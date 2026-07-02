# 体验流畅性 + DJ 连贯性系统方案（交付执行者）

> **目标**：解决用户两大痛点——"点击响应有延迟、UI 是死的" + "DJ 不够智能连贯"
> **生成时间**：2026-06-29（规划者）
> **方法**：三轮深度审计（前端性能 / UI 阻塞 / DJ 连贯性）定位精确根因
> **配套**：先读 `COLLABORATION.md` + `HANDOVER.md`。本规格三阶段独立，按顺序执行。
> **测试基线**：后端 251 / 前端 127（执行后应≥此数）

---

## 〇、审计发现汇总（执行者必读，理解根因再动手）

### 痛点 1：点击响应延迟、UI 死掉
两个独立根因：
- **根因 A（换歌死等）**：`nextSong` action（radioStore.ts:245）**无 loading 状态**。点"下一首"后 5-8 秒（等 AI 生成 transition）界面零变化，用户以为没点上。4 个触发入口（KimiCard 按钮 / FullscreenPlayer 按钮 / MediaSession / onEnded）**无防重入**，连点发多个请求。
- **根因 B（瞬时操作卡顿）**：KimiCard（:45）和 FullscreenPlayer（:23）**直接订阅了 `currentTime`**——这个字段每秒变 4 次（浏览器 timeupdate），导致这两个最重组件**每秒全量重渲染 4 次**。切全屏/收藏/调音量这些本该瞬时的操作，被 React 的重渲染排队拖慢。

### 痛点 2：DJ 不够智能连贯
最致命的缺口（审计发现）：
- **根因 C（DJ 听不见用户）**：`extractDJMemory`（djMemory.ts:42）只取 `sender === 'kimi'`——**用户的聊天发言从不流入换歌串词**。用户聊"今天很累"，换歌时 DJ 完全不知道。
- **根因 D（品味不对称）**：chat 注入了 `tasteMemoryBlock`（长期品味），transition 没有——"聊天时懂你，换歌时像新手"。
- **根因 E（节奏断层）**：三入口字数约束不一致（chat 30-80字 vs transition 80-150字），DJ 在不同场景像不同的人。

---

## 阶段一：换歌流畅性（用户感知最强，先做）

### 任务清单

#### T1.1：store 加 isTransitioning 标志

**文件**：`frontend/src/store/radioStore.ts`

在 StatusSlice 加 `isTransitioning: boolean`（初始 false）+ `setIsTransitioning` action。

在 `nextSong` action（:245）里：
```ts
nextSong: async () => {
  const { sessionId, sessionToken, isTransitioning } = get()
  // T1.1 防重入：正在换歌时不重复触发
  if (isTransitioning) return
  get().setIsTransitioning(true)
  try {
    // ... 现有 nextSong 逻辑 ...
  } finally {
    get().setIsTransitioning(false)
  }
}
```

**关键**：try/finally 确保 even if 失败也释放 isTransitioning（否则换歌失败后永远卡住）。

#### T1.2：换歌按钮加 disabled + spinner

**文件**：`frontend/src/components/KimiCard.tsx`、`frontend/src/components/FullscreenPlayer.tsx`

两个组件都订阅 `isTransitioning`，"下一首"按钮在 isTransitioning 时 disabled + 显示 spinner：
```tsx
const isTransitioning = useRadioStore((state) => state.isTransitioning)
// 按钮处
<button
  onClick={nextSong}
  disabled={isTransitioning}
  aria-label="下一首"
>
  {isTransitioning ? <Spinner /> : <NextIcon />}
</button>
```

#### T1.3：换歌等待期视觉反馈

**文件**：`frontend/src/components/KimiCard.tsx` 的 Speaking 状态指示区

isTransitioning 时显示"换台中..."提示（和现有的 Speaking/Idle 状态并列）：
```tsx
{isTransitioning ? '换台中...' : isSpeaking ? 'Speaking...' : 'Idle'}
```

#### T1.4：nextSong 的 4 个入口统一防重入

确认以下 4 处都经过 store 的 nextSong action（T1.1 的 isTransitioning 守卫统一生效）：
- `KimiCard.tsx` 的下一首按钮
- `FullscreenPlayer.tsx` 的下一首按钮
- `useAudioPlayer.ts` 的 MediaSession nexttrack handler
- `useAudioPlayer.ts` 的 audio.onEnded 自动跳

**注意**：因为防重入在 store action 内部（不在 UI 层），4 个入口自动统一受保护——无需每个按钮单独加 disabled 守卫。但 UI 层仍加 disabled（T1.2）给用户视觉反馈。

### 阶段一验证
```bash
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127
# E2E：
# 1. 点"下一首" → 立即看到"换台中..." + spinner（不再死等）
# 2. 快速连点"下一首"5 次 → 只发 1 个 /next 请求（防重入生效）
# 3. 换歌失败（断网模拟）→ isTransitioning 释放，按钮恢复可点
```

---

## 阶段二：重渲染性能（瞬时操作卡顿的根因）

### 任务清单

#### T2.1：KimiCard 进度条抽离（消除 currentTime 订阅）

**文件**：`frontend/src/components/KimiCard.tsx`

**现状**：:45 `const currentTime = useRadioStore((state) => state.currentTime)` → KimiCard 每秒重渲染 4 次。

**改法**：把进度条 + 时间显示（:244-279 的进度条区块）抽成独立的 memo 子组件 `ProgressBar`，由它单独订阅 currentTime/duration。KimiCard 主体**删除 currentTime 订阅**（:45），改用 `useRadioStore.getState().currentTime` 在需要时命令式读取（如 seek handler）。

```tsx
// 新建 ProgressBar 组件（KimiCard 内或独立文件）
const ProgressBar = memo(function ProgressBar({ onSeek }: { onSeek: (t: number) => void }) {
  const currentTime = useRadioStore((state) => state.currentTime)
  const duration = useRadioStore((state) => state.duration)
  // 进度条渲染（原 KimiCard:244-279 的内容）
})

// KimiCard 主体：删除 currentTime 订阅，用 <ProgressBar onSeek={handleSeek} />
```

**效果**：KimiCard 主体重渲染从 4Hz 降到接近 0（只剩 currentSong/isPlaying/isSpeaking 等低频字段变化时才重渲染）。只有 ProgressBar 小组件每秒更新 4 次。

#### T2.2：FullscreenPlayer 进度条 + 歌词高亮抽离

**文件**：`frontend/src/components/FullscreenPlayer.tsx`

**现状**：:23 订阅 currentTime + :26 订阅 aiCurrentTime → 双高频源，最重组件每秒重渲染 4-5 次。

**改法**：
1. 进度条抽独立子组件（同 T2.1），单独订阅 currentTime
2. 歌词高亮区抽独立子组件 `LyricDisplay`，单独订阅 currentTime，把 lrcCurrentIndex 的线性扫描（:56-64）局限在该子组件内
3. FullscreenPlayer 主体删除 currentTime + aiCurrentTime 订阅

**注意**：aiCurrentTime 订阅要确认主体是否真用了——审计发现主体可能没直接用 aiCurrentTime 渲染（它在注释里说改用歌曲进度驱动歌词）。如果主体没用，直接删除该订阅。

#### T2.3：PlayerBar 去掉 currentTime 订阅

**文件**：`frontend/src/components/PlayerBar.tsx`

**现状**：:11 订阅 currentTime，虽然:17-19 有 localTime setInterval 缓解，但订阅本身仍触发 4Hz 重渲染。

**改法**：删除 currentTime 订阅，改用 `useRadioStore.getState().currentTime` + 本地 setInterval 自治（localTime 已有逻辑，只需把初始值和校准改用 getState 命令式读取，不构成订阅）。

#### T2.4：AudioWaveform 加 memo

**文件**：`frontend/src/components/AudioWaveform.tsx`

**现状**：无 memo（grep 确认 0 命中），4 个实例每秒被父级重渲染带动执行 16 次。

**改法**：用 `memo()` 包裹 default export。props（isPlaying/barCount/color/height/variant/getFrequencyData）基本稳定，memo 后可跳过绝大多数重渲染。

### 阶段二验证
```bash
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127
# E2E + 性能验证：
# 1. 播放歌曲期间，用 React DevTools Profiler 录制 5 秒
#    → KimiCard/FullscreenPlayer 主体重渲染次数应接近 0（不再是每秒 4 次）
#    → 只有 ProgressBar/LyricDisplay 小组件在更新
# 2. 播放期间快速点收藏/切全屏/调音量 → 应感觉"瞬时"（不再卡顿）
# 3. 进度条仍正常推进、歌词仍逐句高亮（功能不回归）
```

---

## 阶段三：DJ 连贯性（最致命的智能缺口）

### 任务清单

#### T3.1：djMemory 加 recentUserSaid（让 DJ 听见用户）

**文件**：`backend/src/utils/djMemory.ts`

**现状**：:42 `.filter(m => m.sender === 'kimi')` 只取 DJ 发言，**用户发言完全不流入 transition**。

**改法**：在 `DJMemory` 接口加 `recentUserSaid: string[]`，`extractDJMemory` 提取最近 N 条用户消息：

```ts
export interface DJMemory {
  // ... 现有字段 ...
  /** 用户最近说过的话（让 DJ 换歌时记得用户意图） */
  recentUserSaid: string[]
}

// extractDJMemory 内
const userMessages = session.messages
  .filter(m => m.sender === 'user')
  .map(m => m.text)
  .filter(text => text.length > 2)  // 排除空消息
  .slice(-3)  // 最近 3 条
  .reverse()
```

`djMemoryPromptBlock` 里注入：
```ts
if (memory.recentUserSaid.length > 0) {
  parts.push(`- 用户刚才说过的：${memory.recentUserSaid.map(t => `"${t.slice(0, 40)}"`).join('、')}`)
}
```

**效果**：用户聊"今天很累" → 换歌时 DJ 看到 memoryBlock 里"用户刚才说过的：今天很累" → 串词能呼应"你说今天很累，这首安静的旋律陪你放松"。

#### T3.2：transition 注入 tasteMemoryBlock（长期品味对称）

**文件**：`backend/src/routes/radio.ts` 的 nextSong handler（:218-220 附近）

**现状**：chat 注入了 tasteMemoryBlock（:343-348），transition 没有。

**改法**：nextSong 里也提取长期品味，拼入传给 generateDJTransition 的 memoryBlock：

```ts
// nextSong handler 内（:218 附近）
import { getLikedArtists, getDislikedArtists } from '../db'
const memory = extractDJMemory(session)
const memoryBlock = djMemoryPromptBlock(memory)
// T3.2：transition 也注入长期品味（和 chat 对称）
const likedArtists = getLikedArtists(3)
const tasteBlock = likedArtists.length > 0
  ? `\n【用户长期品味】用户喜欢过的歌手：${likedArtists.map(a => a.artist).join('、')}。如果换的歌和用户品味相关，可以自然提一句。`
  : ''
transition = await ai.generateDJTransition(prev, next, session.context, memoryBlock + tasteBlock)
```

**效果**：换歌时 DJ 也知道用户喜欢什么，和聊天时一致。

#### T3.3：统一三入口字数约束 + prompt 结构

**文件**：`backend/src/services/mimo.ts`、`backend/src/routes/radio.ts`

**现状**：
- intro: 50-100 字（mimo.ts:191）
- transition: 80-150 字（mimo.ts:158）
- chat: 30-80 字（radio.ts:369）

**改法**：统一为 **60-120 字**（兼顾陪伴感和精简）。三处都改成：
- intro: "50-100 字" → "60-120 字"
- transition: "80-150 字" → "60-120 字"
- chat: "30-80 字" → "60-120 字"

**注意**：chat 的 30-80 字是历史遗留（早期怕 AI 啰嗦）。现在 DJ 有了记忆和品味，适当加长让回复更有人情味。

#### T3.4：chat 历史窗口扩大

**文件**：`backend/src/constants.ts:9`

**现状**：`AI_CHAT_HISTORY_LIMIT = 6`（约 3 轮对话）。

**改法**：`6 → 10`（约 5 轮对话），支持更长的陪伴式聊天。

**注意**：扩大窗口会增加 AI prompt 长度（token 成本略增），但 10 条仍在合理范围内（MiMo 的上下文窗口足够）。

### 阶段三验证
```bash
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run   # ≥251 + djMemory 新测试
# 后端重启
# E2E：
# 1. 聊天"今天好累" → 听 1 首歌 → 换歌 → DJ 串词应呼应"累"（证明 recentUserSaid 生效）
# 2. 先收藏 2 首周杰伦 → 换歌 → DJ 可能提"你喜欢的周杰伦风格"（tasteBlock 生效）
# 3. 连聊 5 轮 → 第 5 轮时 DJ 仍记得第 1 轮内容（窗口 10 生效）
# 4. 三入口字数观察：intro/transition/chat 都在 60-120 字区间
```

---

## 执行顺序与依赖

```
阶段一（换歌流畅）   ← 独立，先做（用户感知最强）
  T1.1 isTransitioning + 防重入
  T1.2 按钮反馈
  T1.3 状态提示
  T1.4 4 入口统一
       ↓
阶段二（重渲染性能）  ← 独立（纯前端组件拆分）
  T2.1 KimiCard 进度条抽离
  T2.2 FullscreenPlayer 抽离
  T2.3 PlayerBar 去订阅
  T2.4 AudioWaveform memo
       ↓
阶段三（DJ 连贯性）   ← 独立（纯后端 prompt 工程）
  T3.1 recentUserSaid
  T3.2 transition tasteBlock
  T3.3 统一字数
  T3.4 历史窗口
```

**三阶段相互独立**，可分轮交付。建议：阶段一+二一轮（都是前端体验），阶段三一轮（后端智能）。

---

## 全局验证清单

```bash
# 前端（阶段一+二）
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127

# 后端（阶段三）
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run    # ≥251

# 后端改了 radio.ts/mimo.ts/constants.ts → 重启
netstat -ano | grep ":8001" | grep LISTENING
taskkill //PID <PID> //F
cd D:/Coder/mimo-radio/backend && npx tsx src/index.ts

# E2E 核心场景
# 1. 点下一首 → "换台中..."立即出现（阶段一）
# 2. 连点下一首5次 → 只1个请求（阶段一防重入）
# 3. 播放时切全屏/收藏/音量 → 瞬时无卡顿（阶段二）
# 4. React DevTools Profiler → KimiCard 主体重渲染≈0（阶段二）
# 5. 聊天"今天累"→换歌→DJ呼应"累"（阶段三）
# 6. 三入口字数都在60-120字（阶段三）
```

---

## 执行检查清单

### 阶段一
- [ ] T1.1 store 加 isTransitioning + nextSong 防重入（try/finally 释放）
- [ ] T1.2 KimiCard/FullscreenPlayer 下一首按钮 disabled + spinner
- [ ] T1.3 换歌等待期"换台中..."提示
- [ ] T1.4 确认 4 入口经 store action 统一防重入
- [ ] 阶段一 tsc + vitest + E2E

### 阶段二
- [ ] T2.1 KimiCard ProgressBar 抽离 + 删 currentTime 订阅
- [ ] T2.2 FullscreenPlayer 进度条+歌词抽离 + 删 currentTime/aiCurrentTime 订阅
- [ ] T2.3 PlayerBar 去 currentTime 订阅（getState + 本地定时器）
- [ ] T2.4 AudioWaveform 加 memo
- [ ] 阶段二 tsc + vitest + Profiler 验证

### 阶段三
- [ ] T3.1 djMemory 加 recentUserSaid + djMemoryPromptBlock 注入
- [ ] T3.1 djMemory.test.ts 补 recentUserSaid 测试
- [ ] T3.2 nextSong 注入 tasteMemoryBlock
- [ ] T3.3 三入口字数统一 60-120 字
- [ ] T3.4 AI_CHAT_HISTORY_LIMIT 6→10
- [ ] 阶段三 tsc + vitest + 后端重启 + E2E

---

## 给执行者的提醒

### 通用
1. **三阶段独立，但建议按顺序**——阶段一用户感知最强（换歌不再死等），先交付能立刻看到效果。
2. **每阶段改完立即验证**（tsc + 测试 + 该阶段 E2E），不要三阶段全改完才测。
3. **改后端必须重启**（阶段三改了 radio.ts/mimo.ts/constants.ts）。

### 阶段一
- **isTransitioning 的 try/finally 是关键**——失败也必须释放，否则换歌失败后永远卡住。
- **防重入在 store action 内部**（不在 UI 层），4 个入口自动统一受保护。

### 阶段二
- **抽离的子组件必须 memo**——否则父级重渲染仍带动子级，等于没抽。
- **seek handler 用 getState() 命令式读取**——KimiCard 删了 currentTime 订阅后，seek 时不能直接读 state 变量，要用 `useRadioStore.getState().currentTime`。
- **用 React DevTools Profiler 验证**——这是阶段二的核心验证，不看 Profiler 等于没验证。录制 5 秒播放，确认 KimiCard 主体重渲染次数≈0。

### 阶段三
- **recentUserSaid 提取最近 3 条**（不要太多，避免 prompt 膨胀）。
- **tasteBlock 用简洁表达**——"用户喜欢过的歌手：周杰伦、陈奕迅"，不要把完整 feedback 数据塞进去。
- **字数统一后观察 AI 实际输出**——60-120 字是约束，AI 可能偶尔超出，这是正常的。

### 关于 AIService 接口（重要）
**本规格不改 AIService 接口签名**。阶段三的 T3.2 给 generateDJTransition 传更长的 memoryBlock（memoryBlock + tasteBlock 拼接），**不改函数签名**——memoryBlock 已是可选参数，传更长的字符串不涉及签名。如果你发现"似乎需要改接口"，停下来问。

---

## 效果预期

| 痛点 | 改造前 | 改造后 |
|------|--------|--------|
| 点"下一首" | 5-8秒死等，不知道在换 | 立即"换台中..." + spinner |
| 连点下一首 | 发多个请求 | 只发1个（防重入） |
| 切全屏/收藏/音量 | 卡顿（KimiCard每秒闪4次） | 瞬时（重渲染归零） |
| DJ 换歌串词 | 不知道用户聊了什么 | 呼应"你说今天累，这首陪你放松" |
| DJ 换歌品味 | 不知用户喜欢什么 | "你喜欢的周杰伦风格" |
| DJ 三入口节奏 | 字数不一，像三个人 | 统一60-120字，一个人 |

---

*本方案基于三轮深度审计（前端性能/UI阻塞/DJ连贯性）的精确根因定位。三阶段独立，按"用户感知从强到弱"排序。执行者按阶段一→二→三顺序，每阶段验证。*
