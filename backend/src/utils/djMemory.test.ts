import { describe, it, expect } from 'vitest'
import { extractDJMemory, djMemoryPromptBlock, getTimeOfDay } from './djMemory'
import type { RadioSession } from '../types'

// 构造测试用 session
function makeSession(overrides: Partial<RadioSession> = {}): RadioSession {
  return {
    id: 'test',
    queue: [
      { id: '1', title: '歌A', artist: '歌手A', emotionTags: [], sceneTags: [] },
      { id: '2', title: '歌B', artist: '歌手B', emotionTags: [], sceneTags: [] },
      { id: '3', title: '歌C', artist: '歌手C', emotionTags: [], sceneTags: [] },
    ],
    currentIndex: 2,
    djEnabled: true,
    context: { time: '23:30', weather: { city: '北京', temp: 22, condition: '晴', description: '晴 22℃' } },
    messages: [
      { id: 'm1', sender: 'kimi', text: '这是一段很长的开场白，超过三十个字的开场白，用于测试记忆提取功能是否正常工作。', timestamp: 0 },
      { id: 'm2', sender: 'kimi', text: '短', timestamp: 0 }, // 应被过滤（<30字）
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RadioSession
}

describe('extractDJMemory', () => {
  it('提取已播歌曲数', () => {
    const m = extractDJMemory(makeSession())
    expect(m.playedCount).toBe(3) // currentIndex=2 → +1 = 3
  })

  it('提取最近已播歌曲（不含当前）', () => {
    const m = extractDJMemory(makeSession())
    expect(m.recentPlayed.length).toBe(2) // 歌A 歌B（歌C是当前，不含）
    expect(m.recentPlayed[0].title).toBe('歌B') // 最近的在前
  })

  it('过滤短消息和带标签消息', () => {
    const m = extractDJMemory(makeSession())
    expect(m.recentDJSpoken.length).toBe(1) // 只有开场白那段，"短"被过滤
  })

  it('提取时段', () => {
    expect(getTimeOfDay('23:30')).toBe('深夜')
    expect(getTimeOfDay('08:00')).toBe('清晨')
    expect(getTimeOfDay('14:00')).toBe('下午')
  })

  it('提取最近用户消息', () => {
    const session = makeSession({
      messages: [
        { id: 'm1', sender: 'user', text: '你好呀', timestamp: 0 },
        { id: 'm2', sender: 'user', text: '今天天气真好呀', timestamp: 0 },
        { id: 'm3', sender: 'user', text: '推荐一些好听的歌吧', timestamp: 0 },
        { id: 'm4', sender: 'kimi', text: '这是一段 DJ 串词，用于测试过滤，不会被计入用户消息', timestamp: 0 },
        { id: 'm5', sender: 'user', text: 'a', timestamp: 0 }, // 太短应过滤
      ],
    })
    const m = extractDJMemory(session)
    expect(m.recentUserSaid.length).toBe(3)
    // 最近的在前
    expect(m.recentUserSaid[0]).toBe('推荐一些好听的歌吧')
    expect(m.recentUserSaid[1]).toBe('今天天气真好呀')
    expect(m.recentUserSaid[2]).toBe('你好呀')
    // 不应包含 kimi 的消息和太短的消息
    expect(m.recentUserSaid).not.toContain('a')
    expect(m.recentUserSaid).not.toContain('这是一段 DJ 串词，用于测试过滤，不会被计入用户消息')
  })
})

describe('djMemoryPromptBlock', () => {
  it('包含时段和已播数', () => {
    const m = extractDJMemory(makeSession())
    const block = djMemoryPromptBlock(m)
    expect(block).toContain('深夜')
    expect(block).toContain('已播 3 首')
  })

  it('包含已播歌名', () => {
    const m = extractDJMemory(makeSession())
    expect(djMemoryPromptBlock(m)).toContain('歌B')
  })

  it('包含用户最近消息', () => {
    const session = makeSession({
      messages: [
        { id: 'm1', sender: 'user', text: '推荐一些好听的歌吧', timestamp: 0 },
      ],
    })
    const m = extractDJMemory(session)
    const block = djMemoryPromptBlock(m)
    expect(block).toContain('用户刚才说过的话')
    expect(block).toContain('推荐一些好听的歌吧')
  })
})
