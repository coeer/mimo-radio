import { URL } from 'url'
import { lookup } from 'dns/promises'
import { isIP } from 'net'

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  // IPv6 ULA（fc00::/7）= fc00-fdff 开头
  /^[fF][cCdD][0-9a-fA-F]{2}:/,
  /^fe80:/i,
  // IPv4-mapped IPv6（::ffff:127.0.0.1 → 绕过 v4 规则）
  /^::ffff:/i,
  // IPv6 6to4（2002: 开头，可能映射私网）—— 保守拦截
  /^2002:/i,
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
 * 去除 IPv6 字面量的方括号 [::1] → ::1，让 PRIVATE_IP_PATTERNS 匹配。
 * Node URL 对 IPv6 literal 返回的 hostname 带方括号，原正则不匹配。
 */
function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1)
  }
  return hostname
}

/**
 * 判断一个 IP 字符串（v4 或 v6）是否在私有/保留范围内。
 * PRIVATE_IP_PATTERNS 同时覆盖 v4 和 v6 literal；IPv4-mapped IPv6
 *（::ffff:127.0.0.1）走 ::ffff: 规则匹配。
 */
function isPrivateAddress(addr: string): boolean {
  const lower = addr.toLowerCase()
  // IPv4-mapped IPv6（::ffff:127.0.0.1）→ 用 ::ffff: 规则匹配
  return PRIVATE_IP_PATTERNS.some((p) => p.test(lower))
}

/**
 * Validate a URL to prevent SSRF attacks.
 *
 * Async because we resolve the hostname via dns.lookup to detect
 * DNS rebinding (public domain resolving to private IP).
 *
 * 流：
 *   1. 协议 + localhost + 字面 IP 同步检查（前置过滤明显非法）
 *   2. 仅当 hostname 看起来是域名（不是 IP 字面量）才 DNS 解析
 *   3. DNS 解析失败 → fail-closed（视为 unsafe）
 *   4. 解析到私网 IP → unsafe
 *
 * 注意：白名单**不**在这里查——白名单查询在 fetchWithTimeout（调方），
 * 命中白名单的 host 会绕过本函数（包括 DNS 解析）。这是设计：白名单 =
 * "我信这个域名，不做 DNS rebinding 校验"。
 */
export async function isSafeUrl(
  urlString: string,
): Promise<{ safe: true } | { safe: false; reason: string }> {
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
  const rawHostname = parsed.hostname.toLowerCase()
  // IPv6 字面量 Node URL 返回带方括号 [::1]，正则去方括号后匹配
  const hostname = stripIpv6Brackets(rawHostname)

  // Block localhost names
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { safe: false, reason: 'localhost is not allowed' }
  }

  // Block private IP ranges（IP 字面量直接正则匹配）
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) {
    return { safe: false, reason: 'private/internal IP addresses are not allowed' }
  }

  // DNS 解析校验：防 rebinding（域名形态才查，IP 字面量已上一步覆盖）
  if (!isIP(hostname)) {
    try {
      const results = await lookup(hostname, { all: true })
      // 任一解析结果是私网 IP → 拒绝（fail-closed）
      for (const r of results) {
        if (isPrivateAddress(r.address)) {
          return {
            safe: false,
            reason: `hostname resolves to private IP ${r.address}`,
          }
        }
      }
    } catch {
      // DNS 解析失败 → fail-closed
      return { safe: false, reason: 'DNS resolution failed' }
    }
  }

  return { safe: true }
}
