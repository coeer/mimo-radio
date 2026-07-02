import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/apiResponse'
import { logger } from '../utils/logger'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown error'
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Don't leak internal error details in production
  const isDev = process.env.NODE_ENV === 'development'
  const path = req.path
  const method = req.method

  if (err instanceof AppError) {
    logger.error(`[${err.code}] ${err.message}`, { requestId: req.requestId, path, method, statusCode: err.statusCode })
    const response: Record<string, unknown> = {
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    }
    if (isDev && err.stack) {
      response.error = { ...response.error as object, stack: err.stack }
    }
    return res.status(err.statusCode).json(response)
  }

  const message = getErrorMessage(err)
  logger.error('Unhandled error', { requestId: req.requestId, path, method, message, stack: err instanceof Error ? err.stack : undefined })

  const response: Record<string, unknown> = {
    success: false,
    error: {
      message: isDev ? message : 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  }
  if (isDev && err instanceof Error && err.stack) {
    response.error = { ...response.error as object, stack: err.stack }
  }

  res.status(500).json(response)
}
