import { describe, it, expect } from 'vitest'
import { personaPromptBlock, composeSystemPrompt, DJPersona } from './djPersona'

// 构造可控人设，避免依赖磁盘上的 data/dj-persona.json
const makePersona = (over: Partial<DJPersona> = {}): DJPersona => ({
  name: 'KIMI',
  voiceTone: '温暖克制',
  knowsUser: '懂用户品味',
  tasteProfile: {
    type: '深夜治愈系',
    genres: ['后摇', 'R&B'],
    moodTendency: '忧郁',
    signatureArtists: ['歌手A', '歌手B', '歌手C', '歌手D', '歌手E', '歌手F'],
    sceneTags: ['深夜', '独处'],
  },
  introStyle: '一句问候开场',
  transitionStyle: '承接情绪引出下一首',
  songIntroStyle: '点出歌曲亮点',
  generatedAt: '2026-06-25T00:00:00.000Z',
  ...over,
})

describe('personaPromptBlock', () => {
  it('包含 DJ 名字', () => {
    const block = personaPromptBlock(makePersona())
    expect(block).toContain('名字：KIMI')
  })

  it('包含说话风格与对用户认知', () => {
    const block = personaPromptBlock(makePersona())
    expect(block).toContain('说话风格：温暖克制')
    expect(block).toContain('你对用户的认知：懂用户品味')
  })

  it('包含品味类型与流派', () => {
    const block = personaPromptBlock(makePersona())
    expect(block).toContain('深夜治愈系')
    expect(block).toContain('后摇')
    expect(block).toContain('R&B')
  })

  it('代表歌手只取前 5 个', () => {
    const block = personaPromptBlock(makePersona())
    // 6 个歌手，prompt 里只出现前 5 个
    expect(block).toContain('歌手E')
    expect(block).not.toContain('歌手F')
  })

  it('包含场景标签与三种说话习惯', () => {
    const block = personaPromptBlock(makePersona())
    expect(block).toContain('深夜')
    expect(block).toContain('开场习惯：一句问候开场')
    expect(block).toContain('过渡习惯：承接情绪引出下一首')
    expect(block).toContain('介绍单曲习惯：点出歌曲亮点')
  })

  it('末尾含"始终以这个人设说话"指令', () => {
    const block = personaPromptBlock(makePersona())
    expect(block).toContain('始终以这个人设说话')
  })

  it('流派/歌手为空时不报错', () => {
    const block = personaPromptBlock(makePersona({
      tasteProfile: {
        type: '待探索', genres: [], moodTendency: '平衡',
        signatureArtists: [], sceneTags: [],
      },
    }))
    expect(block).toContain('待探索')
    expect(typeof block).toBe('string')
  })
})

// ── P3 composeSystemPrompt ──

describe('composeSystemPrompt (P3)', () => {
  it('无 extras 时等价于 personaPromptBlock()', () => {
    expect(composeSystemPrompt()).toBe(personaPromptBlock())
  })

  it('按固定顺序拼接 songContext/searchContext/tasteBlock/memoryBlock', () => {
    const result = composeSystemPrompt({
      songContext: '【当前歌曲】',
      searchContext: '【搜索结果】',
      tasteBlock: '【品味】',
      memoryBlock: '【记忆】',
    })
    const persona = personaPromptBlock()
    const idxPersona = result.indexOf(persona)
    const idxSong = result.indexOf('【当前歌曲】')
    const idxSearch = result.indexOf('【搜索结果】')
    const idxTaste = result.indexOf('【品味】')
    const idxMemory = result.indexOf('【记忆】')
    expect(idxPersona).toBeLessThan(idxSong)
    expect(idxSong).toBeLessThan(idxSearch)
    expect(idxSearch).toBeLessThan(idxTaste)
    expect(idxTaste).toBeLessThan(idxMemory)
  })

  it('undefined 的 extras 不产生多余空行', () => {
    const result = composeSystemPrompt({ memoryBlock: 'hi' })
    // 不应有连续 3 个 \n
    expect(result).not.toMatch(/\n\n\n/)
  })
})
