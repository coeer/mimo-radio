import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'

/**
 * Request ID middleware.
 * Generates a unique correlation ID for each request (or uses X-Request-ID if provided).
 * Attaches it to req/res headers and the request object for downstream logging.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID()

  // Attach to response header for client-side correlation
  res.setHeader('X-Request-ID', id)

  // Attach to request object for downstream access
  req.requestId = id

  next()
}
