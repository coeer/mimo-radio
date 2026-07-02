import { describe, it, expect, vi } from 'vitest'

// fetchWithTimeout 全 mock，确保不发真实网络请求
vi.mock('../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

import { neteaseService } from './netease'

describe('NeteaseService 纯逻辑方法', () => {
  describe('getOuterPlayUrl', () => {
    it('用 neteaseId 拼出 outer/url 重定向地址', () => {
      const url = neteaseService.getOuterPlayUrl('12345')
      expect(url).toContain('id=12345')
      expect(url).toContain('music.163.com')
      expect(url.endsWith('.mp3')).toBe(true)
    })
  })

  describe('parsePlaylist - JSON 数组输入', () => {
    it('解析标准导出 JSON 数组', () => {
      const json = JSON.stringify([
        { id: 100, title: '晴天', artist: '周杰伦', album: '叶惠美' },
        { id: 200, name: '稻香', ar: [{ name: '周杰伦' }], al: { name: '魔杰座' } },
      ])
      const songs = neteaseService.parsePlaylist(json)

      expect(songs).toHaveLength(2)
      expect(songs[0].id).toBe('100')
      expect(songs[0].title).toBe('晴天')
      expect(songs[0].artist).toBe('周杰伦')
      expect(songs[0].neteaseId).toBe('100')
      expect(songs[0].playUrl).toContain('id=100')
      expect(songs[0].platform).toBe('netease')
    })

    it('缺字段时用兜底值', () => {
      const json = JSON.stringify([{ id: 1 }])
      const songs = neteaseService.parsePlaylist(json)
      expect(songs[0].title).toBe('Unknown')
      expect(songs[0].artist).toBe('Unknown')
    })

    it('name 字段作为 title 兼容', () => {
      const json = JSON.stringify([{ id: 5, name: '七里香' }])
      const songs = neteaseService.parsePlaylist(json)
      expect(songs[0].title).toBe('七里香')
    })
  })

  describe('parsePlaylist - 纯文本歌单输入', () => {
    it('解析 "id - 歌名 - 歌手" 文本格式', () => {
      const text = '100 - 晴天 - 周杰伦\n200 - 稻香 - 周杰伦'
      const songs = neteaseService.parsePlaylist(text)

      expect(songs).toHaveLength(2)
      expect(songs[0].id).toBe('100')
      expect(songs[0].title).toBe('晴天')
      expect(songs[0].artist).toBe('周杰伦')
      expect(songs[0].playUrl).toContain('id=100')
    })

    it('空/无效输入返回空数组', () => {
      expect(neteaseService.parsePlaylist('')).toEqual([])
      expect(neteaseService.parsePlaylist('没有任何匹配格式的文本')).toEqual([])
    })
  })
})
