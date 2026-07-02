import { createHmac, timingSafeEqual } from 'crypto'
import { config } from '../config'

const DEV_FALLBACK_SECRET = 'dev-secret-change-in-production'

/**
 * Validate that a secure secret is configured in production.
 * Call this at startup to fail-fast instead of silently using an insecure fallback.
 */
export function assertSecretConfigured(): void {
  if (config.nodeEnv === 'production' && !config.sessionSecret && !config.apiKey) {
    throw new Error(
      'FATAL: Neither SESSION_SECRET nor API_KEY is configured. ' +
      'Production deployments require a strong secret (≥32 characters). ' +
      'Set SESSION_SECRET in your .env file.'
    )
  }
}

const SECRET = config.sessionSecret || config.apiKey || DEV_FALLBACK_SECRET

/**
 * Sign a session ID with HMAC-SHA256 to prevent session enumeration attacks.
 * Returns a token in the format: sessionId.signature
 *
 * 注：当前无过期校验（开发期便利优先）。token 的有效性由 DB 中的 session TTL
 * （24h，见 db/index.ts:SESSION_TTL_MS）间接约束——session 行被清理后，即使
 * token 签名仍合法，对应的会话数据也不复存在。
 * 上线前如需严格过期校验，可再嵌入 expiresAt 并在 verify 时检查。
 */
export function signSession(sessionId: string): string {
  const sig = createHmac('sha256', SECRET).update(sessionId).digest('hex')
  return `${sessionId}.${sig}`
}

/**
 * Verify a session token and extract the session ID.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySessionToken(token: string): { valid: true; sessionId: string } | { valid: false; reason: string } {
  const parts = token.split('.')
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid token format' }
  }

  const [sessionId, signature] = parts
  if (!sessionId || !signature) {
    return { valid: false, reason: 'missing session id or signature' }
  }

  const expectedSig = createHmac('sha256', SECRET).update(sessionId).digest('hex')

  // Timing-safe comparison
  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'invalid signature' }
  }

  return { valid: true, sessionId }
}
