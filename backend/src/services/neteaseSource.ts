import { MusicSource } from './musicSource'
import { Song } from '../types'
import { neteaseService } from './netease'
import { logger, toErrorMeta } from '../utils/logger'

/**
 * 网易云音源 —— 适配统一 MusicSource 接口。
 * 免 cookie 搜索 + 官方接口拿免费歌（fee=8）播放地址。
 */
export const neteaseMusicSource: MusicSource = {
  id: 'netease',
  label: '网易云',

  async isReady() {
    // 网易云免 cookie，永远就绪
    return true
  },

  async searchPlayable(keyword: string, limit = 10): Promise<Song[]> {
    return neteaseService.searchPlayable(keyword, limit)
  },

  async getPlayUrl(songId: string): Promise<string | null> {
    // songId 格式 ne_xxx，提取 neteaseId
    const neteaseId = songId.startsWith('ne_') ? songId.slice(3) : songId
    try {
      return await neteaseService.getPlayUrl(neteaseId)
    } catch (err) {
      logger.error('neteaseSource getPlayUrl failed', { songId, ...toErrorMeta(err) })
      return null
    }
  },
}
