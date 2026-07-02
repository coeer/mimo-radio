import { Song } from '../types'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { logger, toErrorMeta } from '../utils/logger'
import { randomUUID } from 'crypto'

/**
 * 网易云音乐 API Service
 *
 * 策略（已实测验证）：
 *   - 搜索：免 cookie，走 music.163.com/api/search/get
 *   - 播放地址：走 /api/song/enhance/player/url/v1
 *     - fee=8（免费歌）：免 cookie 即可拿到 128kbps mp3
 *     - fee=1（VIP 歌）：url 为 null，需绿钻 cookie
 *   - 过滤：默认只保留 fee=8 的可播放歌曲，确保电台能出声
 *   - 兜底：outer/url 重定向接口（对部分老歌有效）
 */

const API_HOST = 'https://music.163.com'
const COMMON_HEADERS: Record<string, string> = {
  Referer: 'https://music.163.com',
  Origin: 'https://music.163.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

interface NeteaseSearchItem {
  id: number
  name: string
  artists?: Array<{ name: string }>
  album?: { name: string; id: number }
  duration?: number
}

interface PlayUrlItem {
  id: number
  url: string | null
  br: number
  size: number
  type: string | null
  code?: number
  fee?: number
}

interface NeteaseSongDetail {
  id: number
  al?: { picUrl?: string; name?: string }
  ar?: Array<{ name: string }>
}

class NeteaseService {
  /** 搜索歌曲（免 cookie） */
  async search(keyword: string, limit = 10): Promise<Song[]> {
    try {
      const url = `${API_HOST}/api/search/get?s=${encodeURIComponent(
        keyword
      )}&limit=${limit}&type=1`
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { ...COMMON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      }, 10000)
      const data = (await res.json()) as { code: number; result?: { songs?: NeteaseSearchItem[] } }
      if (data.code !== 200 || !data.result?.songs) return []

      const items = data.result.songs
      const ids = items.map((s) => s.id)
      // 并发拿播放地址 + 封面（两次网易云请求并行，节省约一倍耗时）
      const [urlMap, detailMap] = await Promise.all([
        this._batchGetPlayUrls(ids),
        this._batchGetSongDetails(ids),
      ])

      return items.map((s) => {
        const play = urlMap.get(s.id)
        const detail = detailMap.get(s.id)
        return {
          id: `ne_${s.id}`,
          title: s.name,
          artist: s.artists?.map((a) => a.name).join(', ') || '未知歌手',
          album: s.album?.name,
          duration: s.duration ? Math.floor(s.duration / 1000) : undefined,
          neteaseId: String(s.id),
          playUrl: play?.url || undefined,
          fee: play?.fee,
          playable: !!play?.url,
          coverUrl: detail?.al?.picUrl || undefined,
          emotionTags: [],
          sceneTags: [],
          platform: 'netease' as const,
        }
      })
    } catch (err) {
      logger.error('Netease search failed', { ...toErrorMeta(err) })
      return []
    }
  }

  /**
   * 搜索并只返回可播放（fee=8）的歌曲。
   * 这是电台主链路用的方法，确保每首歌都能放出声音。
   */
  async searchPlayable(keyword: string, limit = 10): Promise<Song[]> {
    // 多抓一些再过滤，因为很多是 VIP
    const all = await this.search(keyword, Math.min(limit * 3, 30))
    const playable = all.filter((s) => s.playable)
    logger.debug('Netease searchPlayable', {
      keyword, total: all.length, playable: playable.length,
    })
    return playable.slice(0, limit)
  }

  /** 单曲播放地址 */
  async getPlayUrl(neteaseId: string): Promise<string | null> {
    const map = await this._batchGetPlayUrls([Number(neteaseId)])
    return map.get(Number(neteaseId))?.url || null
  }

  /** 获取歌词（LRC 原文） */
  async getLyric(neteaseId: string): Promise<{ lyric: string; tlyric?: string } | null> {
    try {
      const id = Number(neteaseId)
      if (!id) return null
      const url = `${API_HOST}/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1`
      const res = await fetchWithTimeout(url, {
        headers: COMMON_HEADERS,
      }, 10000)
      const data = (await res.json()) as {
        code: number
        lrc?: { lyric?: string }
        tlyric?: { lyric?: string }
      }
      if (data.code !== 200) return null
      const lyric = data.lrc?.lyric || ''
      const tlyric = data.tlyric?.lyric || undefined
      if (!lyric) return null
      return { lyric, tlyric }
    } catch (err) {
      logger.error('Netease getLyric failed', { ...toErrorMeta(err) })
      return null
    }
  }

  /** 批量获取播放地址（带 fee 信息） */
  private async _batchGetPlayUrls(ids: number[]): Promise<Map<number, PlayUrlItem>> {
    const result = new Map<number, PlayUrlItem>()
    if (ids.length === 0) return result

    try {
      const url = `${API_HOST}/api/song/enhance/player/url/v1?ids=[${ids.join(
        ','
      )}]&level=standard&encodeType=mp3`
      const res = await fetchWithTimeout(url, {
        headers: COMMON_HEADERS,
      }, 10000)
      const data = (await res.json()) as { code: number; data?: PlayUrlItem[] }
      if (data.code === 200 && data.data) {
        for (const item of data.data) {
          result.set(item.id, item)
        }
      }
    } catch (err) {
      logger.error('Netease batchGetPlayUrls failed', { ...toErrorMeta(err) })
    }
    return result
  }

  /** 批量获取歌曲详情（封面等） */
  private async _batchGetSongDetails(ids: number[]): Promise<Map<number, NeteaseSongDetail>> {
    const result = new Map<number, NeteaseSongDetail>()
    if (ids.length === 0) return result

    try {
      // 网易云 v3 详情接口：POST c 参数为 JSON 数组字符串
      const c = JSON.stringify(ids.map((id) => ({ id })))
      const url = `${API_HOST}/api/v3/song/detail`
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { ...COMMON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `c=${encodeURIComponent(c)}`,
      }, 10000)
      const data = (await res.json()) as { code: number; songs?: NeteaseSongDetail[] }
      if (data.code === 200 && data.songs) {
        for (const song of data.songs) {
          result.set(song.id, song)
        }
      }
    } catch (err) {
      logger.error('Netease batchGetSongDetails failed', { ...toErrorMeta(err) })
    }
    return result
  }

  /** outer/url 重定向接口 —— 老歌/部分免费歌可用（兜底） */
  getOuterPlayUrl(neteaseId: string): string {
    return `${API_HOST}/song/media/outer/url?id=${neteaseId}.mp3`
  }

  /** 解析导出的歌单 JSON（保留兼容） */
  parsePlaylist(html: string): Song[] {
    const songs: Song[] = []
    try {
      const data = JSON.parse(html) as unknown
      if (Array.isArray(data)) {
        return data.map((s: any) => ({
          id: String(s.id || randomUUID()),
          title: s.title || s.name || 'Unknown',
          artist: s.artist || s.ar?.[0]?.name || 'Unknown',
          album: s.album || s.al?.name,
          neteaseId: String(s.id || ''),
          playUrl: s.id ? this.getOuterPlayUrl(String(s.id)) : undefined,
          emotionTags: [],
          sceneTags: [],
          platform: 'netease' as const,
        }))
      }
    } catch {
      const regex = /(\d+)\s*-\s*(.+?)\s*-\s*(.+?)(?:\n|$)/g
      let match
      while ((match = regex.exec(html)) !== null) {
        songs.push({
          id: match[1],
          title: match[2].trim(),
          artist: match[3].trim(),
          neteaseId: match[1],
          playUrl: this.getOuterPlayUrl(match[1]),
          emotionTags: [],
          sceneTags: [],
          platform: 'netease' as const,
        })
      }
    }
    return songs
  }
}

export const neteaseService = new NeteaseService()
