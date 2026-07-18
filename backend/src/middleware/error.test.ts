import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
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

// P0b-1：body 上限 —— 直接 supertest 真实 app（P2-2 的 createApp 工厂）。
// 不再有"复刻挂载顺序"的镜像：测试测的就是生产同一份中间件链（B5 类漂移根治）。
// ⚠️ 判定口径：>1MB body 到放宽路径应能"到达路由层"——shape 错误返回 400（zod），
// 而不是 413（body-parser 拦截）；普通路由仍在全局 1mb 之前被 413。
describe('body 上限（真实 app createApp）', () => {
  let realApp: express.Express

  beforeAll(async () => {
    // 防空 .env 里配了 API_KEY 导致测试被 401（dotenv 不覆盖已存在的环境变量）
    vi.stubEnv('API_KEY', '')
    vi.resetModules()
    const mod = await import('../app')
    realApp = mod.createApp()
  })

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // ~2MB JSON，超全局 1mb、低于路径级放宽；shape 故意错误（缺 audio/image 字段）
  const bigBody = { notAudio: 'x'.repeat(2 * 1024 * 1024) }

  it('2MB → /api/v1/dj/asr 到达路由层（400 zod，而非 413）', async () => {
    const res = await request(realApp).post('/api/v1/dj/asr').send(bigBody)
    expect(res.status).toBe(400)
  })

  it('2MB → /api/v1/dj/analyze-image 到达路由层（400 zod，而非 413）', async () => {
    const res = await request(realApp).post('/api/v1/dj/analyze-image').send(bigBody)
    expect(res.status).toBe(400)
  })

  it('2MB → /api/v1/radio/create 仍 413（全局 1mb 未被破坏）', async () => {
    const res = await request(realApp).post('/api/v1/radio/create').send(bigBody)
    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
