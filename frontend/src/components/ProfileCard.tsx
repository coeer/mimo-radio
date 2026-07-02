'use client'

import { useEffect, useRef, useState } from 'react'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'
import PersonalityChart from './PersonalityChart'

const FALLBACK_TAGS = [
  'JAZZ-HIPHOP', 'NEO-CLASSICAL', '90S华语', 'HIP-HOP',
  '柴可夫斯基&EMINEM', 'J-ROCK', '下雨白噪音', 'POST-PUNK',
  'SHIBUYA-KEI',
]

interface ProfileStats {
  personalityType?: string
  personalityDesc?: string
  emotionDistribution?: Record<string, number>
  sceneDistribution?: Record<string, number>
  favoriteArtists?: string[]
  totalSongs?: number
  totalListenTime?: number
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '0m'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`
  return `${m}m`
}

function CardParticles() {
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
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = []
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width / dpr,
        y: Math.random() * canvas.height / dpr,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      })
    }

    let animId: number
    let isVisible = true

    const onVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible'
      if (isVisible && !animId) animate()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const animate = () => {
      if (!isVisible) {
        animId = 0
        return
      }
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(212, 165, 116, ${p.alpha})`
        ctx.fill()
      })

      animId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      animId = 0
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      role="presentation"
    />
  )
}

export default function ProfileCard() {
  const [hoveredTag, setHoveredTag] = useState<string | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/profile/stats`, {
          headers: getApiHeaders(false),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setStats(data)
      } catch (err) {
        logger.warn('[Profile] load stats failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 统计三栏：真实数据优先，无数据用兜底
  const totalSongs = stats?.totalSongs ?? 0
  const listenTime = formatDuration(stats?.totalListenTime)
  const artistCount = stats?.favoriteArtists?.length ?? 0
  const stats3 = [
    { label: 'TRACKS', value: loading ? '...' : String(totalSongs) },
    { label: 'LISTENED', value: loading ? '...' : listenTime },
    { label: 'ARTISTS', value: loading ? '...' : String(artistCount) },
  ]

  // 标签云：favoriteArtists 优先，不足用兜底标签补齐
  const tags = (stats?.favoriteArtists && stats.favoriteArtists.length >= 3
    ? stats.favoriteArtists
    : FALLBACK_TAGS
  )

  // 人格类型与描述
  const personalityType = stats?.personalityType || '音乐探索者'
  const personalityDesc = stats?.personalityDesc || '你的音乐品味独特而多元'

  // 雷达图数据：合并情绪 + 场景分布（取 top 6）
  const chartData = (() => {
    const emo = stats?.emotionDistribution || {}
    const scene = stats?.sceneDistribution || {}
    const merged = [
      ...Object.entries(emo).map(([label, value]) => ({ label, value })),
      ...Object.entries(scene).map(([label, value]) => ({ label, value })),
    ]
    return merged
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  })()

  return (
    <div className="w-full rounded-[28px] surface-card relative overflow-hidden">
      <CardParticles />

      <div className="relative z-10 p-6 flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="relative mb-4">
          <div
            className="w-20 h-20 rounded-full overflow-hidden"
            style={{
              border: '2px solid var(--accent-glow-strong)',
              boxShadow: '0 0 20px var(--accent-glow)',
            }}
          >
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--accent-warm) 0%, var(--accent-copper) 100%)' }}
              aria-hidden="true"
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
              </svg>
            </div>
          </div>
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px]"
            style={{
              background: 'rgba(74, 222, 128, 0.12)',
              color: 'var(--neon-green)',
              border: '1px solid var(--neon-green-glow)',
            }}
          >
            {personalityType}
          </div>
        </div>

        {/* Name */}
        <h2
          className="text-[34px] font-bold tracking-wide"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
        >
          Claudio
        </h2>

        {/* Bio */}
        <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
          mmguo 的私人 dj，会打碟的 taste.md
        </p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>
          {personalityDesc}
        </p>
        <p className="text-[11px] italic mt-1" style={{ color: 'var(--fg-muted)' }}>
          Your mood is my prompt. I hate algorithm. I have taste.
        </p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 mt-5 w-full">
          {stats3.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <span
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)' }}
              >
                {stat.value}
              </span>
              <span className="text-[9px] tracking-wider mt-0.5" style={{ color: 'var(--fg-muted)' }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* 人格雷达图 */}
        <div className="mt-5 w-full">
          <p className="text-[9px] tracking-wider mb-2 font-[var(--font-mono)]" style={{ color: 'var(--fg-dim)' }}>
            MUSIC PERSONALITY
          </p>
          <PersonalityChart data={chartData} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {tags.map((tag) => (
            <span
              key={tag}
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
              className="px-3 py-1.5 rounded-full text-[10px] transition-all duration-200"
              style={{
                background: hoveredTag === tag
                  ? 'var(--accent-glow-strong)'
                  : 'var(--surface-bg-subtle)',
                color: hoveredTag === tag ? 'var(--accent-warm)' : 'var(--fg-muted)',
                border: `1px solid ${hoveredTag === tag ? 'var(--accent-glow-strong)' : 'var(--surface-border-subtle)'} `,
                transform: hoveredTag === tag ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
