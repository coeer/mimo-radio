import { Song } from '../types'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { logger, toErrorMeta } from '../utils/logger'

/**
 * QQ Music API Service
 * Unofficial API wrapper for Tencent QQ Music (y.qq.com)
 *
 * Provides:
 *   - search(keyword, limit)
 *   - getPlayUrl(songMid)
 *   - getLyric(songMid)
 *   - getSongDetail(songMid)
 *
 * Note: VIP songs may return empty playUrl. Links are time-limited.
 */

const REFERER = 'https://y.qq.com/'
const ORIGIN = 'https://y.qq.com'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const COMMON_HEADERS = {
  Referer: REFERER,
  Origin: ORIGIN,
  'User-Agent': USER_AGENT,
}

interface QQSearchItem {
  id: string
  mid: string
  name: string
  singer: string
  album: string
  albumMid: string
  duration?: number
}

interface VkeyResponse {
  req_0?: {
    data?: {
      midurlinfo?: Array<{
        songmid: string
        vkey: string
        purl: string
      }>
    }
  }
}

function buildVkeyBody(songMids: string[]) {
  return {
    req: {
      module: 'CDN.SrfCdnDispatchServer',
      method: 'GetCdnDispatch',
      param: {
        guid: '1234567890',
        calltype: 0,
        userip: '',
      },
    },
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: '1234567890',
        songmid: songMids,
        songtype: songMids.map(() => 0),
        uin: '0',
        loginflag: 1,
        platform: '20',
      },
    },
  }
}

class QQMusicService {
  /**
   * Search songs by keyword
   */
  async search(keyword: string, limit = 20): Promise<Song[]> {
    try {
      const url = `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=${encodeURIComponent(
        keyword
      )}&format=json`

      const res = await fetchWithTimeout(url, { headers: COMMON_HEADERS }, 10000)
      const data = (await res.json()) as any

      const items: QQSearchItem[] = []
      const songList = data?.data?.song?.itemlist || []

      for (const item of songList.slice(0, limit)) {
        items.push({
          id: String(item.id || item.mid),
          mid: item.mid,
          name: item.name,
          singer: item.singer?.map((s: any) => s.name || s).join(', ') || '未知歌手',
          album: item.album?.name || '',
          albumMid: item.album?.mid || '',
          duration: item.interval,
        })
      }

      // Enrich with playUrl in batch
      const mids = items.map((i) => i.mid).filter(Boolean)
      const urlMap = mids.length > 0 ? await this._batchGetPlayUrls(mids) : new Map()

      return items.map((item) => {
        const playUrl = urlMap.get(item.mid) || null
        return {
          id: `qq_${item.mid}`,
          title: item.name,
          artist: item.singer,
          album: item.album,
          duration: item.duration,
          coverUrl: item.albumMid
            ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.albumMid}.jpg`
            : undefined,
          playUrl: playUrl || undefined,
          emotionTags: [],
          sceneTags: [],
          platform: 'qq' as const,
          qqMusicMid: item.mid,
        }
      })
    } catch (err) {
      logger.error('QQMusic search failed', { ...toErrorMeta(err) })
      return []
    }
  }

  /**
   * Get play URL for a single song mid
   */
  async getPlayUrl(songMid: string): Promise<string | null> {
    const map = await this._batchGetPlayUrls([songMid])
    return map.get(songMid) || null
  }

  /**
   * Get lyric for a song
   */
  async getLyric(songMid: string): Promise<{ lyric: string; transLyric?: string } | null> {
    try {
      const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songMid}&format=json&nobase64=1&songtype=0&callback=MusicJsonCallback`

      const res = await fetchWithTimeout(url, { headers: COMMON_HEADERS }, 10000)
      const text = await res.text()

      // Strip JSONP wrapper: MusicJsonCallback({...})
      const jsonStr = text.replace(/^MusicJsonCallback\(|\);?$/g, '')
      const data = JSON.parse(jsonStr)

      return {
        lyric: data.lyric || '',
        transLyric: data.trans || undefined,
      }
    } catch (err) {
      logger.error('QQMusic getLyric failed', { ...toErrorMeta(err) })
      return null
    }
  }

  /**
   * Get song detail (album info, artists, etc.)
   */
  async getSongDetail(songMid: string): Promise<Partial<Song> | null> {
    try {
      const requestBody = {
        req_0: {
          module: 'music.pf_song_detail_svr',
          method: 'GetSongDetail',
          param: {
            song_mid: [songMid],
            song_type: [0],
          },
        },
        comm: {
          g_tk: 5381,
          uin: 0,
          format: 'json',
          platform: 'h5',
        },
      }

      const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(
        JSON.stringify(requestBody)
      )}`

      const res = await fetchWithTimeout(url, { headers: COMMON_HEADERS }, 10000)
      const data = (await res.json()) as any

      const track = data?.req_0?.data?.track_info
      if (!track) return null

      return {
        id: `qq_${track.mid}`,
        title: track.name,
        artist: track.singer?.map((s: any) => s.name).join(', ') || '未知',
        album: track.album?.name,
        coverUrl: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.album?.mid}.jpg`,
        duration: track.interval,
        platform: 'qq' as const,
        qqMusicMid: track.mid,
      }
    } catch (err) {
      logger.error('QQMusic getSongDetail failed', { ...toErrorMeta(err) })
      return null
    }
  }

  /**
   * Batch get play URLs via vkey API
   */
  private async _batchGetPlayUrls(songMids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    if (songMids.length === 0) return result

    try {
      const body = buildVkeyBody(songMids)
      const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 15000)
      const data = (await res.json()) as VkeyResponse

      const infos = data?.req_0?.data?.midurlinfo || []
      for (const info of infos) {
        if (info.purl) {
          const playUrl = `https://isure.stream.qqmusic.qq.com/${info.purl}`
          result.set(info.songmid, playUrl)
        }
      }
    } catch (err) {
      logger.error('QQMusic batchGetPlayUrls failed', { ...toErrorMeta(err) })
    }

    return result
  }
}

export const qqMusicService = new QQMusicService()
