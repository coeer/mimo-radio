import cors from 'cors'
import { config } from '../config'

export const corsMiddleware = cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'X-API-Key'],
})
