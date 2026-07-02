import { URL } from 'url'

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
]

/**
 * SSRF 白名单：已知的可信外部服务域名。
 *
 * fetchWithTimeout 默认对所有 URL 调 isSafeUrl 校验；若 URL 被判 unsafe
 *（如解析到内网 IP），再查此白名单豁免。实际上这些可信域名解析后是公网 IP，
 * 本身就会被 isSafeUrl 判为 safe，白名单主要是防御纵深——
 * 一旦某可信域名因 DNS rebinding 等落到内网，至少显式登记过。
 *
 * 新增外部服务时记得在此登记，否则会被 fetchWithTimeout 拦截（fail-closed）。
 */
export const SSRF_ALLOW_HOSTS = new Set<string>([
  // MiMo（小米大模型 + TTS + ASR）
  'token-plan-cn.xiaomimimo.com',
  // QQ 音乐
  'y.qq.com',
  'u.y.qq.com',
  'c.y.qq.com',
  'isure.stream.qqmusic.qq.com',
  // 网易云音乐
  'music.163.com',
  // OpenWeather
  'api.openweathermap.org',
])

/**
 * SSRF 端口级白名单：只放行特定 host:port 的本地调用。
 * 比 SSRF_ALLOW_HOSTS 更严格——host 匹配后还需要 port 匹配。
 * 用于 webbridge daemon（127.0.0.1:10086）等合法本地服务，
 * 避免放行整个 127.0.0.1（防止被用来打 Redis、元数据服务等敏感端口）。
 */
export const SSRF_ALLOW_HOST_PORTS = new Map<string, Set<number>>([
  // Kimi WebBridge 本地 daemon（QQ 音源经浏览器桥接，合法本地调用，非攻击面）
  ['127.0.0.1', new Set([10086])],
  ['localhost', new Set([10086])],
])

/**
 * Validate a URL to prevent SSRF attacks.
 * Allows only http/https protocols and rejects private/internal IPs.
 */
export function isSafeUrl(urlString: string): { safe: true } | { safe: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return { safe: false, reason: 'invalid URL format' }
  }

  // Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'only http/https protocols are allowed' }
  }

  // Hostname check (reject IP addresses and localhost variants)
  const hostname = parsed.hostname.toLowerCase()

  // Block localhost names
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { safe: false, reason: 'localhost is not allowed' }
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: 'private/internal IP addresses are not allowed' }
    }
  }

  return { safe: true }
}
