import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '8001'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Auth
  apiKey: process.env.API_KEY || '',
  sessionSecret: process.env.SESSION_SECRET || '',

  // CORS
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    // P0a-2（B7）：3000 是前端 next dev 真实默认端口（原白名单独缺）；3001/3002/3003 保留兼容显式指定端口场景
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],

  // MiMo (小米大模型) - 默认 AI 大脑
  mimoApiKey: process.env.MIMO_API_KEY || '',
  mimoBaseUrl: process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1',
  mimoDefaultModel: process.env.MIMO_DEFAULT_MODEL || 'mimo-v2.5',

  // MiMo TTS（多引擎，默认全部走 token-plan，无需额外 key）
  ttsEngine: process.env.TTS_ENGINE || 'mimo-tts', // 启动默认引擎
  mimoTtsVoice: process.env.MIMO_TTS_VOICE || '苏打', // 预置音色：苏打/冰糖/茉莉/白桦/Mia/Chloe/Milo/Dean
  mimoTtsModel: process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts',
  mimoTtsDesignModel: process.env.MIMO_TTS_DESIGN_MODEL || 'mimo-v2.5-tts-voicedesign',
  mimoTtsCloneModel: process.env.MIMO_TTS_CLONE_MODEL || 'mimo-v2.5-tts-voiceclone',
  mimoAsrModel: process.env.MIMO_ASR_MODEL || 'mimo-v2.5-asr',

  // OpenWeather
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',
  openWeatherCity: process.env.OPENWEATHER_CITY || 'Beijing',
  openWeatherLat: parseFloat(process.env.OPENWEATHER_LAT || '39.9042'),
  openWeatherLon: parseFloat(process.env.OPENWEATHER_LON || '116.4074'),

  // Netease
  neteaseCookie: process.env.NETEASE_COOKIE || '',

  // Server base URL (for generating absolute audio URLs)
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8001',

  // Logging
  // 空 = 按 NODE_ENV 自动（dev=DEBUG, prod=INFO）；否则 DEBUG/INFO/WARN/ERROR 显式指定
  logLevel: (process.env.LOG_LEVEL || '').toUpperCase(),
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '14', 10),
}
