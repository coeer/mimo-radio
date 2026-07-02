---
author: DSflash
task: 模式扫描修复方案（给规划者审批）
created: 2026-06-27
---

# 模式扫描修复方案（基于 selftest-pattern-scanning 发现）

> **来源**：`docs/selftest-2026-06-27-pattern-scanning.md`（3 个 Explore 代理代码扫描 + 2 个压测序列）
> **生成时间**：2026-06-27（执行者提交，规划者审批）
> **项目根**：`D:\Coder\mimo-radio`
> **配套**：先读 `COLLABORATION.md`（历史决策）

---

## 任务总览

| 编号 | 模式 | 严重度 | 问题 | 改动量 |
|------|------|--------|------|--------|
| F1 | C3 | 🔴 | **收藏爱心不即时更新** — Zustand selector 选了函数引用而非具体值 | 1 文件，3 行 |
| F2 | A1 | 🔴 | **FullscreenPlayer 主题闭包陈旧** — `prevTheme` 在 `[]` 依赖中捕获，退出恢复错误主题 | 1 文件，5 行 |
| F3 | B5 | 🟡 | **REPLAY 重播歌名滞后** — 重播时 DJ 说的歌名可能已不是当前播放 | 1 文件，8 行 |
| F4 | A3 | 🟡 | **isPlaying 多处写入** — 8 个文件 24+ 写点，缺仲裁层（TTS resume vs MediaSession 竞态） | 架构级，需评估 |
| F5 | B2 | 🟡 | **AI 编造歌曲背景** — Prompt 要求讲"创作年份"但数据无 `year` 字段 | 1 文件，5 行 |
| F6 | B3 | 🟡 | **推荐数量不一致** — AI 说 N 首但搜索结果不足 | 1 文件，5 行 |
| F7 | B4 | 🟢 | **天气/时间感知单向解耦** — DJ 提天气但搜索不考虑 | 2 文件（低优先级） |
| F8 | C4 | 🟢 | **进度条 PlayerBar 本地计时漂移** — 本地 1s interval 无校准 | 1 文件，10 行 |

**执行顺序**：F1 → F2 → F3 → F5 → F6 → F8（F4/F7 需架构评估，延后）

---

## 一、详细修复方案

### 🔴 F1：收藏爱心不即时更新（最高优先级）

**根因**：`KimiCard.tsx` 第 52 行 `useRadioStore((s) => s.isLiked)` 选择了 `isLiked` 函数引用。Zustand 默认 `Object.is` 比较，函数引用不变 → store `likedSongIds` 变了但组件不 re-render。

**改法**：`frontend/src/components/KimiCard.tsx`

```tsx
// 改前（第 52 行附近）
const isLiked = useRadioStore((state) => state.isLiked)
// 使用：const liked = isLiked(currentSong?.id || '')

// 改后
const likedSongIds = useRadioStore((state) => state.likedSongIds)
const liked = likedSongIds.includes(currentSong?.id || '')
```

同时删除或保留 `isLiked` 函数（若其他地方还在用则保留，但 KimiCard 不再引用它）。

**验证**：
- 点击收藏 → 爱心立即变红（不再需要等 `currentTime` 触发 re-render）
- 再次点击 → 爱心立即恢复空心
- 前端 tsc + vitest 全过

**改动量**：1 文件，约 3 行

---

### 🔴 F2：FullscreenPlayer 主题闭包陈旧

**根因**：`FullscreenPlayer.tsx:39` 的 `prevTheme` 在 `useEffect(() => { ... return () => { root.setAttribute('data-theme', prevTheme) } }, [])` 中捕获。依赖 `[]` 意味着 `prevTheme` 在组件挂载时固定，此后用户在 /settings 切换主题不会被感知。退出全屏时恢复的是挂载时的旧主题。

**改法 A（推荐，最小改动）**：`frontend/src/components/FullscreenPlayer.tsx`

```tsx
// 改前
useEffect(() => {
  const root = document.documentElement
  const cur = root.getAttribute('data-theme') || 'dark'
  root.setAttribute('data-theme', 'light')
  return () => {
    root.setAttribute('data-theme', cur)  // cur = 挂载时的值，闭包陈旧
  }
}, [])

// 改后：退出时读取当前 data-theme（用户在满屏期间可能切过主题），如果仍是 light 则恢复 prev，否则保留当前
useEffect(() => {
  const root = document.documentElement
  const prevTheme = root.getAttribute('data-theme') || 'dark'
  root.setAttribute('data-theme', 'light')
  return () => {
    // 退出时：如果当前是 light（全屏设的），恢复 prev；否则保留用户手动切的主题
    const current = root.getAttribute('data-theme')
    if (current === 'light') {
      root.setAttribute('data-theme', prevTheme)
    }
    // 如果已经是 dark，说明用户在全屏期间手动切过，不覆盖
  }
}, [])
```

**改法 B（更彻底）**：把 `prevTheme` 存在 ref 中，但在 cleanup 时读实时 `data-theme` 决定恢复策略。

**验证**：
1. /settings 切深色 → 回首页 → 进全屏 → 退出 → **主题保持深色**
2. 浅色 → 进全屏 → 退出 → **主题恢复浅色**
3. 快速进出全屏 5 次 → **主题稳定，不漂移**

**改动量**：1 文件，约 5 行

---

### 🟡 F3：REPLAY 重播歌名滞后

**根因**：点 REPLAY 时，`handleReplay` 调 `speakAIMessage(text)` 朗读旧的 DJ 消息。该消息可能包含"第一首《晴天》..."，但此时 currentSong 可能已换到第 3 首。这属于"AI 文本与系统行为解耦"的子模式。

**改法**：`frontend/src/app/page.tsx:159-164` 的 `handleReplay`，在重播前附加当前歌曲信息，或替换掉过时的歌名引用。

```tsx
// 改前
const handleReplay = useCallback(
  (text: string) => {
    stopTTS()
    void speakAIMessage(text)
  },
  [stopTTS, speakAIMessage],
)

// 改后：如果当前有歌，在重播消息后追加一句当前歌曲提示
const handleReplay = useCallback(
  (text: string) => {
    stopTTS()
    const song = useRadioStore.getState().currentSong
    const suffix = song ? `。现在是《${song.title}》— ${song.artist}` : ''
    void speakAIMessage(text + suffix)
  },
  [stopTTS, speakAIMessage],
)
```

**验证**：
1. 播几首歌后点某条旧消息的 REPLAY → DJ 先说旧消息，最后说"现在是《xxx》"
2. 无 currentSong 时 REPLAY → 不加后缀，行为不变

**改动量**：1 文件，约 8 行

---

### 🟡 F5：AI 编造歌曲背景（Prompt 修复）

**根因**：`mimo.ts:152-154` transition prompt 要求 AI 讲"**创作年份**、歌手的巧思、或它为什么动人"，但 Song 类型的 `year?: number` 是可选字段，真实 API 数据通常不包含。AI 必然编造。

**改法**：`backend/src/services/mimo.ts` 的 `generateDJTransition` prompt 中，去掉"创作年份"的引导，改为更安全的表达。同时在 prompt 注入 `year` 信息（若存在）让 AI 有据可依。

```ts
// 改前 prompt 片段
`这是一次换歌。刚才放的是：${prevInfo}。现在要来的是：${nextInfo}。
用 80-150 字写一段过渡串词，像电台 DJ 一样自然。
讲一点这首歌的背景——创作年份、歌手的巧思、或它为什么动人。`

// 改后
`这是一次换歌。刚才放的是：${prevInfo}。现在要来的是：${nextInfo}。
用 80-150 字写一段过渡串词，像电台 DJ 一样自然。
${nextSong.year ? `这首歌发行于 ${nextSong.year} 年。` : ''}讲一讲它给你的感觉，自然过渡即可。`
```

**验证**：
- 后端 tsc + vitest 全过
- 过渡串词不再包含虚构的年份信息
- 如果歌曲有 `year` 字段，AI 仍可提及（现在有据可依）

**改动量**：1 文件，约 5 行

---

### 🟡 F6：推荐数量一致性

**根因**：AI reply prompt 允许 AI 自由回复，可能说"为你找了 5 首"但搜索结果不足 5 首。

**改法**：`backend/src/routes/radio.ts` 的 chat reply prompt 中，加指令约束：

```ts
// 在 radio.ts 的 system prompt 或 chat reply prompt 加一句
'在回复中不要声明具体推荐数量。如果需要提及歌曲数，用"找了这几首"代替"找了 X 首"。'
```

更彻底的方案：把实际搜索结果数量填入 AI prompt 让 AI 说真实数字。

**改动量**：1-2 行 prompt 文本

---

### 🟢 F8：进度条 PlayerBar 本地计时漂移

**根因**：`PlayerBar.tsx:15-27` 用 `setInterval` 本地计时，无校准逻辑，与实际 `timeupdate` 偏差可达 0-1s。

**改法 A（推荐）**：`frontend/src/components/PlayerBar.tsx`，每次 store.currentTime 变化时重置本地计时器，消除累积漂移。

```tsx
// 改前
const [localTime, setLocalTime] = useState(0)
useEffect(() => {
  if (!isPlaying) return
  setLocalTime(currentTime)  // 只在 isPlaying 变化时重置
  const t = setInterval(() => setLocalTime(p => p + 1), 1000)
  return () => clearInterval(t)
}, [isPlaying])

// 改后：currentTime 变化时也重置（校准）
const prevTimeRef = useRef(currentTime)
useEffect(() => {
  if (!isPlaying) return
  // seek 或换歌时校准
  if (Math.abs(currentTime - prevTimeRef.current) > 1.5) {
    setLocalTime(currentTime)
  }
  prevTimeRef.current = currentTime
  const t = setInterval(() => setLocalTime(p => p + 1), 1000)
  return () => clearInterval(t)
}, [isPlaying, currentTime])  // 加 currentTime 依赖
```

**验证**：
- 正常播放时本地时间跟随 store 校准，偏差 < 1s
- seek 后进度条立即反映新位置（不等下次 interval 滴答）

**改动量**：1 文件，约 10 行

---

## 二、暂不处理的项（需规划者评估）

### F4 isPlaying 24+ 写点（架构级）

**为什么暂不处理**：
- 当前靠 React 批处理和 Zustand 的异步更新兜底，实际运行时未报告竞态 bug
- 修复需要引入"播放仲裁层"（一个中心化的 play/pause action 取代各处 `setIsPlaying` 直接调用），改动量涉及 8+ 文件
- 建议在出现可复现的竞态 bug 后再做架构改造

**记录待办**：记入 `HANDOVER.md` "已知技术债务"。

### F7 天气/时间感知双向耦合

**为什么暂不处理**：
- 需要改 `moodToKeywords` 或搜索逻辑，涉及 AI prompt + 搜索算法的耦合设计
- 收益不确定（用户不容易感知"推荐的歌和天气无关"）
- 优先级低

---

## 三、验证清单

```bash
# 前端改动
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127

# 后端改动（F5/F6）
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run    # ≥234

# E2E 重点验证
# F1: 点收藏 → 爱心即变红（不等 re-render）
# F2: /settings 深色 → 进全屏 → 退出 → 主题保持深色
# F2: 快速进出全屏 5 次 → 主题不漂移
# F3: REPLAY 旧消息 → 最后提示"现在是《当前歌》"
# F8: seek 后进度条立即反映
```

---

## 四、不修的项（明确边界）

- ❌ **F4 isPlaying 架构改造**：需规划者评估后独立立项
- ❌ **F7 天气/时间感知**：低优先级，延后
- ❌ **A4 currentSong 写点散落**：虽然 6 处写入但统一经过 `setCurrentSong` action，风险可控
- ❌ **主题不进 Zustand store**：当前 localStorage + DOM 方式简单可靠，进 store 反而增加复杂度

---

## 五、执行顺序建议

```
F1（收藏爱心）  ← 用户体验最敏感，先做
  ↓
F2（主题闭包）  ← Bug 1 修复
  ↓
F3（REPLAY）   ← 小改，独立
  ↓
F5（AI 编造）  ← Prompt 调整，独立
  ↓
F6（数量一致） ← Prompt 调整，独立
  ↓
F8（进度条）   ← 小改
```

F1+F2 为核心体验修复，建议优先执行。F3/F5/F6/F8 为质量加固，可在同一轮次完成。

---
*报告由 DSflash 生成。*