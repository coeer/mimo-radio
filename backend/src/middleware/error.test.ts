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

// 模拟 body-parser 抛出的超限错误（type='entity.too.large'）
app.get('/too-large', (_req, _res, next) => {
  next(Object.assign(new Error('request entity too large'), { type: 'entity.too.large' }))
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

  it('should return 413 PAYLOAD_TOO_LARGE for entity.too.large (P0b-1)', async () => {
    const res = await request(app).get('/too-large')
    expect(res.status).toBe(413)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toBe('Request body too large')
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})

// P0b-1：body 上限挂载顺序 —— 镜像 index.ts 的真实顺序
// （路径级 25mb/12mb 在全局 1mb 之前注册 + 真实 errorHandler）。
// ⚠️ 与 index.ts 的 P0b-1 注释互相引用：改挂载顺序/限额要两边同步，防 B5 式快照漂移。
describe('body 上限挂载顺序（镜像 index.ts）', () => {
  const orderApp = express()
  orderApp.use('/api/v1/dj/asr', express.json({ limit: '25mb' }))
  orderApp.use('/api/v1/dj/analyze-image', express.json({ limit: '12mb' }))
  orderApp.use(express.json({ limit: '1mb' }))
  orderApp.post('/api/v1/dj/asr', (_req, res) => res.json({ ok: true }))
  orderApp.post('/api/v1/dj/analyze-image', (_req, res) => res.json({ ok: true }))
  orderApp.post('/api/v1/radio/create', (_req, res) => res.json({ ok: true }))
  orderApp.use(errorHandler)

  const bigBody = { audio: 'x'.repeat(2 * 1024 * 1024) } // ~2MB JSON，超全局 1mb、低于路径级放宽

  it('2MB → /api/v1/dj/asr 不被 413（25mb 放宽生效）', async () => {
    const res = await request(orderApp).post('/api/v1/dj/asr').send(bigBody)
    expect(res.status).toBe(200)
  })

  it('2MB → /api/v1/dj/analyze-image 不被 413（12mb 放宽生效）', async () => {
    const res = await request(orderApp).post('/api/v1/dj/analyze-image').send(bigBody)
    expect(res.status).toBe(200)
  })

  it('2MB → /api/v1/radio/create 仍 413（全局 1mb 未被破坏）', async () => {
    const res = await request(orderApp).post('/api/v1/radio/create').send(bigBody)
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
