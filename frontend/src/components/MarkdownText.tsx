'use client'

import React, { memo } from 'react'

/**
 * 轻量 markdown 渲染 —— 只处理 DJ 回复实际用到的子集：
 * - **加粗**  → <strong>（关键词高亮，后端 prompt 强制要求）
 * - `代码`    → <code>
 * - 换行符    → <br>
 *
 * 不引入 react-markdown 等重型库。DJ 文本来自可信 AI，但为安全仍转义 HTML。
 */

/** 转义 HTML 特殊字符，防 XSS */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 把一段不含块级语法的文本转为 React 节点（处理 **加粗** 和 `代码`） */
function renderInline(text: string): React.ReactNode[] {
  // 先转义，再做行内替换（安全：转义后不含原始 HTML 标签）
  const escaped = escapeHtml(text)
  // 匹配 **加粗** 或 `代码`，用占位切分
  const parts = escaped.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} style={{ color: 'var(--fg-primary)', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
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
          {part.slice(1, -1)}
        </code>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

function MarkdownTextImpl({ text }: { text: string }) {
  // 按换行符分行，每行独立渲染行内格式，行间用 <br> 连接
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderInline(line)}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  )
}

const MarkdownText = memo(MarkdownTextImpl)
export default MarkdownText
