import { create, StateCreator } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'

// API 类型单一来源：见 @/types/api（与后端 backend/src/types/index.ts 对齐）
export type { MusicPlatform, Song, ChatMessage, RecommendSong } from '@/types/api'
// 本文件内部直接引用，避免循环依赖的具名导入
import type { Song, ChatMessage } from '@/types/api'

// ── Slice types ──────────────────────────────────────────────

interface PlayerSlice {
  currentSong: Song | null
  queue: Song[]
  isPlaying: boolean
  currentTime: number
  duration: number
  isFullscreenPlayer: boolean
  likedSongIds: string[]
  /** 音量 0~1（HTMLMediaElement.volume 标准）。跨组件共享，KimiCard 显示/控制，useAudioPlayer 应用到 audio.volume */
  volume: number
  setCurrentSong: (song: Song | null) => void
  setQueue: (queue: Song[]) => void
  togglePlay: () => void
  setIsPlaying: (playing: boolean) => void
  setCurrentTime: (time: number | ((prev: number) => number)) => void
  setDuration: (duration: number) => void
  setFullscreenPlayer: (v: boolean) => void
  toggleLike: (id: string) => void
  isLiked: (id: string) => boolean
  setVolume: (volume: number) => void
}

interface SessionSlice {
  sessionId: string | null
  sessionToken: string | null
  djEnabled: boolean
  currentModel: string
  /** 当前选中的 TTS 音色（预置引擎用，如 '苏打'/'冰糖'） */
  ttsVoice: string
  setSessionId: (id: string | null) => void
  setSessionToken: (token: string | null) => void
  setDjEnabled: (enabled: boolean) => void
  setCurrentModel: (model: string) => void
  setTtsVoice: (voice: string) => void
}

interface ChatSlice {
  messages: ChatMessage[]
  isSpeaking: boolean
  /** AI 语音已播放时长（秒）—— 歌词高亮以此驱动 */
  aiCurrentTime: number
  /** AI 语音总时长（秒） */
  aiVoiceDuration: number
  /** 开场白文本：createSession 存入，首次用户交互后播报（规避自动播放拦截） */
  introScript: string | null
  /** 开场白是否已播报，避免重复播放 */
  introPlayed: boolean
  /** 浏览器音频是否已解锁（用户已发生交互手势）。解锁后异步 audio.play() 才合法 */
  audioUnlocked: boolean
  /** 换歌串词待播报信号（瞬态，page.tsx 消费后即 clear，不持久化） */
  pendingTtsText: string | null
  /** 换歌时要求停止当前 TTS 的信号（瞬态，page.tsx 消费后即 clear） */
  pendingTtsStop: boolean
  addMessage: (msg: Omit<ChatMessage, 'id'>) => void
  /** 设置待 TTS 播报文本（换歌 transition 用） */
  setPendingTtsText: (text: string) => void
  /** 清除待播报信号（消费后调用） */
  clearPendingTtsText: () => void
  /** 设置停止 TTS 信号 */
  setPendingTtsStop: () => void
  /** 清除停止 TTS 信号 */
  clearPendingTtsStop: () => void
  /** 原地替换最后一条 kimi 消息（用于 pending→正式 reply 的平滑过渡，避免重复消息） */
  updateLastKimiMessage: (text: string, extra?: Partial<Pick<ChatMessage, 'recommendations' | 'isPending'>>) => void
  setSpeaking: (speaking: boolean) => void
  setAiCurrentTime: (t: number) => void
  setAiVoiceDuration: (t: number) => void
  setIntroScript: (text: string | null) => void
  setIntroPlayed: (played: boolean) => void
  setAudioUnlocked: (unlocked: boolean) => void
  clearMessages: () => void
}

interface StatusSlice {
  isCreating: boolean
  isOnline: boolean
  /** T1.1 换歌进行中标志（防重入 + 加载反馈） */
  isTransitioning: boolean
  setIsCreating: (creating: boolean) => void
  setOnline: (online: boolean) => void
  setIsTransitioning: (v: boolean) => void
}

interface RadioActions {
  nextSong: () => Promise<void>
  prevSong: () => void
  /** 重置会话与播放状态到引导态（切音源、登出等场景，不清偏好设置） */
  clearSession: () => void
}

type RadioState = PlayerSlice & SessionSlice & ChatSlice & StatusSlice & RadioActions

// ── Slice creators ───────────────────────────────────────────
// Each slice declares devtools mutator so `set` accepts the action name arg.
// The devtools + persist middlewares are applied at the combined store level.

type Mutators = [['zustand/devtools', never]]

const createPlayerSlice: StateCreator<
  RadioState,
  Mutators,
  [],
  PlayerSlice
> = (set, get) => ({
  currentSong: null,
  queue: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isFullscreenPlayer: false,
  likedSongIds: [],
  volume: 0.8,
  setCurrentSong: (song) => set({ currentSong: song }, false, 'player/setCurrentSong'),
  setQueue: (queue) => set({ queue }, false, 'player/setQueue'),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying }), false, 'player/togglePlay'),
  setIsPlaying: (playing) => set({ isPlaying: playing }, false, 'player/setIsPlaying'),
  setCurrentTime: (time) =>
    set(
      (s) => ({
        currentTime: typeof time === 'function' ? (time as (prev: number) => number)(s.currentTime) : time,
      }),
      false,
      'player/setCurrentTime',
    ),
  setDuration: (duration) => set({ duration }, false, 'player/setDuration'),
  setFullscreenPlayer: (v) => set({ isFullscreenPlayer: v }, false, 'player/setFullscreenPlayer'),
  toggleLike: (id) =>
    set(
      (s) => ({
        likedSongIds: s.likedSongIds.includes(id)
          ? s.likedSongIds.filter((x) => x !== id)
          : [...s.likedSongIds, id],
      }),
      false,
      'player/toggleLike',
    ),
  isLiked: (id) => get().likedSongIds.includes(id),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }, false, 'player/setVolume'),
})

const createSessionSlice: StateCreator<
  RadioState,
  Mutators,
  [],
  SessionSlice
> = (set) => ({
  sessionId: null,
  sessionToken: null,
  djEnabled: true,
  currentModel: 'mimo-v2.5',
  ttsVoice: '苏打',
  setSessionId: (id) => set({ sessionId: id }, false, 'session/setSessionId'),
  setSessionToken: (token) => set({ sessionToken: token }, false, 'session/setSessionToken'),
  setDjEnabled: (enabled) => set({ djEnabled: enabled }, false, 'session/setDjEnabled'),
  setCurrentModel: (model) => set({ currentModel: model }, false, 'session/setCurrentModel'),
  setTtsVoice: (voice) => set({ ttsVoice: voice }, false, 'session/setTtsVoice'),
})

const createChatSlice: StateCreator<
  RadioState,
  Mutators,
  [],
  ChatSlice
> = (set, get) => ({
  messages: [],
  isSpeaking: false,
  aiCurrentTime: 0,
  aiVoiceDuration: 0,
  introScript: null,
  introPlayed: false,
  audioUnlocked: false,
  pendingTtsText: null,
  pendingTtsStop: false,
  addMessage: (msg) =>
    set(
      (s) => ({
        messages: [...s.messages, { ...msg, id: crypto.randomUUID() }],
      }),
      false,
      'chat/addMessage',
    ),
  setPendingTtsText: (text) => set({ pendingTtsText: text }, false, 'chat/setPendingTtsText'),
  clearPendingTtsText: () => set({ pendingTtsText: null }, false, 'chat/clearPendingTtsText'),
  setPendingTtsStop: () => set({ pendingTtsStop: true }, false, 'chat/setPendingTtsStop'),
  clearPendingTtsStop: () => set({ pendingTtsStop: false }, false, 'chat/clearPendingTtsStop'),
  updateLastKimiMessage: (text, extra) => {
    const s = get()
    // 找到最后一条 kimi 消息，原地替换文本（保持 id 不变，避免 React key 跳变）
    const lastKimiIdx = [...s.messages].reverse().findIndex((m) => m.sender === 'kimi')
    if (lastKimiIdx === -1) return
    const realIdx = s.messages.length - 1 - lastKimiIdx
    const updated = [...s.messages]
    updated[realIdx] = {
      ...updated[realIdx],
      text,
      isPending: extra?.isPending ?? false,
      recommendations: extra?.recommendations ?? updated[realIdx].recommendations,
    }
    set({ messages: updated }, false, 'chat/updateLastKimiMessage')
  },
  setSpeaking: (speaking) => set({ isSpeaking: speaking }, false, 'chat/setSpeaking'),
  setAiCurrentTime: (t) => set({ aiCurrentTime: t }, false, 'chat/setAiCurrentTime'),
  setAiVoiceDuration: (t) => set({ aiVoiceDuration: t }, false, 'chat/setAiVoiceDuration'),
  setIntroScript: (text) => set({ introScript: text }, false, 'chat/setIntroScript'),
  setIntroPlayed: (played) => set({ introPlayed: played }, false, 'chat/setIntroPlayed'),
  setAudioUnlocked: (unlocked) => set({ audioUnlocked: unlocked }, false, 'chat/setAudioUnlocked'),
  clearMessages: () => set({ messages: [] }, false, 'chat/clearMessages'),
})

const createStatusSlice: StateCreator<
  RadioState,
  Mutators,
  [],
  StatusSlice
> = (set) => ({
  isCreating: false,
  isOnline: true,
  isTransitioning: false,
  setIsCreating: (creating) => set({ isCreating: creating }, false, 'status/setIsCreating'),
  setOnline: (online) => set({ isOnline: online }, false, 'status/setOnline'),
  setIsTransitioning: (v) => set({ isTransitioning: v }, false, 'status/setIsTransitioning'),
})

const createRadioActionsSlice: StateCreator<
  RadioState,
  Mutators,
  [],
  RadioActions
> = (_set, get) => ({
  prevSong: () => {
    const { queue, currentSong } = get()
    const currentIndex = queue.findIndex((s) => s.id === currentSong?.id)
    const prev = queue[currentIndex - 1]
    if (prev) {
      _set({ currentSong: prev, currentTime: 0, isPlaying: true }, false, 'radio/prevSong')
    }
  },
  nextSong: async () => {
    const { sessionId, sessionToken, isTransitioning } = get()
    // T1.1 防重入：正在换歌时不重复触发
    if (isTransitioning) return
    get().setIsTransitioning(true)
    try {
      if (sessionId) {
        try {
          const res = await fetch(`${API_BASE}/api/v1/radio/${sessionId}/next`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify({ session_token: sessionToken }),
          })
          if (!res.ok) {
            const errText = await res.text()
            throw new Error(`HTTP ${res.status}: ${errText}`)
          }
          const data = await res.json()

          if (data.song) {
            // Batch all state updates into a single setState call
            const { queue, addMessage } = get()
            const updates: Partial<RadioState> = {
              currentSong: data.song,
              currentTime: 0,
              isPlaying: true,
            }
            if (!queue.find((s) => s.id === data.song.id)) {
              updates.queue = [...queue, data.song]
            }
            _set(updates, false, 'radio/nextSong')

            if (data.transition) {
              addMessage({ sender: 'kimi', text: data.transition, timestamp: 0 })
              // P2 修复：先停止当前 TTS，再触发新 transition 播报
              get().setPendingTtsStop()
              get().setPendingTtsText(data.transition)
            }
          }
        } catch (err) {
          logger.error('[Store] nextSong API failed', { error: err instanceof Error ? err.message : String(err) })
          const { queue, currentSong } = get()
          const currentIndex = queue.findIndex((s) => s.id === currentSong?.id)
          const next = queue[currentIndex + 1]
          if (next) {
            _set(
              { currentSong: next, currentTime: 0, isPlaying: true },
              false,
              'radio/nextSong/fallback',
            )
          }
        }
      } else {
        const { queue, currentSong } = get()
        const currentIndex = queue.findIndex((s) => s.id === currentSong?.id)
        const next = queue[currentIndex + 1]
        if (next) {
          _set(
            { currentSong: next, currentTime: 0 },
            false,
            'radio/nextSong/local',
          )
        }
      }
    } finally {
      get().setIsTransitioning(false)
    }
  },
  clearSession: () =>
    _set(
      {
        sessionId: null,
        sessionToken: null,
        currentSong: null,
        queue: [],
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        isFullscreenPlayer: false,
        isSpeaking: false,
        aiCurrentTime: 0,
        aiVoiceDuration: 0,
        introScript: null,
        introPlayed: false,
        pendingTtsText: null,
        // 保留 likedSongIds（用户长期偏好，不因切音源丢失）
        // 保留 messages（聊天历史，createSession 会主动 clearMessages 开新会话）
      },
      false,
      'radio/clearSession',
    ),
})

// ── Compose store ────────────────────────────────────────────

export const useRadioStore = create<RadioState>()(
  devtools(
    persist(
      (...args) => ({
        ...createPlayerSlice(...args),
        ...createSessionSlice(...args),
        ...createChatSlice(...args),
        ...createStatusSlice(...args),
        ...createRadioActionsSlice(...args),
      }),
      {
        name: 'mimo-radio-store',
        // Only persist preference fields — player/chat/session state resets on reload.
        // 安全 + 一致性：sessionToken/sessionId/queue/currentSong 都不持久化。
        // - sessionToken：防 XSS 读走鉴权凭据
        // - sessionId：持久化 sessionId 却不持久化 queue 会导致 reload 后
        //   "有 sessionId 无歌曲"的尴尬态（sessionId 阻止自动重建，queue 又是空）。
        //   统一不持久化会话，reload 后干净重建，状态一致。
        partialize: (state) => ({
          djEnabled: state.djEnabled,
          currentModel: state.currentModel,
          ttsVoice: state.ttsVoice,
          // messages 不持久化：sessionId 不持久化，恢复 messages 也显示不出来（ChatArea 依赖 sessionId）。
          // 且 createSession 会 clearMessages。保持现状最干净。
        }),
      },
    ),
    { name: 'MimoRadio' },
  ),
)
