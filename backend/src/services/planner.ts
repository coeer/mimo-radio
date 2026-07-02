import { logger, toErrorMeta } from '../utils/logger'
import { extractJsonObject } from '../utils/extractJson'
import { loadPersona } from './djPersona'
import { getMusicSource } from './musicSource'
import { Song } from '../types'
import { TimeSlot, DEFAULT_SLOTS } from './scheduler'

/**
 * 每日电台规划器 —— 调 MiMo 生成结构化全天歌单。
 *
 * 数据源（不依赖已丢失的 netease-taste.json）：
 *   - 时段骨架：scheduler 的 DEFAULT_SLOTS
 *   - 天气：weatherService（调用方传入，无则"未知"）
 *   - 用户品味：DJ persona.tasteProfile（已生成的人设）
 *   - 真实歌曲：planner 生成歌名后，用 getMusicSource().searchPlayable 解析
 *
 * 缓存：当天结果存内存，避免重复调 MiMo。
 */

export interface PlanSegment {
  start: string
  end: string
  scene: string
  mood: string
  description: string
  candidates: { name: string; artist: string }[]
  tracks?: Song[] // 解析后的真实歌曲
}

export interface DailyPlan {
  date: string
  summary: string
  weather: string
  segments: PlanSegment[]
  source: 'ai' | 'fallback'
  tracksLoaded: boolean  // resolveTracks 异步解析是否已完成
}

interface PlanCache {
  date: string
  plan: DailyPlan
}
let planCache: PlanCache | null = null

interface WeatherInput {
  description?: string
  temp?: number
}

/**
 * 生成每日计划（主入口）。
 * @param aiChat 大模型调用函数
 * @param weather 天气信息
 */
export async function generateDailyPlan(
  aiChat: (messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) => Promise<string>,
  weather?: WeatherInput
): Promise<DailyPlan> {
  const today = new Date().toISOString().split('T')[0]

  // 命中缓存
  if (planCache && planCache.date === today) {
    logger.debug('planner 命中当天缓存', { date: today })
    return planCache.plan
  }

  const persona = loadPersona()
  const weatherDesc = weather?.description
    ? `${weather.description}${weather.temp != null ? ` ${weather.temp}℃` : ''}`
    : '未知'

  // 只取 6 个主要时段（精简 prompt，避免超时）
  const mainSlots = [DEFAULT_SLOTS[1], DEFAULT_SLOTS[2], DEFAULT_SLOTS[5], DEFAULT_SLOTS[6], DEFAULT_SLOTS[10], DEFAULT_SLOTS[12]]
  const slotsBrief = mainSlots.map((s: TimeSlot) => `${s.start}-${s.end} ${s.label}`)

  // 精简的品味摘要（不用完整 personaBlock，避免 prompt 过长）
  const tp = persona.tasteProfile
  const tasteBrief = `用户品味：${tp.type}。偏好流派：${tp.genres.join('、')}。代表歌手：${tp.signatureArtists.slice(0, 5).join('、')}。情绪：${tp.moodTendency}。`

  const prompt = `你是 AI DJ KIMI 的电台规划大脑。${tasteBrief}
今日天气：${weatherDesc}，${getWeekday(today)}。

为下面 6 个时段各推荐 2 首歌（优先用户品味的歌手，不确定就少推荐）：
${slotsBrief.join('\n')}

严格输出 JSON（无其他文字）：
{"summary":"一句话今日氛围","segments":[{"start":"HH:mm","end":"HH:mm","scene":"场景","mood":"mood","description":"为何","candidates":[{"name":"歌名","artist":"歌手"}]}]}`

  try {
    const raw = await aiChat([
      { role: 'system', content: '你是 AI DJ KIMI 的电台规划大脑。' },
      { role: 'user', content: prompt },
    ])
    const extracted = extractJsonObject(raw)
    if (!extracted) throw new Error('未解析到 JSON')
    const parsed = JSON.parse(extracted) as Partial<DailyPlan>

    const segments: PlanSegment[] = (parsed.segments || []).map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      scene: seg.scene || '',
      mood: seg.mood || '',
      description: seg.description || '',
      candidates: (seg.candidates || []).map((c: any) => ({ name: c.name, artist: c.artist })),
    }))

    const plan: DailyPlan = {
      date: today,
      summary: parsed.summary || '今日电台',
      weather: weatherDesc,
      segments,
      source: 'ai',
      tracksLoaded: false,  // tracks 尚未解析完成
    }

    // 异步解析真实歌曲（不阻塞响应）
    resolveTracks(segments).then(() => {
      plan.tracksLoaded = true  // 就地更新缓存中的 plan，下次请求即可拿到完整数据
      logger.info('planner tracks 解析完成')
    }).catch(err => {
      // S1 修复：失败也要置位 tracksLoaded，避免前端基于 false 无限轮询。
      // tracks 保持空数组，但标记为"已就绪"，前端不再重试。
      plan.tracksLoaded = true
      logger.error('planner 解析真实歌曲失败', { ...toErrorMeta(err) })
    })

    planCache = { date: today, plan }
    logger.info('planner 生成完成', { date: today, segments: segments.length })
    return plan
  } catch (err) {
    logger.error('planner AI 生成失败，用兜底', { ...toErrorMeta(err) })
    return fallbackPlan(today, weatherDesc)
  }
}

/** 把 AI 推荐的歌名解析成真实可播 Song（异步填充 segments.tracks，不阻塞响应） */
async function resolveTracks(segments: PlanSegment[]) {
  const source = getMusicSource()
  // 并行解析所有时段（避免串行拖慢）
  await Promise.all(segments.map(async (seg) => {
    if (!seg.candidates.length) return
    const resolved: Song[] = []
    // 每首歌解析加 8s 超时保护
    await Promise.all(seg.candidates.map(async (c) => {
      try {
        const found = await withTimeout(source.searchPlayable(`${c.name} ${c.artist}`, 1), 8000)
        if (found[0]) resolved.push(found[0])
      } catch { /* 单首解析失败，跳过，继续解析其余候选 */ }
    }))
    seg.tracks = resolved.slice(0, 3)
  }))
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ])
}

/** 兜底计划（AI 失败时用写死时段） */
function fallbackPlan(date: string, weather: string): DailyPlan {
  return {
    date,
    summary: '今日电台（基础版）',
    weather,
    segments: DEFAULT_SLOTS.map((s: TimeSlot) => ({
      start: s.start,
      end: s.end,
      scene: s.label,
      mood: '',
      description: s.description,
      candidates: [],
    })),
    source: 'fallback',
    tracksLoaded: true,  // 兜底计划没有异步解析，tracks 始终为空
  }
}

/** 清除缓存（手动重新生成时用） */
export function clearPlanCache() {
  planCache = null
}

function getWeekday(dateStr: string): string {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(dateStr).getDay()]
}
