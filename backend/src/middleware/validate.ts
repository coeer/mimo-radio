import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid request body', code: 'VALIDATION_ERROR', issues },
      })
    }
    req.body = result.data
    next()
  }
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid URL parameters', code: 'VALIDATION_ERROR', issues },
      })
    }
    req.params = result.data as any
    next()
  }
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid query parameters', code: 'VALIDATION_ERROR', issues },
      })
    }
    req.query = result.data as any
    next()
  }
}
