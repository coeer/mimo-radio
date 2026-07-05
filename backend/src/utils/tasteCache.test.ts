import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 关键：mock ../db（必须在 import 之前）
const mockGetLikedArtists = vi.fn(() => [
  { artist: '周杰伦', count: 3 },
  { artist: '陈奕迅', count: 1 },
])
const mockGetDislikedArtists = vi.fn(() => [
  { artist: '许嵩', count: 2 },
])

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
    it('首次 getLikedArtists 触发 1 次 db 调用；第二次同会话直接走缓存', async () => {
      const first = await tasteCache.getLikedArtists(3)
      const second = await tasteCache.getLikedArtists(3)
      const third = await tasteCache.getLikedArtists(5)

      expect(first).toEqual(second)
      expect(first).toEqual(third) // 内容是同一个数组（limit 仅影响 db 层 → 这里相等因为都无截断差异）
      // 30s 内 db 函数只被调 1 次
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

  describe('不同 limit 仅在缓存 miss 时影响 db 调用', () => {
    it('缓存命中时无论传什么 limit 都返回同一份缓存值', async () => {
      mockGetLikedArtists.mockReturnValueOnce([
        { artist: 'A', count: 5 },
        { artist: 'B', count: 3 },
        { artist: 'C', count: 1 },
      ])
      const first = await tasteCache.getLikedArtists(3) // limit=3 取 3 个
      // 第二次 limit=2 但缓存的是数组引用（db 层 limit 由调用方决定，cache 拿到的是数组本身）
      const second = await tasteCache.getLikedArtists(2)
      // 我们的 cache 是直接缓存 db 的返回值，不依赖 limit，因此 limit 不会自动截断
      // 这是已知设计：limit 仅控制 db 第一次查询的截断；之后从缓存返回。
      expect(first).toBe(second)
      expect(mockGetLikedArtists).toHaveBeenCalledTimes(1)
      expect(mockGetLikedArtists).toHaveBeenCalledWith(3)
    })
  })
})
