import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRadioStore } from '@/store/radioStore'

/**
 * useSession hook 单元测试（V2.0 §10.2 列为 P2）。
 * mock 掉 useTTS（避免真实 TTS/音频）和 fetch（避免真实网络），
 * 验证 createSession / sendChatMessage 的请求构造、状态流转、错误兜底。
 */

// mock useTTS：捕获 setHandlers 以便后续触发 onEnd
const ttsHandlers: { onStart?: () => void; onEnd?: () => void; onError?: () => void } = {}
vi.mock('./useTTS', () => ({
  useTTS: () => ({
    speak: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    setHandlers: (h: typeof ttsHandlers) => Object.assign(ttsHandlers, h),
  }),
}))

// mock config（useSession 引用 getApiHeaders / API_BASE）
vi.mock('@/lib/config', () => ({
  API_BASE: 'http://test-api',
  getApiHeaders: () => ({ 'Content-Type': 'application/json' }),
}))

import { useSession } from './useSession'

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  })
}

describe('useSession', () => {
  beforeEach(() => {
    // 清空 handlers
    Object.keys(ttsHandlers).forEach((k) => delete ttsHandlers[k as keyof typeof ttsHandlers])
    useRadioStore.setState({
      sessionId: null,
      sessionToken: null,
      queue: [],
      currentSong: null,
      isPlaying: false,
      isSpeaking: false,
      isCreating: false,
      djEnabled: true,
      messages: [],
      currentModel: 'mimo-v2.5',
    })
  })

  it('createSession 成功：设置 sessionId/token/queue，返回 true', async () => {
    const fetchSpy = mockFetchResponse({
      session_id: 'sess-1',
      session_token: 'sess-1.token',
      queue: [{ id: 's1', title: '晴天', artist: '周杰伦', playUrl: 'http://x/1.mp3', duration: 200 }],
    })
    ;(globalThis as Record<string, unknown>).fetch = fetchSpy

    const { result } = renderHook(() => useSession())
    let ok = false
    await act(async () => {
      ok = await result.current.createSession('深夜想听点安静的')
    })

    expect(ok).toBe(true)
    const s = useRadioStore.getState()
    expect(s.sessionId).toBe('sess-1')
    expect(s.sessionToken).toBe('sess-1.token')
    expect(s.queue).toHaveLength(1)
    // 请求体含 mood / user_input / dj_enabled
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.mood).toBe('深夜想听点安静的')
    expect(body.dj_enabled).toBe(true)
  })

  it('createSession 有开场白且 djEnabled：注册 TTS handlers 并触发 speak', async () => {
    mockFetchResponse({
      session_id: 'sess-2',
      session_token: 'sess-2.token',
      queue: [{ id: 's1', title: 't', artist: 'a', playUrl: 'http://x/1.mp3' }],
      intro_script: '欢迎收听今晚电台',
    })
    ;(globalThis as Record<string, unknown>).fetch = mockFetchResponse({
      session_id: 'sess-2',
      session_token: 'sess-2.token',
      queue: [{ id: 's1', title: 't', artist: 'a', playUrl: 'http://x/1.mp3' }],
      intro_script: '欢迎收听今晚电台',
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await result.current.createSession('测试')
    })

    // hook 挂载即注册 handlers
    expect(ttsHandlers.onStart).toBeDefined()
    expect(ttsHandlers.onEnd).toBeDefined()
    // 开场白应作为消息加入
    const s = useRadioStore.getState()
    expect(s.messages.some((m: { text: string }) => m.text === '欢迎收听今晚电台')).toBe(true)
  })

  it('createSession 失败：返回 false 并给出错误提示消息', async () => {
    ;(globalThis as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('服务器错误'),
    })

    const { result } = renderHook(() => useSession())
    let ok = true
    await act(async () => {
      ok = await result.current.createSession('测试')
    })

    expect(ok).toBe(false)
    const s = useRadioStore.getState()
    expect(s.messages.some((m: { text: string }) => m.text.includes('电台启动失败'))).toBe(true)
  })

  it('createSession 网络异常：返回 false 且不崩溃', async () => {
    ;(globalThis as Record<string, unknown>).fetch = vi.fn().mockRejectedValue(new Error('网络断开'))

    const { result } = renderHook(() => useSession())
    let ok = true
    await act(async () => {
      ok = await result.current.createSession('测试')
    })

    expect(ok).toBe(false)
  })

  it('sendChatMessage 无 sessionId 时直接返回 false', async () => {
    const { result } = renderHook(() => useSession())
    let ret = true
    await act(async () => {
      ret = await result.current.sendChatMessage('hello')
    })
    expect(ret).toBe(false)
  })

  it('sendChatMessage 成功：返回 true 并加入 AI reply 消息', async () => {
    useRadioStore.setState({ sessionId: 'sess-3', sessionToken: 'tok' })
    ;(globalThis as Record<string, unknown>).fetch = mockFetchResponse({
      reply: '好的，给你放一首',
    })

    const { result } = renderHook(() => useSession())
    let ret = false
    await act(async () => {
      ret = await result.current.sendChatMessage('放首歌')
    })

    expect(ret).toBe(true)
    const s = useRadioStore.getState()
    expect(s.messages.some((m: { text: string }) => m.text === '好的，给你放一首')).toBe(true)
  })

  it('TTS onEnd handler：DJ 说完后若有 currentSong 未播放则启动播放', async () => {
    // 先 createSession 拿到 currentSong
    ;(globalThis as Record<string, unknown>).fetch = mockFetchResponse({
      session_id: 'sess-4',
      session_token: 'sess-4.token',
      queue: [{ id: 's1', title: 't', artist: 'a', playUrl: 'http://x/1.mp3' }],
      intro_script: '开场',
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await result.current.createSession('测试')
    })

    // 模拟 DJ 正在说
    act(() => useRadioStore.setState({ isSpeaking: true, isPlaying: false }))
    // 触发 TTS onEnd
    act(() => {
      ttsHandlers.onEnd?.()
    })

    const s = useRadioStore.getState()
    expect(s.isSpeaking).toBe(false)
    expect(s.isPlaying).toBe(true)
  })

  it('TTS onError handler 也应触发续播（避免说完/出错后卡死）', async () => {
    ;(globalThis as Record<string, unknown>).fetch = mockFetchResponse({
      session_id: 'sess-5',
      session_token: 'sess-5.token',
      queue: [{ id: 's1', title: 't', artist: 'a', playUrl: 'http://x/1.mp3' }],
      intro_script: '开场',
    })

    const { result } = renderHook(() => useSession())
    await act(async () => {
      await result.current.createSession('测试')
    })

    act(() => useRadioStore.setState({ isSpeaking: true, isPlaying: false }))
    act(() => {
      ttsHandlers.onError?.()
    })

    expect(useRadioStore.getState().isPlaying).toBe(true)
  })
})
