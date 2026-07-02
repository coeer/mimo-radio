import { Router } from 'express'
import { z } from 'zod'
import { setCurrentTtsEngine, listTtsEnginesWithReady } from '../services/ttsEngine'
import { validateBody } from '../middleware/validate'

const router = Router()

const switchSchema = z.object({
  id: z.string().min(1).max(50),
})

// GET /api/v1/tts-engines —— 列出所有 TTS 引擎（含就绪状态与当前选中）
// 不挂 aiLimiter：引擎列表查询是轻量操作，不应被 AI 限流
router.get('/', async (_req, res, next) => {
  try {
    const result = await listTtsEnginesWithReady()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/tts-engines/switch —— 切换当前 TTS 引擎
router.post('/switch', validateBody(switchSchema), async (req, res, next) => {
  try {
    const { id } = req.body
    const switched = setCurrentTtsEngine(id)
    if (!switched) {
      return res.status(400).json({
        success: false,
        error: { message: `unknown tts engine: ${id}`, code: 'INVALID_ENGINE' },
      })
    }
    const result = await listTtsEnginesWithReady()
    res.json({ success: true, current: id, engines: result.engines })
  } catch (err) {
    next(err)
  }
})

export default router
