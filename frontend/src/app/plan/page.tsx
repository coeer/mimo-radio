'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { logger } from '@/lib/logger'
import TopBar from '@/components/TopBar'
import ParticleBackground from '@/components/ParticleBackground'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { DailySchedule } from '@/types/schedule'

/**
 * 序6C：路由专属"重型"组件（终端时间轴，251 行）按需加载。
 * - ssr: false — 首屏 / 不需要它；/plan 进入时再下载
 * - loading 用一个跟终端风格一致的占位（避免 layout shift）
 */
const PlanTimeline = dynamic(() => import('@/components/PlanTimeline'), {
  ssr: false,
  loading: () => (
    <div className="card-enter rounded-2xl px-4 py-5 surface-card font-[var(--font-mono)]">
      <div className="skeleton w-32 h-3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-2 h-2 rounded-full" />
            <div className="skeleton flex-1 h-3" />
          </div>
        ))}
      </div>
    </div>
  ),
})

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

        {/* 时间轴区独立 ErrorBoundary：
             - 崩了显示"时间轴加载失败"，用户仍能用顶部 TopBar 跳到首页/其它页。
             - dynamic(PlanTimeline) 的 chunk 加载失败走 dynamic 自身 loading 状态（不会被 ErrorBoundary 拦截）。
         */}
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl px-4 py-6 surface-card text-center" style={{ border: '1px solid var(--surface-border)' }}>
              <p className="text-[13px] mb-1" style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}>
                时间轴加载失败
              </p>
              <p className="text-[11px] mb-3" style={{ color: 'var(--fg-muted)' }}>
                电台时间轴暂时不可用，可点击顶栏跳转其他页面。
              </p>
              <button
                onClick={() => loadSchedule()}
                className="text-[11px] px-3 py-1.5 rounded-full"
                style={{ background: 'var(--accent-glow)', color: 'var(--accent-warm)', border: '1px solid var(--accent-glow-strong)' }}
              >
                重试
              </button>
            </div>
          }
        >
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
        </ErrorBoundary>
      </div>
    </main>
  )
}
