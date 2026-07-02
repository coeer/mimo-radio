'use client'

import { memo, useEffect, useRef } from 'react'

interface AudioWaveformProps {
  isPlaying?: boolean
  barCount?: number
  color?: string
  height?: number
  className?: string
  variant?: 'large' | 'mini'
  /** 真实音频分析器（有则用真实频率，无则 sin 模拟） */
  getFrequencyData?: (() => Uint8Array | null) | null
}

function resolveColor(cssColor: string): string {
  if (!cssColor.startsWith('var(')) return cssColor
  const varName = cssColor.slice(4, -1)
  const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return computed || 'rgba(128,128,128,0.5)'
}

function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number[]
) {
  // roundRect is available in modern browsers; fallback to fillRect
  const rr = (ctx as unknown as { roundRect?: typeof ctx.roundRect }).roundRect
  if (typeof rr === 'function') {
    rr.call(ctx, x, y, w, h, radii)
  } else {
    ctx.fillRect(x, y, w, h)
  }
}

function AudioWaveform({
  isPlaying = false,
  barCount = 48,
  color = 'var(--fg-secondary)',
  height = 48,
  className = '',
  variant = 'large',
  getFrequencyData = null,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const barsRef = useRef<number[]>([])
  const timeRef = useRef<number>(0)
  const peakRef = useRef<number>(0)
  const isVisibleRef = useRef(true)
  const isPlayingRef = useRef(isPlaying)
  const colorRef = useRef(color)
  const getFreqRef = useRef(getFrequencyData)
  // 是否检测到真实频率数据有效（避免每帧检测）
  const useRealFreqRef = useRef(false)

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    colorRef.current = resolveColor(color)
  }, [color])

  useEffect(() => {
    getFreqRef.current = getFrequencyData
    // 切换数据源时重置检测
    useRealFreqRef.current = false
  }, [getFrequencyData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resolvedColor = resolveColor(color)
    colorRef.current = resolvedColor

    const dpr = window.devicePixelRatio || 1
    let rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Initialize bars with bell-curve distribution
    if (barsRef.current.length === 0) {
      barsRef.current = Array.from({ length: barCount }, (_, i) => {
        const center = barCount / 2
        const dist = Math.abs(i - center) / center
        const base = Math.max(0.06, 0.7 * (1 - dist * dist))
        return base + Math.random() * 0.1
      })
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        rect = { width: cr.width, height: cr.height, top: 0, left: 0, right: cr.width, bottom: cr.height, x: 0, y: 0, toJSON: () => ({}) }
        canvas.width = cr.width * dpr
        canvas.height = cr.height * dpr
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    })
    resizeObserver.observe(canvas)

    // 30fps 节流：波形视觉无差异，但移动端省一半 CPU/GPU 开销
    const FRAME_INTERVAL = 1000 / 30
    let lastFrame = 0

    const animate = (ts: number = 0) => {
      animRef.current = requestAnimationFrame(animate)
      // 节流：未到下一帧间隔则跳过绘制
      if (ts - lastFrame < FRAME_INTERVAL) return
      lastFrame = ts

      if (!isVisibleRef.current) {
        animRef.current = 0
        return
      }

      const width = rect.width
      const barWidth = width / barCount
      const gap = barWidth * 0.5
      const actualBarW = Math.max(1, barWidth - gap)

      ctx.clearRect(0, 0, width, height)
      timeRef.current += 1

      // Decay peak
      peakRef.current *= 0.95

      const playing = isPlayingRef.current

      // 尝试拿真实频率数据（若提供了 analyser）
      let freqData: Uint8Array | null = null
      if (playing && getFreqRef.current) {
        freqData = getFreqRef.current()
        // 检测真实数据是否有效（非全 0）—— 全 0 说明 CORS 拿不到，降级
        if (!useRealFreqRef.current && freqData) {
          let sum = 0
          for (let k = 0; k < freqData.length; k++) sum += freqData[k]
          if (sum > 0) useRealFreqRef.current = true
        }
      }

      barsRef.current = barsRef.current.map((bar, i) => {
        const center = barCount / 2
        const dist = Math.abs(i - center) / center
        const bellCurve = Math.max(0.04, 1 - dist * dist * 0.85)

        let target: number
        if (playing && useRealFreqRef.current && freqData) {
          // 真实频率数据驱动：把频率桶映射到 bar
          // freqData 是 0-255，归一化到 0-1，叠 bellCurve 增强中心
          const freqIdx = Math.floor((i / barCount) * freqData.length)
          const freqVal = freqData[Math.min(freqIdx, freqData.length - 1)] / 255
          target = Math.max(0.04, freqVal * bellCurve * 1.3)
          if (target > peakRef.current) peakRef.current = target
        } else if (playing) {
          // 降级：sin 模拟（CORS 拿不到或无 analyser）
          const beat1 = Math.sin(timeRef.current * 0.12 + i * 0.35) * 0.35
          const beat2 = Math.sin(timeRef.current * 0.07 + i * 0.6) * 0.25
          const beat3 = Math.sin(timeRef.current * 0.22 + i * 0.15) * 0.2
          const noise = (Math.random() - 0.5) * 0.3
          const kick = Math.sin(timeRef.current * 0.08) > 0.85 ? 0.4 * bellCurve : 0
          target = 0.12 + bellCurve * 0.7 + (beat1 + beat2 + beat3 + noise + kick) * bellCurve
          if (target > peakRef.current) peakRef.current = target
        } else {
          // Gentle breathing when paused
          const breath = Math.sin(timeRef.current * 0.025 + i * 0.18) * 0.05
          target = 0.08 + bellCurve * 0.15 + breath
        }

        target = Math.max(0.04, Math.min(0.95, target))
        const speed = playing ? 0.18 : 0.02
        return bar + (target - bar) * speed
      })

      // 颜色解析提到循环外（每帧只算一次，避免每 bar 重复 replace）
      const baseColor = colorRef.current
      const fadeColor = baseColor.startsWith('rgba')
        ? baseColor.replace(/[\d.]+\)$/, '0.1)')
        : baseColor

      barsRef.current.forEach((bar, i) => {
        const barH = bar * height * 0.92
        const x = i * barWidth + gap / 2
        const y = (height - barH) / 2

        // gradient 几何参数每 bar 不同，无法跨 bar 复用对象，但颜色已缓存
        const gradient = ctx.createLinearGradient(x, y + barH, x, y)
        gradient.addColorStop(0, baseColor)
        gradient.addColorStop(1, fadeColor)

        ctx.fillStyle = gradient
        ctx.beginPath()
        const radius = variant === 'large' ? 1 : 0
        safeRoundRect(ctx, x, y, actualBarW, barH, [radius, radius, radius, radius])
        ctx.fill()

        // Subtle top highlight for taller bars
        if (bar > 0.4 && variant === 'large') {
          const baseColor = colorRef.current
          const fadeColor = baseColor.startsWith('rgba')
            ? baseColor.replace(/[\d.]+\)$/, '0.8)')
            : baseColor
          ctx.fillStyle = fadeColor
          ctx.beginPath()
          safeRoundRect(ctx, x, y, actualBarW, Math.min(barH, 3), [radius, radius, 0, 0])
          ctx.fill()
        }
      })
    }

    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      isVisibleRef.current = visible
      if (visible && !animRef.current) {
        animate()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    animate()

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      colorRef.current = resolveColor(color)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      cancelAnimationFrame(animRef.current)
      animRef.current = 0
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer.disconnect()
    }
  }, [barCount, color, height, variant])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
    />
  )
}

export default memo(AudioWaveform)
