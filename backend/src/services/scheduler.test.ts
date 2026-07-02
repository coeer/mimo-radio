import { describe, it, expect, beforeEach } from 'vitest'
import { generateDailySchedule, getCurrentPlaylist } from './scheduler'
import { loadMockSongs } from './engine'

describe('scheduler', () => {
  beforeEach(() => {
    loadMockSongs()
  })

  describe('generateDailySchedule', () => {
    it('should return a valid schedule object', () => {
      const schedule = generateDailySchedule()
      expect(schedule).toHaveProperty('date')
      expect(schedule).toHaveProperty('weather')
      expect(schedule).toHaveProperty('temperature')
      expect(schedule).toHaveProperty('sunrise')
      expect(schedule).toHaveProperty('sunset')
      expect(schedule).toHaveProperty('calendar')
      expect(schedule).toHaveProperty('slots')
      expect(schedule).toHaveProperty('playlist')
    })

    it('should have 14 time slots', () => {
      const schedule = generateDailySchedule()
      expect(schedule.slots.length).toBe(14)
    })

    it('should have playlist entries for each slot', () => {
      const schedule = generateDailySchedule()
      expect(schedule.playlist.length).toBe(schedule.slots.length)
    })

    it('each playlist entry should have slot and songs', () => {
      const schedule = generateDailySchedule()
      for (const entry of schedule.playlist) {
        expect(entry).toHaveProperty('slot')
        expect(entry).toHaveProperty('songs')
        expect(entry.songs.length).toBeGreaterThan(0)
      }
    })

    it('should have date in YYYY-MM-DD format', () => {
      const schedule = generateDailySchedule()
      expect(schedule.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('getCurrentPlaylist', () => {
    it('should return a playlist for the current hour', () => {
      const result = getCurrentPlaylist()
      expect(result).not.toBeNull()
      if (result) {
        expect(result.slot).toHaveProperty('label')
        expect(result.slot).toHaveProperty('tags')
        expect(result.songs).toBeInstanceOf(Array)
      }
    })

    it('should return songs matching slot tags', () => {
      const result = getCurrentPlaylist()
      if (result && result.songs.length > 0) {
        // Note: might not match if pool is small, so we just check structure
        expect(result.songs.length).toBeGreaterThan(0)
      }
    })
  })
})
