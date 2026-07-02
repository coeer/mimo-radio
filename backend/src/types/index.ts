export type MusicPlatform = 'mock' | 'netease' | 'qq'

export interface Song {
  id: string
  title: string
  artist: string
  album?: string
  duration?: number
  coverUrl?: string
  playUrl?: string
  genre?: string
  year?: number
  emotionTags: string[]
  sceneTags: string[]
  moodScore?: number
  neteaseId?: string
  qqMusicMid?: string
  platform?: MusicPlatform
  /** 网易云 fee：0=免费 1=VIP 4=数字专辑 8=低音质免费可播 */
  fee?: number
  /** 是否可播放（有真实 playUrl） */
  playable?: boolean
}

export interface ChatMessage {
  id: string
  sender: 'kimi' | 'user'
  text: string
  timestamp: number
  audioUrl?: string
}

export interface RadioSession {
  id: string
  queue: Song[]
  currentIndex: number
  djEnabled: boolean
  context: SessionContext
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export interface SessionContext {
  weather?: WeatherInfo
  time: string
  userInput?: string
  mood?: string
}

export interface WeatherInfo {
  city: string
  temp: number
  condition: string
  description: string
  humidity?: number
}

export interface UserProfile {
  personalityType: string
  personalityDesc: string
  emotionDistribution: Record<string, number>
  sceneDistribution: Record<string, number>
  favoriteArtists: string[]
  totalSongs: number
  totalListenTime: number
}

export interface DJTransition {
  text: string
  audioUrl?: string
}

// AI Service types
export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIImageInput {
  type: 'image_url'
  image_url: { url: string }
}

export interface AIMultimodalMessage {
  role: 'user'
  content: (string | AIImageInput)[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionId?: string
    }
  }
}

export interface AIService {
  model: string
  chat(messages: AIChatMessage[], opts?: { timeoutMs?: number; maxTokens?: number }): Promise<string>
  chatWithImage(text: string, imageBase64: string): Promise<string>
  generateRecommendationStrategy(
    userInput: string,
    context: SessionContext,
    history: Song[]
  ): Promise<{
    mood: string
    genres: string[]
    energy: string
    reason: string
  }>
  generateDJTransition(prevSong: Song | null, nextSong: Song, context: SessionContext, memoryBlock?: string): Promise<DJTransition>
  generateIntro(mood: string, context: SessionContext): Promise<string>
  analyzePersonality(songs: Song[]): Promise<{
    type: string
    description: string
  }>
}

// ── TTS 引擎接口 ──
// 照搬 MusicSource 的设计：多引擎可切换，对外统一形态。
// 不管是 MiMo 预置音色、音色设计、音色复刻，都实现这个接口。
export interface TtsEngine {
  /** 引擎标识（如 'mimo-tts' / 'mimo-design' / 'mimo-clone'） */
  readonly id: string
  /** 显示名（如 'MiMo 苏打'） */
  readonly label: string
  /** 引擎类型：preset=预置音色 / design=文本描述生成 / clone=音频样本复刻 */
  readonly kind: 'preset' | 'design' | 'clone'
  /** 是否就绪（voiceclone 需先上传样本） */
  isReady(): Promise<boolean>
  /** 文本 → 音频 Buffer（mp3）。options.voice 可覆盖预置引擎的默认音色。 */
  synthesize(text: string, options?: { voice?: string }): Promise<Buffer>
}
