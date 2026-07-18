import express, { type Express } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import compression from 'compression'
import { resolve } from 'path'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { apiKeyAuth } from './middleware/auth'
import { requestId } from './middleware/requestId'
import { checkDbHealth } from './db'
import { logger } from './utils/logger'
import { getCircuitStates } from './utils/fetchWithTimeout'
import { HELMET_OPTIONS } from './config/securityHeaders'

import radioRoutes from './routes/radio'
import djRoutes from './routes/dj'
import djPersonaRoutes from './routes/djPersona'
import musicSourceRoutes from './routes/musicSource'
import ttsEnginesRoutes from './routes/ttsEngines'
import profileRoutes from './routes/profile'
import importRoutes from './routes/import'
import contextRoutes from './routes/context'
import scheduleRoutes from './routes/schedule'
import qqmusicRoutes from './routes/qqmusic'
import lyricRoutes from './routes/lyric'
import logRoutes from './routes/log'

/**
 * App 工厂（P2-2，B5 类风险根治方案）。
 *
 * 把 Express app 的构建（中间件 + 路由）与启动（鉴权校验 / initDb / listen）分离：
 * - index.ts 只负责启动流程
 * - 测试可以 supertest 真实 app（与生产同一份中间件链），不再"复刻挂载顺序"
 *   ——P0b-1 的镜像测试、B5 的 helmet 快照漂移都源于无法 import 真实 app
 *
 * 注意：本函数不做任何启动副作用（不 initDb、不 listen、不读 .env 之外的 IO）。
 */
export function createApp(): Express {
  const app = express()

  // Security headers —— 配置单一来源见 config/securityHeaders.ts（P0a-1/B5）
  // 后端默认仅响应 JSON，CSP 作为兜底防护；PWA 是前端独立部署，不受后端 CSP 影响
  app.use(helmet(HELMET_OPTIONS))
  app.use(compression())

  // Rate limiting — general
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })

  // P0a-4（B1）：aiLimiter 在 middleware/aiLimiter.ts，只在具体 POST 路由挂载（不整 router 挂）
  app.use(generalLimiter)

  // Middleware
  app.use(corsMiddleware)
  app.use(requestId)
  // P0b-1：路径级 body-parser 放宽（ASR ≤20MB base64 / analyze-image ≤10MB base64，见 dj.ts schema）。
  // 必须注册在全局 1mb 之前：body-parser 解析成功后设 req._body，全局解析器会跳过；
  // 若放在全局之后，>1MB 请求先被全局 413，永远到不了这里（实测验证，见 verdict-p0b-1-body-parser-order-2026-07-18）。
  // 真实 app 测试：middleware/error.test.ts 的「body 上限（真实 app）」describe 直接 supertest createApp()。
  app.use('/api/v1/dj/asr', express.json({ limit: '25mb' }))
  app.use('/api/v1/dj/analyze-image', express.json({ limit: '12mb' }))
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  // Request logging with correlation ID
  app.use((req, res, next) => {
    const start = Date.now()
    const reqId = req.requestId || '-'
    res.on('finish', () => {
      const duration = Date.now() - start
      logger.info(`${req.method} ${req.path}`, {
        requestId: reqId,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
      })
    })
    next()
  })

  // Static files (TTS audio)
  app.use('/static', express.static(resolve(process.cwd(), 'static')))

  // Health check (public)
  app.get('/health', (_req, res) => {
    const health = {
      status: 'ok',
      project: 'MiMo',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: 'unknown' as string,
        circuits: getCircuitStates(),
      },
    }

    if (checkDbHealth()) {
      health.services.database = 'ok'
      res.json(health)
    } else {
      health.status = 'degraded'
      health.services.database = 'error'
      res.status(503).json(health)
    }
  })

  // Global request timeout (prevent hanging connections) — must be before routes
  app.use((req, res, next) => {
    req.setTimeout(30000, () => {
      if (!res.headersSent) {
        res.status(408).json({ success: false, error: { message: 'Request timeout', code: 'REQUEST_TIMEOUT' } })
      }
      // P1-1：真正中止 socket，避免 handler 后续写响应抛 "headers already sent" / 连接悬挂
      req.destroy()
    })
    next()
  })

  // API Key auth for all /api/* routes
  app.use('/api', apiKeyAuth)

  // API routes (versioned: /api/v1/*)
  app.use('/api/v1/radio', radioRoutes)
  app.use('/api/v1/dj', djRoutes)
  app.use('/api/v1/dj/persona', djPersonaRoutes)
  app.use('/api/v1/music-source', musicSourceRoutes)
  app.use('/api/v1/tts-engines', ttsEnginesRoutes)
  app.use('/api/v1/profile', profileRoutes)
  app.use('/api/v1/import', importRoutes)
  app.use('/api/v1/context', contextRoutes)
  app.use('/api/v1/schedule', scheduleRoutes)
  app.use('/api/v1/qqmusic', qqmusicRoutes)
  app.use('/api/v1/lyric', lyricRoutes)
  app.use('/api/v1/log', logRoutes)

  // Error handler (must be last)
  app.use(errorHandler)

  return app
}
