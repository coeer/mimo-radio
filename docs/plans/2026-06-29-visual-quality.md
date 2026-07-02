# 视觉质感执行规格：封面放大 + 主题统一（useTheme）

> **目标**：提升"精致感"——封面从配角变主角（视觉层级），主题从散落 4 处变统一管理（消除割裂）。
> **生成时间**：2026-06-29（规划者）
> **配套**：先读 `COLLABORATION.md` + `HANDOVER.md`。本规格两件事相互独立，可任意顺序。

---

## 〇、为什么做这两件（不是新功能）

当前核心链路（播放/点歌/DJ记忆）已扎实。这一轮是"质感打磨"——视频规格里 Claudio 的封面是视觉主角（大尺寸、有质感），主题切换是顺滑的。我们当前：
- 封面偏小（KimiCard 56px，视频里更大、是卡片视觉中心）
- 主题散落 4 处独立操作（layout SSR / FullscreenPlayer / ThemeToggle / AudioWaveform 监听），虽 F2 修了闭包 bug，但根本问题（多处管理）没解

这两件成本低、用户感知中等，做完提升"精致感"。

---

## Part A：封面放大（视觉层级提升）

### 现状
| 位置 | 当前 size | 规格 |
|------|----------|------|
| KimiCard（主播放卡） | 56px | 偏小，应是卡片视觉中心 |
| FullscreenPlayer（全屏） | 88px | 偏小，全屏应更大 |
| QueueList（队列） | 32px | 合理（列表项） |
| RecommendCardList（推荐卡） | 36px | 合理（卡片项） |
| CoverArt 默认 | 48px | — |

### 改法
放大 KimiCard 和 FullscreenPlayer 的封面，QueueList/RecommendCard 不动（列表/卡片项的封面保持小尺寸是对的）。

**`frontend/src/components/KimiCard.tsx:179`**：
```tsx
// 改前
<CoverArt src={currentSong.coverUrl} size={56} radius={10} />

// 改后
<CoverArt src={currentSong.coverUrl} size={72} radius={12} />
```

**`frontend/src/components/FullscreenPlayer.tsx:141`**：
```tsx
// 改前
<CoverArt src={currentSong.coverUrl} size={88} radius={12} />

// 改后
<CoverArt src={currentSong.coverUrl} size={120} radius={14} />
```

### 设计理由
- KimiCard 72px：从"小图标感"变"专辑封面感"，成为卡片视觉中心。72px 在 440px 宽的卡片里占比合适（约 16%），不会挤压歌名/控件空间。
- FullscreenPlayer 120px：全屏沉浸态，封面应是第一视觉焦点。120px 够大但不占满（留出歌名/歌词空间）。
- QueueList/RecommendCard 不动：列表项和推荐卡的封面是"辅助识别"，不是视觉焦点，32/36px 合适。

### 验证
```bash
cd /d/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127
# E2E：播放歌曲 → KimiCard 封面明显变大（72px）；进全屏 → 封面 120px 是视觉焦点
# 确认：封面放大后不挤压歌名/控件（歌名 truncate 正常，控件按钮不重叠）
```

---

## Part B：主题统一（useTheme hook）

### 现状（主题散落 4 处）
| 位置 | 做什么 | 问题 |
|------|--------|------|
| `layout.tsx:54` SSR 内联脚本 | 读 localStorage `mimo-theme`，设 `data-theme` | 防闪烁，启动时跑一次 |
| `ThemeToggle.tsx:13/15/22` | 点切换改 `data-theme` + 写 localStorage | 唯一正常入口 |
| `FullscreenPlayer.tsx:38-41` | 进出全屏强制改 `data-theme` | F2 已修闭包，但仍直接操作 DOM |
| `AudioWaveform.tsx:235` | MutationObserver 监听 `data-theme` 变化重绘 | 依赖别人改 data-theme |

**根本问题**：主题读写散落在 4 个文件，没有统一"真相源"。虽然 F2 修了闭包 bug，但 FullscreenPlayer 仍直接操作 DOM，和 ThemeToggle 的 localStorage 写入不同步。

### 改法：抽 useTheme hook

**新建文件**：`frontend/src/hooks/useTheme.ts`

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'mimo-theme'

/**
 * 主题统一管理 hook。
 * 所有主题读写都走这里，不再各组件直接操作 data-theme / localStorage。
 *
 * 真相源：localStorage（持久化）+ data-theme（DOM 应用）
 * SSR 防闪烁仍由 layout.tsx 的内联脚本负责（它在 hydration 前跑）
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  // 初始化：读 localStorage（客户端）
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (saved === 'light' || saved === 'dark') {
      setThemeState(saved)
    } else {
      // 无存储时读当前 DOM（layout SSR 已设过）
      const current = document.documentElement.getAttribute('data-theme') as Theme | null
      if (current) setThemeState(current)
    }
  }, [])

  // 应用到 DOM + 持久化
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(STORAGE_KEY, next)
    // 同步 theme-color meta（layout SSR 里也有这逻辑）
    const meta = document.getElementById('theme-color-meta')
    if (meta) {
      meta.setAttribute('content', next === 'light' ? '#f5f3ef' : '#06060a')
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
```

### 改造 ThemeToggle（用 hook 替代直接 DOM 操作）

**`frontend/src/components/ThemeToggle.tsx`**：整个组件改用 `useTheme`：

```tsx
'use client'

import { memo } from 'react'
import { useTheme } from '@/hooks/useTheme'

function ThemeToggleImpl() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="..."
    >
      {/* 现有 SVG 图标保持不变 */}
    </button>
  )
}

export default memo(ThemeToggleImpl)
```

**删除**：原 ThemeToggle 里的 `localStorage.getItem`、`setAttribute('data-theme')`、`localStorage.setItem`——这些逻辑移到 useTheme 里了。

### 改造 FullscreenPlayer（用 hook 替代直接 DOM 操作）

**`frontend/src/components/FullscreenPlayer.tsx:36-45`**：

```tsx
// 改前（F2 修复版，但仍直接操作 DOM）
const prevThemeRef = useRef<string>('dark')
useEffect(() => {
  const root = document.documentElement
  prevThemeRef.current = root.getAttribute('data-theme') || 'dark'
  root.setAttribute('data-theme', 'light')
  return () => {
    root.setAttribute('data-theme', prevThemeRef.current)
  }
}, [])

// 改后（用 useTheme 的 setTheme，不直接操作 DOM）
import { useTheme } from '@/hooks/useTheme'
// ...
const { theme: userTheme, setTheme } = useTheme()
useEffect(() => {
  // 进全屏：记录用户主题，强制浅色
  const prev = userTheme
  setTheme('light')
  return () => {
    // 退出全屏：恢复用户原主题
    setTheme(prev)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**关键改进**：
- 不再直接 `setAttribute('data-theme')`，走 `setTheme`（hook 内部统一处理 DOM + localStorage + meta）
- `prev` 用闭包捕获 mount 时的 userTheme（和 ref 等效，因为 `[]` 依赖）
- 退出恢复时走 setTheme，保证 localStorage 也同步（之前 FullscreenPlayer 直接改 DOM 不写 localStorage，是不同步的根源）

### AudioWaveform 不改

`AudioWaveform.tsx:235` 的 MutationObserver 监听 `data-theme` 变化——这个**保留**。因为 useTheme 的 setTheme 内部仍会改 `data-theme`，MutationObserver 能监听到，会自动重绘。AudioWaveform 是"消费者"（响应变化），不是"生产者"（改主题），所以不需要改。

### layout.tsx 不改

`layout.tsx:54` 的 SSR 内联脚本**保留**。它在 hydration 前跑（防闪烁），useTheme 在 hydration 后跑。两者职责不同：SSR 防 FOUC，useTheme 管交互。useTheme 初始化时读 DOM（:15 `getAttribute('data-theme')`）会和 SSR 设的值对齐。

### 验证
```bash
cd /d/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127
# E2E：
# 1. /settings 切深色 → 回首页 → 进全屏 → 退出 → 仍是深色
# 2. /settings 切浅色 → 回首页 → 进全屏 → 退出 → 仍是浅色
# 3. 切主题 → 刷新 → 主题保持（localStorage 持久化）
# 4. 进全屏 → 退出 → 刷新 → 主题是用户原主题（不是 light）
#    （这验证了 FullscreenPlayer 退出时 setTheme(prev) 写了 localStorage）
```

---

## 执行顺序

```
Part A（封面放大）   ← 独立，2 行改动，先做
       ↓
Part B（useTheme）   ← 新建 hook + 改 2 组件
  ├─ B1: 新建 useTheme.ts
  ├─ B2: 改 ThemeToggle 用 hook
  └─ B3: 改 FullscreenPlayer 用 hook
       ↓
验证（tsc + 测试 + E2E 4 场景）
```

---

## 验证清单

```bash
# Part A
- [ ] KimiCard 封面 56→72
- [ ] FullscreenPlayer 封面 88→120
- [ ] tsc + vitest ≥127

# Part B
- [ ] B1: 新建 useTheme.ts（theme/setTheme/toggleTheme）
- [ ] B2: ThemeToggle 改用 useTheme（删直接 DOM 操作）
- [ ] B3: FullscreenPlayer 改用 useTheme（删直接 DOM 操作 + ref）
- [ ] tsc + vitest ≥127
- [ ] E2E 4 场景（深色进出全屏 / 浅色进出全屏 / 刷新保持 / 全屏退出后刷新）
```

---

## 给执行者的提醒

### Part A
1. **只改 KimiCard 和 FullscreenPlayer 两处 size**。QueueList(32)/RecommendCard(36) 不动——列表项封面保持小尺寸是对的。
2. **改完确认不挤压**——KimiCard 72px 后，歌名 truncate 正常、控件按钮不重叠。如果挤压，调小到 68px 或调整 flex 布局。

### Part B
1. **useTheme 是唯一真相源**——所有主题读写走它。改完后，全文 grep `data-theme`（.tsx 文件），确认只剩 useTheme.ts 内部 + layout.tsx SSR + AudioWaveform 的监听（这三处是合法的）。
2. **FullscreenPlayer 的 `[]` 依赖 + 闭包捕获 userTheme**——这是有意的（只在 mount 时记录用户主题）。不要加 userTheme 到依赖数组（会导致每次主题变都重跑 effect）。
3. **不要删 AudioWaveform 的 MutationObserver**——它是消费者不是生产者，监听 data-theme 变化自动重绘，保留。
4. **不要改 layout.tsx 的 SSR 脚本**——它防 FOUC，职责和 useTheme 不同。
5. **ThemeToggle 改完后，原文件里的 localStorage/setAttribute 逻辑全删**——移到 useTheme 了，不要留重复代码。

### 关于 AIService 接口（给 DSpro 的再次提醒）
**本规格不涉及后端，完全不动 AIService 接口。** 纯前端改动（hook + 组件）。如果你"觉得"需要改后端，停下来问。

---

*本规格是质感打磨。Part A 2 行改动提升封面视觉层级，Part B 抽 useTheme 消除主题散落。做完视觉质感明显提升。*
