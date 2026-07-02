'use client'

import { useCallback, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'mimo-theme'

/**
 * 主题统一管理 hook。
 * 所有主题读写都走这里，不再各组件直接操作 data-theme / localStorage。
 *
 * 真相源：localStorage（持久化）+ data-theme（DOM 应用）
 * SSR 防闪烁仍由 layout.tsx 的内联脚本负责（它在 hydration 前跑）
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  // 初始化：读 localStorage（客户端）
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (saved === 'light' || saved === 'dark') {
      setThemeState(saved)
    } else {
      // 无存储时读当前 DOM（layout SSR 已设过）
      const current = document.documentElement.getAttribute('data-theme') as Theme | null
      if (current) setThemeState(current)
    }
  }, [])

  // 应用到 DOM + 持久化
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(STORAGE_KEY, next)
    // 同步 theme-color meta（layout SSR 里也有这逻辑）
    const meta = document.getElementById('theme-color-meta')
    if (meta) {
      meta.setAttribute('content', next === 'light' ? '#f5f3ef' : '#06060a')
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
