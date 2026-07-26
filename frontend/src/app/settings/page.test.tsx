import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SettingsPage from './page'
import { useRadioStore } from '@/store/radioStore'

/**
 * F-4（批次 3）previewVoice 测试：
 * 1. 连点 A→B：A 的 fetch 被 abort，只有 B 发声，ttsVoice=B
 * 2. 试听失败（无 audio_url / fetch reject）：ttsVoice 不变（成功才 set，不再试听即改设置）
 */

const VOICES = [
  { id: 'voice_a', name: '小夜', gender: '女' as const, style: '温柔', lang: 'zh' as const, desc: 'A 音色' },
  { id: 'voice_b', name: '阿晨', gender: '男' as const, style: '沉稳', lang: 'zh' as const, desc: 'B 音色' },
]

// jsdom 的 HTMLMediaElement.play 未实现，mock Audio 使 play/pause 可断言
const audioPlayMock = vi.fn(async () => {})
class MockAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn()
  play = audioPlayMock
  constructor(public src?: string) {}
}

interface PendingReq {
  init?: RequestInit
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

const fetchMock = vi.fn()
let pendingTts: PendingReq[]

function routeFetch(url: string, init?: RequestInit): Promise<unknown> {
  if (url.includes('tts-voices')) {
    return Promise.resolve({ ok: true, json: async () => ({ voices: VOICES }) })
  }
  if (url.includes('/dj/tts')) {
    return new Promise((resolve, reject) => {
      pendingTts.push({ init, resolve, reject })
    })
  }
  // SourceSwitcher / 其它
  return Promise.resolve({ ok: true, json: async () => ({}) })
}

describe('settings previewVoice（F-4 批次 3）', () => {
  beforeEach(() => {
    pendingTts = []
    fetchMock.mockReset()
    fetchMock.mockImplementation(routeFetch)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Audio', MockAudio)
    audioPlayMock.mockClear()
    useRadioStore.setState({ ttsVoice: 'orig_voice' })
  })

  it('连点 A→B：A 的 fetch 被 abort，只有 B 的音频播放，ttsVoice 改为 B', async () => {
    render(<SettingsPage />)
    const cardA = await screen.findByText('小夜')
    const cardB = await screen.findByText('阿晨')

    fireEvent.click(cardA)
    await waitFor(() => expect(pendingTts).toHaveLength(1))
    fireEvent.click(cardB)
    await waitFor(() => expect(pendingTts).toHaveLength(2))

    // A 的 fetch signal 已被 abort
    expect((pendingTts[0].init?.signal as AbortSignal).aborted).toBe(true)
    expect((pendingTts[1].init?.signal as AbortSignal).aborted).toBe(false)

    // B 的 fetch 成功返回 audio_url → 播放 + 设音色
    pendingTts[1].resolve({ ok: true, json: async () => ({ audio_url: 'http://x/b.mp3' }) })
    await waitFor(() => expect(useRadioStore.getState().ttsVoice).toBe('voice_b'))
    expect(audioPlayMock).toHaveBeenCalledTimes(1)

    // A 晚到的 resolve 不再产生影响（已被 abort，fetch 实际不会 resolve——
    // 但若 resolve 也不应覆盖：本用例验证 abort 语义即可）
  })

  it('试听失败（响应无 audio_url）→ ttsVoice 不变', async () => {
    render(<SettingsPage />)
    const cardA = await screen.findByText('小夜')
    fireEvent.click(cardA)
    await waitFor(() => expect(pendingTts).toHaveLength(1))

    pendingTts[0].resolve({ ok: true, json: async () => ({}) })

    await waitFor(() => expect(screen.getByText('▶ 点击试听')).toBeInTheDocument())
    expect(useRadioStore.getState().ttsVoice).toBe('orig_voice')
    expect(audioPlayMock).not.toHaveBeenCalled()
  })

  it('试听失败（fetch reject）→ ttsVoice 不变', async () => {
    render(<SettingsPage />)
    const cardA = await screen.findByText('小夜')
    fireEvent.click(cardA)
    await waitFor(() => expect(pendingTts).toHaveLength(1))

    pendingTts[0].reject(new Error('network down'))

    await waitFor(() => expect(screen.getByText('▶ 点击试听')).toBeInTheDocument())
    expect(useRadioStore.getState().ttsVoice).toBe('orig_voice')
    expect(audioPlayMock).not.toHaveBeenCalled()
  })
})
