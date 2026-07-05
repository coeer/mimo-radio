'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import ThemeToggle from '@/components/ThemeToggle'
import { useRadioStore } from '@/store/radioStore'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { ErrorBoundary } from '@/components/ErrorBoundary'

/**
 * 序6C：SourceSwitcher 仅在 /settings 使用，且内部有 fetch + 切换状态机。
 * ssr: false 推迟到 /settings 进入时再下载。
 */
const SourceSwitcher = dynamic(() => import('@/components/SourceSwitcher'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--fg-muted)] font-[var(--font-mono)]">
        SOURCE
      </span>
      <div className="skeleton w-32 h-7 rounded-full" />
    </div>
  ),
})

interface VoiceInfo {
  id: string
  name: string
  gender: '男' | '女'
  style: string
  lang: 'zh' | 'en'
  desc: string
}

/** 试听文案：中文音色用中文例句，英文音色用英文例句 */
const SAMPLE_TEXT_ZH = '晚上好，欢迎收听 Claudio 电台，这里是陪你度过深夜的声音。'
const SAMPLE_TEXT_EN = 'Good evening, welcome to Claudio Radio. This is the voice that stays with you through the night.'

export default function SettingsPage() {
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const ttsVoice = useRadioStore((s) => s.ttsVoice)
  const setTtsVoice = useRadioStore((s) => s.setTtsVoice)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/dj/tts-voices`, { headers: getApiHeaders(false) })
      .then((r) => r.json())
      .then((d) => setVoices(d.voices || []))
      .catch(() => {})
  }, [])

  /** 试听某个音色：调 /tts 合成示例句并播放 */
  const previewVoice = useCallback(async (voice: VoiceInfo) => {
    // 停掉上一个试听
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    setPreviewing(voice.id)
    setTtsVoice(voice.id) // 选中即设为当前音色
    try {
      const text = voice.lang === 'zh' ? SAMPLE_TEXT_ZH : SAMPLE_TEXT_EN
      const res = await fetch(`${API_BASE}/api/v1/dj/tts`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ text, voice: voice.id }),
      })
      const data = await res.json()
      if (data.audio_url) {
        const url = data.audio_url.startsWith('http')
          ? data.audio_url
          : `${API_BASE}${data.audio_url}`
        const audio = new Audio(url)
        previewAudioRef.current = audio
        audio.onended = () => setPreviewing(null)
        audio.onerror = () => setPreviewing(null)
        await audio.play()
      } else {
        setPreviewing(null)
      }
    } catch {
      setPreviewing(null)
    }
  }, [setTtsVoice])

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
      }
    }
  }, [])

  return (
    <main className="min-h-screen relative overflow-x-hidden bg-[var(--bg-void)]">
      <div className="ambient-glow" />
      <div className="dot-grid" />

      <div className="relative z-10 mx-auto w-full max-w-[440px] px-4 py-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--accent-warm), var(--accent-copper))',
                boxShadow: '0 0 12px var(--accent-glow)',
              }}
              aria-hidden="true"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </div>
            <span className="text-[14px] font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}>
              设置
            </span>
          </Link>
        </div>

        {/* 设置区独立 ErrorBoundary：
             - 任何子组件（TTS 列表 / SourceSwitcher / ThemeToggle 等）崩溃都不会影响 Header 和返回链接。
             - dynamic(SourceSwitcher) 的 chunk 加载失败走 dynamic 自身 loading 状态，不会被 ErrorBoundary 拦截。
             - 一旦 component 渲染时崩溃，显示降级卡。
         */}
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl px-4 py-6 surface-card text-center" style={{ border: '1px solid var(--surface-border)' }}>
              <p className="text-[13px] mb-1" style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}>
                设置加载失败
              </p>
              <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                设置项暂时不可用，可点击顶栏返回电台。
              </p>
            </div>
          }
        >
          {/* TTS 音色区 */}
          <section className="card-enter">
            <h2 className="text-[13px] mb-3" style={{ color: 'var(--fg-secondary)', fontFamily: 'var(--font-display)' }}>
              DJ 音色
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {voices.map((v) => {
                const isSelected = v.id === ttsVoice
                const isPrev = previewing === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => previewVoice(v)}
                    className="rounded-2xl p-3 text-left transition-all"
                    style={{
                      background: isSelected ? 'var(--accent-glow)' : 'var(--surface-bg-subtle)',
                      border: `1px solid ${isSelected ? 'var(--accent-warm)' : 'var(--surface-border-subtle)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: isSelected ? 'var(--accent-warm)' : 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}
                      >
                        {v.name}
                      </span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: isSelected ? 'var(--accent-warm)' : 'var(--surface-border-subtle)',
                          color: isSelected ? '#fff' : 'var(--fg-muted)',
                        }}
                      >
                        {v.gender}
                      </span>
                    </div>
                    <p className="text-[10px] mb-1.5" style={{ color: 'var(--fg-muted)' }}>
                      {v.desc}
                    </p>
                    <span
                      className="text-[9px]"
                      style={{ color: isPrev ? 'var(--neon-green)' : 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}
                    >
                      {isPrev ? '● 试听中…' : '▶ 点击试听'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--fg-dim)' }}>
              当前音色：{ttsVoice}。点击卡片试听并切换。
            </p>
          </section>

          {/* 音源区 */}
          <section className="card-enter card-enter-delay-1">
            <h2 className="text-[13px] mb-3" style={{ color: 'var(--fg-secondary)', fontFamily: 'var(--font-display)' }}>
              音乐来源
            </h2>
            <div className="rounded-2xl px-4 py-3 surface-card">
              <SourceSwitcher />
            </div>
          </section>

          {/* 主题区 */}
          <section className="card-enter card-enter-delay-2">
            <h2 className="text-[13px] mb-3" style={{ color: 'var(--fg-secondary)', fontFamily: 'var(--font-display)' }}>
              外观
            </h2>
            <div className="rounded-2xl px-4 py-3 surface-card flex items-center justify-between">
              <span className="text-[12px]" style={{ color: 'var(--fg-secondary)' }}>
                深色 / 浅色
              </span>
              <ThemeToggle />
            </div>
          </section>
        </ErrorBoundary>
      </div>
    </main>
  )
}
