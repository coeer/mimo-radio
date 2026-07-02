import { Router } from 'express'
import { z } from 'zod'
import { weatherService } from '../services/weather'
import { validateQuery } from '../middleware/validate'

const router = Router()

// All context routes are read-only; minimal validation for query params if added later
const cityQuerySchema = z.object({
  city: z.string().max(50).optional(),
})

// GET /api/context/weather
router.get('/weather', validateQuery(cityQuerySchema), async (_req, res, next) => {
  try {
    const weather = await weatherService.getCurrent()
    res.json(weather)
  } catch (err) {
    next(err)
  }
})

// GET /api/context/all
router.get('/all', async (_req, res, next) => {
  try {
    const weather = await weatherService.getCurrent()

    const now = new Date()
    res.json({
      weather,
      time: `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`,
      date: now.toISOString().split('T')[0],
      weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()],
    })
  } catch (err) {
    next(err)
  }
})

export default router
