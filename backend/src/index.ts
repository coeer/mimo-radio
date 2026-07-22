import { resolve } from 'path'
import { config } from './config'
import { createApp } from './app'
import {
  initDb,
  startSessionCleanup,
  stopSessionCleanup,
  startFeedbackCleanup,
  stopFeedbackCleanup,
} from './db'
import { logger, cleanupOldLogs, toErrorMeta } from './utils/logger'
import { assertSecretConfigured } from './utils/sessionToken'
import { startPeriodicCleanup } from './utils/fileCleanup'

// App 构建（中间件 + 路由）已抽到 app.ts 的 createApp()（P2-2）；
// 本文件只负责启动流程：鉴权校验 → initDb → 注册服务 → listen。
const app = createApp()

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
registerTtsEngine(mimoPresetTts)
registerTtsEngine(mimoDesignTts)
registerTtsEngine(mimoCloneTts)
// 应用启动默认引擎（由 .env 的 TTS_ENGINE 控制，默认 mimo-tts）
setCurrentTtsEngine(config.ttsEngine)

const PORT = config.port
const server = app.listen(PORT, async () => {
  startSessionCleanup()
  // B2-5 (2026-07-22)：feedback TTL 清理（90 天）
  startFeedbackCleanup()
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

// B2-5 (2026-07-22)：优雅退出钩子——停掉后台定时器（session cleanup / feedback cleanup），
// 避免进程 hang 在 event loop 上不退。原代码只 process.exit(1)，未清理定时器。
let shuttingDown = false
function gracefulShutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`Received ${signal}, shutting down gracefully`)
  stopSessionCleanup()
  stopFeedbackCleanup()
  server.close((err) => {
    if (err) logger.error('Error closing server', { ...toErrorMeta(err) })
    process.exit(0)
  })
  // 兜底：5 秒内未关完则强退
  setTimeout(() => {
    logger.warn('Graceful shutdown timeout, forcing exit')
    process.exit(1)
  }, 5000).unref()
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
