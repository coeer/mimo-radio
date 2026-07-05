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
  private likedArtists: CacheEntry<ArtistTaste> | null = null
  private dislikedArtists: CacheEntry<ArtistTaste> | null = null

  private isExpired<T>(entry: CacheEntry<T> | null): boolean {
    return !entry || entry.expiresAt < Date.now()
  }

  /** 取 liked artists；limit 与 db 层默认 5 对齐 */
  async getLikedArtists(limit = 5): Promise<ArtistTaste> {
    if (this.isExpired(this.likedArtists)) {
      this.likedArtists = {
        value: getLikedArtists(limit),
        expiresAt: Date.now() + TTL_MS,
      }
    }
    // 此分支里 this.likedArtists 已被重新赋值，TS 跨过 if 边界仍报 null
    // 用非空断言兜底（isExpired(true) 路径已保证赋值）
    return this.likedArtists!.value
  }

  /** 取 disliked artists；limit 与 db 层默认 3 对齐 */
  async getDislikedArtists(limit = 3): Promise<ArtistTaste> {
    if (this.isExpired(this.dislikedArtists)) {
      this.dislikedArtists = {
        value: getDislikedArtists(limit),
        expiresAt: Date.now() + TTL_MS,
      }
    }
    return this.dislikedArtists!.value
  }

  /** 立即清空所有缓存 —— 在 saveFeedback 写入后调用 */
  invalidate(): void {
    this.likedArtists = null
    this.dislikedArtists = null
  }
}

export const tasteCache = new TasteCache()
