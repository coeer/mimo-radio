'use client'

import React, { memo } from 'react'
import Link from 'next/link'

/**
 * 顶栏 —— 极简版
 * 左：[头像] Claudio（点击进 /profile）
 * 右：齿轮设置图标（进 /settings）
 * 主题/音源/音色等设置项全部移入 /settings 页面。
 */
function TopBar() {
  return (
    <div className="flex items-center justify-between">
      <Link href="/profile" className="flex items-center gap-2 group">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, var(--accent-warm) 0%, var(--accent-copper) 100%)',
            boxShadow: '0 0 12px var(--accent-glow)',
          }}
          aria-hidden="true"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
          </svg>
        </div>
        <span
          className="text-[14px] font-medium"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}
        >
          Claudio
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href="/plan"
          className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
          style={{ background: 'var(--surface-bg-subtle)' }}
          aria-label="今日电台时间轴"
          title="今日电台时间轴"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            style={{ color: 'var(--fg-secondary)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Link>

        <Link
          href="/settings"
        className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
        style={{ background: 'var(--surface-bg-subtle)' }}
        aria-label="设置"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          style={{ color: 'var(--fg-secondary)' }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.241.437-.613.43-.992a7.723 7.723 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        </Link>
      </div>
    </div>
  )
}

export default memo(TopBar)
