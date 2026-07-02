import { Song } from '../types'
import { logger } from '../utils/logger'

/**
 * 统一音源接口 —— 不管 QQ 还是网易云，对外都长这样。
 * engine.ts / radio.ts 只认这个接口，不关心具体实现。
 */
export interface MusicSource {
  /** 标识 */
  readonly id: 'netease' | 'qq'
  /** 显示名 */
  readonly label: string
  /** 是否就绪（QQ 依赖 webbridge+浏览器登录态） */
  isReady(): Promise<boolean>
  /** 搜索可播放的歌曲 */
  searchPlayable(keyword: string, limit?: number): Promise<Song[]>
  /** 单曲播放地址 */
  getPlayUrl(songId: string): Promise<string | null>
}

// ── Provider 切换器 ──
// QQ 音乐为默认首选（用户数据最完整），网易云作兜底
let currentSourceId: 'netease' | 'qq' = 'qq'
const sources = new Map<string, MusicSource>()
// QQ 就绪状态缓存（避免每次 getMusicSource 都同步检查 webbridge）
let qqReadyCache: boolean | null = null
let qqReadyCacheTime = 0
const QQ_READY_CACHE_TTL = 30000 // 30 秒内复用就绪检查结果

export function registerMusicSource(source: MusicSource) {
  sources.set(source.id, source)
  logger.info('音源已注册', { id: source.id, label: source.label })
}

/**
 * 获取当前音源。
 * 智能回落：若首选是 QQ 但 QQ 未就绪（webbridge/浏览器没开），
 * 自动回落到网易云，保证总有歌可放。
 */
export function getMusicSource(): MusicSource {
  const preferred = sources.get(currentSourceId)
  if (preferred && preferred.id !== 'qq') {
    return preferred
  }
  // 首选 QQ：检查就绪（用缓存避免频繁调 webbridge）
  if (preferred?.id === 'qq') {
    const now = Date.now()
    if (qqReadyCache === null || now - qqReadyCacheTime > QQ_READY_CACHE_TTL) {
      // 异步刷新缓存（不阻塞当前请求，本轮先用旧值/兜底）
      preferred.isReady().then((ready) => {
        qqReadyCache = ready
        qqReadyCacheTime = Date.now()
        if (!ready) logger.warn('QQ 未就绪，本轮回落网易云', {})
      }).catch(() => { qqReadyCache = false; qqReadyCacheTime = Date.now() })
    }
    if (qqReadyCache === false) {
      // QQ 明确未就绪 → 回落网易云
      const netease = sources.get('netease')
      if (netease) return netease
    }
    return preferred
  }
  // 回落第一个注册的
  const first = Array.from(sources.values())[0]
  if (first) return first
  throw new Error('没有可用的音源')
}

export function getCurrentSourceId(): string {
  return currentSourceId
}

export function setCurrentSourceId(id: 'netease' | 'qq'): boolean {
  if (!sources.has(id)) return false
  currentSourceId = id
  logger.info('音源已切换', { id })
  return true
}

export function listMusicSources() {
  return Array.from(sources.values()).map((s) => ({
    id: s.id,
    label: s.label,
    isCurrent: s.id === currentSourceId,
  }))
}

/**
 * 获取所有已注册的音源实例（供 engine.ts 做 fallback 搜索）。
 * 当前首选排第一，其余按注册顺序。
 */
export function getAllMusicSources(): MusicSource[] {
  const preferred = sources.get(currentSourceId)
  const rest = Array.from(sources.values()).filter((s) => s.id !== currentSourceId)
  return preferred ? [preferred, ...rest] : rest
}
