'use client'

import { memo } from 'react'
import { useTheme } from '@/hooks/useTheme'

function ThemeToggleImpl() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      aria-pressed={theme === 'dark'}
      aria-label="Toggle theme"
      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] transition-all duration-200 hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: 'var(--surface-bg-subtle)',
        border: '1px solid var(--surface-border-subtle)',
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-mono)',
        outlineColor: 'var(--accent-warm)',
      }}
    >
      <span
        className={`px-2 py-0.5 rounded-full transition-all duration-200 ${
          theme === 'dark'
            ? 'bg-white/10 text-white'
            : 'text-black/30'
        }`}
      >
        DARK
      </span>
      <span
        className={`px-2 py-0.5 rounded-full transition-all duration-200 ${
          theme === 'light'
            ? 'bg-black/10'
            : 'text-white/40'
        }`}
        style={{ color: theme === 'light' ? 'var(--fg-primary)' : 'rgba(255,255,255,0.4)' }}
      >
        LIGHT
      </span>
    </button>
  )
}

export default memo(ThemeToggleImpl)
