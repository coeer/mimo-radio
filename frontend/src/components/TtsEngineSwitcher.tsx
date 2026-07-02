'use client'

import { memo, useEffect, useState } from 'react'
import { API_BASE, getApiHeaders } from '@/lib/config'

interface TtsEngineInfo {
  id: string
  label: string
  kind: 'preset' | 'design' | 'clone'
  isCurrent: boolean
  isReady: boolean
}

/**
 * TTS 引擎切换器 —— MiMo 预置/设计/复刻 一键切换。
 * 照搬 SourceSwitcher 的范式：拉取后端引擎列表 + POST 切换。
 */
function TtsEngineSwitcher() {
  const [engines, setEngines] = useState<TtsEngineInfo[]>([])
  const [current, setCurrent] = useState('mimo-tts')
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/tts-engines`, {
        headers: getApiHeaders(false),
      })
      const data = await res.json()
      setEngines(data.engines || [])
      setCurrent(data.current)
    } catch {
      /* 静默 */
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSwitch = async (id: string) => {
    if (id === current || switching) return
    setSwitching(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/v1/tts-engines/switch`, {
        method: 'POST',
        headers: { ...getApiHeaders(false), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message || data.error || '切换失败')
      } else {
        setCurrent(id)
        setEngines(data.engines || engines)
      }
    } catch {
      setError('网络错误')
    } finally {
      setSwitching(false)
    }
  }

  if (engines.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px]"
        style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}
      >
        TTS
      </span>
      <div className="pill-toggle">
        {engines.map((e) => {
          const disabled = switching || (!e.isReady && !e.isCurrent)
          return (
            <button
              key={e.id}
              className={e.id === current ? 'is-active' : ''}
              onClick={() => handleSwitch(e.id)}
              disabled={disabled}
              style={!e.isReady ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              title={
                e.kind === 'clone' && !e.isReady
                  ? '音色复刻：需先上传参考音频（见 data/voice-sample.json）'
                  : e.kind === 'design'
                    ? '音色设计：根据 DJ 人设动态生成音色'
                    : e.kind === 'clone'
                      ? '音色复刻：用参考音频复刻的声音'
                      : '预置音色：稳定可靠'
              }
            >
              {e.label}
            </button>
          )
        })}
      </div>
      {error && (
        <span
          className="text-[9px]"
          style={{ color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}
        >
          {error.slice(0, 30)}
        </span>
      )}
    </div>
  )
}

export default memo(TtsEngineSwitcher)
