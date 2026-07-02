'use client'

import { useEffect, useState } from 'react'

// 5x7 dot matrix digit patterns (more detailed than 5x3)
const DIGITS: Record<string, number[]> = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01111],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10001, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b10001, 0b01110],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
}

function DotMatrixDigit({
  pattern,
  dotSize = 3,
  gap = 2,
  activeColor = 'var(--fg-primary)',
  glow = true,
}: {
  pattern: number[]
  dotSize?: number
  gap?: number
  activeColor?: string
  glow?: boolean
}) {
  const width = 5 * dotSize + 4 * gap
  const height = 7 * dotSize + 6 * gap

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {pattern.map((row, y) =>
        Array.from({ length: 5 }, (_, x) => {
          const bit = (row >> (4 - x)) & 1
          const cx = x * (dotSize + gap) + dotSize / 2
          const cy = y * (dotSize + gap) + dotSize / 2
          return (
            <circle
              key={`${x}-${y}`}
              cx={cx}
              cy={cy}
              r={dotSize / 2}
              fill={bit ? activeColor : 'transparent'}
              style={{
                opacity: bit ? 1 : 0.06,
                transition: 'opacity 0.3s ease',
                filter: glow && bit ? `drop-shadow(0 0 ${dotSize}px ${activeColor})` : 'none',
              }}
            />
          )
        })
      )}
    </svg>
  )
}

export default function DotMatrixClock() {
  const [time, setTime] = useState(new Date())
  const [colonOn, setColonOn] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
      setColonOn((prev) => !prev)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const h = time.getHours().toString().padStart(2, '0')
  const m = time.getMinutes().toString().padStart(2, '0')
  const digits = [h[0], h[1], ':', m[0], m[1]]

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const dayName = days[time.getDay()]
  const dateStr = `${time.getDate()} ${months[time.getMonth()]} ${time.getFullYear()}`

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="flex items-center gap-2">
        {digits.map((d, i) => (
          <div
            key={i}
            style={{
              marginRight: d === ':' ? 2 : 6,
              opacity: d === ':' ? (colonOn ? 1 : 0.3) : 1,
              transition: d === ':' ? 'opacity 0.2s ease' : 'none',
            }}
          >
            <DotMatrixDigit
              pattern={DIGITS[d] || DIGITS['0']}
              dotSize={4}
              gap={3}
              activeColor="var(--fg-primary)"
              glow
            />
          </div>
        ))}
      </div>
      <div className="text-center space-y-0.5">
        <div
          className="text-sm tracking-[0.2em] uppercase"
          style={{
            color: 'var(--fg-secondary)',
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
          }}
        >
          {dayName}
        </div>
        <div
          className="text-[11px] tracking-[0.15em]"
          style={{
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {dateStr}
        </div>
      </div>
    </div>
  )
}
