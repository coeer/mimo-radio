import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { qqMusicService } from './qqmusic'

const mockFetch = vi.mocked(fetchWithTimeout)

function mockJsonResponse(data: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response
}

describe('qqMusicService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('search', () => {
    it('should search and return songs', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          data: {
            song: {
              itemlist: [
                { id: 123, mid: 'abc123', name: '晴天', singer: [{ name: '周杰伦' }], album: { name: '叶惠美', mid: 'def456' }, interval: 269 },
              ],
            },
          },
        })
      )

      // Mock vkey API for play URL
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          req_0: {
            data: {
              midurlinfo: [{ songmid: 'abc123', vkey: 'testkey', purl: 'abc123.m4a' }],
            },
          },
        })
      )

      const songs = await qqMusicService.search('晴天', 5)
      expect(songs.length).toBe(1)
      expect(songs[0].title).toBe('晴天')
      expect(songs[0].artist).toBe('周杰伦')
      expect(songs[0].platform).toBe('qq')
      expect(songs[0].qqMusicMid).toBe('abc123')
    })

    it('should return empty array on search failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const songs = await qqMusicService.search('test')
      expect(songs).toEqual([])
    })

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ data: { song: { itemlist: [] } } })
      )

      const songs = await qqMusicService.search('nonexistent')
      expect(songs).toEqual([])
    })
  })

  describe('getPlayUrl', () => {
    it('should return play URL for valid mid', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          req_0: {
            data: {
              midurlinfo: [{ songmid: 'abc123', vkey: 'key123', purl: 'abc123.m4a' }],
            },
          },
        })
      )

      const url = await qqMusicService.getPlayUrl('abc123')
      expect(url).toContain('abc123')
      expect(url).toContain('qqmusic.qq.com')
    })

    it('should return null when no purl available', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          req_0: {
            data: {
              midurlinfo: [{ songmid: 'vip-song', vkey: '', purl: '' }],
            },
          },
        })
      )

      const url = await qqMusicService.getPlayUrl('vip-song')
      expect(url).toBeNull()
    })
  })

  describe('getLyric', () => {
    it('should parse JSONP lyric response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('MusicJsonCallback({"lyric":"[00:01]歌词","trans":"[00:01]translation"})'),
      } as Response)

      const lyric = await qqMusicService.getLyric('abc123')
      expect(lyric).toBeDefined()
      expect(lyric!.lyric).toContain('歌词')
      expect(lyric!.transLyric).toContain('translation')
    })

    it('should return null on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      const lyric = await qqMusicService.getLyric('abc123')
      expect(lyric).toBeNull()
    })
  })
})
