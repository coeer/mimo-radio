import { config } from '../config'
import { appendFile, mkdir, readdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

/**
 * Lightweight structured logger.
 *
 * No external dependencies (no Winston/Pino). Outputs JSON in production
 * and human-readable lines in development.
 *
 * 双输出：控制台 + 文件落盘。
 * - 文件按日期轮转：logs/app-YYYY-MM-DD.log（每天一个文件）
 * - 文件写失败静默降级（绝不让日志功能拖垮主服务）
 * - 异步写入（带背压队列），不阻塞主线程
 * - 启动时清理超过保留期的旧日志
 *
 * 级别控制（三级优先）：
 * 1. LOG_LEVEL 环境变量显式指定 → 用它
 * 2. 否则按 NODE_ENV：dev=DEBUG（全记），prod=INFO（略过 DEBUG）
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAME_TO_VALUE: Record<string, LogLevel> = {
  DEBUG: LogLevel.DEBUG,
  INFO: LogLevel.INFO,
  WARN: LogLevel.WARN,
  ERROR: LogLevel.ERROR,
}

function resolveCurrentLevel(): LogLevel {
  // 1. LOG_LEVEL 环境变量优先
  if (config.logLevel && LEVEL_NAME_TO_VALUE[config.logLevel] !== undefined) {
    return LEVEL_NAME_TO_VALUE[config.logLevel]
  }
  // 2. 按 NODE_ENV
  return config.nodeEnv === 'production' ? LogLevel.INFO : LogLevel.DEBUG
}

const CURRENT_LEVEL = resolveCurrentLevel()

function shouldLog(level: LogLevel): boolean {
  return level >= CURRENT_LEVEL
}

// ── 文件落盘 ──────────────────────────────────────────────
// 日志目录：项目根 logs/（便于人和 AI 直接在项目顶层定位日志）
//
// 用 process.cwd() 解析而非 __dirname 跳层：
// - dev（tsx watch src/index.ts）：cwd = backend/，logs = backend/../logs = 项目根/logs
// - prod（node dist/index.js）：cwd = backend/，logs = 项目根/logs
//   ※ 服务统一从 backend/ 启动（npm run dev/start 均如此），故 cwd 稳定指向 backend/。
// - 可用 LOG_DIR 环境变量覆盖绝对路径。
const LOG_DIR = process.env.LOG_DIR
  ? resolve(process.env.LOG_DIR)
  : join(process.cwd(), '..', 'logs')
const LOG_ROTATION = 'daily' // 按日期轮转

// 启动路径自检：打印实际落盘位置，便于人和 AI 在项目根直接定位日志
// （用 console 直接打，不调 logger 自身，避免模块加载期的潜在递归）
console.info(`[logger] 落盘目录 = ${LOG_DIR}（轮转：${LOG_ROTATION}，级别：${LogLevel[CURRENT_LEVEL]}）`)

/** 当天日志文件路径（首次写时确保目录存在） */
async function getLogFile(): Promise<string> {
  if (!existsSync(LOG_DIR)) {
    try {
      await mkdir(LOG_DIR, { recursive: true })
    } catch {
      // 目录创建失败：返回一个仍会尝试写的路径，写入会吞错降级
    }
  }
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(LOG_DIR, `app-${date}.log`)
}

// ── 异步写入队列（带背压） ──────────────────────────────────
// 避免高并发下 appendFileSync 阻塞事件循环。
// - 单消费者串行写，避免并发 append 冲突
// - 队列满时丢弃最旧的 DEBUG/INFO，保留 WARN/ERROR（错误绝不丢）
interface QueueItem {
  line: string
  level: LogLevel
}
const WRITE_QUEUE: QueueItem[] = []
const MAX_QUEUE = 1000
let flushing = false
let droppedCount = 0

/** 把一行加入异步写队列；队列满时按级别丢弃低优先级 */
function enqueueWrite(line: string, level: LogLevel): void {
  if (WRITE_QUEUE.length >= MAX_QUEUE) {
    // 背压：优先丢 DEBUG/INFO，保留 WARN/ERROR
    const dropIdx = WRITE_QUEUE.findIndex((it) => it.level <= LogLevel.INFO)
    if (dropIdx >= 0) {
      WRITE_QUEUE.splice(dropIdx, 1)
      droppedCount++
    } else {
      // 全是 WARN/ERROR，不得不丢最旧一条
      WRITE_QUEUE.shift()
      droppedCount++
    }
  }
  WRITE_QUEUE.push({ line, level })
  void flushQueue()
}

/** 串行消费队列 */
async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    while (WRITE_QUEUE.length > 0) {
      const item = WRITE_QUEUE.shift()!
      try {
        const file = await getLogFile()
        await appendFile(file, item.line + '\n', 'utf-8')
      } catch {
        // 落盘失败（磁盘满/权限）不影响服务，控制台仍可见
      }
    }
    if (droppedCount > 0) {
      droppedCount = 0 // 重置计数，下次丢了再累计
    }
  } finally {
    flushing = false
  }
}

function formatLog(
  level: string,
  message: string,
  meta?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString()
  if (config.nodeEnv === 'production') {
    return JSON.stringify({ timestamp, level, message, ...meta })
  }
  const metaStr = meta ? ' ' + JSON.stringify(meta) : ''
  return `[${timestamp}] ${level}: ${message}${metaStr}`
}

/** 统一输出：控制台 + 文件 */
function emit(level: string, message: string, meta: Record<string, unknown> | undefined, numericLevel: LogLevel): void {
  const line = formatLog(level, message, meta)
  // 控制台（按级别用对应方法）
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else if (level === 'DEBUG') console.debug(line)
  else console.info(line)
  // 文件落盘（所有级别都写，事后排查用）
  enqueueWrite(line, numericLevel)
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(LogLevel.DEBUG)) {
      emit('DEBUG', message, meta, LogLevel.DEBUG)
    }
  },

  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(LogLevel.INFO)) {
      emit('INFO', message, meta, LogLevel.INFO)
    }
  },

  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(LogLevel.WARN)) {
      emit('WARN', message, meta, LogLevel.WARN)
    }
  },

  error(message: string, meta?: Record<string, unknown>) {
    if (shouldLog(LogLevel.ERROR)) {
      emit('ERROR', message, meta, LogLevel.ERROR)
    }
  },
}

/**
 * 错误对象规范化：把 unknown 类型的 catch err 转成带堆栈的 meta。
 *
 * 用法：logger.error('XXX failed', toErrorMeta(err))
 * 解决业务 catch 里 String(err) 丢失堆栈的问题。
 */
export function toErrorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { message: String(err) }
}

/** 暴露日志目录（供测试 / 启动信息用） */
export const LOG_DIRECTORY = LOG_DIR
export const LOG_LEVEL_CURRENT = CURRENT_LEVEL
export { LOG_ROTATION }

// ── 保留期清理（启动时执行一次） ──────────────────────────
// 删除超过 logRetentionDays 天的 app-*.log，避免磁盘无限膨胀。
// 失败只 warn 不阻断启动。
export async function cleanupOldLogs(retentionDays = config.logRetentionDays): Promise<number> {
  let deleted = 0
  try {
    if (!existsSync(LOG_DIR)) return 0
    const files = await readdir(LOG_DIR)
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    for (const f of files) {
      if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue
      const filePath = join(LOG_DIR, f)
      try {
        const st = await stat(filePath)
        if (st.mtimeMs < cutoff) {
          await unlink(filePath)
          deleted++
        }
      } catch {
        // 单个文件清理失败跳过，继续下一个
      }
    }
  } catch (e) {
    console.warn(`[logger] cleanupOldLogs failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  return deleted
}
