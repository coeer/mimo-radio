# Kimi AI Radio — Impeccable 前端改进方案（合并版）

> 综合两份 Impeccable 审查报告：
> - 工程架构审查（2026-05-12）— 关注性能、组件拆分、代码质量
> - 视觉设计审查（2026-05-17）— 关注可访问性、反 AI Slop、视觉细节
>
> 审查框架：[Impeccable](https://impeccable.style) — audit（技术五维）+ critique（Nielsen 十启发式）

---

## 一、审查评分总览

### 技术审查 (audit)

| 维度 | 当前 | 目标 |
|------|------|------|
| 可访问性 (Accessibility) | 2/4 | 3/4 |
| 性能 (Performance) | 2/4 | 3/4 |
| 主题 (Theming) | 3/4 | 4/4 |
| 响应式 (Responsive) | 2/4 | 3/4 |
| 反模式 (Anti-Patterns) | 2/4 | 3/4 |
| **总分** | **11/20** | **16/20** |

### UX 评审 (critique)

| 启发式 | 当前 | 目标 |
|--------|------|------|
| 系统状态可见性 | 3/4 | 4/4 |
| 系统与现实匹配 | 3/4 | 3/4 |
| 用户控制与自由 | 2/4 | 3/4 |
| 一致性与标准 | 2/4 | 3/4 |
| 错误预防 | 2/4 | 3/4 |
| 识别优于回忆 | 2/4 | 3/4 |
| 灵活性与效率 | 2/4 | 3/4 |
| 美观与极简 | 3/4 | 4/4 |
| 错误恢复 | 2/4 | 3/4 |
| 帮助与文档 | 1/4 | 2/4 |
| **总分** | **22/40** | **32/40** |

### AI Slop Test

**当前：通过 ✅** — 点阵时钟 + 粒子连线 + 音频波形 + 铜色调，不是泛 AI 审美。

**风险**：粒子 + 连线组合是 AI 项目最常见的视觉元素（见 P3-6）。

---

## 二、设计上下文

| 维度 | 内容 |
|------|------|
| **用户** | 个人用户（mmguo），寻求私人化、反算法的 AI 音乐电台体验 |
| **场景** | 桌面/移动端浏览器，沉浸式听歌 + 与 AI DJ 聊天 |
| **品牌个性** | 复古终端 × 铜色温暖 — "有品味的 taste.md，不是算法" |
| **情感目标** | 亲密感、仪式感、对抗算法的骄傲感 |
| **技术约束** | Next.js 14 + Tailwind + Zustand，移动优先（`max-w-[440px]`） |
| **设计原则** | ① 固定白色卡片（如 song-info-card）→ 文字必须用固定深色；② 主题适配背景 → 文字用 CSS 变量；③ 边框避免 `border-white/[0.03]` |

---

## 三、改进路线图

```
Round 1: 核心体验修复（2-3 小时）
  → P1 全部项

Round 2: 质量提升（3-4 小时）
  → P2 全部项

Round 3: 打磨与个性化（2-3 小时）
  → P3 全部项
```

---

## 四、P1 — 必须修复（阻塞体验）

### P1-1: 修复文字对比度（WCAG AA）

**问题**：`--fg-muted` 在暗色背景 `#06060a` 上对比度 ≈ 2.8:1，不满足 WCAG AA 最低 4.5:1。亮色模式下 `#888888` 在 `#f5f3ef` 上也同样不满足。

**违反原则**："Light gray text on dark is the #1 accessibility fail"

**改动**：`src/app/globals.css`

```diff
  :root {
-   --fg-muted: #4a4a5e;
+   --fg-muted: #7a7a90;
  }
```
验证：`#7a7a90` 在 `#06060a` 上 ≈ 4.6:1 ✅

```diff
  [data-theme="light"] {
-   --fg-muted: #888888;
+   --fg-muted: #6b6b6b;
  }
```
验证：`#6b6b6b` 在 `#f5f3ef` 上 ≈ 4.7:1 ✅

**验收**：使用 axe DevTools 或 WAVE 扫描，对比度错误为 0。

---

### P1-2: 移除重复播放/暂停按钮

**问题**：当前同时存在 3 个播放控制区域：
- 顶部 Player Bar（`page.tsx:329`）
- KimiCard 歌曲信息卡片内（`KimiCard.tsx:160`）
- KimiCard 底部迷你播放器（`KimiCard.tsx:322`）

违反原则："重复信息"、"Every element earns its pixel"

**方案**：去掉顶部 Player Bar 的控制按钮，只保留歌曲信息展示。控制统一在 KimiCard 内。

**改动**：`src/app/page.tsx`

```diff
  {/* Controls row */}
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-1">
-     {/* Previous — ghost style */}
-     <button disabled aria-label="Previous (coming soon)" ...>...</button>
-
-     {/* Play / Pause — primary accent */}
-     <button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => togglePlay()} ...>...</button>
-
-     {/* Next — ghost style */}
-     <button disabled aria-label="Next (coming soon)" ...>...</button>
+     {/* Controls live in KimiCard */}
    </div>
```

同时移除顶部 Player Bar 中的 `togglePlay` 导入和 `currentTime` 订阅（见 P1-3 拆分）。

**验收**：页面上只存在一套播放控制按钮（在 KimiCard 内）。

---

### P1-3: 拆分 `page.tsx` God Component

**问题**：552 行混合音频生命周期、session 管理、API 调用、UI 渲染。可维护性极差，任何一处修改都可能导致全页面重渲染。

**方案**：提取为独立 hooks 和组件。

**新建文件**：
1. `src/hooks/useAudioPlayer.ts` — 音频生命周期
2. `src/hooks/useSession.ts` — API 调用
3. `src/components/PlayerBar.tsx` — 顶部播放器信息栏（去控制化）
4. `src/components/ChatArea.tsx` — 聊天区域
5. `src/components/InputArea.tsx` — 输入区域

**重构后 `page.tsx` 结构**：

```tsx
export default function Home() {
  const [inputText, setInputText] = useState('')
  const { handleSeek, addTimer } = useAudioPlayer()
  const { createSession, sendChatMessage } = useSession(addTimer)
  // ... 组合逻辑
  return (
    <main>
      <PlayerBar />
      {showTerminal && <TerminalLog />}
      <KimiCard onSeek={handleSeek} />
      <QueueList />
      <ChatArea />
      <InputArea ... />
    </main>
  )
}
```

**完整代码见附录 A**。

**验收**：
- `page.tsx` 行数 ≤ 120 行
- `npm run build` 通过
- 原有功能无回归

---

### P1-4: 优化 `currentTime` 高频重渲染

**问题**：`timeupdate` 事件每秒触发 ~4 次，`currentTime` 变化导致 `PlayerBar` 和 `KimiCard` 全组件重渲染。

**方案**：Player Bar 改为信息展示（无控制），并在内部用 `setInterval` 独立驱动进度显示，不通过 Zustand `currentTime`。

```tsx
// PlayerBar.tsx
const [localTime, setLocalTime] = useState(currentTime)

useEffect(() => {
  if (!isPlaying) return
  const interval = setInterval(() => {
    setLocalTime((t) => Math.min(t + 1, duration || 0))
  }, 1000)
  return () => clearInterval(interval)
}, [isPlaying, duration])
```

**验收**：React DevTools Profiler 中 `PlayerBar` 重渲染 ≤ 1 次/秒。

---

### P1-5: 提取 Icon 组件

**问题**：Play/Pause/Prev/Next/Kimi SVG 在 4+ 文件中重复，维护成本极高。

**改动**：新建 `src/components/icons.tsx`

```tsx
export const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
)
export const PauseIcon = ...
export const PrevIcon = ...
export const NextIcon = ...
export const KimiIcon = ...
export const SendIcon = ...
export const MicrophoneIcon = ...
export const SpinnerIcon = ...
```

**替换位置**：`page.tsx`、`KimiCard.tsx`（3 处）、`ProfileCard.tsx`

**验收**：`grep -r "fill=\"currentColor\"" src/components/ icons.tsx` 之外无重复内联 SVG。

---

### P1-6: 统一聊天区域

**问题**：`page.tsx` 第 412-474 行和 `KimiCard.tsx` 第 234-300 行各有一个聊天区域，显示重复消息。

**方案**：`KimiCard` 移除聊天区域，只保留歌曲信息和波形。聊天统一在 `ChatArea`。

```diff
  // KimiCard.tsx — 移除整个聊天 div（第 234-300 行）
- <div ref={chatRef} className="px-5 py-3 space-y-3 max-h-[180px] overflow-y-auto">
-   {kimiMessages.map((msg) => (...))}
- </div>
```

**验收**：页面上只存在一个聊天区域。

---

### P1-7: 修复零散硬编码颜色

**问题**：`status-badge` 和 ProfileCard 头像使用硬编码 hex，不走 token。

**改动 1**：`src/app/globals.css` — 添加语义颜色 token

```css
:root {
  --color-success: #22c55e;
  --color-success-light: #16a34a;
  --color-success-bg: rgba(74, 222, 128, 0.1);
  --color-success-bg-light: rgba(34, 197, 94, 0.1);

  --color-info: #60a5fa;
  --color-info-light: #2563eb;
  --color-info-bg: rgba(59, 130, 246, 0.12);
  --color-info-bg-light: rgba(37, 99, 235, 0.1);

  --color-error: #f87171;
  --color-error-light: #dc2626;
  --color-error-bg: rgba(239, 68, 68, 0.12);
  --color-error-bg-light: rgba(220, 38, 38, 0.1);
}
```

**改动 2**：替换 `globals.css` 中 `status-badge` 的硬编码 hex 为变量。

**改动 3**：`ProfileCard.tsx` 头像背景改用 `var(--accent-warm)` 和 `var(--accent-copper)`。

**⚠️ 例外**：`KimiCard.tsx` 中 `song-info-card` 的 `#1a1a1a`、`#555555`、`#888888` **保持不动**。这是故意的设计决策——固定白色卡片必须使用固定深色保证对比度，改用 CSS 变量会导致亮色模式"白底浅灰字"。

**验收**：`grep -rn "#22c55e\|#16a34a\|#60a5fa\|#2563eb\|#f87171\|#dc2626\|#c49b6a\|#a67052" src/` 无匹配。

---

### P1-8: 修正 "LOGIN" 文案

**问题**："LOGIN" 链接指向 `/profile`（音乐人格页面），误导用户。

**改动**：`src/app/page.tsx`

```diff
- LOGIN
+ PROFILE
```

或更具品牌感：

```diff
- LOGIN
+ MY TASTE
```

---

## 五、P2 — 应该修复（影响质量）

### P2-1: 响应式布局 — 桌面端双栏

**问题**：`max-w-[440px]` 在桌面端显示为窄条，浪费空间。

**改动**：`src/app/page.tsx`

```tsx
<div className="relative z-10 mx-auto w-full max-w-[440px] lg:max-w-[900px] px-4 py-6 md:py-8 
  flex flex-col lg:flex-row gap-3 lg:gap-6">

  {/* Left column: Player */}
  <div className="flex-1 flex flex-col gap-3">
    {/* Header + Clock + Player Bar + KimiCard */}
  </div>

  {/* Right column: Queue + Chat */}
  <div className="lg:w-[340px] flex flex-col gap-3">
    {/* QueueList + Chat area */}
  </div>
</div>
```

---

### P2-2: 替换弹跳缓动曲线

**问题**：`--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` 使用了弹跳/弹性缓动。

违反原则："Avoid bounce and elastic curves. They feel tacky and amateurish."

**改动**：`src/app/globals.css`

```diff
  :root {
-   --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
+   --ease-spring: cubic-bezier(0.25, 1, 0.5, 1); /* ease-out-quart */
  }
```

搜索所有使用 `--ease-spring` 的地方，确认替换后视觉效果可接受。

---

### P2-3: 迁移内联样式到 Tailwind utilities

**问题**：几乎每个组件都大量使用 `style={{ color: 'var(--fg-primary)' }}`，与 Tailwind 混用导致维护困难。

**改动**：`src/app/globals.css`

```css
@layer utilities {
  .text-fg-primary { color: var(--fg-primary); }
  .text-fg-secondary { color: var(--fg-secondary); }
  .text-fg-muted { color: var(--fg-muted); }
  .text-accent-warm { color: var(--accent-warm); }
  .text-neon-green { color: var(--neon-green); }
  .bg-surface { background-color: var(--surface-bg); }
  .bg-surface-subtle { background-color: var(--surface-bg-subtle); }
  .border-surface { border-color: var(--surface-border); }
  .border-surface-subtle { border-color: var(--surface-border-subtle); }
  .font-display { font-family: var(--font-display); }
  .font-mono { font-family: var(--font-mono); }
}
```

**迁移示例**：`KimiCard.tsx`

```diff
- <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-primary)' }}>
+ <span className="text-sm font-medium font-display text-fg-primary">
    Kimi
  </span>
```

---

### P2-4: 增大触控目标

**问题**：部分按钮 32-36px，低于 44px WCAG 推荐值。

**改动**：
- 播放按钮：`w-9 h-9` (36px) → `w-11 h-11` (44px)
- 上一首/下一首：`w-8 h-8` (32px) → `w-10 h-10` (40px)
- `.control-btn`：`40px` → `44px`

对于视觉上必须保持小尺寸的按钮，使用 `::before` 扩展触控区域：

```css
.touch-target-expand {
  position: relative;
}
.touch-target-expand::before {
  content: '';
  position: absolute;
  inset: -6px; /* 32 + 6*2 = 44px */
}
```

---

### P2-5: 动态 themeColor

**问题**：`layout.tsx` 中 `themeColor` 硬编码为 `#000000`，亮色模式下不匹配。

**改动 1**：`src/app/layout.tsx`

```diff
  export const viewport: Viewport = {
-   themeColor: '#000000',
+   themeColor: '#06060a',
    width: 'device-width',
    initialScale: 1,
  }
```

**改动 2**：`src/components/ThemeToggle.tsx`

```typescript
const meta = document.querySelector('meta[name="theme-color"]')
if (meta) meta.setAttribute('content', next === 'dark' ? '#06060a' : '#f5f3ef')
```

---

### P2-6: 字体最小值提升

**问题**：`text-[10px]` 在移动端几乎不可读。

**改动**：核心 UI 标签从 `text-[10px]` 提升至 `text-[11px]`。

例外保留：`status-badge`（9px，已定义为组件级 token）、ProfileCard stats label（9px）。

---

### P2-7: ProfileCard 粒子背景重命名

**问题**：`ProfileCard` 内嵌了同名 `ParticleBackground`，与全局组件冲突。

**改动**：`src/components/ProfileCard.tsx`

```diff
- function ParticleBackground() {
+ function MiniParticleBackground() {
```

---

## 六、P3 — 可以打磨（锦上添花）

### P3-1: 粒子背景性能优化

**问题**：80 个粒子的 O(n²) 连线计算，每帧 3160 次距离计算。

**方案 A（快速）**：降低粒子数量

```diff
- const particleCount = Math.min(80, Math.floor((width * height) / 15000))
+ const particleCount = Math.min(40, Math.floor((width * height) / 25000))
```

**方案 B（推荐）**：空间分区（网格）优化连线

```typescript
const cellSize = 120
const grid = new Map<string, Particle[]>()

// 按网格分区存放粒子
particles.forEach(p => {
  const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)}`
  if (!grid.has(key)) grid.set(key, [])
  grid.get(key)!.push(p)
})

// 只检查相邻 9 格内的粒子对
for (const [key, cell] of grid) {
  const [cx, cy] = key.split(',').map(Number)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const neighbor = grid.get(`${cx + dx},${cy + dy}`)
      if (!neighbor) continue
      // 检查 cell 与 neighbor 间的粒子对
    }
  }
}
```

---

### P3-2: 考虑替换粒子连线（消除 AI Slop）

**问题**：粒子 + 连线是 AI 项目最常见的视觉元素。

**方案 A**：移除连线，只保留粒子漂浮。

**方案 B（推荐）**：用更贴合"电台"主题的效果替代——比如模拟收音机调频的水平扫描线，或静电噪声闪烁。

```css
/* 扫描线效果示例 */
.scanlines::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,0.03) 2px,
    rgba(0,0,0,0.03) 4px
  );
  z-index: 100;
}
```

---

### P3-3: 提取重复的 ParticleBackground

**问题**：`ProfileCard.tsx` 内嵌了独立的粒子背景组件，与全局 `ParticleBackground.tsx` 代码重复。

**方案**：将 `ParticleBackground` 改为接受 `variant` prop：

```tsx
interface ParticleBackgroundProps {
  variant?: 'fullscreen' | 'card'
  particleCount?: number
  color?: string
}
```

---

### P3-4: 队列交互

**问题**：QueueList 的歌曲项不可点击。

**改动**：`src/components/QueueList.tsx`

```diff
  <div
    key={song.id}
    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
      isCurrent ? 'queue-item-active' : ''
    }`}
+   onClick={() => {
+     useRadioStore.getState().setCurrentSong(song)
+     useRadioStore.getState().setIsPlaying(true)
+     useRadioStore.getState().setCurrentTime(0)
+   }}
+   role="button"
+   tabIndex={0}
+   aria-label={`Play ${song.title} by ${song.artist}`}
  >
```

---

### P3-5: Canvas 无障碍

**问题**：AudioWaveform 和 ParticleBackground 纯 Canvas 渲染，屏幕阅读器无法获取信息。

**改动**：

```tsx
<canvas
  ref={canvasRef}
  className={`w-full ${className}`}
  style={{ height: `${height}px` }}
  role="img"
  aria-label={isPlaying ? 'Audio waveform visualization - playing' : 'Audio waveform visualization - paused'}
/>
```

ParticleBackground 添加 `aria-hidden="true"`（纯装饰性）。

---

### P3-6: 添加 skip-to-content 链接

**改动**：`src/app/layout.tsx`

```tsx
<body className="antialiased min-h-screen">
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm"
    style={{ background: 'var(--accent-warm)', color: '#fff' }}
  >
    跳到主要内容
  </a>
  <ErrorBoundary>{children}</ErrorBoundary>
</body>
```

`page.tsx` 中 `<main>` 添加 `id="main-content"`。

---

### P3-7: 字体尺寸规范化

**问题**：大量使用 `text-[10px]`、`text-[11px]`、`text-[12px]` 等任意尺寸，没有模块化比例。

**改动**：`tailwind.config.ts`

```typescript
theme: {
  extend: {
    fontSize: {
      'caption': ['10px', { lineHeight: '1.4', letterSpacing: '0.02em' }],
      'label': ['11px', { lineHeight: '1.5' }],
      'body-sm': ['12px', { lineHeight: '1.6' }],
      'body': ['13px', { lineHeight: '1.6' }],
      'display-sm': ['14px', { lineHeight: '1.4' }],
      'display': ['22px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
    },
  },
}
```

---

### P3-8: 网络状态检测

**问题**：没有离线状态检测和提示。

**改动**：`src/store/radioStore.ts`

```typescript
isOnline: true,
setOnline: (online: boolean) => set({ isOnline: online }),
```

`page.tsx` 中监听：

```typescript
useEffect(() => {
  const handleOnline = () => useRadioStore.getState().setOnline(true)
  const handleOffline = () => useRadioStore.getState().setOnline(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}, [])
```

显示离线提示：

```tsx
{!isOnline && (
  <div className="rounded-full px-3 py-1.5 text-center text-label" 
    style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
    网络已断开，正在播放本地缓存
  </div>
)}
```

---

### P3-9: 添加键盘快捷键

**改动**：`src/app/page.tsx`

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        useRadioStore.getState().togglePlay()
        break
      case 'ArrowLeft':
        handleSeek(Math.max(0, (useRadioStore.getState().currentTime || 0) - 10))
        break
      case 'ArrowRight':
        handleSeek(Math.min(
          useRadioStore.getState().duration || 0,
          (useRadioStore.getState().currentTime || 0) + 10
        ))
        break
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [handleSeek])
```

---

### P3-10: 改善空状态和错误恢复

**改动 1**：`ChatArea.tsx` 空状态引导

```tsx
{messages.length === 0 && sessionId && (
  <div className="text-center py-6">
    <p className="text-body-sm mb-2" style={{ color: 'var(--fg-secondary)' }}>
      电台已启动，和 Kimi 聊聊吧
    </p>
    <p className="text-label" style={{ color: 'var(--fg-muted)' }}>
      试试："换一首中文歌"、"有点困了"、"推荐爵士"
    </p>
  </div>
)}
```

**改动 2**：API 错误添加 retry 机制

```tsx
// useSession.ts 中
s.addMessage({
  sender: 'kimi',
  text: '网络有点卡，点击重试',
  timestamp: 0,
})

// ChatArea.tsx 中检测并渲染重试按钮
```

---

### P3-11: `addMessage` ID 生成优化

**改动**：`src/store/radioStore.ts`

```diff
  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
-       { ...msg, id: Math.random().toString(36).slice(2) },
+       { ...msg, id: crypto.randomUUID?.() || Math.random().toString(36).slice(2) },
      ],
    })),
```

---

## 七、实施顺序建议

### Round 1：核心体验修复（预计 2-3 小时）

按此顺序执行，每步都可独立验证：

1. **P1-1** 修复对比度 — 改 2 个 CSS 变量值
2. **P1-8** 修正 LOGIN 文案 — 改 1 个字符串
3. **P1-5** 提取 Icon 组件 — 新建 1 个文件，替换 4 处
4. **P1-7** 修复硬编码颜色 — 改 CSS + ProfileCard
5. **P1-2** 移除重复播放按钮 — 删代码
6. **P1-6** 统一聊天区域 — 从 KimiCard 移除聊天
7. **P1-3** 拆分 God Component — 最大改动，需要完整回归测试
8. **P1-4** 优化 currentTime 重渲染 — 在拆分后的 PlayerBar 中实现

### Round 2：质量提升（预计 3-4 小时）

9. **P2-1** 响应式双栏布局
10. **P2-2** 替换弹跳缓动
11. **P2-3** 迁移内联样式到 Tailwind utilities
12. **P2-4** 增大触控目标
13. **P2-5** 动态 themeColor
14. **P2-6** 字体最小值提升
15. **P2-7** ProfileCard 粒子背景重命名

### Round 3：打磨（预计 2-3 小时）

16. **P3-1** 粒子背景性能优化
17. **P3-3** 提取重复的 ParticleBackground
18. **P3-4** 队列交互
19. **P3-5** Canvas 无障碍
20. **P3-6** skip-to-content
21. **P3-7** 字体尺寸规范化
22. **P3-8** 网络状态检测
23. **P3-9** 键盘快捷键
24. **P3-10** 改善空状态和错误恢复
25. **P3-11** addMessage ID 优化
26. **P3-2** 考虑替换粒子连线（设计决策，可延后）

---

## 八、验收检查清单

### Round 1 验收

- [ ] axe DevTools / WAVE 扫描：0 个对比度错误
- [ ] `grep -rn "#22c55e\|#16a34a\|#60a5fa\|#2563eb\|#f87171\|#dc2626\|#c49b6a\|#a67052" src/` 无匹配（KimiCard song-info-card 除外）
- [ ] `grep -r "fill=\"currentColor\"" src/components/ icons.tsx` 之外无重复内联 SVG
- [ ] 页面上只存在一套播放控制按钮（在 KimiCard 内）
- [ ] 页面上只存在一个聊天区域
- [ ] `page.tsx` 行数 ≤ 120 行
- [ ] React DevTools Profiler：`PlayerBar` 重渲染 ≤ 1 次/秒
- [ ] `npm run build` 通过
- [ ] `npm test` 全部通过
- [ ] 功能回归测试：创建电台、播放/暂停、聊天、切歌

### Round 2 验收

- [ ] 桌面端（≥1024px）显示双栏布局
- [ ] 无 `--ease-spring` 弹跳缓动使用
- [ ] 所有可点击元素触控目标 ≥ 40px，主要按钮 ≥ 44px
- [ ] 切换主题时浏览器状态栏颜色同步变化
- [ ] `grep -rn "text-\[10px\]" src/` 仅出现在 status-badge 和 profile stats label

### Round 3 验收

- [ ] VoiceOver / NVDA 能播报新消息
- [ ] 按 Tab 键第一个焦点是 "跳到主要内容"
- [ ] 空格键播放/暂停
- [ ] 左右箭头快进/快退 10s
- [ ] 断网时显示离线提示
- [ ] 点击队列歌曲可跳转播放
- [ ] 空聊天区域显示引导文案

---

## 九、预期评分提升

| 维度 | 当前 | 目标 | 提升 |
|------|------|------|------|
| **技术审查 (audit)** | 11/20 | 16/20 | +5 |
| **UX 评审 (critique)** | 22/40 | 32/40 | +10 |
| **AI Slop Test** | 3/4 | 4/4 | +1 |
| **WCAG 对比度** | Fail | AA Pass | ✅ |
| **综合评级** | **Acceptable** | **Good** | 🎯 |

---

## 附录 A: God Component 拆分完整代码

### A.1 `src/hooks/useAudioPlayer.ts`

```typescript
'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRadioStore } from '@/store/radioStore'

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRefs = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const currentSong = useRadioStore((state) => state.currentSong)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const nextSong = useRadioStore((state) => state.nextSong)

  // Effect 1: Audio element setup
  useEffect(() => {
    if (!currentSong?.playUrl) return
    const setCurrentTime = useRadioStore.getState().setCurrentTime
    const setDuration = useRadioStore.getState().setDuration

    if (!audioRef.current) {
      audioRef.current = new Audio()
    }

    const audio = audioRef.current
    const onEnded = () => { nextSong().catch(console.error) }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => setDuration(audio.duration)

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)

    if (audio.src !== currentSong.playUrl) {
      audio.src = currentSong.playUrl
      audio.load()
    }

    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [currentSong, nextSong])

  // Effect 2: Play/pause control
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentSong?.playUrl) return

    if (isPlaying) {
      audio.play().catch((err) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          const s = useRadioStore.getState()
          s.addMessage({
            sender: 'kimi',
            text: '请点击页面以启用音频播放',
            timestamp: 0,
          })
          s.setIsPlaying(false)
        }
      })
    } else {
      audio.pause()
    }
  }, [isPlaying, currentSong])

  // Cleanup
  useEffect(() => {
    const timers = timerRefs.current
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
  }, [])

  const addTimer = useCallback((callback: () => void, delay: number) => {
    const t: ReturnType<typeof setTimeout> = setTimeout(() => {
      callback()
      timerRefs.current.delete(t)
    }, delay)
    timerRefs.current.add(t)
    return t
  }, [])

  return { audioRef, handleSeek, addTimer }
}
```

### A.2 `src/hooks/useSession.ts`

```typescript
'use client'

import { useCallback } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { API_BASE, getApiHeaders } from '@/lib/config'

export function useSession(addTimer: (cb: () => void, delay: number) => ReturnType<typeof setTimeout>) {
  const djEnabled = useRadioStore((state) => state.djEnabled)

  const createSession = useCallback(
    async (text: string) => {
      const s = useRadioStore.getState()
      s.setIsCreating(true)
      s.clearMessages()
      try {
        const res = await fetch(`${API_BASE}/api/radio/create`, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({
            mood: text,
            dj_enabled: djEnabled,
            user_input: text,
          }),
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`HTTP ${res.status}: ${errText}`)
        }
        const data = await res.json()
        s.setSessionToken(data.session_token || null)
        const rawSessionId = data.session_token ? data.session_token.split('.')[0] : null
        s.setSessionId(rawSessionId)
        s.setQueue(data.queue || [])
        if (data.queue?.length > 0) {
          s.setCurrentSong(data.queue[0])
          s.setDuration(data.queue[0].duration || 180)
          s.setIsPlaying(true)
        }
        if (data.intro_script) {
          s.setSpeaking(true)
          s.addMessage({
            sender: 'kimi',
            text: data.intro_script,
            timestamp: 0,
          })
          addTimer(() => s.setSpeaking(false), 3000)
        }
        return true
      } catch (err) {
        console.error('[Session] createSession failed:', err)
        s.addMessage({
          sender: 'kimi',
          text: '抱歉，电台启动失败了，请检查后端服务。',
          timestamp: 0,
        })
        return false
      } finally {
        s.setIsCreating(false)
      }
    },
    [djEnabled, addTimer]
  )

  const sendChatMessage = useCallback(
    async (text: string) => {
      const s = useRadioStore.getState()
      const sid = s.sessionId
      if (!sid) return false
      s.setIsCreating(true)
      try {
        const res = await fetch(`${API_BASE}/api/radio/${sid}/chat`, {
          method: 'POST',
          headers: getApiHeaders(),
          body: JSON.stringify({ text, model: s.currentModel, session_token: s.sessionToken }),
        })
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`HTTP ${res.status}: ${errText}`)
        }
        const data = await res.json()
        if (data.reply) {
          s.setSpeaking(true)
          s.addMessage({
            sender: 'kimi',
            text: data.reply,
            timestamp: 0,
          })
          addTimer(() => s.setSpeaking(false), 3000)
        }
        if (data.new_song) {
          const song = data.new_song
          s.setQueue([...s.queue, song])
          s.setCurrentSong(song)
          s.setDuration(song.duration || 180)
          s.setIsPlaying(true)
        }
        return true
      } catch (err) {
        console.error('[Chat] sendChatMessage failed:', err)
        s.addMessage({
          sender: 'kimi',
          text: '网络有点卡，稍后再聊。',
          timestamp: 0,
        })
        return false
      } finally {
        s.setIsCreating(false)
      }
    },
    [addTimer]
  )

  return { createSession, sendChatMessage }
}
```

### A.3 `src/components/PlayerBar.tsx`

```tsx
'use client'

import React, { memo, useState, useEffect } from 'react'
import { useRadioStore } from '@/store/radioStore'
import { fmtTime } from '@/lib/utils'
import AudioWaveform from './AudioWaveform'

const PlayerBar = memo(function PlayerBar() {
  const currentSong = useRadioStore((state) => state.currentSong)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const currentTime = useRadioStore((state) => state.currentTime)
  const duration = useRadioStore((state) => state.duration)

  // Local time drive to reduce re-render frequency
  const [localTime, setLocalTime] = useState(currentTime)

  useEffect(() => {
    setLocalTime(currentTime)
  }, [currentTime])

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setLocalTime((t) => Math.min(t + 1, duration || 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [isPlaying, duration])

  if (!currentSong) return null

  return (
    <div className="card-enter">
      <div className="rounded-2xl px-4 py-3 surface-card">
        {/* Top row: spectrum + song info + status */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 shrink-0">
            <AudioWaveform
              isPlaying={isPlaying}
              barCount={12}
              color="var(--neon-green)"
              height={24}
              variant="mini"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium truncate"
                style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}
              >
                {currentSong.title} - {currentSong.artist}
              </span>
              <span className="status-badge status-badge--playing">PLAYING</span>
              {currentSong.platform && currentSong.platform !== 'mock' && (
                <span className={`status-badge ${currentSong.platform === 'qq' ? 'status-badge--qq' : 'status-badge--netease'}`}>
                  {currentSong.platform === 'qq' ? 'QQ' : 'NetEase'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info row: time + mini progress (no controls) */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {fmtTime(localTime)}
          </span>
          <div className="flex-1 mx-3 h-[2px] rounded-full overflow-hidden" style={{ background: 'var(--surface-bg-subtle)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${duration > 0 ? (localTime / duration) * 100 : 0}%`,
                background: 'var(--accent-warm)',
              }}
            />
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {fmtTime(duration || 0)}
          </span>
        </div>
      </div>
    </div>
  )
})

export default PlayerBar
```

### A.4 `src/components/ChatArea.tsx`

```tsx
'use client'

import React, { memo } from 'react'
import { useRadioStore } from '@/store/radioStore'

const ChatArea = memo(function ChatArea() {
  const messages = useRadioStore((state) => state.messages)
  const sessionId = useRadioStore((state) => state.sessionId)

  if (messages.length === 0) {
    if (!sessionId) return null
    return (
      <div className="card-enter card-enter-delay-2">
        <div className="rounded-2xl px-4 py-3 surface-card">
          <div className="text-center py-6">
            <p className="text-[12px] mb-2" style={{ color: 'var(--fg-secondary)' }}>
              电台已启动，和 Kimi 聊聊吧
            </p>
            <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              试试："换一首中文歌"、"有点困了"、"推荐爵士"
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card-enter card-enter-delay-2">
      <div className="rounded-2xl px-4 py-3 space-y-3 max-h-[200px] overflow-y-auto surface-card" aria-live="polite" aria-atomic="false">
        {/* Chat header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: 'var(--neon-green)' }} />
            <span className="text-[11px]" style={{ color: 'var(--neon-green)', fontFamily: 'var(--font-mono)' }}>
              Kimi
            </span>
            <span className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>LIVE</span>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
            Connected to Kimi server
          </span>
        </div>

        {/* Messages */}
        <div className="space-y-2.5">
          {messages.slice(-8).map((msg) => (
            <div key={msg.id} className="flex gap-2.5">
              {msg.sender === 'kimi' && (
                <div
                  className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-warm), var(--accent-copper))',
                  }}
                  aria-hidden="true"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12z" />
                  </svg>
                </div>
              )}
              <div className={`flex-1 ${msg.sender === 'user' ? 'text-right' : ''}`}>
                <div className="flex items-center gap-1.5 mb-0.5" style={{ justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  <span className="text-[11px]" style={{ color: msg.sender === 'kimi' ? 'var(--accent-warm)' : 'var(--fg-secondary)' }}>
                    {msg.sender === 'kimi' ? 'Kimi' : 'You'}
                  </span>
                </div>
                <div
                  className="inline-block text-[12px] leading-relaxed px-3 py-2 rounded-xl"
                  style={{
                    background: msg.sender === 'kimi' ? 'var(--surface-bg-subtle)' : 'var(--accent-glow)',
                    color: 'var(--fg-secondary)',
                    border: `1px solid ${msg.sender === 'kimi' ? 'var(--surface-border-subtle)' : 'var(--accent-glow-strong)'}`,
                    textAlign: 'left',
                  }}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default ChatArea
```

### A.5 `src/components/InputArea.tsx`

```tsx
'use client'

import React, { memo } from 'react'
import { useRadioStore } from '@/store/radioStore'

interface InputAreaProps {
  inputText: string
  setInputText: (text: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

const InputArea = memo(function InputArea({ inputText, setInputText, onSend, onKeyDown }: InputAreaProps) {
  const isCreating = useRadioStore((state) => state.isCreating)

  return (
    <div className="chat-input flex items-center gap-2 px-4 py-2.5">
      <button
        aria-label="Voice input"
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--fg-muted)', outlineColor: 'var(--accent-warm)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </button>
      <input
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isCreating ? '正在准备电台...' : 'Say something to the DJ...'}
        aria-label="Chat with DJ"
        disabled={isCreating}
        maxLength={500}
        className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2 rounded-md px-2 py-1"
        style={{ color: 'var(--fg-primary)', fontFamily: 'var(--font-body)', '--tw-ring-color': 'var(--accent-warm)' } as React.CSSProperties}
      />
      <button
        aria-label="Send message"
        onClick={onSend}
        disabled={!inputText.trim() || isCreating}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 hover:scale-105 active:scale-95 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ background: 'var(--surface-bg-subtle)', outlineColor: 'var(--accent-warm)' }}
      >
        {isCreating ? (
          <svg className="w-4 h-4 animate-spin" style={{ color: 'var(--fg-primary)' }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" style={{ color: 'var(--fg-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        )}
      </button>
    </div>
  )
})

export default InputArea
```

### A.6 重构后的 `src/app/page.tsx`

```tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import KimiCard from '@/components/KimiCard'
import DotMatrixClock from '@/components/DotMatrixClock'
import OnAirBadge from '@/components/OnAirBadge'
import QueueList from '@/components/QueueList'
import TerminalLog from '@/components/TerminalLog'
import ThemeToggle from '@/components/ThemeToggle'
import ParticleBackground from '@/components/ParticleBackground'
import PlayerBar from '@/components/PlayerBar'
import ChatArea from '@/components/ChatArea'
import InputArea from '@/components/InputArea'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { useSession } from '@/hooks/useSession'
import { useRadioStore } from '@/store/radioStore'
import Link from 'next/link'

export default function Home() {
  const [inputText, setInputText] = useState('')
  const [showTerminal, setShowTerminal] = useState(true)

  const { handleSeek, addTimer } = useAudioPlayer()
  const { createSession, sendChatMessage } = useSession(addTimer)

  const sessionId = useRadioStore((state) => state.sessionId)
  const currentSong = useRadioStore((state) => state.currentSong)
  const queue = useRadioStore((state) => state.queue)
  const isCreating = useRadioStore((state) => state.isCreating)
  const isPlaying = useRadioStore((state) => state.isPlaying)
  const isOnline = useRadioStore((state) => state.isOnline)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          useRadioStore.getState().togglePlay()
          break
        case 'ArrowLeft':
          handleSeek(Math.max(0, (useRadioStore.getState().currentTime || 0) - 10))
          break
        case 'ArrowRight':
          handleSeek(Math.min(
            useRadioStore.getState().duration || 0,
            (useRadioStore.getState().currentTime || 0) + 10
          ))
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSeek])

  // Network status
  useEffect(() => {
    const handleOnline = () => useRadioStore.getState().setOnline(true)
    const handleOffline = () => useRadioStore.getState().setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isCreating) return
    const text = inputText.trim()
    const s = useRadioStore.getState()
    s.addMessage({ sender: 'user', text, timestamp: 0 })
    setInputText('')
    s.setSpeaking(true)
    addTimer(() => s.setSpeaking(false), 800)

    if (sessionId) {
      await sendChatMessage(text)
    } else {
      const ok = await createSession(text)
      if (ok) setShowTerminal(false)
    }
  }, [inputText, isCreating, sessionId, sendChatMessage, createSession, addTimer])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend()
  }, [handleSend])

  return (
    <main id="main-content" className="min-h-screen relative overflow-x-hidden" style={{ background: 'var(--bg-void)' }}>
      <ParticleBackground />
      <div className="ambient-glow" />
      <div className="dot-grid" />

      <div className="relative z-10 mx-auto w-full max-w-[440px] lg:max-w-[900px] px-4 py-6 md:py-8 flex flex-col lg:flex-row gap-3 lg:gap-6">
        {/* Left column */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Link
              href="/profile"
              className="text-[11px] tracking-wider transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:opacity-100 rounded-sm px-1 py-0.5"
              style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', outlineColor: 'var(--accent-warm)' }}
            >
              MY TASTE
            </Link>
            <ThemeToggle />
          </div>

          {/* Clock + ON AIR */}
          <div className="flex flex-col items-center gap-3">
            <div className="animate-text-glow">
              <DotMatrixClock />
            </div>
            <OnAirBadge isLive={isPlaying} />
          </div>

          {/* Offline indicator */}
          {!isOnline && (
            <div className="rounded-full px-3 py-1.5 text-center text-[11px]"
              style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              网络已断开，正在播放本地缓存
            </div>
          )}

          {/* Player Bar (info only) */}
          {sessionId && currentSong && <PlayerBar />}

          {/* Terminal Log */}
          {showTerminal && !sessionId && (
            <div className="card-enter md:max-h-[300px] md:overflow-y-auto rounded-2xl" style={{ scrollbarWidth: 'none' }}>
              <TerminalLog />
            </div>
          )}

          {/* Player Card */}
          {currentSong && (
            <div>
              <KimiCard onSeek={handleSeek} />
            </div>
          )}

          {/* Loading Skeleton */}
          {isCreating && (
            <div className="card-enter">
              <div className="rounded-[28px] p-5 space-y-3 surface-card">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton w-24 h-3" />
                    <div className="skeleton w-16 h-2" />
                  </div>
                </div>
                <div className="skeleton w-full h-10 rounded-lg" />
                <div className="flex gap-2">
                  <div className="skeleton w-20 h-2" />
                  <div className="skeleton w-16 h-2" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column (desktop) */}
        <div className="lg:w-[340px] flex flex-col gap-3">
          {/* Queue */}
          {sessionId && queue.length > 0 && (
            <div className="card-enter card-enter-delay-1">
              <QueueList />
            </div>
          )}

          {/* Chat Area */}
          <ChatArea />

          {/* Input Area */}
          <InputArea
            inputText={inputText}
            setInputText={setInputText}
            onSend={handleSend}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-3 pb-6">
        <span className="text-[11px]" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>KIMI FM</span>
        <span className="w-1 h-1 rounded-full" style={{ background: 'var(--fg-dim)' }} />
        <span className="text-[11px]" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>CONNECTED</span>
      </div>
    </main>
  )
}
```

---

*文档版本：v2.0（合并版）*  
*合并来源：工程架构审查 + 视觉设计审查*
