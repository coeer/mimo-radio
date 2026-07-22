import { Request, Response, NextFunction } from 'express'
import { verifySessionToken } from '../utils/sessionToken'
import { logger } from '../utils/logger'

/**
 * Session token authentication middleware.
 * Extracts and verifies signed session tokens from:
 *   - Header: X-Session-Token
 *   - Body field: session_token
 *
 * Query param removed 2026-07-18 (B2-1 / B1-1): token in URL leaks via
 * access log / browser history / Referer / proxy log.
 *
 * Attaches `req.sessionId` on success.
 */
export function sessionAuth(req: Request, res: Response, next: NextFunction) {
  const token =
    (req.headers['x-session-token'] as string) ||
    req.body?.session_token

  if (!token || typeof token !== 'string') {
    logger.warn('Session auth failed', { requestId: req.requestId, path: req.path, reason: 'missing_session' })
    return res.status(401).json({
      success: false,
      error: { message: 'Missing session token', code: 'SESSION_REQUIRED' },
    })
  }

  const result = verifySessionToken(token)
  if (!result.valid) {
    logger.warn('Session auth failed', { requestId: req.requestId, path: req.path, reason: 'invalid_session' })
    return res.status(403).json({
      success: false,
      error: { message: 'Invalid or expired session', code: 'SESSION_INVALID' },
    })
  }

  // Attach verified session ID to request
  req.sessionId = result.sessionId
  next()
}
