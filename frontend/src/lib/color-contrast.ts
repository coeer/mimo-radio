/**
 * WCAG 2.1 颜色对比度工具 + 仓库色对登记册
 *
 * 用于：
 *  1. 计算两个色值的对比度比（基于 WCAG 2.1 relative luminance 公式）。
 *  2. 登记项目中实际用到的所有前景/背景色对，防止后续调整色值时破坏对比度。
 *
 * 来源色值全部来自 `src/app/globals.css`（CSS 变量定义）。
 *
 * 参考：https://www.w3.org/TR/WCAG21/#contrast-minimum
 *  - 正文（normal）：≥ 4.5:1
 *  - 大字（large，≥ 18pt 或 ≥ 14pt 粗体）：≥ 3:1
 *  - 非文本 UI（disabled/placeholder 等辅助级）：≥ 3:1
 *
 * ⚠️ 该文件是"色对安全网"——若需要调整 globals.css 中任何相关的 CSS 变量，
 * 须同时改本文件中的 COLOR_PAIRS（保持一一对应）。
 */

// ─── Color parsing utilities ─────────────────────────────────────────────

export type RgbTuple = readonly [number, number, number]
export type RgbaTuple = readonly [number, number, number, number]

/** 把 hex（#rgb / #rrggbb / #rrggbbaa）转成 [r, g, b] */
export function hexToRgb(hex: string): RgbTuple {
  let h = hex.replace(/^#/, '')
  // 简化 #abc → #aabbcc
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  // 兼容 8 位（含 alpha），截掉
  if (h.length === 8) h = h.slice(0, 6)
  if (h.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  const num = parseInt(h, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/** 解析 "rgb(r, g, b)" / "rgba(r, g, b, a)" 字符串 */
export function parseRgba(input: string): RgbaTuple {
  const m = input.match(/rgba?\(([^)]+)\)/i)
  if (!m) throw new Error(`Invalid rgba string: ${input}`)
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
  if (parts.length < 3) throw new Error(`Insufficient rgba components: ${input}`)
  return [parts[0], parts[1], parts[2], parts[3] !== undefined ? parts[3] : 1]
}

/**
 * 把 rgba(r,g,b,α) 渲染到指定背景上（alpha 合成），得到等效 RGB。
 * 这是处理 "rgba(255,255,255,0.04)" 这种半透明色叠到 page bg 时必备。
 */
export function alphaOver(fg: RgbTuple, alpha: number, bg: RgbTuple): RgbTuple {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ]
}

// ─── WCAG luminance + contrast ──────────────────────────────────────────

/** WCAG 2.1 relative luminance */
export function relativeLuminance(rgb: RgbTuple): number {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 对比度比 = (L_lighter + 0.05) / (L_darker + 0.05) */
export function getContrastRatio(c1: RgbTuple, c2: RgbTuple): number {
  const l1 = relativeLuminance(c1)
  const l2 = relativeLuminance(c2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ─── 色对登记册 ──────────────────────────────────────────────────────────

/**
 * 视觉等级：
 *  - 'normal' = 正文文本，阈值 4.5:1
 *  - 'large'  = ≥ 18pt 普通 或 ≥ 14pt 粗体，阈值 3:1
 *  - 'ui'     = disabled / placeholder / icon-only 等辅助级，阈值 3:1
 */
export type TextSize = 'normal' | 'large' | 'ui'

export interface ColorPair {
  /** 描述色对用在哪 */
  name: string
  /** 前景色（hex 或 rgba 字符串） */
  fg: string
  /** 背景色（hex / rgba / 或 "over <pageBg>" 形式，后者将通过 alpha 合成到 pageBg） */
  bg: string
  /** 视觉等级 */
  size: TextSize
}

export const WCAG_THRESHOLDS: Record<TextSize, number> = {
  normal: 4.5,
  large: 3,
  ui: 3,
}

/**
 * 项目所有 fg/bg 色对登记册。
 *
 * 改动 globals.css 的对应变量时，请同步维护此数组。
 * 测试 `color-contrast.test.ts` 会在 CI 时强制每对比率。
 *
 * 若 fg/bg 含 rgba 半透明，page bg 通过前缀 "over:" 标记（如 "over #0a0a0f"）。
 * 否则假定 fg/bg 是 hex。
 */
export const COLOR_PAIRS: ReadonlyArray<ColorPair> = [
  // ─── body 文本 ───
  { name: 'fg-primary / bg-void (DARK)', fg: '#f0f0f5', bg: '#0a0a0f', size: 'normal' },
  { name: 'fg-primary / bg-elevated (DARK)', fg: '#f0f0f5', bg: '#14141e', size: 'normal' },
  { name: 'fg-secondary / bg-void (DARK)', fg: '#9a9aa8', bg: '#0a0a0f', size: 'normal' },
  { name: 'fg-secondary / bg-elevated (DARK)', fg: '#9a9aa8', bg: '#14141e', size: 'normal' },
  { name: 'fg-muted / bg-void (DARK)', fg: '#8e8ea4', bg: '#0a0a0f', size: 'normal' },
  { name: 'fg-muted / bg-elevated (DARK)', fg: '#8e8ea4', bg: '#14141e', size: 'normal' },

  { name: 'fg-primary / bg-void (LIGHT)', fg: '#1a1a1a', bg: '#ffffff', size: 'normal' },
  { name: 'fg-secondary / bg-void (LIGHT)', fg: '#555555', bg: '#ffffff', size: 'normal' },
  { name: 'fg-muted / bg-void (LIGHT)', fg: '#6b6b6b', bg: '#ffffff', size: 'normal' },

  // ─── accent ───
  { name: 'accent-warm / bg-void (DARK)', fg: '#c9a87c', bg: '#0a0a0f', size: 'normal' },
  { name: 'accent-warm / bg-void (LIGHT)', fg: '#855b30', bg: '#ffffff', size: 'normal' },

  // ─── 状态色（status badge）───
  { name: 'color-success / rgba(0,230,118,0.10) over bg-void (DARK)', fg: '#00e676', bg: 'rgba(0, 230, 118, 0.10) over #0a0a0f', size: 'normal' },
  { name: 'color-info / rgba(59,130,246,0.12) over bg-elevated (DARK)', fg: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12) over #14141e', size: 'normal' },
  { name: 'color-error / rgba(239,68,68,0.12) over bg-elevated (DARK)', fg: '#f87171', bg: 'rgba(239, 68, 68, 0.12) over #14141e', size: 'normal' },

  { name: 'color-success LIGHT / rgba(34,197,94,0.10) over white', fg: '#15803d', bg: 'rgba(34, 197, 94, 0.10) over #ffffff', size: 'normal' },
  { name: 'color-info LIGHT / rgba(37,99,235,0.10) over white', fg: '#1d4ed8', bg: 'rgba(37, 99, 235, 0.10) over #ffffff', size: 'normal' },
  { name: 'color-error LIGHT / rgba(220,38,38,0.10) over white', fg: '#b91c1c', bg: 'rgba(220, 38, 38, 0.10) over #ffffff', size: 'normal' },

  // ─── 歌词 (fullscreen player，固定白底) ───
  { name: 'lyric-highlight on white fs', fg: '#1a7f37', bg: '#ffffff', size: 'normal' },
  { name: 'lyric-past on white fs', fg: '#666666', bg: '#ffffff', size: 'normal' },

  // ─── Song Info Card（DARK 主题下 card 是 rgba(255,255,255,0.95) 叠到 #0a0a0f）───
  { name: 'song-info-fg / song-card (DARK)', fg: '#1a1a1a', bg: 'rgba(255, 255, 255, 0.95) over #0a0a0f', size: 'normal' },
  { name: 'song-info-fg-secondary / song-card (DARK)', fg: '#555555', bg: 'rgba(255, 255, 255, 0.95) over #0a0a0f', size: 'normal' },
  { name: 'song-info-fg-muted / song-card (DARK)', fg: '#666666', bg: 'rgba(255, 255, 255, 0.95) over #0a0a0f', size: 'normal' },

  // ─── Song Info Card（LIGHT 主题 card 是 #f8f7f5）───
  { name: 'song-info-fg / song-card (LIGHT)', fg: '#1a1a1a', bg: '#f8f7f5', size: 'normal' },
  { name: 'song-info-fg-secondary / song-card (LIGHT)', fg: '#8a6a3e', bg: '#f8f7f5', size: 'normal' },
  { name: 'song-info-fg-muted / song-card (LIGHT)', fg: '#6b6b6b', bg: '#f8f7f5', size: 'normal' },

  // ─── ThemeToggle ───
  // DARK 模式下 LIGHT 标签: rgba(255,255,255,0.55) 文字 over bg-void
  { name: 'ThemeToggle LIGHT label (DARK): white/0.55 on bg-void', fg: 'rgba(255,255,255,0.55) over #0a0a0f', bg: '#0a0a0f', size: 'normal' },
  // LIGHT 模式下 DARK 标签: fg-muted 文字 on bg-void (white)
  { name: 'ThemeToggle DARK label (LIGHT): fg-muted on bg-void', fg: '#6b6b6b', bg: '#ffffff', size: 'normal' },
] as const

// ─── 辅助：把 "rgba(...) over #hex" 或纯 hex 解析成最终 RGB ───

/**
 * 解析色字符串为最终 RGB。
 *  - "#xxx" → hex
 *  - "rgba(...)" → 与 page bg（默认 #000000）做 alpha 合成
 *  - "rgba(...) over #xxx" → 与指定 page bg 做 alpha 合成
 */
export function resolveBgOrFg(input: string, defaultOver: RgbTuple = [0, 0, 0]): RgbTuple {
  if (input.startsWith('#')) return hexToRgb(input)

  const overMatch = input.match(/^(rgba?\([^)]+\))\s+over\s+(#[0-9a-fA-F]+)/i)
  if (overMatch) {
    const rgba = parseRgba(overMatch[1])
    const pageBg = hexToRgb(overMatch[2])
    return alphaOver([rgba[0], rgba[1], rgba[2]], rgba[3], pageBg)
  }

  // 单独 rgba（无 over） → 与 default page bg 合成
  const rgba = parseRgba(input)
  return alphaOver([rgba[0], rgba[1], rgba[2]], rgba[3], defaultOver)
}

/** 计算一个 ColorPair 的对比度比 */
export function ratioForPair(pair: ColorPair): number {
  const fg = resolveBgOrFg(pair.fg)
  const bg = resolveBgOrFg(pair.bg)
  return getContrastRatio(fg, bg)
}
