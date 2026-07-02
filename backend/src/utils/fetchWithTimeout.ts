import { logger } from './logger'
import { isSafeUrl, SSRF_ALLOW_HOSTS, SSRF_ALLOW_HOST_PORTS } from './ssrfGuard'

/**
 * Circuit breaker states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are rejected immediately
 * - HALF_OPEN: Testing if service has recovered (one probe request)
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number
  /** Time in ms before transitioning from OPEN to HALF_OPEN */
  resetTimeoutMs: number
  /** Maximum time in ms for a single request */
  timeoutMs: number
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000, // 30 seconds
  timeoutMs: 15_000,
}

/**
 * Per-hostname circuit breaker state.
 * Tracks consecutive failures and prevents cascade failures.
 */
const circuits = new Map<string, {
  state: CircuitState
  failures: number
  lastFailureTime: number
}>()

function getHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

/** 从 URL 提取 hostname + port（port 可能为空字符串，表示默认端口） */
function getHostPort(url: string): { hostname: string; port: string } {
  try {
    const parsed = new URL(url)
    return { hostname: parsed.hostname, port: parsed.port }
  } catch {
    return { hostname: 'unknown', port: '' }
  }
}

function getCircuit(host: string) {
  if (!circuits.has(host)) {
    circuits.set(host, { state: 'CLOSED', failures: 0, lastFailureTime: 0 })
  }
  return circuits.get(host)!
}

/**
 * Fetch with timeout and per-host circuit breaker.
 *
 * If the circuit is OPEN, requests are immediately rejected with an error.
 * If HALF_OPEN, one probe request is allowed through.
 */
export async function fetchWithTimeout(
  url: string,
  options: Parameters<typeof fetch>[1] = {},
  timeoutMs: number = DEFAULT_CIRCUIT_CONFIG.timeoutMs,
): Promise<Response> {
  // SSRF 防护：默认校验所有 URL；被判 unsafe 时查白名单豁免。
  // 双层白名单：
  //   1. SSRF_ALLOW_HOST_PORTS（严格，host+port 都匹配才放行）——用于本地服务
  //   2. SSRF_ALLOW_HOSTS（宽松，host 匹配即放行）——用于外部可信域名
  // 防止未来用户可控 URL 经此工具打到内网元数据服务等。
  const { hostname, port } = getHostPort(url)
  const host = hostname  // circuit breaker 按 hostname 统计
  const ssrfCheck = isSafeUrl(url)
  if (!ssrfCheck.safe) {
    // 端口级白名单优先检查
    if (SSRF_ALLOW_HOST_PORTS.has(hostname)) {
      const allowedPorts = SSRF_ALLOW_HOST_PORTS.get(hostname)!
      const portNum = port ? parseInt(port, 10) : (url.startsWith('https') ? 443 : 80)
      if (!allowedPorts.has(portNum)) {
        logger.warn('SSRF guard blocked request (port not allowed)', { hostname, port: portNum, allowedPorts: [...allowedPorts] })
        throw new Error(`Blocked by SSRF guard: port ${portNum} not allowed for ${hostname}`)
      }
    } else if (!SSRF_ALLOW_HOSTS.has(hostname)) {
      logger.warn('SSRF guard blocked request', { host: hostname, reason: ssrfCheck.reason })
      throw new Error(`Blocked by SSRF guard: ${ssrfCheck.reason} (${hostname})`)
    }
    // 命中任一层白名单则放行
  }

  const circuit = getCircuit(host)
  const now = Date.now()

  // Check circuit state
  if (circuit.state === 'OPEN') {
    if (now - circuit.lastFailureTime >= DEFAULT_CIRCUIT_CONFIG.resetTimeoutMs) {
      // Transition to HALF_OPEN — allow one probe request
      circuit.state = 'HALF_OPEN'
      logger.info('Circuit breaker HALF_OPEN', { host })
    } else {
      throw new Error(`Circuit breaker OPEN for ${host} (${DEFAULT_CIRCUIT_CONFIG.failureThreshold} consecutive failures)`)
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    // Success: reset circuit on 2xx/3xx
    if (res.ok || circuit.state === 'HALF_OPEN') {
      if (circuit.failures > 0) {
        logger.info('Circuit breaker CLOSED', { host, previousFailures: circuit.failures })
      }
      circuit.state = 'CLOSED'
      circuit.failures = 0
    }

    return res
  } catch (err) {
    // Record failure
    circuit.failures++
    circuit.lastFailureTime = Date.now()

    if (circuit.failures >= DEFAULT_CIRCUIT_CONFIG.failureThreshold) {
      circuit.state = 'OPEN'
      logger.warn('Circuit breaker OPENED', { host, failures: circuit.failures })
    }

    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get current circuit breaker states (for health checks / debugging).
 */
export function getCircuitStates(): Record<string, CircuitState> {
  const states: Record<string, CircuitState> = {}
  for (const [host, circuit] of circuits) {
    states[host] = circuit.state
  }
  return states
}
