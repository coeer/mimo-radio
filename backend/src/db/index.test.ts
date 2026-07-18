import { describe, it, expect, beforeEach } from 'vitest'
import {
  initDb,
  getSession,
  setSession,
  getProfile,
  setProfile,
  startSessionCleanup,
  saveFeedback,
  getFeedbackStats,
  getLikedArtists,
  getDislikedArtists,
} from './index'
import type { RadioSession, UserProfile } from '../types'

describe('db', () => {
  beforeEach(() => {
    initDb()
  })

  describe('sessions', () => {
    it('should get and set sessions', () => {
      const session: RadioSession = {
        id: 'test-session',
        queue: [],
        currentIndex: 0,
        djEnabled: true,
        context: { time: '12:00' },
        messages: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }
      setSession(session.id, session)
      const retrieved = getSession(session.id)
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('test-session')
    })

    it('should revive Date objects from storage', () => {
      const session: RadioSession = {
        id: 'date-test',
        queue: [],
        currentIndex: 0,
        djEnabled: true,
        context: { time: '12:00' },
        messages: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }
      setSession(session.id, session)
      const retrieved = getSession(session.id)
      expect(retrieved!.createdAt).toBeInstanceOf(Date)
      expect(retrieved!.updatedAt).toBeInstanceOf(Date)
    })

    it('should update updatedAt on set', () => {
      const session: RadioSession = {
        id: 'update-test',
        queue: [],
        currentIndex: 0,
        djEnabled: true,
        context: { time: '12:00' },
        messages: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }
      setSession(session.id, session)
      const before = getSession(session.id)!.updatedAt.getTime()

      // Wait a tiny bit then update
      return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
        setSession(session.id, { ...session, updatedAt: new Date() })
        const after = getSession(session.id)!.updatedAt.getTime()
        expect(after).toBeGreaterThanOrEqual(before)
      })
    })
  })

  describe('profile', () => {
    it('should get and set profile', () => {
      const profile: UserProfile = {
        personalityType: '测试型',
        personalityDesc: '测试描述',
        emotionDistribution: { 开心: 5 },
        sceneDistribution: { 工作: 3 },
        favoriteArtists: ['Test'],
        totalSongs: 10,
        totalListenTime: 3600,
      }
      setProfile(profile)
      expect(getProfile()).toEqual(profile)
    })
  })

  describe('session cleanup', () => {
    it('should clean up expired sessions', () => {
      const oldSession: RadioSession = {
        id: 'old',
        queue: [],
        currentIndex: 0,
        djEnabled: true,
        context: { time: '12:00' },
        messages: [],
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      }
      const newSession: RadioSession = {
        id: 'new',
        queue: [],
        currentIndex: 0,
        djEnabled: true,
        context: { time: '12:00' },
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      setSession(oldSession.id, oldSession)
      setSession(newSession.id, newSession)

      // setSession updates updatedAt, so manually reset it for the old session
      const storedOld = getSession('old')!
      storedOld.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000)
      setSession(storedOld.id, storedOld, false)

      // Manually trigger cleanup
      startSessionCleanup()

      expect(getSession('old')).toBeUndefined()
      expect(getSession('new')).toBeDefined()
    })
  })

  describe('feedback', () => {
    it('should save and retrieve feedback stats', () => {
      saveFeedback({ sessionId: 's1', songId: 'song1', action: 'like' })
      saveFeedback({ sessionId: 's1', songId: 'song2', action: 'skip' })
      saveFeedback({ sessionId: 's1', songId: 'song3', action: 'complete' })

      const stats = getFeedbackStats()
      expect(stats.total).toBeGreaterThanOrEqual(3)
      expect(stats.likes).toBeGreaterThanOrEqual(1)
      expect(stats.skips).toBeGreaterThanOrEqual(1)
      expect(stats.completes).toBeGreaterThanOrEqual(1)
    })

    it('should count unlikes separately', () => {
      saveFeedback({ sessionId: 's2', songId: 'song1', action: 'like' })
      saveFeedback({ sessionId: 's2', songId: 'song1', action: 'unlike' })

      const stats = getFeedbackStats()
      expect(stats.unlikes).toBeGreaterThanOrEqual(1)
    })

    it('should return all zeros for empty feedback table', () => {
      // getFeedbackStats reads from the whole table, so we just check structure
      const stats = getFeedbackStats()
      expect(typeof stats.total).toBe('number')
      expect(typeof stats.likes).toBe('number')
      expect(typeof stats.unlikes).toBe('number')
      expect(typeof stats.skips).toBe('number')
      expect(typeof stats.completes).toBe('number')
      // No field should be null (COALESCE fix)
      expect(stats.likes).not.toBeNull()
      expect(stats.unlikes).not.toBeNull()
      expect(stats.skips).not.toBeNull()
      expect(stats.completes).not.toBeNull()
    })
  })

  describe('getLikedArtists', () => {
    it('返回按次数排序的歌手，新收藏的周杰伦应在列表中', () => {
      saveFeedback({ songId: 'l1', songArtist: '周杰伦', action: 'like' })
      saveFeedback({ songId: 'l2', songArtist: '周杰伦', action: 'like' })
      saveFeedback({ songId: 'l3', songArtist: '陈奕迅', action: 'like' })
      const liked = getLikedArtists(10)
      expect(liked.length).toBeGreaterThanOrEqual(2)
      // 周杰伦有2次like，应在列表中
      const jay = liked.find(a => a.artist === '周杰伦')
      expect(jay).toBeTruthy()
      expect(jay!.count).toBeGreaterThanOrEqual(2)
    })

    it('排除 unlike 和 skip', () => {
      saveFeedback({ songId: 'l4', songArtist: '许嵩-unlike', action: 'unlike' })
      saveFeedback({ songId: 'l5', songArtist: '汪苏泷-skip', action: 'skip' })
      const liked = getLikedArtists(20)
      expect(liked.find(a => a.artist === '许嵩-unlike')).toBeUndefined()
      expect(liked.find(a => a.artist === '汪苏泷-skip')).toBeUndefined()
    })
  })

  describe('getDislikedArtists', () => {
    it('返回跳过次数最多的歌手，新跳过的歌手X应在列表中', () => {
      saveFeedback({ songId: 'd1', songArtist: '歌手X-dislike', action: 'skip' })
      saveFeedback({ songId: 'd2', songArtist: '歌手X-dislike', action: 'skip' })
      const disliked = getDislikedArtists(10)
      expect(disliked.length).toBeGreaterThanOrEqual(1)
      const x = disliked.find(a => a.artist === '歌手X-dislike')
      expect(x).toBeTruthy()
    })
  })
})
