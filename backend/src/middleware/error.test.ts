import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { errorHandler } from './error'
import { AppError } from '../utils/apiResponse'

const app = express()
app.use(express.json())

// Routes that trigger different errors
app.get('/app-error', () => {
  throw new AppError('Custom error', 422, 'CUSTOM_ERROR')
})

app.get('/generic-error', () => {
  throw new Error('Something broke')
})

app.get('/string-error', () => {
  throw 'Plain string error'
})

app.get('/unknown-error', () => {
  throw 42
})

app.use(errorHandler)

describe('errorHandler', () => {
  it('should handle AppError with custom status and code', async () => {
    const res = await request(app).get('/app-error')
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toBe('Custom error')
    expect(res.body.error.code).toBe('CUSTOM_ERROR')
  })

  it('should handle generic Error as 500', async () => {
    const res = await request(app).get('/generic-error')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
  })

  it('should handle string errors', async () => {
    const res = await request(app).get('/string-error')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
  })

  it('should handle unknown errors gracefully', async () => {
    const res = await request(app).get('/unknown-error')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
  })

  it('should hide internal details in production', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const res = await request(app).get('/generic-error')
    expect(res.body.error.message).toBe('Internal server error')

    process.env.NODE_ENV = originalEnv
  })

  it('should include stack trace in development', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const res = await request(app).get('/generic-error')
    expect(res.body.error.message).toBe('Something broke')
    expect(res.body.error.stack).toBeDefined()

    process.env.NODE_ENV = originalEnv
  })
})
