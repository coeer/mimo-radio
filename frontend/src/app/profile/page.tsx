'use client'

import dynamic from 'next/dynamic'
import ThemeToggle from '@/components/ThemeToggle'
import Link from 'next/link'
import { ErrorBoundary } from '@/components/ErrorBoundary'

/**
 * 序6C：ProfileCard 是 /profile 专属"重型"组件（278 行 + 内嵌 PersonalityChart 134 行 +
 * CardParticles canvas 粒子动画）。仅在用户进入 /profile 时下载。
 * - ssr: false — 首屏 / 不需要它；进入 /profile 时再下载
 * - loading 给一个轻骨架，避免 layout shift
 */
const ProfileCard = dynamic(() => import('@/components/ProfileCard'), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-[28px] surface-card p-6 flex flex-col items-center gap-4 min-h-[420px]">
      <div className="skeleton w-20 h-20 rounded-full" />
      <div className="skeleton w-32 h-5" />
      <div className="skeleton w-48 h-3" />
      <div className="flex gap-6 mt-4">
        <div className="skeleton w-10 h-6" />
        <div className="skeleton w-10 h-6" />
        <div className="skeleton w-10 h-6" />
      </div>
      <div className="skeleton w-40 h-40 rounded-full mt-4" />
    </div>
  ),
})

export default function ProfilePage() {
  return (
    <main className="min-h-screen relative overflow-x-hidden flex flex-col">
      <div className="ambient-glow" />

      {/* Content wrapper — unified centering, full height */}
      <div className="relative z-10 flex-1 flex flex-col mx-auto w-full max-w-[440px] px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: 'linear-gradient(135deg, var(--accent-warm), var(--accent-copper))',
                fontFamily: 'var(--font-display)',
                color: '#ffffff',
              }}
            >
              K
            </div>
            <span
              className="text-sm font-medium tracking-wide"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
            >
              Claudio
            </span>
          </Link>
          <ThemeToggle />
        </div>

        {/* Card + back link — centered vertically */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {/* ProfileCard 区域独立 ErrorBoundary：
               - dynamic(ProfileCard) 的 chunk 加载失败走 dynamic 自身 loading 状态（不会被 ErrorBoundary 拦截）。
               - 一旦 ProfileCard 渲染时崩溃，显示降级卡片，Header 和 back link 仍可用。
           */}
          <div className="w-full">
            <ErrorBoundary
              fallback={
                <div className="w-full rounded-[28px] surface-card p-6 text-center min-h-[420px] flex flex-col items-center justify-center gap-3">
                  <p className="text-[13px]" style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}>
                    个人主页加载失败
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                    暂时无法显示个人数据，可点击下方返回电台。
                  </p>
                </div>
              }
            >
              <ProfileCard />
            </ErrorBoundary>
          </div>
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/"
              className="text-[11px] transition-all duration-150 hover:opacity-80"
              style={{ color: 'var(--fg-muted)' }}
            >
              ← 返回电台
            </Link>
            <span className="text-[10px] text-[var(--fg-dim)] font-[var(--font-mono)] tracking-wider">
              CLAUDE × MMGUO
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
