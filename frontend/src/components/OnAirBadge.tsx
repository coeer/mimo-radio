'use client'

interface OnAirBadgeProps {
  isLive?: boolean
  className?: string
}

export default function OnAirBadge({ isLive = true, className = '' }: OnAirBadgeProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${isLive ? 'animate-pulse-dot' : ''}`}
        style={{
          backgroundColor: isLive ? 'var(--neon-green)' : 'var(--fg-muted)',
          boxShadow: isLive ? '0 0 6px var(--neon-green-glow)' : 'none',
        }}
      />
      <span
        className="text-[11px] font-medium tracking-wide font-[var(--font-mono)]"
        style={{
          color: isLive ? 'var(--neon-green)' : 'var(--fg-muted)',
        }}
      >
        ON AIR
      </span>
    </div>
  )
}
