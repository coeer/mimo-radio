/**
 * Taste 查询缓存 —— 给低频变化的品味查询加 30s TTL。
 *
 * 根因（P2.1）：每次 chat/next 请求都会查 getLikedArtists + getDislikedArtists（2 次 SQLite）。
 * taste 数据只在用户主动反馈（saveFeedback）时才变化，频率极低，所以完全值得加缓存。
 *
 * 设计要点：
 * - 30s TTL：覆盖用户连续聊天的 1 个会话生命周期；同时限制"刚反馈完没生效"的最大延迟
 * - 只缓存 taste 类查询（likedArtists / dislikedArtists），不缓存 chat 消息、session 等高频变化数据
 * - feedback 写入时立即 invalidate，保证一致性（routes 层调用，避免污染 db 层）
 * - 单用户本地应用，不引入锁/Redis（COLLABORATION §六.陷阱 3）
 */

import { getLikedArtists, getDislikedArtists } from '../db'

/** 与 db 层返回类型保持一致 —— 改 db 时务必同步这里 */
export type ArtistTaste = Array<{ artist: string; count: number }>

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const TTL_MS = 30 * 1000 // 30s

class TasteCache {
  // P0b-4（B6）：key = `liked:${limit}` / `disliked:${limit}`。
  // 原单槽缓存的 bug：radio.ts:222 用 limit=3、radio.ts:354 用 limit=5，30s 内先到先得，
  // 后到的 limit 命中前一个的缓存，limit 语义丢失（隐藏的数据正确性 bug）。
  private cache = new Map<string, CacheEntry<ArtistTaste>>()

  private isExpired<T>(entry: CacheEntry<T> | null | undefined): boolean {
    return !entry || entry.expiresAt < Date.now()
  }

  /** 取 liked artists；limit 与 db 层默认 5 对齐 */
  async getLikedArtists(limit = 5): Promise<ArtistTaste> {
    const key = `liked:${limit}`
    const entry = this.cache.get(key)
    if (this.isExpired(entry)) {
      this.cache.set(key, {
        value: getLikedArtists(limit),
        expiresAt: Date.now() + TTL_MS,
      })
    }
    // isExpired(false) 路径已保证 set 执行，非空断言兜底
    return this.cache.get(key)!.value
  }

  /** 取 disliked artists；limit 与 db 层默认 3 对齐 */
  async getDislikedArtists(limit = 3): Promise<ArtistTaste> {
    const key = `disliked:${limit}`
    const entry = this.cache.get(key)
    if (this.isExpired(entry)) {
      this.cache.set(key, {
        value: getDislikedArtists(limit),
        expiresAt: Date.now() + TTL_MS,
      })
    }
    return this.cache.get(key)!.value
  }

  /** 立即清空所有缓存 —— 在 saveFeedback 写入后调用 */
  invalidate(): void {
    this.cache.clear()
  }
}

export const tasteCache = new TasteCache()
