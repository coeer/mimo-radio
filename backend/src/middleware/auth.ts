import { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { config } from '../config'
import { logger } from '../utils/logger'

/**
 * Timing-safe string comparison using Buffer + timingSafeEqual.
 * Prevents timing attacks that could leak API key characters.
 */
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * API Key authentication middleware.
 * Requires X-API-Key header for all protected routes.
 * In development, allows empty API_KEY (no auth) for convenience.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  // Skip auth if no API_KEY is configured (development convenience)
  // For production, API_KEY must be set
  if (!config.apiKey) {
    if (config.nodeEnv === 'production') {
      logger.error('Auth misconfiguration: API_KEY not set in production', { requestId: req.requestId, path: req.path })
      return res.status(500).json({
        success: false,
        error: { message: 'Server misconfiguration: API_KEY not set', code: 'SERVER_MISCONFIG' },
      })
    }
    return next()
  }

  const key = req.headers['x-api-key']
  if (!key || typeof key !== 'string' || !secureCompare(key, config.apiKey)) {
    const reason = !key ? 'missing_key' : 'invalid_key'
    logger.warn('Auth failed', { requestId: req.requestId, path: req.path, reason })
    return res.status(401).json({
      success: false,
      error: { message: 'Unauthorized: invalid or missing API key', code: 'UNAUTHORIZED' },
    })
  }

  next()
}
