'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface TypewriterTextProps {
  text: string
  speed?: number
  highlightColor?: string
  baseColor?: string
  className?: string
  onComplete?: () => void
}

/** 片段：纯文本或加粗或行内代码（已剥离 markdown 标记） */
type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }

/**
 * 把含 **加粗** / `代码` 的文本解析为片段数组（标记不计入可见字符长度）。
 * 与 MarkdownText 保持一致的行内语法子集。
 */
function parseSegments(text: string): Segment[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  const segs: Segment[] = []
  for (const p of parts) {
    if (!p) continue
    const bold = /^\*\*([^*]+)\*\*$/.exec(p)
    if (bold) {
      segs.push({ kind: 'bold', text: bold[1] })
      continue
    }
    const code = /^`([^`]+)`$/.exec(p)
    if (code) {
      segs.push({ kind: 'code', text: code[1] })
      continue
    }
    segs.push({ kind: 'text', text: p })
  }
  return segs
}

export default function TypewriterText({
  text,
  speed = 40,
  highlightColor = 'var(--accent-warm)',
  baseColor = 'var(--fg-secondary)',
  className = '',
  onComplete,
}: TypewriterTextProps) {
  const [visibleChars, setVisibleChars] = useState(0)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const segments = useMemo(() => parseSegments(text), [text])
  // 可见字符总长（剥离 markdown 标记后），用于打字机停止判定
  const strippedLen = useMemo(
    () => segments.reduce((n, s) => n + s.text.length, 0),
    [segments],
  )

  useEffect(() => {
    setVisibleChars(0)
    if (strippedLen === 0) return
    let current = 0
    const timer = setInterval(() => {
      current += 1
      setVisibleChars(current)
      if (current >= strippedLen) {
        clearInterval(timer)
        onCompleteRef.current?.()
      }
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed, strippedLen])

  // 按片段顺序消费可见字符额度，渲染已显露部分
  let remaining = visibleChars
  const nodes: ReactNode[] = []
  segments.forEach((seg, i) => {
    if (remaining <= 0) return
    const take = Math.min(remaining, seg.text.length)
    remaining -= take
    const shown = seg.text.slice(0, take)
    if (seg.kind === 'bold') {
      nodes.push(
        <strong key={i} style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>
          {shown}
        </strong>,
      )
    } else if (seg.kind === 'code') {
      nodes.push(
        <code
          key={i}
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'var(--surface-bg-subtle)',
            padding: '0 4px',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          {shown}
        </code>,
      )
    } else {
      nodes.push(<span key={i} style={{ color: highlightColor }}>{shown}</span>)
    }
  })

  // 未显露的尾部（用剥离标记后的纯文本，避免露出 ** 或 `）
  const strippedText = useMemo(() => segments.map((s) => s.text).join(''), [segments])

  return (
    <span className={className}>
      {nodes}
      <span style={{ color: baseColor }}>{strippedText.slice(visibleChars)}</span>
    </span>
  )
}
