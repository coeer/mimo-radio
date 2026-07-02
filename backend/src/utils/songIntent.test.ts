import { describe, it, expect } from 'vitest'
import { extractIntent } from './songIntent'

describe('extractIntent', () => {
  it('精确匹配"歌手+歌名"', () => {
    const r = extractIntent('周杰伦的晴天')
    expect(r.intent).toBe('point_song')
    expect(r.artist).toBe('周杰伦')
    expect(r.title).toBe('晴天')
    expect(r.keyword).toBe('晴天 周杰伦')
  })

  it('"歌名-歌手"格式', () => {
    const r = extractIntent('晴天 - 周杰伦')
    expect(r.intent).toBe('point_song')
    expect(r.title).toBe('晴天')
    expect(r.artist).toBe('周杰伦')
  })

  it('点歌意图但无具体歌名', () => {
    const r = extractIntent('来首周杰伦')
    expect(r.intent).toBe('point_song')
    expect(r.keyword).toBe('周杰伦')
  })

  it('推荐意图', () => {
    const r = extractIntent('推荐点爵士')
    expect(r.intent).toBe('recommend')
    expect(r.keyword).toBe('爵士')
  })

  it('纯聊天', () => {
    const r = extractIntent('今天天气真好')
    expect(r.intent).toBe('chat')
  })

  it('"来点轻音乐"→推荐意图', () => {
    const r = extractIntent('来点轻音乐')
    expect(r.intent).toBe('recommend')
    expect(r.keyword).toBe('轻音乐')
  })

  it('"想听周杰伦的歌"→点歌 keyword 提取', () => {
    const r = extractIntent('想听周杰伦的歌')
    expect(r.intent).toBe('point_song')
    expect(r.keyword).toBe('周杰伦')
  })

  it('"推荐一些爵士"→推荐', () => {
    const r = extractIntent('推荐一些爵士')
    expect(r.intent).toBe('recommend')
    expect(r.keyword).toBe('爵士')
  })
})
