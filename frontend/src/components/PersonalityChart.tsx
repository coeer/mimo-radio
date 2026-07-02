'use client'

import { memo } from 'react'

interface PersonalityChartProps {
  /** 维度数据：label + 0~1 归一化值 */
  data: Array<{ label: string; value: number }>
  /** 主色（默认暖金） */
  color?: string
  size?: number
}

/**
 * 音乐人格雷达图（纯 SVG，无依赖）。
 * data 的 value 会归一化到 0~1（按最大值缩放）。
 * 维度数 3~8 为宜；不足 3 个不渲染（雷达图至少三角形）。
 */
function PersonalityChartImpl({
  data,
  color = 'var(--accent-warm)',
  size = 180,
}: PersonalityChartProps) {
  const validData = data.filter((d) => d.label)
  if (validData.length < 3) {
    return (
      <div className="text-center text-[10px] text-[var(--fg-dim)] py-4 font-[var(--font-mono)]">
        品味数据积累中 · 多听几首解锁人格雷达
      </div>
    )
  }

  const n = validData.length
  const maxVal = Math.max(...validData.map((d) => d.value), 1)
  const center = size / 2
  const radius = size / 2 - 28 // 留出标签空间
  const levels = 4 // 同心多边形层数

  // 多边形顶点坐标
  const points = (rRatio: number) =>
    validData.map((_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const r = radius * rRatio
      return [center + r * Math.cos(angle), center + r * Math.sin(angle)]
    })

  const toPath = (pts: number[][]) =>
    pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

  // 数据多边形（归一化值）
  const dataPts = points(1).map((p, i) => {
    const ratio = validData[i].value / maxVal
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return [center + radius * ratio * Math.cos(angle), center + radius * ratio * Math.sin(angle)]
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto"
      role="img"
      aria-label="音乐人格雷达图"
    >
      {/* 同心多边形网格 */}
      {Array.from({ length: levels }).map((_, lv) => {
        const ratio = (lv + 1) / levels
        return (
          <polygon
            key={lv}
            points={toPath(points(ratio))}
            fill="none"
            stroke="var(--surface-border)"
            strokeWidth={0.5}
            opacity={0.6}
          />
        )
      })}

      {/* 轴线 */}
      {points(1).map((p, i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={p[0]}
          y2={p[1]}
          stroke="var(--surface-border)"
          strokeWidth={0.5}
          opacity={0.4}
        />
      ))}

      {/* 数据多边形 */}
      <polygon
        points={toPath(dataPts)}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={1.5}
      />

      {/* 数据点 */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={color} />
      ))}

      {/* 标签 */}
      {points(1).map((p, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const labelR = radius + 14
        const lx = center + labelR * Math.cos(angle)
        const ly = center + labelR * Math.sin(angle)
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end'
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor={anchor as 'middle' | 'start' | 'end'}
            dominantBaseline="middle"
            className="font-[var(--font-mono)]"
            fontSize={9}
            fill="var(--fg-muted)"
          >
            {validData[i].label}
          </text>
        )
      })}
    </svg>
  )
}

export default memo(PersonalityChartImpl)
