'use client'

import { memo, useEffect, useState } from 'react'
import { API_BASE, getApiHeaders } from '@/lib/config'
import { useRadioStore } from '@/store/radioStore'

interface SourceInfo {
  id: string
  label: string
  isCurrent: boolean
}

/**
 * 音源切换器 —— 网易云 / QQ音乐 一键切换。
 * 显示当前音源 + 可点选切换。
 */
function SourceSwitcher() {
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [current, setCurrent] = useState('netease')
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/music-source`, {
        headers: getApiHeaders(false),
      })
      const data = await res.json()
      setSources(data.sources || [])
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
      const res = await fetch(`${API_BASE}/api/v1/music-source/switch`, {
        method: 'POST',
        headers: { ...getApiHeaders(false), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '切换失败')
      } else {
        setCurrent(id)
        // 切音源后重置会话到引导态（不清偏好设置）。
        // 旧会话的 queue/currentSong 绑定的是旧音源，必须清掉让用户重新开台。
        // 不再整页 reload，保留页面/偏好状态，体验更连贯。
        useRadioStore.getState().clearSession()
      }
    } catch {
      setError('网络错误')
    } finally {
      setSwitching(false)
    }
  }

  if (sources.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px]"
        style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}
      >
        SOURCE
      </span>
      <div className="pill-toggle">
        {sources.map((s) => (
          <button
            key={s.id}
            className={s.id === current ? 'is-active' : ''}
            onClick={() => handleSwitch(s.id)}
            disabled={switching}
            title={
              s.id === 'qq'
                ? 'QQ音乐：需浏览器登录 y.qq.com + webbridge 运行'
                : '网易云：免配置'
            }
          >
            {s.label}
          </button>
        ))}
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

export default memo(SourceSwitcher)
