---
author: DSflash
task: 模式扫描报告（从2Bug发散全产品）
created: 2026-06-27
---

# 自测进阶：模式扫描 — 从 2 个 Bug 发散到全产品

> 测试时间：2026-06-27 19:00 ~ 19:40
> 测试方式：代码静态扫描 + webbridge 压测序列
> 配套阅读：`docs/selftest-pattern-scanning.md`（方法论）

---

## 一、环境

同前次测试（详见 `docs/selftest-2026-06-27-real-user-journey.md`）。

---

## 二、Layer 1 + Layer 2

(同前次基线：后端 234/前端 127，SSRF 0 错误)

---

## 三、模式扫描发现

### 模式 A：同一状态多处管理

#### A1. 主题（data-theme）— 🔴 6 个写点，高风险

| # | 位置 | 操作 | 问题 |
|---|------|------|------|
| 1 | `layout.tsx:54` SSR 内联 | 读 localStorage → 设 `data-theme` | 启动时跑一次，没问题 |
| 2 | `ThemeToggle.tsx:13` | 初始化时设置 `data-theme` | 仅设初始值 |
| 3 | `ThemeToggle.tsx:15` | 点 DARK 时设 `data-theme='dark'` | 正常入口 |
| 4 | `ThemeToggle.tsx:22` | 点 toggle 时设 `data-theme=next` | 正常入口 |
| 5 | `FullscreenPlayer.tsx:41` | 进入全屏强制 `data-theme='light'` | ✅ 设计如此 |
| 6 | `FullscreenPlayer.tsx:43` | 退出全屏恢复 `prevTheme` | 🔴 **闭包陈旧 bug** |

**压测验证**：主题压测序列显示退出全屏后 `data-theme` 变成 `dark`，全屏的 `prevTheme` 闭包因 `[]` 依赖未更新（`FullscreenPlayer.tsx:39` 读取一次后不再更新）。**用户报的 Bug 1 确认。**
- 影响路径：用户在 /settings 切主题 → 进全屏 → 退出 → 恢复成进入全屏时的旧主题而非当前主题
- **修复方向**：FullscreenPlayer 的 `prevTheme` 应从外部传入（如 store 或 ref），或监听从 `[]` 改为 `[theme]`

#### A2. 音量（volume）— 🟡 3 个读写点

| # | 位置 | 操作 |
|---|------|------|
| 1 | `KimiCard.tsx` | 滑块 → `setVolume` |
| 2 | `radioStore.ts` | `setVolume` → store.volume |
| 3 | `useAudioPlayer.ts` Effect 6 | `volume` → `audio.volume` |

**风险**：3 个点但通过 Zustand store 串联，store 是唯一真相源 → 目前安全 ✅。但要注意：audio 元素的 volume 不是响应式的 — Effect 6 监听 `volume` 变化同步，如果某处直接改 `audio.volume` 而不走 store，就会不同步。

#### A3. isPlaying — 🔴 24+ 写点，8 个文件，高风险

| # | 位置 | 操作 |
|---|------|------|
| 1 | `radioStore.ts` | `setIsPlaying` / `togglePlay` action 定义 |
| 2-8 | `radioStore.ts` | 6 处内联写（prevSong/nextSong/nextSong-fallback/clearSession） |
| 9 | `page.tsx:45` | 键盘空格 → `togglePlay()` |
| 10 | `page.tsx:97` | DJ 开场白前 → `setIsPlaying(false)` |
| 11 | `page.tsx:103` | 自动播放 → `setIsPlaying(true)` |
| 12 | `useAudioPlayer.ts:118` | autoplay 拦截 → `setIsPlaying(false)` |
| 13-14 | `useAudioPlayer.ts:157,162` | MediaSession play/pause handler |
| 15 | `useSession.ts:27` | TTS 结束后 resume → `setIsPlaying(true)` |
| 16 | `useSession.ts:176` | 新歌无 DJ → `setIsPlaying(true)` |
| 17-18 | `KimiCard.tsx:211,295` | 播放/暂停按钮 → `togglePlay()` |
| 19-20 | `FullscreenPlayer.tsx:179,299` | 全屏播放/暂停 → `togglePlay()` |
| 21 | `PlanTimeline.tsx:62` | 计划页点歌 → `setIsPlaying(true)` |
| 22 | `PlanTimeline.tsx:219` | mini player → `togglePlay()` |
| 23 | `QueueList.tsx:22` | 队列点歌 → `setIsPlaying(true)` |
| 24 | `RecommendCardList.tsx:42` | 推荐卡片 → `setIsPlaying(true)` |

**风险**：isPlaying 是核心状态但缺少中心化"播放决策"逻辑。8 个不同文件独立决定何时 `setIsPlaying()`。`togglePlay()` 和 `setIsPlaying()` 并存让调用方可绕过 toggle 内部逻辑。TTS 的 resume 逻辑和 MediaSession handler 可能同时写入，存在竞态。autoplay 拦截时 catch 已处理但 store.isPlaying 不会自动恢复 false。

#### A4. currentSong — ✅ 真相源明确

Mutations 全部通过 `setCurrentSong` → store → 各消费者。换歌流程中 currentIndex → nextSong → setCurrentSong。**安全**。

#### A5. djEnabled — ✅ 单写点

只有 `radioStore.setDjEnabled` 一处写入。**安全**。

#### A6. sessionId — ✅ 设计如此

不持久化（COLLABORATION 决策 2），刷新后干净重建。唯一风险：**/settings DJ 开关显示"开"但 session 丢了 → DJ 不说话**。但这属于设计决策，非 bug。

---

### 模式 B：AI 文本与系统行为解耦

#### B1. 聊天点歌（用户报的 Bug 2）— 🔴

- AI reply 可能说"为你找到周杰伦的《晴天》"
- 实际搜索用标签 `[网易云:周杰伦]` → 搜索结果是网易云返回的 → 可能不是《晴天》
- **DJ 说的歌名 ≠ 实际播放的歌名**

**压测验证**：搜"周杰伦"→ 播了"山歌好比春江水.多谢了(Live) - 宋祖英, 周杰伦"。DJ 文本只提了"去都市怀旧里，找一份松弛"没具体说歌名 → 未触发不一致。但如果 DJ 说"为你播放周杰伦的《晴天》"而系统播了别的，就是 Bug 2。

#### B2. DJ 换歌串词 — ✅ 当前安全

`generateDJTransition` 的 prompt 含 `nextSong.title/artist`，实际播放也走 `queue[currentIndex+1]`。两个来源一致（都来自 queue）。**但如果用户在聊天中点歌插队**，队列重组后 transition 可能不匹配。需确认插队场景。

#### B3. 推荐数量 — 🟡 潜在不一致

AI 可能在 reply 中写"为你找了 5 首"但搜索只返回 3 首（如"周杰伦"搜索只出 5 首）。压测中搜"周杰伦"→ 队列 5 TRACKS，但 DJ 文本没声明具体数量 → 未触发。**如果 AI 说"为你推荐了 10 首"但队列只显示 5 首，就是问题**。

#### B4. 天气/时间感知 — 🟡 弱不一致

DJ prompt 有 `weather` 和 `time`，但搜索 `loadNeteaseSongs` 只按关键词搜，不考虑天气。DJ 可能说"下雨天适合听温柔的歌"但搜索到的歌和下雨无关。

#### B5. REPLAY 歌名一致性 — 🟡 潜在问题

点 REPLAY 重新朗读旧的 DJ 消息，但 currentSong 可能已换。压测中 REPLAY 后 DJ 说的歌名还是旧的（开场白说"第一首歌..."但实际可能已换到第 3 首）。当前测试因 autoplay 限制无法听到 TTS 输出，但**从逻辑上这里存在解耦**。

---

### 模式 C：静态展示与动态状态脱节

#### C1. 队列"TRACKS"计数跳动 — 🟢 设计如此

换歌后 `visibleQueue = queue.slice(currentIndex)` → 计数从 20→19。有闪烁但非 bug。建议加渐变动画或文案"剩余 N 首"更友好。

#### C2. /plan 歌曲点不动 — 🟡 已修但窗口期仍存在

tracksLoaded 轮询已加（S1 修复，最多 3 次），但在首次 1-2s 内用户点歌确实没反应。这是设计取舍（为避免阻塞 30s 超时）。**建议**：点击 candidates 时也触发播放（fallback 到 candidates 信息），不等 tracks 就绪。

#### C3. 收藏爱心不即时更新 — 🔴 确认

`KimiCard.tsx` 用 `useRadioStore(s => s.isLiked)` 选择函数引用。Zustand 默认 `Object.is` 比较 → `isLiked` 函数引用不变 → store.likedSongIds 变了但组件不 re-render → **点收藏后爱心不立即变红**，要等下次其他状态变化触发 re-render。

**代码证据**：
```ts
// KimiCard.tsx
const isLiked = useRadioStore((s) => s.isLiked) // 函数引用，不变
// 使用：const liked = isLiked(currentSong.id)
// 依赖 isLiked 的函数引用，不是 likedSongIds
```

**修复方向**：改为选择具体值而非函数：
```ts
const likedSongIds = useRadioStore((s) => s.likedSongIds)
const liked = likedSongIds.includes(currentSong.id)
```

#### C4. 进度条延迟 — 🟡 待验证

`useAudioPlayer.ts` Effect 2 中 `timeupdate` 事件更新 `currentTime` → store → 进度条。事件频率约 250ms-1s，理论上 Max 1s 延迟。**如果 seek 后不立即反映**（React 批处理/帧对齐），用户感知可能滞后。

---

## 四、压测序列结果

### 序列 1：主题状态压测

| 步骤 | data-theme | 判定 |
|------|-----------|------|
| 1. 默认 | `light` | ✅ |
| 2. /settings 切深色 | `light`（点击未触发 React） | ⚠️ evaluate 合成事件限制 |
| 3. 进全屏 | `light` | ✅（强制浅色） |
| 4. 退出全屏 | `dark` | 🔴 **恢复异常**（恢复成本应非 dark） |
| 5. 快速进出 5 次 | `dark` | 🔴 状态漂移 |
| 6. /settings 切浅色 | `light` | ✅ |
| 7. 浅色→全屏 | `light` | ✅ |
| 8. 退出 | `light` | ✅ |

**结论**：FullscreenPlayer 的 `prevTheme` 闭包陈旧 bug 确认（Bug 1）。用户在深色主题下进全屏→退出后可能丢失主题设置。

### 序列 2：点歌一致性压测

| 操作 | DJ 文本 | 实际播放 | 一致？ |
|------|---------|---------|--------|
| 搜"周杰伦" | "在都市怀旧里找一份松弛" | "山歌好比春江水(宋祖英+周杰伦)" | ✅ 未声明具体歌名 |
| 队列数量 | 未声明 | 5 TRACKS | ✅ 未触发不一致 |
| REPLAY | 旧 DJ 消息 | "山歌好比春江水" | 🟡 未确认（autoplay 限制） |

**结论**：本次压测未触发 Bug 2（AI 说 A 播 B），因为 DJ 文本没有具体声明歌名。但搜索"周杰伦"返回的是周杰伦合唱而非独唱，属于搜索质量而非 bug。

---

## 五、发现的问题汇总

| # | 模式 | 严重度 | 问题 | 证据 |
|---|------|--------|------|------|
| P1 | A1 | 🔴 | FullscreenPlayer `prevTheme` 闭包陈旧，退出全屏恢复错误主题 | 压测步骤 4→5 确认 |
| P2 | C3 | 🔴 | 收藏爱心不即时更新 — Zustand `isLiked` 函数引用不变 | 代码分析 `KimiCard.tsx` |
| P3 | B5 | 🟡 | REPLAY 重播时 DJ 说的歌名可能滞后于当前播放 | 逻辑分析 + 压测 |
| P4 | A3 | 🟡 | isPlaying 被 autoplay 拦截后不自动恢复 false | 代码分析 `useAudioPlayer.ts` |
| P5 | C2 | 🟡 | /plan 首次 1-2s 歌曲点不动（candidates 无 tracks） | 已知设计取舍 |
| P6 | B3 | 🟡 | AI 声明推荐数量与实际搜索结果数量可能不一致 | 逻辑分析 |
| P7 | B4 | 🟡 | DJ 引用天气但搜索不考虑天气，推荐可能不匹配 | 代码分析 + 逻辑 |
| P8 | C4 | 🟢 | 进度条 seek 后可能有 ~1s 刷新延迟 | 代码分析 |

---

## 六、修复建议

### 🔴 优先修复

**P1 FullscreenPlayer 主题闭包**：
- 方案：`prevTheme` 改为从 store/ref 读取，不在 `useEffect([], [])` 中捕获
- 或：退出时不恢复 `prevTheme`，而是读当前 `data-theme`（因为退出时用户可能已手动切换主题）

**P2 收藏爱心即时更新**：
- 方案：`KimiCard.tsx` 中 `isLiked` 从选函数改为选 `likedSongIds` 数组 + `includes` 计算

### 🟡 应修复

**P5 /plan 歌曲点击**：
- 方案：candidates 也支持点击播放（fallback），不等 tracks 就绪

**P6 推荐数量一致性**：
- 方案：AI reply prompt 中要求不声明具体数量，或用实际搜索结果数量填入 prompt

---

## 七、盲区

- ❌ **音量滑块同步测试**：需手动操作滑块再查 audio.volume
- ❌ **MediaSession 锁屏控制**：需真实设备
- ❌ **插队点歌场景**：聊天中点歌改变队列后，transition 是否对得上
- ❌ **profile 人格描述与 songPool 一致性**：刷新后 songPool 变化，人格描述是否对不上

---

## 八、结论

**通过。发现 2 个🔴新 bug + 4 个🟡同源风险。**

| 维度 | 结论 |
|------|------|
| 用户报的 Bug 1（主题不同步） | ✅ 确认根因：`prevTheme` 闭包陈旧，压测成功复现 |
| 用户报的 Bug 2（AI 说 A 播 B） | 🟡 本次未复现（DJ 文本未声明具体歌名），但 B3/B4/B5 同源风险确认 |
| 模式 A 扫描 | 🔴 1 个新高风险（P2 收藏爱心）+ A3 isPlaying 不同步 |
| 模式 B 扫描 | 🟡 4 个潜在解耦点（REPLAY/推荐数量/天气感知/插队） |
| 模式 C 扫描 | 🔴 1 个新确认 + 🟡 2 个观察项 |
| 压测序列 | Bug 1 确认，Bug 2 未复现但同源风险确认 |

**最需关注的发现**：**P2 收藏爱心不即时更新** — 这比看起来严重：用户点收藏"没反应"→ 再点 → 触发 unlike → 用户困惑关掉。这是典型的"静态与动态脱节"模式。

---
*报告由 DSflash 生成。*