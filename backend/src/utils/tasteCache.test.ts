import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 关键：mock ../db（必须在 import 之前）
// mock 按 limit 截断返回，让不同 limit 的结果可区分（P0b-4 分 key 验证需要）
const mockGetLikedArtists = vi.fn((limit = 5) =>
  [
    { artist: '周杰伦', count: 3 },
    { artist: '陈奕迅', count: 1 },
    { artist: '林俊杰', count: 2 },
    { artist: '邓紫棋', count: 1 },
    { artist: '薛之谦', count: 1 },
  ].slice(0, limit)
)
const mockGetDislikedArtists = vi.fn((limit = 3) =>
  [
    { artist: '许嵩', count: 2 },
    { artist: '汪苏泷', count: 1 },
    { artist: '徐良', count: 1 },
  ].slice(0, limit)
)

vi.mock('../db', () => ({
  getLikedArtists: (...args: unknown[]) => (mockGetLikedArtists as (...a: unknown[]) => unknown)(...args),
  getDislikedArtists: (...args: unknown[]) => (mockGetDislikedArtists as (...a: unknown[]) => unknown)(...args),
}))

import { tasteCache } from './tasteCache'

describe('tasteCache', () => {
  beforeEach(() => {
    mockGetLikedArtists.mockClear()
    mockGetDislikedArtists.mockClear()
    tasteCache.invalidate() // 每个测试用例前清缓存
  })

  afterEach(() => {
    tasteCache.invalidate()
  })

  describe('cache hit', () => {
    it('首次 getLikedArtists 触发 1 次 db 调用；同 limit 第二次直接走缓存', async () => {
      const first = await tasteCache.getLikedArtists(3)
      const second = await tasteCache.getLikedArtists(3)

      expect(first).toEqual(second)
      expect(first).toHaveLength(3)
      // 30s 内同 key db 函数只被调 1 次
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(1)
    })

    it('likedArtists 与 dislikedArtists 独立缓存（不影响彼此）', async () => {
      await tasteCache.getLikedArtists(3)
      await tasteCache.getDislikedArtists(3)
      await tasteCache.getLikedArtists(3)
      await tasteCache.getDislikedArtists(3)

      expect(mockGetLikedArtists).toHaveBeenCalledTimes(1)
      expect(mockGetDislikedArtists).toHaveBeenCalledTimes(1)
    })
  })

  describe('cache expire', () => {
    it('TTL 过期后下次调用重新查 DB', async () => {
      vi.useFakeTimers()

      // 首次
      await tasteCache.getLikedArtists(3)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(1)

      // TTL 内（30s 之前）：仍走缓存
      vi.advanceTimersByTime(29 * 1000)
      await tasteCache.getLikedArtists(3)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(1)

      // 跨过 TTL：重新查 DB
      vi.advanceTimersByTime(2 * 1000) // 总共 31s
      await tasteCache.getLikedArtists(3)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('invalidate', () => {
    it('invalidate() 立即清空，下次调用重新查 DB', async () => {
      await tasteCache.getLikedArtists(3)
      await tasteCache.getDislikedArtists(3)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(1)
      expect(mockGetDislikedArtists).toHaveBeenCalledTimes(1)

      tasteCache.invalidate()

      // invalidate 后重新查
      await tasteCache.getLikedArtists(3)
      await tasteCache.getDislikedArtists(3)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(2)
      expect(mockGetDislikedArtists).toHaveBeenCalledTimes(2)
    })

    it('invalidate() 在 30s TTL 之前立即生效（不等过期）', async () => {
      vi.useFakeTimers()

      await tasteCache.getLikedArtists(3)
      vi.advanceTimersByTime(5 * 1000) // 远未到 TTL
      tasteCache.invalidate()
      await tasteCache.getLikedArtists(3)

      expect(mockGetLikedArtists).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('invalidate() 同步触发，无 await（反馈后立即清）', () => {
      // 不应用 await —— 见规格「invalidate 是同步的」
      // 这里直接验证返回值是 void
      expect(tasteCache.invalidate()).toBeUndefined()
    })
  })

  describe('不同 limit 不互相污染（P0b-4 / B6）', () => {
    it('30s 内先调 limit=3 再调 limit=5，各自独立查 db，limit 语义不丢失', async () => {
      const three = await tasteCache.getLikedArtists(3)
      const five = await tasteCache.getLikedArtists(5)

      // 原单槽 bug：limit=5 会命中 limit=3 的缓存（返回 3 个）
      expect(three).toHaveLength(3)
      expect(five).toHaveLength(5)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(2)
      expect(mockGetLikedArtists).toHaveBeenNthCalledWith(1, 3)
      expect(mockGetLikedArtists).toHaveBeenNthCalledWith(2, 5)
    })

    it('同 limit 重复调用仍走缓存（分 key 不破坏缓存收益）', async () => {
      await tasteCache.getLikedArtists(3)
      await tasteCache.getLikedArtists(5)
      await tasteCache.getLikedArtists(3)
      await tasteCache.getLikedArtists(5)

      expect(mockGetLikedArtists).toHaveBeenCalledTimes(2)
    })

    it('disliked 同样按 limit 分 key', async () => {
      const two = await tasteCache.getDislikedArtists(2)
      const three = await tasteCache.getDislikedArtists(3)

      expect(two).toHaveLength(2)
      expect(three).toHaveLength(3)
      expect(mockGetDislikedArtists).toHaveBeenCalledTimes(2)
    })
  })
})
