import { Router } from 'express'
import { z } from 'zod'
import { upnpService } from '../services/upnp'
import { validateBody } from '../middleware/validate'
import { isSafeUrl } from '../utils/ssrfGuard'

const router = Router()

const upnpPlaySchema = z.object({
  device_location: z.string().url().max(500),
  media_url: z.string().url().max(500),
})

// GET /api/upnp/devices
router.get('/devices', async (_req, res, next) => {
  try {
    const devices = await upnpService.discover()
    res.json({ devices })
  } catch (err) {
    next(err)
  }
})

// POST /api/upnp/play
router.post('/play', validateBody(upnpPlaySchema), async (req, res, next) => {
  try {
    const { device_location, media_url } = req.body

    // SSRF protection: validate both URLs
    const deviceCheck = isSafeUrl(device_location)
    if (!deviceCheck.safe) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid device_location: ${deviceCheck.reason}`, code: 'INVALID_URL' },
      })
    }

    const mediaCheck = isSafeUrl(media_url)
    if (!mediaCheck.safe) {
      return res.status(400).json({
        success: false,
        error: { message: `Invalid media_url: ${mediaCheck.reason}`, code: 'INVALID_URL' },
      })
    }

    const result = await upnpService.play(device_location, media_url)
    res.json({ ok: true, device: device_location, media: media_url, result })
  } catch (err) {
    next(err)
  }
})

export default router
