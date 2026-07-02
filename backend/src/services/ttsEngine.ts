import type { TtsEngine } from '../types'
import { logger } from '../utils/logger'

/**
 * 统一 TTS 引擎切换器 —— 照搬 musicSource.ts 的工厂模式。
 *
 * 不管是 MiMo 预置音色、音色设计、音色复刻，
 * 都注册到这里，对外通过 getTtsEngine() 获取当前引擎。
 * 前端可通过 /tts-engines 接口切换，无需重启。
 *
 * 智能回落：若当前引擎未就绪（如 voiceclone 没传样本），
 * 自动回落到 mimo-tts（最稳定，开箱即用）。
 */

let currentEngineId = 'mimo-tts'
const engines = new Map<string, TtsEngine>()

// 就绪状态缓存（避免每次 getTtsEngine 都调一次 isReady）
interface ReadyCacheEntry {
  ready: boolean
  checkedAt: number
}
const readyCache = new Map<string, ReadyCacheEntry>()
const READY_CACHE_TTL = 30000 // 30 秒内复用就绪检查结果

export function registerTtsEngine(engine: TtsEngine) {
  engines.set(engine.id, engine)
  logger.info('TTS 引擎已注册', { id: engine.id, label: engine.label, kind: engine.kind })
}

/**
 * 获取当前 TTS 引擎。
 * 智能回落：若当前引擎未就绪，回落到 mimo-tts；全部未就绪则取第一个。
 */
export function getTtsEngine(): TtsEngine {
  const preferred = engines.get(currentEngineId)

  if (preferred && preferred.id !== currentEngineId) {
    // 理论不会走到，保险
    return preferred
  }

  if (preferred) {
    // 检查就绪（带缓存）
    const cached = readyCache.get(preferred.id)
    const now = Date.now()
    if (!cached || now - cached.checkedAt > READY_CACHE_TTL) {
      // 异步刷新（不阻塞当前请求，本轮先用旧值/兜底）
      preferred
        .isReady()
        .then((ready) => {
          readyCache.set(preferred.id, { ready, checkedAt: Date.now() })
          if (!ready) {
            logger.warn('TTS 引擎未就绪，本轮可能回落', { id: preferred.id })
          }
        })
        .catch(() => {
          readyCache.set(preferred.id, { ready: false, checkedAt: Date.now() })
        })
    }
    // 若缓存明确未就绪 → 回落 mimo-tts
    if (cached && cached.ready === false && preferred.id !== 'mimo-tts') {
      const fallback = engines.get('mimo-tts')
      if (fallback) return fallback
    }
    return preferred
  }

  // 回落 mimo-tts（最稳定）
  const fallback = engines.get('mimo-tts')
  if (fallback) return fallback

  // 最后兜底：取第一个注册的
  const first = Array.from(engines.values())[0]
  if (first) return first
  throw new Error('没有可用的 TTS 引擎')
}

export function getCurrentTtsEngineId(): string {
  return currentEngineId
}

export function setCurrentTtsEngine(id: string): boolean {
  if (!engines.has(id)) return false
  currentEngineId = id
  // 清掉就绪缓存，让下次 getTtsEngine 重新检查
  readyCache.delete(id)
  logger.info('TTS 引擎已切换', { id })
  return true
}

export function listTtsEngines() {
  return Array.from(engines.values()).map((e) => ({
    id: e.id,
    label: e.label,
    kind: e.kind,
    isCurrent: e.id === currentEngineId,
  }))
}

/**
 * 获取引擎列表（含就绪状态，供 /tts-engines 接口返回）。
 * 并行检查所有引擎的就绪状态。
 */
export async function listTtsEnginesWithReady() {
  const list = Array.from(engines.values())
  const results = await Promise.all(
    list.map(async (e) => {
      const cached = readyCache.get(e.id)
      const now = Date.now()
      let ready: boolean
      if (cached && now - cached.checkedAt <= READY_CACHE_TTL) {
        ready = cached.ready
      } else {
        try {
          ready = await e.isReady()
        } catch {
          ready = false
        }
        readyCache.set(e.id, { ready, checkedAt: now })
      }
      return {
        id: e.id,
        label: e.label,
        kind: e.kind,
        isCurrent: e.id === currentEngineId,
        isReady: ready,
      }
    })
  )
  return {
    engines: results,
    current: currentEngineId,
  }
}
