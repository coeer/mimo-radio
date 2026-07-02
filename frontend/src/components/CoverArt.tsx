'use client'

import { memo, useState, useEffect } from 'react'

interface CoverArtProps {
  /** 专辑封面 URL，无则渲染渐变占位 + 图标 */
  src?: string
  /** 正方形尺寸（px） */
  size?: number
  /** 圆角（px），默认 8 */
  radius?: number
  className?: string
  /** 自定义渐变占位（默认暖金渐变） */
  fallbackGradient?: string
}

/**
 * 专辑封面组件 —— 有 coverUrl 显示真实封面，无则渐变占位 + 音符图标。
 * 全项目统一封面渲染（KimiCard/FullscreenPlayer/QueueList/RecommendCardList）。
 * lazy 加载 + onError 降级到占位，避免坏链留白。
 */
function CoverArtImpl({
  src,
  size = 48,
  radius = 8,
  className = '',
  fallbackGradient = 'linear-gradient(135deg, var(--accent-warm) 0%, var(--accent-copper) 100%)',
}: CoverArtProps) {
  const [failed, setFailed] = useState(false)
  // src 变化时重置失败态，避免上一首歌的加载失败导致后续歌曲也显示占位
  useEffect(() => { setFailed(false) }, [src])
  const showImage = src && !failed

  return (
    <div
      className={`shrink-0 overflow-hidden flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: showImage ? undefined : fallbackGradient,
        boxShadow: showImage ? '0 2px 8px rgba(0,0,0,0.15)' : '0 0 12px var(--accent-glow-strong)',
      }}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg
          style={{ width: size * 0.45, height: size * 0.45 }}
          fill="none"
          stroke="white"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 9h10v9a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h2v6zM9 9V3l10 2v4M9 9h10"
          />
        </svg>
      )}
    </div>
  )
}

const CoverArt = memo(CoverArtImpl)
export default CoverArt
