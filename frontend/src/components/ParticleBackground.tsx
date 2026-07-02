'use client'

import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  pulse: number
  pulseSpeed: number
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animRef = useRef<number>(0)
  const isVisibleRef = useRef(true)
  const lastDrawRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    let width = window.innerWidth
    let height = window.innerHeight

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize particles — cap at 60 for performance
    const particleCount = Math.min(60, Math.floor((width * height) / 18000))
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.015 + 0.005,
    }))

    // Throttled draw loop (~30fps) to reduce CPU usage
    const draw = (timestamp: number) => {
      if (!isVisibleRef.current) {
        animRef.current = 0
        return
      }

      // Skip frame if less than 33ms since last draw (~30fps cap)
      if (timestamp - lastDrawRef.current < 33) {
        animRef.current = requestAnimationFrame(draw)
        return
      }
      lastDrawRef.current = timestamp

      ctx.clearRect(0, 0, width, height)

      const particles = particlesRef.current

      // Draw particles
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.pulse += p.pulseSpeed

        // Wrap around
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        const pulseOpacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse))

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201, 168, 124, ${pulseOpacity})`
        ctx.fill()

        // Subtle glow for larger particles
        if (p.size > 1.2) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(201, 168, 124, ${pulseOpacity * 0.15})`
          ctx.fill()
        }
      })

      animRef.current = requestAnimationFrame(draw)
    }

    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      isVisibleRef.current = visible
      if (visible && !animRef.current) {
        lastDrawRef.current = 0
        animRef.current = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // IntersectionObserver: pause when canvas is not in viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting && document.visibilityState === 'visible'
        if (isVisibleRef.current && !animRef.current) {
          lastDrawRef.current = 0
          animRef.current = requestAnimationFrame(draw)
        }
      },
      { threshold: 0 }
    )
    observer.observe(canvas)

    animRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animRef.current)
      animRef.current = 0
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      aria-hidden="true"
      role="presentation"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    />
  )
}
