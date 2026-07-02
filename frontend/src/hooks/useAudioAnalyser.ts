'use client'

import { useEffect, useRef, useCallback } from 'react'
import { logger } from '@/lib/logger'

/**
 * Web Audio API 分析器 —— 把 audio 元素连到 AnalyserNode，提取真实频率数据。
 *
 * 链路：audio → MediaElementSource → AnalyserNode → destination
 *
 * 用途：让 AudioWaveform 反映真实音频起伏（而非 sin 模拟）。
 *
 * CORS 注意：跨域音频（网易云/QQ CDN）连 AnalyserNode 需 audio.crossOrigin='anonymous'。
 * 若 CDN 不带 CORS 头，频率数据会全 0 → 调用方检测后降级到 sin 模拟。
 */
export function useAudioAnalyser() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const connectedElRef = useRef<HTMLAudioElement | null>(null)
  const freqDataRef = useRef<Uint8Array | null>(null)

  /** 确保 AudioContext + AnalyserNode 已创建 */
  const ensureContext = useCallback(() => {
    if (typeof window === 'undefined') return null
    if (!audioCtxRef.current) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return null
        audioCtxRef.current = new AC()
        analyserRef.current = audioCtxRef.current.createAnalyser()
        analyserRef.current.fftSize = 128 // 64 个频率桶，够波形用
        analyserRef.current.smoothingTimeConstant = 0.7
        freqDataRef.current = new Uint8Array(new ArrayBuffer(analyserRef.current.frequencyBinCount))
      } catch (e) {
        logger.warn('[Analyser] AudioContext 创建失败', { error: e instanceof Error ? e.message : String(e) })
        return null
      }
    }
    return audioCtxRef.current
  }, [])

  /**
   * 把一个 audio 元素连到 analyser。
   * 同一元素只连一次；换元素时先断开旧的。
   */
  const connect = useCallback((audioEl: HTMLAudioElement) => {
    const ctx = ensureContext()
    if (!ctx || !analyserRef.current) return false

    // 已连过同一个元素，跳过
    if (connectedElRef.current === audioEl && sourceRef.current) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      return true
    }

    try {
      // 断开旧连接
      if (sourceRef.current) {
        try { sourceRef.current.disconnect() } catch {}
      }
      // crossOrigin 必须在连 source 前设好（否则跨域音频频率数据全 0）
      if (!audioEl.crossOrigin) audioEl.crossOrigin = 'anonymous'
      sourceRef.current = ctx.createMediaElementSource(audioEl)
      sourceRef.current.connect(analyserRef.current)
      analyserRef.current.connect(ctx.destination)
      connectedElRef.current = audioEl
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      return true
    } catch (e) {
      logger.warn('[Analyser] 连接失败（可能已连过）', { error: e instanceof Error ? e.message : String(e) })
      return false
    }
  }, [ensureContext])

  /** 拿当前频率数据（Uint8Array, 0-255）。返回 null 表示无数据。 */
  const getFrequencyData = useCallback((): Uint8Array | null => {
    if (!analyserRef.current || !freqDataRef.current) return null
    // TS5 对 Uint8Array 泛型严格，用断言
    analyserRef.current.getByteFrequencyData(freqDataRef.current as Uint8Array<ArrayBuffer>)
    return freqDataRef.current
  }, [])

  /** 首次用户交互后恢复 AudioContext（autoplay 策略） */
  const resume = useCallback(() => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      try { sourceRef.current?.disconnect() } catch {}
      try { analyserRef.current?.disconnect() } catch {}
    }
  }, [])

  return { connect, getFrequencyData, resume, analyserRef }
}
