import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import compression from 'compression'
import { startPeriodicCleanup } from './utils/fileCleanup'
import { resolve } from 'path'
import { config } from './config'
import { corsMiddleware } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { apiKeyAuth } from './middleware/auth'
import { requestId } from './middleware/requestId'
import { initDb, startSessionCleanup, checkDbHealth } from './db'
import { logger, cleanupOldLogs, toErrorMeta } from './utils/logger'
import { assertSecretConfigured } from './utils/sessionToken'
import { getCircuitStates } from './utils/fetchWithTimeout'

import radioRoutes from './routes/radio'
import djRoutes from './routes/dj'
import djPersonaRoutes from './routes/djPersona'
import musicSourceRoutes from './routes/musicSource'
import ttsEnginesRoutes from './routes/ttsEngines'
import profileRoutes from './routes/profile'
import importRoutes from './routes/import'
import contextRoutes from './routes/context'
import upnpRoutes from './routes/upnp'
import scheduleRoutes from './routes/schedule'
import qqmusicRoutes from './routes/qqmusic'
import lyricRoutes from './routes/lyric'
import logRoutes from './routes/log'

const app = express()

// Security headers
// 后端默认仅响应 JSON，CSP 作为兜底防护：
//   - 防 XSS：未来若有端点返回 HTML，浏览器将按 CSP 限制资源来源
//   - 与 helmet 其它安全头形成完整链条（X-Content-Type-Options / X-Frame-Options 等仍由默认启用）
//   - PWA 是前端独立部署，不受后端 CSP 影响；后端响应 JSON 时浏览器不强制 CSP
//
// CSP 设计：
//   - useDefaults: false —— 不与 helmet 默认合并，从零显式声明，避免历史默认值未来变动引入回归
//   - crossOriginEmbedderPolicy: false —— PWA/前端资源加载兼容；COEP=require-corp 会破坏跨域资源（如网易云封面）
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // 后端纯 JSON，禁 inline 即可
        styleSrc: ["'self'"], // 纯 JSON 后端，无 CSS 资源
        imgSrc: ["'self'", 'data:'], // 允许 data: base64（封面图等）
        connectSrc: ["'self'"], // fetch/XHR 限制同源
        frameSrc: ["'none'"], // 不允许嵌入
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // 防 PWA 兼容性问题（见上行注释）
  }),
)
app.use(compression())

// Rate limiting — general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

// Rate limiting — AI / expensive endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI generation rate limit exceeded. Please slow down.' },
})

app.use(generalLimiter)

// Middleware
app.use(corsMiddleware)
app.use(requestId)
// P0b-1：路径级 body-parser 放宽（ASR ≤20MB base64 / analyze-image ≤10MB base64，见 dj.ts schema）。
// 必须注册在全局 1mb 之前：body-parser 解析成功后设 req._body，全局解析器会跳过；
// 若放在全局之后，>1MB 请求先被全局 413，永远到不了这里（实测验证，见 verdict-p0b-1-body-parser-order-2026-07-18）。
// 测试镜像：middleware/error.test.ts 的「body 上限挂载顺序」describe（改这里要同步改测试）。
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
  })
  next()
})

// API Key auth for all /api/* routes
app.use('/api', apiKeyAuth)

// API routes (versioned: /api/v1/*)
app.use('/api/v1/radio', aiLimiter, radioRoutes)
app.use('/api/v1/dj', aiLimiter, djRoutes)
app.use('/api/v1/dj/persona', djPersonaRoutes)
app.use('/api/v1/music-source', musicSourceRoutes)
app.use('/api/v1/tts-engines', ttsEnginesRoutes)
app.use('/api/v1/profile', profileRoutes)
app.use('/api/v1/import', importRoutes)
app.use('/api/v1/context', contextRoutes)
app.use('/api/v1/upnp', upnpRoutes)
app.use('/api/v1/schedule', scheduleRoutes)
app.use('/api/v1/qqmusic', qqmusicRoutes)
app.use('/api/v1/lyric', lyricRoutes)
app.use('/api/v1/log', logRoutes)

// Error handler (must be last)
app.use(errorHandler)

// Initialize database and validate secrets BEFORE starting the server
assertSecretConfigured()

// P0b-2（R2 鉴权 fail-closed）：显式 production 才严格，没配就警告但能跑（单人开发项目，忘配不应起不来）
if (!config.apiKey && config.nodeEnv === 'production') {
  // production 下 auth 中间件会对每个请求 500，属于误配置，启动直接 fail-fast
  throw new Error('FATAL: NODE_ENV=production requires API_KEY to be set.')
}
if (!config.apiKey) {
  logger.warn('⚠️  API_KEY not set and NODE_ENV != production — authentication is DISABLED. Safe for local dev only.')
}
if (!config.sessionSecret && !config.apiKey) {
  logger.warn('[DEV] using fallback session secret')
}

initDb()

// 启动时加载 DJ 人设（若有）
import { loadPersona } from './services/djPersona'
loadPersona()

// 启动时注册双音源（网易云 + QQ）
import { registerMusicSource } from './services/musicSource'
import { neteaseMusicSource } from './services/neteaseSource'
import { registerQQMusicSource } from './services/qqSource'
registerMusicSource(neteaseMusicSource)
registerQQMusicSource()

// 启动时注册 TTS 引擎（MiMo 预置/设计/复刻）
import { registerTtsEngine, setCurrentTtsEngine } from './services/ttsEngine'
import { mimoPresetTts, mimoDesignTts, mimoCloneTts } from './services/mimoTts'
import { config as ttsConfig } from './config'
registerTtsEngine(mimoPresetTts)
registerTtsEngine(mimoDesignTts)
registerTtsEngine(mimoCloneTts)
// 应用启动默认引擎（由 .env 的 TTS_ENGINE 控制，默认 mimo-tts）
setCurrentTtsEngine(ttsConfig.ttsEngine)

const PORT = config.port
const server = app.listen(PORT, async () => {
  startSessionCleanup()
  startPeriodicCleanup(resolve(process.cwd(), 'static/audio'))
  logger.info('Server started', { port: PORT, env: config.nodeEnv })
  // 启动后清理过期日志（不阻塞服务）
  const deleted = await cleanupOldLogs()
  if (deleted > 0) {
    logger.info('Log cleanup done', { retentionDays: config.logRetentionDays, deleted })
  }

  // Q1 修复：启动后异步预热 planner，首次用户访问大概率命中缓存
  setTimeout(async () => {
    try {
      const { generateDailyPlan } = await import('./services/planner')
      const { getAIService } = await import('./services/aiFactory')
      const { weatherService } = await import('./services/weather')
      const ai = getAIService()
      // S2 修复：预热也传真实天气，避免缓存污染"未知"天气
      let weather
      try { weather = await weatherService.getCurrent() } catch { /* 天气失败用 undefined */ }
      await generateDailyPlan(
        (messages) => ai.chat(messages, { timeoutMs: 15000 }),
        weather ? { description: weather.description, temp: weather.temp } : undefined
      )
      logger.info('planner 预热完成', { weather: weather?.description || 'unknown' })
    } catch (err) {
      logger.warn('planner 预热失败（首次访问时会重试）', { ...toErrorMeta(err) })
    }
  }, 3000)  // 启动 3s 后预热，不影响启动速度
})

// 监听端口占用等启动错误：若端口被占用（EADDRINUSE）等，记录日志后退出，
// 让进程管理器（PM2/nodemon）拉起新实例，而不是静默僵死。
server.on('error', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('Port already in use, exiting', { port: PORT, error: err.message })
  } else {
    logger.error('Server failed to start', { ...toErrorMeta(err) })
  }
  process.exit(1)
})

// 全局兜底：未捕获的同步异常 / 未处理的 Promise 拒绝。
// 记录日志后退出（不吞错），避免进程在异常状态下继续对外提供服务。
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException, shutting down', { ...toErrorMeta(err) })
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection, shutting down', { reason: String(reason) })
  process.exit(1)
})
