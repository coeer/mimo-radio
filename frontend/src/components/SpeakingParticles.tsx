'use client'

import { useEffect, useRef } from 'react'

/**
 * Speaking 状态的紫蓝粒子背景 —— 对齐视频 204-248s
 * 紫色 #8b5cf6 / 蓝色 #3b82f6 粒子缓慢飘动
 */
export default function SpeakingParticles({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const colors = ['#8b5cf6', '#3b82f6', '#a78bfa', '#ec4899']
    const particles = Array.from({ length: 36 }, () => ({
      x: Math.random() * (canvas.width / dpr),
      y: Math.random() * (canvas.height / dpr),
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 3 + 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.3 + 0.1,
    }))

    let raf = 0
    let running = active
    const animate = () => {
      if (!running) {
        raf = 0
        return
      }
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(animate)
    }

    if (active) animate()

    return () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active])

  if (!active) return null
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  )
}
