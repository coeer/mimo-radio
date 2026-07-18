'use client'

import { useRef, useCallback, useEffect } from 'react'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { useRadioStore } from '@/store/radioStore'
import { logger } from '@/lib/logger'

/**
 * 统一的 TTS 播放接口 —— 打通 AI 语音真实播放链路
 *
 * 策略：
 * 1. 优先调后端 /api/v1/dj/tts（MiMo TTS 真实合成，返回 mp3 url）
 *    - 用 HTMLAudioElement 播放，能拿到精确 currentTime/duration
 * 2. 后端失败（无 key 等）→ 兜底用浏览器原生 speechSynthesis
 *    - 无法拿到精确时长，用估算 + boundary 事件近似
 *
 * 两条路径对外暴露统一回调：onStart / onTimeUpdate / onEnd / onError
 */

export interface TTSHandlers {
  onStart?: () => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnd?: () => void
  onError?: (err: unknown) => void
}

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const handlersRef = useRef<TTSHandlers>({})
  // 兜底用：标记当前是否用 speechSynthesis（无法精确计时）
  const usingSpeechSynthRef = useRef(false)
  const synthStartRef = useRef(0)
  const synthDurationRef = useRef(0)
  const synthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // P1-2b（F3）：取消在途 TTS 合成请求——复用 chat 防重入的 chatAbortRef 模式（提交 b32ad68）。
  // 换歌时旧 transition 的 fetch resolve 后会 playAudio，造成双音轨叠加；AbortController 让旧请求静默终止。
  const ttsAbortRef = useRef<AbortController | null>(null)

  const setHandlers = useCallback((h: TTSHandlers) => {
    handlersRef.current = h
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      stop()
      if (audioRef.current) {
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = useCallback(() => {
    // P1-2b：stop 同时取消在途合成请求（否则旧 fetch resolve 后"复活"播放）
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort()
      ttsAbortRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    if (usingSpeechSynthRef.current && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    if (synthTimerRef.current) {
      clearInterval(synthTimerRef.current)
      synthTimerRef.current = null
    }
    usingSpeechSynthRef.current = false
  }, [])

  /**
   * 合成并播放一段文本
   * options.voice 可指定音色（覆盖 store 默认值）
   * 返回播放方式：'audio' | 'speech' | null（失败）
   */
  const speak = useCallback(
    async (text: string, options?: { voice?: string }): Promise<'audio' | 'speech' | null> => {
      if (!text?.trim()) return null
      // 先停掉之前的
      stop()
      // P1-2b：取消上一个在途的 tts fetch（防"旧串词复活"双音轨）
      if (ttsAbortRef.current) ttsAbortRef.current.abort()
      const controller = new AbortController()
      ttsAbortRef.current = controller

      const handlers = handlersRef.current
      // 音色：优先用调用方传入的，否则用 store 持久化的
      const voice = options?.voice || useRadioStore.getState().ttsVoice

      // ── 路径1：调后端 /dj/tts 拿真实 mp3 ──
      try {
        const res = await fetch(`${API_BASE}/api/v1/dj/tts`, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ text, voice }),
          signal: controller.signal,
        })
      if (res.ok) {
        const data = await res.json()
        if (data.audio_url) {
          const url = data.audio_url.startsWith('http')
            ? data.audio_url
            : `${API_BASE}${data.audio_url}`
          return playAudio(url)
        }
      }
    } catch (err) {
      // P1-2b：被新 speak/stop 主动取消 → 静默返回，不走 speechSynth 兜底（否则照样双音轨）
      if (err instanceof DOMException && err.name === 'AbortError') return null
      // 落到兜底
      logger.warn('[TTS] /dj/tts failed, fallback to speechSynthesis', { error: err instanceof Error ? err.message : String(err) })
    }

    // ── 路径2：浏览器原生 speechSynthesis 兜底 ──
    return playSpeechSynth(text, handlers)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop])

  // 用 HTMLAudioElement 播放真实 mp3
  function playAudio(url: string): 'audio' {
    try {
      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current
      const handlers = handlersRef.current

      audio.src = url
      audio.onplay = () => handlers.onStart?.()
      audio.ontimeupdate = () =>
        handlers.onTimeUpdate?.(audio.currentTime, audio.duration || 0)
      audio.onended = () => handlers.onEnd?.()
      audio.onerror = () => handlers.onError?.(new Error('TTS audio error'))

      // play() 在某些环境（jsdom）不返回 Promise 或同步抛错，做防御
      const playRet = audio.play()
      if (playRet && typeof (playRet as Promise<void>)?.catch === 'function') {
        ;(playRet as Promise<void>).catch((e) => handlers.onError?.(e))
      }
    } catch (e) {
      // jsdom 等环境 Audio 不可用时，记录但不阻断（调用方已返回 'audio' 标记）
      logger.warn('[TTS] playAudio runtime issue', { error: e instanceof Error ? e.message : String(e) })
    }
    return 'audio'
  }

  // 兜底：浏览器 speechSynthesis（中文用 zh-CN）
  function playSpeechSynth(text: string, handlers: TTSHandlers): 'speech' | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      handlers.onError?.(new Error('speechSynthesis unavailable'))
      return null
    }
    usingSpeechSynthRef.current = true
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US'
    utter.rate = 0.95
    // 估算时长：中文 ~4字/秒，英文 ~2.5词/秒
    const chars = text.replace(/\s/g, '').length
    synthDurationRef.current = utter.lang.startsWith('zh')
      ? chars / 3.5
      : text.split(/\s+/).length / 2.5
    synthStartRef.current = Date.now()

    utter.onstart = () => {
      handlers.onStart?.()
      // 用定时器模拟 timeupdate
      synthTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - synthStartRef.current) / 1000
        handlers.onTimeUpdate?.(elapsed, synthDurationRef.current)
      }, 200)
    }
    utter.onend = () => {
      if (synthTimerRef.current) {
        clearInterval(synthTimerRef.current)
        synthTimerRef.current = null
      }
      handlers.onEnd?.()
    }
    utter.onerror = () => handlers.onError?.(new Error('speechSynthesis error'))

    window.speechSynthesis.speak(utter)
    return 'speech'
  }

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) audioRef.current.pause()
    if (usingSpeechSynthRef.current && window.speechSynthesis) window.speechSynthesis.pause()
  }, [])

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) audioRef.current.play().catch(() => {})
    if (usingSpeechSynthRef.current && window.speechSynthesis) window.speechSynthesis.resume()
  }, [])

  return { speak, stop, pause, resume, setHandlers }
}
