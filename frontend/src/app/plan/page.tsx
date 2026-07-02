'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'
import PlanTimeline from '@/components/PlanTimeline'
import TopBar from '@/components/TopBar'
import ParticleBackground from '@/components/ParticleBackground'
import type { DailySchedule } from '@/types/schedule'

/**
 * 单次 fetch /schedule/today，带 25s 超时（AbortController）。
 * 纯函数：超时定时器在 try/finally 内严格成对清理，绝不泄漏。
 * @returns 成功返回数据，失败抛错
 */
async function fetchScheduleOnce(): Promise<DailySchedule> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25000)
  try {
    const res = await fetch(`${API_BASE}/api/v1/schedule/today`, {
      headers: getApiHeaders(false),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as DailySchedule
  } finally {
    clearTimeout(timeoutId)  // 铁律1：资源清理成对，在 finally 里
  }
}

const MAX_RETRIES = 3

export default function PlanPage() {
  const [schedule, setSchedule] = useState<DailySchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  // S1 修复：轮询计数，防止 tracksLoaded 无限重试
  const retryCountRef = useRef(0)

  /** 内部 fetch 逻辑（不重置计数），isAutoRetry=true 时不重置计数器 */
  const doFetch = useCallback(async (isAutoRetry: boolean): Promise<void> => {
    // fetch + 失败重试（最多 MAX_RETRIES 次，含首次）
    let data: DailySchedule | null = null
    let lastErr: unknown = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        data = await fetchScheduleOnce()
        lastErr = null
        break  // 成功，跳出重试循环
      } catch (err) {
        lastErr = err
        logger.warn(`[Plan] fetch attempt ${attempt + 1}/${MAX_RETRIES} failed`, {
          error: err instanceof Error ? err.message : String(err),
        })
        // 最后一次失败不再等
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
    }

    // fetch 全部失败：保留已有数据（自动重试）或清空（初始加载），直接返回
    if (!data) {
      if (!isAutoRetry) setSchedule(null)
      return
    }

    // fetch 成功，更新数据
    setSchedule(data)

    // tracksLoaded=false：2s 后自动重试（受 retryCount 上限保护，避免无限循环）
    if (data.tracksLoaded === false && retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1
      setTimeout(() => doFetch(true), 2000)
    }
  }, [])

  /** 初始/手动加载：重置计数 */
  const loadSchedule = useCallback(async () => {
    retryCountRef.current = 0
    setLoading(true)
    try {
      await doFetch(false)
    } finally {
      setLoading(false)
    }
  }, [doFetch])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const handleRegenerate = useCallback(async () => {
    if (regenerating) return
    setRegenerating(true)
    try {
      await fetch(`${API_BASE}/api/v1/schedule/generate`, {
        method: 'POST',
        headers: { ...getApiHeaders(false), 'Content-Type': 'application/json' },
      })
      await loadSchedule()
    } catch (err) {
      logger.warn('[Plan] regenerate failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setRegenerating(false)
    }
  }, [regenerating, loadSchedule])

  return (
    <main className="min-h-screen relative overflow-x-hidden bg-[var(--bg-void)]">
      <ParticleBackground />
      <div className="ambient-glow" />
      <div className="dot-grid" />

      <div className="relative z-10 mx-auto w-full max-w-[440px] px-4 py-6 flex flex-col gap-3">
        <TopBar />

        {/* 标题 + 返回 */}
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-[20px] font-bold tracking-tight"
              style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}
            >
              今日电台
            </h1>
            <p className="text-[10px] text-[var(--fg-muted)] font-[var(--font-mono)] mt-0.5">
              DAILY TIMELINE · AI PLANNED
            </p>
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenerating || loading}
            className="text-[10px] px-3 py-1.5 rounded-full surface-card text-[var(--fg-secondary)] hover:text-[var(--accent-warm)] transition-colors disabled:opacity-50 font-[var(--font-mono)]"
          >
            {regenerating ? 'REGENERATING...' : 'REGENERATE'}
          </button>
        </div>

        {/* 时间轴 */}
        <PlanTimeline schedule={schedule} loading={loading} />

        {/* 返回主页 */}
        <Link
          href="/"
          className="text-center text-[11px] text-[var(--fg-muted)] hover:text-[var(--accent-warm)] transition-colors py-2 font-[var(--font-mono)]"
        >
          ← BACK TO RADIO
        </Link>
      </div>
    </main>
  )
}
