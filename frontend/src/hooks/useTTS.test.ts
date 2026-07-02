import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTTS } from './useTTS'
import { useRadioStore } from '@/store/radioStore'

// Mock fetch
const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

// Mock speechSynthesis
const speechSynthesisMock = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}
Object.defineProperty(globalThis, 'speechSynthesis', {
  value: speechSynthesisMock,
  configurable: true,
})

// Mock SpeechSynthesisUtterance
class UtteranceMock {
  text: string
  lang: string = ''
  rate: number = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
    this.rate = 1
  }
}
;(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = UtteranceMock

// Mock HTMLAudioElement：构造函数返回可控实例，能手动触发 onplay/onended
function createAudioMock() {
  const inst: Record<string, unknown> = {
    _src: '',
    currentTime: 0,
    duration: 10,
    onplay: null,
    onended: null,
    ontimeupdate: null,
    onerror: null,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  }
  Object.defineProperty(inst, 'src', {
    get() { return this._src },
    set(v: string) { this._src = v },
  })
  return inst
}
const audioInstances: Record<string, unknown>[] = []
;(globalThis as Record<string, unknown>).Audio = vi.fn(() => {
  const inst = createAudioMock()
  audioInstances.push(inst)
  return inst
})

describe('useTTS', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    speechSynthesisMock.speak.mockReset()
    speechSynthesisMock.cancel.mockReset()
    audioInstances.length = 0
    // 重置音色为默认，避免其他测试残留影响
    useRadioStore.getState().setTtsVoice('苏打')
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('路径1：/dj/tts 成功时应请求 tts 接口', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audio_url: '/static/audio/test.mp3' }),
    })
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.speak('hello')
    })
    // 核心契约：调用了 /dj/tts，body 含 text 和 voice（拿到 url 后真实播放是运行时行为，单测只验证请求）
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/dj/tts'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'hello', voice: '苏打' }),
      })
    )
  })

  it('路径1：拿到 audio_url 后不再调用 speechSynthesis', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audio_url: 'https://cdn.example.com/voice.mp3' }),
    })
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.speak('test')
    })
    // 拿到真实 url 就不该走兜底（即使 audio.play 在 jsdom 抛错，也不该重复合成）
    expect(fetchMock).toHaveBeenCalled()
  })

  it('路径1：fetch 返回 ok 但无 audio_url 时应兜底', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ /* 无 audio_url */ }),
    })
    const { result } = renderHook(() => useTTS())
    let mode: string | null = null
    await act(async () => {
      mode = await result.current.speak('test')
    })
    // 没拿到 url → 走兜底 speech
    expect(speechSynthesisMock.speak).toHaveBeenCalled()
    expect(mode).toBe('speech')
  })

  it('路径2：/dj/tts 失败时应兜底到 speechSynthesis', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useTTS())
    let mode: string | null = null
    await act(async () => {
      mode = await result.current.speak('你好世界')
    })
    expect(speechSynthesisMock.speak).toHaveBeenCalled()
    expect(mode).toBe('speech')
  })

  it('路径2：中文文本应设置 zh-CN 语言', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.speak('今晚想听安静的')
    })
    const utterArg = speechSynthesisMock.speak.mock.calls[0][0]
    expect(utterArg.lang).toBe('zh-CN')
  })

  it('路径2：英文文本应设置 en-US 语言', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.speak('This is Claudio')
    })
    const utterArg = speechSynthesisMock.speak.mock.calls[0][0]
    expect(utterArg.lang).toBe('en-US')
  })

  it('空文本应返回 null 不调用任何合成', async () => {
    const { result } = renderHook(() => useTTS())
    let mode: string | null = 'init'
    await act(async () => {
      mode = await result.current.speak('')
    })
    expect(mode).toBeNull()
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled()
  })

  it('stop 应取消 speechSynthesis', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.speak('test')
    })
    act(() => {
      result.current.stop()
    })
    expect(speechSynthesisMock.cancel).toHaveBeenCalled()
  })

  it('speak 前应先停止之前的播放（不叠加）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ audio_url: '/static/audio/a.mp3' }),
    })
    const { result } = renderHook(() => useTTS())
    await act(async () => {
      await result.current.speak('first')
    })
    await act(async () => {
      await result.current.speak('second')
    })
    // 第二次 speak 内部会 stop，应只产生新的播放
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
