'use client'

import { useEffect, useState } from 'react'

interface LogLine {
  text: string
  delay: number
  color?: string
}

const DEFAULT_LOGS: LogLine[] = [
  { text: '> kimi start', delay: 0 },
  { text: '', delay: 100 },
  { text: '┌─────────────────────────────┐', delay: 200 },
  { text: '│ MiMo Server              │', delay: 300 },
  { text: '│ listening on :8765          │', delay: 400 },
  { text: '│ ● connected to 网易云/Spotify│', delay: 500 },
  { text: '│ ● MiMo DJ Taste loaded   │', delay: 600 },
  { text: '└─────────────────────────────┘', delay: 800 },
  { text: '', delay: 900 },
  { text: 'MiMo DJ  2026-04-20 周一', delay: 1000, color: 'var(--accent-warm)' },
  { text: '正在为你定制今日电台...', delay: 1100 },
  { text: '', delay: 1200 },
  { text: '● 起床时间：09:12（周一）', delay: 1300 },
  { text: '● 天气：晴 22/8℃  日落时间 18:56', delay: 1400 },
  { text: '● 收藏夹：3247 首（近期音乐风格：摇滚、90s华语）', delay: 1600 },
  { text: '● 检测音响设备...', delay: 1700 },
  { text: '', delay: 1800 },
  { text: '─────────────────────────────', delay: 1900 },
  { text: '◉ 今日电台：mmguo\'s Room Tone', delay: 2000, color: 'var(--accent-warm)' },
  { text: '─────────────────────────────', delay: 2100 },
  { text: '', delay: 2200 },
  { text: '09:12-10:00  房间先醒    naim宝宝', delay: 2300 },
  { text: '   颜色 — 许美静', delay: 2350 },
  { text: '   取消资格 — 陈奕迅', delay: 2400 },
  { text: '   一万一千公里 — 那英', delay: 2450 },
  { text: '', delay: 2500 },
  { text: '10:00-12:00  深度工作    sony小黑', delay: 2600 },
  { text: '   A Walk — Tycho', delay: 2650 },
  { text: '   Cirrus — Bonobo', delay: 2700 },
  { text: '   Open Eye Signal — Jon Hopkins', delay: 2750 },
  { text: '', delay: 2800 },
  { text: '12:00-13:00  午休韩语    naim宝宝', delay: 2900 },
  { text: '   It Goes Like — Peggy Gou', delay: 2950 },
  { text: '   Square — Yerin Baek', delay: 3000 },
]

export default function TerminalLog({ logs = DEFAULT_LOGS, className = '' }: {
  logs?: LogLine[]
  className?: string
}) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)
    let current = 0
    const timers: ReturnType<typeof setTimeout>[] = []

    logs.forEach((line, i) => {
      const timer = setTimeout(() => {
        current = i + 1
        setVisibleCount(current)
      }, line.delay)
      timers.push(timer)
    })

    return () => timers.forEach(clearTimeout)
  }, [logs])

  return (
    <div className={`terminal-panel ${className}`}>
      <div className="space-y-0.5">
        {logs.slice(0, visibleCount).map((line, i) => (
          <div
            key={i}
            className="terminal-line"
            style={{
              color: line.color || undefined,
            }}
          >
            {line.text}
          </div>
        ))}
        {visibleCount < logs.length && (
          <div
            className="terminal-line animate-pulse"
            style={{ color: 'var(--accent-warm)' }}
          >
            ▌
          </div>
        )}
      </div>
    </div>
  )
}
