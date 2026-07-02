/**
 * 前端轻量日志封装。
 *
 * - dev：全部级别打 console（便于本地调试）
 * - prod：静默 debug/info，仅保留 warn/error 并上报后端 /api/v1/log，
 *   写入同一份后端日志文件，实现前后端日志统一排查。
 *
 * 上报失败静默（绝不让日志功能影响业务）。
 */
import { API_BASE, getApiHeaders } from './config'

type Level = 'debug' | 'info' | 'warn' | 'error'

const isProd = process.env.NODE_ENV === 'production'

// prod 下是否启用后端上报（可通过 NEXT_PUBLIC_LOG_REPORT=0 关闭）
const reportEnabled = isProd && process.env.NEXT_PUBLIC_LOG_REPORT !== '0'

// 上报节流：同一消息 5 秒内只上报一次，避免刷屏
const recentReports = new Map<string, number>()
const REPORT_DEBOUNCE_MS = 5000

function consoleEmit(level: Level, msg: string, ctx?: unknown) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  if (ctx !== undefined) {
    fn(`[${level.toUpperCase()}] ${msg}`, ctx)
  } else {
    fn(`[${level.toUpperCase()}] ${msg}`)
  }
}

async function reportToBackend(level: Level, msg: string, ctx?: unknown) {
  if (!reportEnabled) return
  // 节流：按 level+msg 去重
  const key = `${level}:${msg}`
  const now = Date.now()
  const last = recentReports.get(key)
  if (last && now - last < REPORT_DEBOUNCE_MS) return
  recentReports.set(key, now)
  // 定期清理节流表，避免内存泄漏
  if (recentReports.size > 100) recentReports.clear()

  try {
    const body: Record<string, unknown> = {
      level,
      msg: typeof msg === 'string' ? msg.slice(0, 2000) : String(msg).slice(0, 2000),
    }
    if (ctx !== undefined) {
      body.ctx = {
        ...(typeof ctx === 'object' && ctx !== null ? ctx : { value: ctx }),
        url: typeof location !== 'undefined' ? location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }
    }
    await fetch(`${API_BASE}/api/v1/log`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(body),
      // 用 keepalive 确保页面卸载时也能发出（如 ErrorBoundary 触发时）
      keepalive: true,
    })
  } catch {
    // 上报失败静默，不影响业务
  }
}

function emit(level: Level, msg: string, ctx?: unknown) {
  // dev 全打 console；prod 只打 warn/error 到 console（方便浏览器开发者工具仍可见）
  if (!isProd || level === 'warn' || level === 'error') {
    consoleEmit(level, msg, ctx)
  }
  // prod 的 warn/error 上报后端
  if (isProd && (level === 'warn' || level === 'error')) {
    void reportToBackend(level, msg, ctx)
  }
}

export const logger = {
  debug(msg: string, ctx?: unknown) {
    emit('debug', msg, ctx)
  },
  info(msg: string, ctx?: unknown) {
    emit('info', msg, ctx)
  },
  warn(msg: string, ctx?: unknown) {
    emit('warn', msg, ctx)
  },
  error(msg: string, ctx?: unknown) {
    emit('error', msg, ctx)
  },
}
