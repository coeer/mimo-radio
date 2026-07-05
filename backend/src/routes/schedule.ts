import { Router } from 'express'
import { z } from 'zod'
import { generateDailySchedule, getCurrentPlaylist } from '../services/scheduler'
import { generateDailyPlan, clearPlanCache } from '../services/planner'
import { validateQuery } from '../middleware/validate'
import { getAIService } from '../services/aiFactory'
import { weatherService } from '../services/weather'
import { logger, toErrorMeta } from '../utils/logger'

const router = Router()

const slotQuerySchema = z.object({
  hour: z.string().regex(/^\d{1,2}$/).optional(),
})

/**
 * GET /api/schedule/today
 * 返回今日电台计划。优先用 planner（AI 生成），失败兜底写死时段。
 */
router.get('/today', validateQuery(slotQuerySchema), async (_req, res, _next) => {
  try {
    let weather
    try { weather = await weatherService.getCurrent() } catch { /* 天气获取失败，降级为无天气上下文 */ }
    const ai = getAIService()
    const plan = await generateDailyPlan((messages) => ai.chat(messages, { timeoutMs: 15000, maxTokens: 4096 }), weather
      ? { description: weather.description, temp: weather.temp }
      : undefined
    )
    if (plan.source === 'ai') {
      res.json({
        date: plan.date,
        weather: plan.weather,
        temperature: '',
        summary: plan.summary,
        source: 'ai',
        tracksLoaded: plan.tracksLoaded,
        slots: plan.segments.map(seg => ({
          start: seg.start,
          end: seg.end,
          label: seg.scene,
          icon: '',
          description: seg.description,
          tags: [],
        })),
        playlist: plan.segments.map(seg => ({
          slot: { start: seg.start, end: seg.end, label: seg.scene },
          songs: seg.tracks || [],
          candidates: seg.candidates,
          mood: seg.mood,
        })),
      })
    } else {
      res.json(generateDailySchedule())
    }
  } catch (err) {
    logger.error('schedule/today 失败，兜底', { ...toErrorMeta(err) })
    res.json(generateDailySchedule())
  }
})

// GET /api/schedule/now
router.get('/now', (_req, res, next) => {
  try {
    const current = getCurrentPlaylist()
    res.json(current)
  } catch (err) {
    next(err)
  }
})

// POST /api/schedule/generate —— 手动重新生成今日计划
router.post('/generate', async (_req, res, next) => {
  try {
    clearPlanCache()
    let weather
    try { weather = await weatherService.getCurrent() } catch { /* 天气获取失败，降级为无天气上下文 */ }
    const ai = getAIService()
    const plan = await generateDailyPlan((messages) => ai.chat(messages, { timeoutMs: 15000, maxTokens: 4096 }), weather
      ? { description: weather.description, temp: weather.temp }
      : undefined
    )
    res.json({ ok: true, plan })
  } catch (err) {
    next(err)
  }
})

export default router
