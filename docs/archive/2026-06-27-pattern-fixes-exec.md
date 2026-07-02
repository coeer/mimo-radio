# 模式扫描修复执行规格(F1/F2/F3/F5/F6)

> **来源**:规划者复核 `2026-06-27-pattern-fixes.md` 后的修正版
> **生成时间**:2026-06-27(规划者)
> **修正**:删除误报的 F8;F1 根因解释精确化;F2 改用 useRef;F3 改用"诚实标记"而非补后缀
> **配套**:先读 `COLLABORATION.md` + `docs/selftest-pattern-scanning.md`

---

## 任务总览(5 项,无 F8)

| 编号 | 严重度 | 问题 | 改动量 |
|------|--------|------|--------|
| F1 | 🔴 | 收藏爱心不即时更新(订阅派生函数而非派生数据) | 1 文件 |
| F2 | 🔴 | FullscreenPlayer 主题闭包陈旧 | 1 文件 |
| F3 | 🟡 | REPLAY 重播音名滞后(改用诚实标记) | 1 文件 |
| F5 | 🟡 | AI 编造歌曲年份(prompt 引导) | 1 文件 |
| F6 | 🟡 | 推荐数量不一致(prompt 约束) | 1 文件 |

**执行顺序**:F1 → F2 → F5 → F6 → F3 → 验证

---

## 🔴 F1:收藏爱心不即时更新

### 精确根因(规划者修正)
不是"Object.is 比较函数引用"——而是**组件订阅了派生函数(`isLiked` action)而非派生数据(`likedSongIds` 数组)**。
- `radioStore.ts:146` `isLiked: (id) => get().likedSongIds.includes(id)` 是个 action 函数
- `KimiCard.tsx:52` `useRadioStore((s) => s.isLiked)` 订阅了这个函数引用
- 函数引用永远不变 → `likedSongIds` 数组变化时,**Zustand 不会通知这个组件 re-render**
- 所以爱心填充(`:324/:327` 的 `isLiked(currentSong.id)`)不会即时更新,要等别的状态变化(如 currentTime 每秒变)触发 re-render 才反映

### 改法
`frontend/src/components/KimiCard.tsx`:

**第 52 行**——把订阅源从函数改为数组:
```tsx
// 改前
const isLiked = useRadioStore((state) => state.isLiked)

// 改后
const likedSongIds = useRadioStore((state) => state.likedSongIds)
const isSongLiked = (id: string) => likedSongIds.includes(id)
```

**第 62 行**(handleLike 里)——用新函数:
```tsx
// 改前
const liked = isLiked(currentSong.id)

// 改后
const liked = isSongLiked(currentSong.id)
```

**第 77 行**(useCallback 依赖)——更新依赖:
```tsx
// 改前
}, [currentSong, isLiked, toggleLike, sessionId, sessionToken])

// 改后
}, [currentSong, isSongLiked, toggleLike, sessionId, sessionToken])
```

**第 324 行 和 第 327 行**(爱心 UI)——把 `isLiked(currentSong.id)` 换成 `isSongLiked(currentSong.id)`:
```tsx
className={`control-group-btn ${currentSong && isSongLiked(currentSong.id) ? 'is-active' : ''}`}
// ...
fill={currentSong && isSongLiked(currentSong.id) ? 'currentColor' : 'none'}
```

**注意**:全文件搜索 `isLiked` 确保没有遗漏(`grep -n isLiked KimiCard.tsx`)。store 里的 `isLiked` action **保留**(其他组件可能用,不要删 store 定义)。

### 验证
- `cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit` 零错误
- `npx vitest run` ≥127 全过
- E2E:点收藏 → 爱心**立即变红**(不等下一秒);再点 → 立即恢复空心

---

## 🔴 F2:FullscreenPlayer 主题闭包陈旧

### 精确根因
`FullscreenPlayer.tsx:36-46`:
```tsx
const [prevTheme, setPrevTheme] = useState<string>('dark')  // 默认 'dark'
useEffect(() => {
  const cur = root.getAttribute('data-theme') || 'dark'
  setPrevTheme(cur)            // setState 触发 re-render
  root.setAttribute('data-theme', 'light')
  return () => {
    root.setAttribute('data-theme', prevTheme)  // ← 闭包捕获 mount 时的 prevTheme='dark'
  }
}, [])  // ← [] 依赖,setState 后 effect 不重跑,cleanup 闭包不更新
```
退出全屏时 cleanup 里的 `prevTheme` 永远是 mount 时的初始值 `'dark'`,**无论用户原主题是什么都强制变 dark**。

### 改法(用 useRef,规划者推荐)
`frontend/src/components/FullscreenPlayer.tsx`:

**第 3 行 import**——加 useRef:
```tsx
// 改前
import React, { memo, useEffect, useState } from 'react'

// 改后
import React, { memo, useEffect, useRef, useState } from 'react'
```

**第 36-46 行**——整个 effect 块替换:
```tsx
// 改前
const [prevTheme, setPrevTheme] = useState<string>('dark')
useEffect(() => {
  const root = document.documentElement
  const cur = root.getAttribute('data-theme') || 'dark'
  setPrevTheme(cur)
  root.setAttribute('data-theme', 'light')
  return () => {
    root.setAttribute('data-theme', prevTheme)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

// 改后
const prevThemeRef = useRef<string>('dark')
useEffect(() => {
  const root = document.documentElement
  prevThemeRef.current = root.getAttribute('data-theme') || 'dark'  // ref 跨渲染保持
  root.setAttribute('data-theme', 'light')
  return () => {
    root.setAttribute('data-theme', prevThemeRef.current)  // 读 ref.current,拿 mount 时真实值
  }
}, [])
```

**删除** `setPrevTheme` 相关的 useState(第 36 行整行删)。如果 `useState` 在文件其他地方没用到了,从 import 移除(检查全文,通常还有别的 useState,保留 import)。

**为什么用 ref 而非执行者原方案**:执行者的改法 A(退出时读 current data-theme 判断"是否被用户切过")逻辑能跑,但引入了"全屏期间用户切主题"的边界判断,容易出问题。**useRef 是这个场景的标准解法**——ref 跨渲染保持,cleanup 读 ref.current 直接拿到 mount 时记录的真实值,无歧义。

### 验证
- `npx tsc --noEmit` 零错误,`npx vitest run` ≥127 全过
- E2E 场景(必须测全):
  1. /settings 切深色 → 回首页 → 进全屏 → 退出 → **仍是深色**(不再变浅)
  2. /settings 切浅色 → 回首页 → 进全屏 → 退出 → **仍是浅色**
  3. 快速进出全屏 5 次 → **主题稳定不漂移**

---

## 🟡 F3:REPLAY 重播音名滞后(改用"诚实标记")

### 根因
点 REPLAY 重播某条旧 DJ 消息,但当前 currentSong 可能已换。DJ 说"这首《晴天》...",实际在播别的歌 → 错位。

### 改法决策(规划者定:诚实标记,不补后缀)
执行者原方案"REPLAY 追加'现在是《歌名》'"——技术正确但**听感突兀**(DJ 说一段旧串词,突然冒出"现在是另一首")。

**采用"诚实标记"**:REPLAY 按钮本身不拦截(保留用户重听解说的自由),但当**该消息关联的歌 ≠ 当前歌**时,在 REPLAY 旁加灰色提示"(旧解说)",让用户知道这是历史解说。

但实现"消息关联的歌"需要消息带 songId。检查 ChatMessage 类型是否带 songId——如果没有,**降级方案**:REPLAY 按钮在"距最新 DJ 消息 > 2 条"时标记"(旧)"。这是启发式,简单有效。

### 改法(降级启发式)
`frontend/src/components/ChatArea.tsx`:

**第 133-145 行**(DJ 消息的 REPLAY 区块),需要知道当前 msg 是不是"最新的 kimi 消息"。在组件顶部加计算:

```tsx
// 在 ChatArea 组件函数体顶部(messages 已订阅),计算最新 kimi 消息 id
const messages = useRadioStore((state) => state.messages)
const lastKimiMsgId = useMemo(() => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === 'kimi' && !messages[i].isPending) return messages[i].id
  }
  return null
}, [messages])
```
(需 import useMemo)

**第 133-145 行 REPLAY 块**——根据 msg.id 是否等于 lastKimiMsgId 决定显示:
```tsx
{msg.sender === 'kimi' && !msg.isPending && (
  <div className="flex items-center gap-2 mt-1 ml-0.5">
    <span className="text-[10px] text-[var(--fg-muted)] font-[var(--font-mono)]">
      {timeStr}
    </span>
    <button
      className="text-[10px] text-[var(--fg-muted)] hover:text-[var(--accent-warm)] transition-colors font-[var(--font-mono)]"
      aria-label="重播"
      onClick={() => onReplay?.(msg.text)}
    >
      REPLAY
    </button>
    {/* F3: 非最新 DJ 解说标记为"旧",提示用户歌名可能已换 */}
    {msg.id !== lastKimiMsgId && (
      <span className="text-[9px] text-[var(--fg-dim)] font-[var(--font-mono)]">(旧解说)</span>
    )}
  </div>
)}
```

**为什么这么做**:不破坏 REPLAY 功能(用户仍可重听),但诚实告知"这是旧解说,当前歌可能不是这首"。比补后缀自然,比禁用按钮保留自由度。

### 验证
- `npx tsc --noEmit` 零错误
- E2E:换几首歌后,聊天区较老的 DJ 消息 REPLAY 旁显示"(旧解说)",最新一条不显示

---

## 🟡 F5:AI 编造歌曲年份

### 精确根因
`mimo.ts:154` 的 prompt 要求 AI 讲"创作年份、歌手的巧思",但 Song 类型无 `year` 字段(网易云/QQ 返回不含年份)。AI 必然编造年份(如"1971 年 David Gates..."但实际是别的歌)。

### 改法
`backend/src/services/mimo.ts` 的 `generateDJTransition` prompt(第 150-166 行附近):

**第 154 行**——去掉"创作年份"引导:
```ts
// 改前
`2. 故事：讲一点这首歌的背景——创作年份、歌手的巧思、或它为什么动人（像在和朋友聊一张老唱片）`

// 改后
`2. 故事：讲一点这首歌给你的感觉——旋律的色彩、歌手声线的特质、或它为什么动人（像在和朋友聊一张老唱片）。不要编造具体的发行年份或未经核实的事实。`
```

**第 157-158 行参考风格**——删掉带年份的英文示例(它会引导 AI 编年份):
```ts
// 改前
`参考风格（不要照抄，按你的语气重写）：
"This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper — you'll feel yourself lift off the ground a little."`

// 改后（去掉带年份的示例，换成不带具体年份的）
`参考风格（不要照抄，按你的语气重写）：
"This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Every line ends in a whisper — you'll feel yourself lift off the ground a little. This one's for the quiet hour."`
```

**注意**:`generateIntro`(开场白)如果有类似的"创作年份"引导也要一并去掉(grep `创作年份|发行|年份` mimo.ts 全文)。

### 验证
- `cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run` ≥234 全过
- 实测:换几首歌,听 DJ 串词不再出现编造的年份。检查 `mimo.test.ts` 是否有断言串词含年份(若有,更新)

---

## 🟡 F6:推荐数量不一致

### 精确根因
AI reply 可能说"为你找了 5 首",但后端 `slice(0, 5)` 固定取 5 首,如果搜索只返回 3 首,前端显示 3 张卡片 → 数量不符。

### 改法
`backend/src/routes/radio.ts` 的 chat system prompt(第 284-311 行附近):

**在 prompt 末尾(第 311 行 `当前天气` 之后)加约束**:
```ts
// 在现有 prompt 文本末尾追加
`【推荐数量规则】不要在回复中声明具体的推荐数量（如"5首""三首"）。如果需要提及，用模糊表达如"挑了几首""找了些歌"代替具体数字，因为实际可播数量取决于曲库。`
```

**更彻底(可选,同一轮做)**:后端在构造 recommendations 后,把实际数量填入 AI 上下文。但 chat 流程是"AI 先回复→后搜索",数量在回复之后才知道。所以 prompt 约束是当前可行的方案。彻底方案(搜索前置)属于 Bug 2 的方案 B,工作量大,本轮不做。

### 验证
- `npx tsc --noEmit && npx vitest run` ≥234 全过
- 实测:输入"来点爵士" → AI 回复不再说"5 首",用"挑了几首"

---

## 验证清单(全部完成后)

```bash
# 前端(F1/F2/F3)
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127

# 后端(F5/F6)
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run    # ≥234

# 后端改了 mimo.ts/radio.ts → 需重启
netstat -ano | grep ":8001" | grep LISTENING
taskkill //PID <PID> //F
cd D:/Coder/mimo-radio/backend && npx tsx src/index.ts

# E2E 重点验证(用 webbridge,务必先 unlockAudio)
# F1: 点收藏 → 爱心立即变红(不等下一秒)
# F2: /settings 深色 → 进全屏 → 退出 → 仍是深色;快速进出5次稳定
# F3: 换几首歌后,旧 DJ 消息 REPLAY 旁显示"(旧解说)",最新不显示
# F5: 换歌后 DJ 串词不含编造年份
# F6: 输入"来点爵士" → AI 不说具体数量
```

---

## 执行检查清单

- [ ] F1: KimiCard 订阅 likedSongIds 而非 isLiked(改 52/62/77/324/327 五处,store 的 isLiked 保留)
- [ ] F2: FullscreenPlayer 用 useRef 替换 useState prevTheme(删 36 行,改 37-46 effect)
- [ ] F3: ChatArea 加 lastKimiMsgId 计算,旧消息 REPLAY 标"(旧解说)"
- [ ] F5: mimo.ts transition prompt 去创作年份引导 + 换无年份参考示例(intro 一并查)
- [ ] F6: radio.ts chat prompt 加"不声明具体数量"约束
- [ ] 前端 tsc + vitest 全过
- [ ] 后端 tsc + vitest 全过 + 重启
- [ ] 5 项 E2E 验证(务必 unlockAudio)

---

## 给执行者的提醒

1. **F1 全文搜索 isLiked**:`grep -n isLiked KimiCard.tsx` 确认无遗漏,但**不要删 store 的 isLiked 定义**(其他组件可能用)。
2. **F2 useRef 是标准解法**,不要用执行者原方案(读 current data-theme 判断边界),那个会引入复杂边界判断。
3. **F3 是诚实标记不是补后缀**——保留 REPLAY 自由度,只加视觉提示。补后缀听感突兀。
4. **F5 改完 grep `年份|发行|year` mimo.ts 全文**,确保 intro prompt 没有同类引导。
5. **改后端必须重启**(F5/F6),否则 API 行为不变。
6. **每改一项立即验证**(tsc + 该项相关测试),不要攒着一起测。

执行完产出执行报告(改了哪些文件、测试结果、E2E 验证结果),按 `selftest-spec.md` 规范。

---

*规格已修正:删除误报 F8,F1 根因精确化,F2 用 useRef,F3 改诚实标记。执行者按本规格执行即可。*
