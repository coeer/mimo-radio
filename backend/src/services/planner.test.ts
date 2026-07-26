import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * T-1（深度 review 批次 4）：planner 此前零测试。
 * 覆盖：AI 成功路径 + 缓存命中 + AI 失败兜底 + tracksLoaded 双路径（S1 修复）。
 *
 * 注意：generateDailyPlan 的 resolveTracks 是"发射后不管"的异步填充（不阻塞响应），
 * 测试里用 vi.waitFor 等 tracksLoaded 翻 true，而不是假设 await 返回时已就绪。
 */

const searchPlayable = vi.fn()

vi.mock('./djPersona', () => ({
  loadPersona: () => ({
    tasteProfile: {
      type: '深夜怀旧型',
      genres: ['citypop', 'jazz'],
      signatureArtists: ['山下達郎', '竹内まりや'],
      moodTendency: '安静',
    },
  }),
}))

vi.mock('./musicSource', () => ({
  getMusicSource: () => ({ searchPlayable }),
}))

import { generateDailyPlan, clearPlanCache } from './planner'

const VALID_AI_JSON = JSON.stringify({
  summary: '今日适合听老唱片',
  segments: [
    {
      start: '07:00', end: '09:00', scene: '清晨', mood: 'calm',
      description: '慢慢醒来',
      candidates: [{ name: 'Plastic Love', artist: '竹内まりや' }],
    },
  ],
})

const FAKE_SONG = {
  id: 'ne_x1', title: 'Plastic Love', artist: '竹内まりや',
  playUrl: 'http://m701.music.126.net/p.mp3',
  emotionTags: [], sceneTags: [], platform: 'netease' as const,
}

describe('planner generateDailyPlan', () => {
  beforeEach(() => {
    clearPlanCache()
    searchPlayable.mockReset()
  })

  it('AI 成功：解析 JSON → source=ai，segments 映射完整', async () => {
    searchPlayable.mockResolvedValue([FAKE_SONG])
    const aiChat = vi.fn().mockResolvedValue(VALID_AI_JSON)

    const plan = await generateDailyPlan(aiChat, { description: '晴', temp: 26 })

    expect(plan.source).toBe('ai')
    expect(plan.summary).toBe('今日适合听老唱片')
    expect(plan.weather).toBe('晴 26℃')
    expect(plan.segments).toHaveLength(1)
    expect(plan.segments[0].candidates[0]).toEqual({ name: 'Plastic Love', artist: '竹内まりや' })
  })

  it('tracksLoaded 成功路径：resolveTracks 完成后翻 true 且 tracks 填充', async () => {
    searchPlayable.mockResolvedValue([FAKE_SONG])
    const aiChat = vi.fn().mockResolvedValue(VALID_AI_JSON)

    const plan = await generateDailyPlan(aiChat)
    // 返回时异步解析未必完成（不阻塞响应）
    await vi.waitFor(() => expect(plan.tracksLoaded).toBe(true))
    expect(plan.segments[0].tracks?.[0]?.id).toBe('ne_x1')
  })

  it('tracksLoaded 失败路径（S1）：searchPlayable 全失败也翻 true，不无限轮询', async () => {
    searchPlayable.mockRejectedValue(new Error('source down'))
    const aiChat = vi.fn().mockResolvedValue(VALID_AI_JSON)

    const plan = await generateDailyPlan(aiChat)
    await vi.waitFor(() => expect(plan.tracksLoaded).toBe(true))
    // 解析失败 → tracks 为空数组，但标记已就绪
    expect(plan.segments[0].tracks).toEqual([])
  })

  it('缓存：当天第二次调用命中缓存，aiChat 只调一次', async () => {
    searchPlayable.mockResolvedValue([FAKE_SONG])
    const aiChat = vi.fn().mockResolvedValue(VALID_AI_JSON)

    const first = await generateDailyPlan(aiChat)
    const second = await generateDailyPlan(aiChat)

    expect(aiChat).toHaveBeenCalledTimes(1)
    expect(second).toBe(first) // 同一个 plan 对象（含就地更新的 tracksLoaded）
  })

  it('AI 抛错 → 兜底计划：source=fallback，tracksLoaded 立即 true', async () => {
    const aiChat = vi.fn().mockRejectedValue(new Error('LLM down'))

    const plan = await generateDailyPlan(aiChat)

    expect(plan.source).toBe('fallback')
    expect(plan.tracksLoaded).toBe(true)
    expect(plan.segments.length).toBeGreaterThan(0) // DEFAULT_SLOTS 全时段
    expect(searchPlayable).not.toHaveBeenCalled()
  })

  it('AI 返回非 JSON（无 JSON 对象）→ 兜底计划', async () => {
    const aiChat = vi.fn().mockResolvedValue('抱歉，我今天不想排歌单。')

    const plan = await generateDailyPlan(aiChat)

    expect(plan.source).toBe('fallback')
    expect(plan.tracksLoaded).toBe(true)
  })
})
