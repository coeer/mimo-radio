import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRadioStore } from '@/store/radioStore'
import { useSession } from './useSession'

/**
 * AI DJ「开场白说完→自动放歌」端到端功能性测试（v2）
 *
 * 新播放编排逻辑（修复浏览器自动播放策略 + 音轨冲突）：
 *   useSession.createSession()
 *     → fetch /radio/create 返回 queue[0] + intro_script
 *     → 不立即播放（避免被自动播放拦截），intro 存入 store.introScript
 *   首次用户交互（page.tsx unlockAudio）→ speakAIMessage(introScript)
 *     → useTTS.speak() → fetch /dj/tts → HTMLAudioElement 播放
 *     → 播放结束 onended → onEnd → resumePlaybackAfterSpeak → setIsPlaying(true)
 *
 * 测试用 createAndUnlock 内部 mount + speakAIMessage(introScript) 模拟"首次交互触发的播报"。
 * 核心断言不变：TTS 出错 / 兜底失败 / 歌曲无 playUrl 时，开场白"说完"后歌曲必须续播。
 */

// ── Mock fetch（URL 路由式，避免 mockResolvedValueOnce 的顺序依赖）─────
type RouteResp = { ok: boolean; status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }
const routes = new Map<string, () => RouteResp>()
const fetchMock = vi.fn(async (url: string) => {
  const u = String(url)
  for (const key of Array.from(routes.keys())) {
    if (u.includes(key)) return routes.get(key)!()
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }
})
;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock

function route(key: string, resp: RouteResp | (() => RouteResp)) {
  routes.set(key, typeof resp === 'function' ? resp : () => resp)
}
function ttsOk(url = '/static/audio/abc.mp3') {
  route('/dj/tts', {
    ok: true,
    json: async () => ({ audio_url: url, text: 'x', engine: 'mimo-tts' }),
  })
}
function ttsFail() {
  route('/dj/tts', { ok: false, status: 500, json: async () => ({}) })
}

// ── 受控 HTMLAudioElement ───────────────────────────────────
interface MockAudio {
  _src: string
  currentTime: number
  duration: number
  paused: boolean
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  onplay: ((...a: unknown[]) => void) | null
  onended: ((...a: unknown[]) => void) | null
  onerror: ((...a: unknown[]) => void) | null
  ontimeupdate: ((...a: unknown[]) => void) | null
  onloadedmetadata: ((...a: unknown[]) => void) | null
}

const audioInstances: MockAudio[] = []

function createAudioMock(): MockAudio {
  const inst: MockAudio = {
    _src: '',
    currentTime: 0,
    duration: 10,
    paused: true,
    play: vi.fn(() => {
      inst.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(() => {
      inst.paused = true
    }),
    load: vi.fn(),
    addEventListener: vi.fn((type: string, cb: (...args: unknown[]) => void) => {
      ;(inst as unknown as Record<string, unknown>)['on' + type] = cb
    }),
    removeEventListener: vi.fn(),
    onplay: null,
    onended: null,
    onerror: null,
    ontimeupdate: null,
    onloadedmetadata: null,
  }
  Object.defineProperty(inst, 'src', {
    get() {
      return inst._src
    },
    set(v: string) {
      inst._src = v
    },
  })
  return inst
}

let audioImpl: () => MockAudio = createAudioMock

function AudioMockCtor(this: MockAudio) {
  const inst = audioImpl()
  for (const key of Object.keys(inst)) {
    ;(this as unknown as Record<string, unknown>)[key] = inst[key as keyof MockAudio]
  }
  Object.defineProperty(this, 'src', {
    get: () => inst._src,
    set: (v: string) => {
      inst._src = v
    },
    configurable: true,
  })
  syncEventProps(this, inst)
  audioInstances.push(this)
}

function syncEventProps(target: MockAudio, src: MockAudio) {
  const events = ['onplay', 'onended', 'onerror', 'ontimeupdate', 'onloadedmetadata']
  for (const ev of events) {
    Object.defineProperty(target, ev, {
      get() {
        return src[ev as keyof MockAudio]
      },
      set(v: ((...a: unknown[]) => void) | null) {
        ;(src as unknown as Record<string, unknown>)[ev] = v
      },
      configurable: true,
    })
  }
}

function installAudio() {
  audioInstances.length = 0
  audioImpl = createAudioMock
  ;(globalThis as unknown as { Audio: unknown }).Audio = AudioMockCtor
}

function removeSpeechSynth() {
  delete (globalThis as unknown as { speechSynthesis?: unknown }).speechSynthesis
}

function resetStore() {
  useRadioStore.getState().clearMessages()
  useRadioStore.setState({
    currentSong: null,
    isPlaying: false,
    isSpeaking: false,
    queue: [],
    aiCurrentTime: 0,
    aiVoiceDuration: 0,
    sessionId: null,
    sessionToken: null,
    isCreating: false,
    djEnabled: true,
    introScript: null,
    introPlayed: false,
  })
}

const SONG = {
  id: 'ne_1',
  title: '夜に駆ける',
  artist: 'YOASOBI',
  playUrl: 'http://m701.music.126.net/test.mp3',
  duration: 200,
  emotionTags: [],
  sceneTags: [],
  platform: 'netease' as const,
}

const SONG_NO_URL = {
  ...SONG,
  id: 'qq_1',
  playUrl: undefined,
  platform: 'qq' as const,
}

describe('AI DJ 开场白→自动放歌 端到端功能测试', () => {
  let originalAudio: unknown
  let originalSynth: unknown

  beforeEach(() => {
    resetStore()
    fetchMock.mockClear()
    routes.clear()
    removeSpeechSynth()
    originalAudio = (globalThis as unknown as { Audio: unknown }).Audio
    originalSynth = (globalThis as unknown as { speechSynthesis?: unknown }).speechSynthesis
    installAudio()
  })

  afterEach(() => {
    ;(globalThis as unknown as { Audio: unknown }).Audio = originalAudio
    ;(globalThis as unknown as { speechSynthesis?: unknown }).speechSynthesis = originalSynth
    vi.clearAllMocks()
  })

  /**
   * 辅助：mount useSession → createSession → 若有待播开场白则触发播报（模拟首次交互 unlock）。
   * 返回 hook 的 actions（含 speakAIMessage 等）。
   * 注意：真实流程中 unlockAudio 会先 setIntroPlayed(true) 再 speakAIMessage，这里对齐该顺序。
   */
  async function createAndUnlock(mood: string) {
    const { result } = renderHook(() => useSession())
    await act(async () => {
      await result.current.createSession(mood)
    })
    const s = useRadioStore.getState()
    if (s.introScript && !s.introPlayed) {
      // 对齐 page.tsx unlockAudio：先标记已播，再播报
      await act(async () => {
        useRadioStore.getState().setIntroPlayed(true)
        await result.current.speakAIMessage(s.introScript!)
      })
    }
    return result.current
  }

  /** 取最近创建的 TTS audio 实例（开场白播放器） */
  function lastTtsAudio() {
    return audioInstances[audioInstances.length - 1]
  }

  /**
   * 场景 A：有开场白，TTS 正常合成并播放完毕 → 必须自动放歌。
   */
  it('场景A：有开场白 + TTS 正常播放完毕 → 自动放歌', async () => {
    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-1',
        session_token: 'tok-1',
        queue: [SONG],
        intro_script: '晚上好，为你挑了一首适合深夜的歌。',
      }),
    })
    ttsOk()

    await createAndUnlock('深夜想听点安静的')

    const afterUnlock = useRadioStore.getState()
    expect(afterUnlock.currentSong?.id).toBe('ne_1')
    expect(afterUnlock.introScript).toBe('晚上好，为你挑了一首适合深夜的歌。')
    expect(afterUnlock.introPlayed).toBe(true)
    expect(afterUnlock.isSpeaking).toBe(true)
    expect(afterUnlock.isPlaying).toBe(false)

    const ttsCalled = fetchMock.mock.calls.some(([u]) => String(u).includes('/dj/tts'))
    expect(ttsCalled).toBe(true)
    const ttsAudio = lastTtsAudio()
    expect(ttsAudio.play).toHaveBeenCalled()

    await act(async () => {
      ttsAudio.onended?.()
    })

    const afterEnd = useRadioStore.getState()
    expect(afterEnd.isSpeaking).toBe(false)
    expect(afterEnd.isPlaying).toBe(true)
  })

  /**
   * 场景 B：有开场白，TTS 音频 play() 失败（autoplay 拦截等）→ 仍应放歌。
   */
  it('场景B：有开场白 + TTS 播放出错 → 仍应自动放歌', async () => {
    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-2',
        session_token: 'tok-2',
        queue: [SONG],
        intro_script: '晚上好。',
      }),
    })
    ttsOk('/static/audio/bad.mp3')

    audioImpl = () => {
      const inst = createAudioMock()
      inst.play = vi.fn(() => {
        inst.onerror?.(new Error('TTS audio error'))
        return Promise.reject(new DOMException('NotAllowed', 'NotAllowedError'))
      })
      return inst
    }

    await createAndUnlock('深夜')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const afterError = useRadioStore.getState()
    expect(afterError.isSpeaking).toBe(false)
    expect(afterError.isPlaying).toBe(true)
  })

  /**
   * 场景 C：有开场白，/dj/tts 失败，speechSynthesis 不可用 → onError 续播。
   */
  it('场景C：有开场白 + /dj/tts 失败且 speechSynthesis 不可用 → 应自动放歌', async () => {
    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-3',
        session_token: 'tok-3',
        queue: [SONG],
        intro_script: '你好，欢迎收听。',
      }),
    })
    ttsFail()

    await createAndUnlock('深夜')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const afterError = useRadioStore.getState()
    expect(afterError.isSpeaking).toBe(false)
    expect(afterError.isPlaying).toBe(true)
  })

  /**
   * 场景 D：DJ 关闭 → 即使有开场白，createSession 不存 introScript；
   * unlock 无 introScript 直接放歌，不调 TTS。
   */
  it('场景D：DJ 关闭 → 即使有开场白也直接放歌', async () => {
    useRadioStore.getState().setDjEnabled(false)

    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-4',
        session_token: 'tok-4',
        queue: [SONG],
        intro_script: '（后端仍返回了开场白，但前端 DJ 关闭）',
      }),
    })

    await createAndUnlock('随便')

    const after = useRadioStore.getState()
    expect(after.introScript).toBeNull()
    const ttsCalled = fetchMock.mock.calls.some(([u]) => String(u).includes('/dj/tts'))
    expect(ttsCalled).toBe(false)
    // createSession 不立即播；模拟 unlock：无开场白直接放歌
    await act(async () => {
      const s = useRadioStore.getState()
      if (s.currentSong && !s.isPlaying && !s.isSpeaking) s.setIsPlaying(true)
    })
    expect(useRadioStore.getState().isPlaying).toBe(true)
    expect(useRadioStore.getState().isSpeaking).toBe(false)
  })

  /**
   * 场景 E：歌曲无 playUrl（QQ 音源）+ 有开场白说完 → 应放歌。
   */
  it('场景E：歌曲无 playUrl（QQ）+ 有开场白说完 → 应放歌', async () => {
    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-5',
        session_token: 'tok-5',
        queue: [SONG_NO_URL],
        intro_script: '为你播一首。',
      }),
    })
    ttsOk('/static/audio/e.mp3')

    await createAndUnlock('深夜')

    const ttsAudio = lastTtsAudio()
    await act(async () => {
      ttsAudio.onended?.()
    })

    const after = useRadioStore.getState()
    expect(after.isSpeaking).toBe(false)
    expect(after.isPlaying).toBe(true)
  })

  /**
   * 场景 F：无开场白 → unlock 后直接放歌。
   */
  it('场景F：无开场白 → unlock 后直接放歌', async () => {
    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-6',
        session_token: 'tok-6',
        queue: [SONG],
      }),
    })

    await createAndUnlock('随便')

    const afterCreate = useRadioStore.getState()
    expect(afterCreate.isPlaying).toBe(false)
    expect(afterCreate.introScript).toBeNull()
    // 模拟 unlock：无开场白直接放歌
    await act(async () => {
      const s = useRadioStore.getState()
      if (s.currentSong && !s.isPlaying && !s.isSpeaking) s.setIsPlaying(true)
    })
    expect(useRadioStore.getState().isPlaying).toBe(true)
    expect(useRadioStore.getState().isSpeaking).toBe(false)
  })

  /**
   * 场景 G：开场白说完后歌曲已在播，再次触发 onEnd 不应出错或重置。
   */
  it('场景G：开场白说完但歌曲已在播 → 保持播放状态', async () => {
    route('/radio/create', {
      ok: true,
      json: async () => ({
        session_id: 'sess-7',
        session_token: 'tok-7',
        queue: [SONG],
        intro_script: '嗨。',
      }),
    })
    ttsOk('/static/audio/g.mp3')

    await createAndUnlock('深夜')

    const ttsAudio = lastTtsAudio()
    await act(async () => {
      useRadioStore.getState().setIsPlaying(true)
      ttsAudio.onended?.()
    })

    const after = useRadioStore.getState()
    expect(after.isSpeaking).toBe(false)
    expect(after.isPlaying).toBe(true)
  })

  /**
   * 场景 H：/radio/create 本身失败 → 不应崩，给出错误提示。
   */
  it('场景H：create 接口失败 → 状态安全、有错误提示', async () => {
    route('/radio/create', {
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'Internal Server Error',
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      const ok = await result.current.createSession('深夜')
      expect(ok).toBe(false)
    })

    const after = useRadioStore.getState()
    expect(after.isCreating).toBe(false)
    expect(after.messages.length).toBeGreaterThan(0)
    expect(after.messages[0].text).toContain('电台启动失败')
  })
})
