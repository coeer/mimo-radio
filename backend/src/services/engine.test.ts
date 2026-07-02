import { describe, it, expect, beforeEach } from 'vitest'
import { loadMockSongs, getSongPool, generateQueue, createSession, filterByMood, calculateSimilarity, MOCK_SONGS } from './engine'
import type { Song } from '../types'

describe('engine', () => {
  beforeEach(() => {
    loadMockSongs()
  })

  describe('loadMockSongs', () => {
    it('should not mutate original MOCK_SONGS', () => {
      // Verify original MOCK_SONGS has no playUrl
      expect(MOCK_SONGS[0].playUrl).toBeUndefined()
      // Pool should have playUrl (from cloned copy)
      const pool = getSongPool()
      expect(pool.length).toBeGreaterThan(0)
      expect(pool[0].playUrl).toBeDefined()
    })

    it('should populate song pool', () => {
      const pool = getSongPool()
      expect(pool.length).toBeGreaterThan(0)
    })
  })

  describe('filterByMood', () => {
    it('should return all songs when no mood provided', () => {
      const pool = getSongPool()
      const result = filterByMood(pool, undefined)
      expect(result.length).toBe(pool.length)
    })

    it('should filter by emotion tag', () => {
      const pool = getSongPool()
      const result = filterByMood(pool, '温暖')
      expect(result.length).toBeGreaterThan(0)
      expect(result.every(s =>
        s.emotionTags.some(t => t.includes('温暖')) ||
        s.sceneTags.some(t => t.includes('温暖')) ||
        s.title.includes('温暖') ||
        s.artist.includes('温暖')
      )).toBe(true)
    })

    it('should fallback to all songs when no match', () => {
      const pool = getSongPool()
      const result = filterByMood(pool, 'xyznonexistent')
      expect(result.length).toBe(pool.length)
    })
  })

  describe('calculateSimilarity', () => {
    it('should score same artist higher', () => {
      const a: Song = {
        id: '1', title: 'A', artist: 'Same',
        emotionTags: ['a'], sceneTags: ['b'], moodScore: 5
      }
      const b: Song = {
        id: '2', title: 'B', artist: 'Same',
        emotionTags: ['c'], sceneTags: ['d'], moodScore: 5
      }
      const score = calculateSimilarity(a, b)
      expect(score).toBeGreaterThan(0.3) // same artist bonus
    })

    it('should score overlapping emotions higher', () => {
      const a: Song = {
        id: '1', title: 'A', artist: 'A1',
        emotionTags: ['温暖', '治愈'], sceneTags: [], moodScore: 5
      }
      const b: Song = {
        id: '2', title: 'B', artist: 'B1',
        emotionTags: ['温暖', '治愈'], sceneTags: [], moodScore: 5
      }
      const score = calculateSimilarity(a, b)
      expect(score).toBeGreaterThan(0.5) // 2 emotion overlaps * 0.25 = 0.5
    })
  })

  describe('generateQueue', () => {
    it('should generate queue of requested length', () => {
      const pool = getSongPool()
      const queue = generateQueue(pool, undefined, 10)
      expect(queue.length).toBe(10)
    })

    it('should not exceed available songs', () => {
      const pool = getSongPool()
      const queue = generateQueue(pool, undefined, 1000)
      expect(queue.length).toBeLessThanOrEqual(pool.length)
    })

    it('should place seed song first', () => {
      const pool = getSongPool()
      const seedId = pool[5].id
      const queue = generateQueue(pool, seedId, 10)
      expect(queue[0].id).toBe(seedId)
    })

    it('should not repeat songs', () => {
      const pool = getSongPool()
      const queue = generateQueue(pool, undefined, 10)
      const ids = queue.map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('createSession', () => {
    it('should create a session with queue', () => {
      const session = createSession('温暖')
      expect(session.queue.length).toBeGreaterThan(0)
      expect(session.currentIndex).toBe(0)
      expect(session.djEnabled).toBe(true)
    })

    it('should use provided context', () => {
      const context = {
        time: '14:00',
        weather: { city: 'Beijing', temp: 22, condition: 'Clear', description: '晴天' },
      }
      const session = createSession('温暖', true, undefined, context)
      expect(session.context.time).toBe('14:00')
    })
  })
})
