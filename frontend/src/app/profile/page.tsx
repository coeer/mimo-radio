'use client'

import ProfileCard from '@/components/ProfileCard'
import ThemeToggle from '@/components/ThemeToggle'
import Link from 'next/link'

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
          <div className="w-full">
            <ProfileCard />
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
