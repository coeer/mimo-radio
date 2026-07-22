---
author: KIMI
task: F4 isPlaying 仲裁层——单点 playRequest 取代 12 处直写（方案规格，ZCode 已审修订版）
created: 2026-07-18
status: ZCode 已审（2026-07-18），规格修订版 → 执行者实现
basis: HANDOVER §五.1（Mavis 审计升级 P0）+ docs/reports/audit-2026-07-03-independent-Mavis.md §3
revision: 2026-07-18 ZCode 源码核实修订（基线数字 / 写点计数 / nextSong 两阶段 / 场景 1 裁决 / 新增场景 8）
---

# F4 isPlaying 仲裁层 任务规格

> **修订说明（ZCode 2026-07-18）**：本方案经 ZCode 源码核实后修订。修订项见各节 `[ZCode 修订]` 标记。执行者以本修订版为准，原始版已覆盖。

## 〇、写给执行者的话（前科提醒）

1. 本任务是**并发仲裁**，和 chat 防重入（b32ad68）、useTTS ttsAbortRef（批 2）同源——先读懂这两个已验证模式再动手。
2. **铁律 4 重点**：page.tsx 的 unlockAudio + djIntroToSong 链路（intro→onEnd→续播）是已验证流程，仲裁层必须**承接**它的语义，不是重写它。改之前先回答：原流程靠哪几个状态位保证"开场白前歌不响"？你的新代码保住了吗？
3. 所有终态列全（§四矩阵），只改 happy path 必出 B 批式无限轮询同类 bug。

## 〇、基线（ZCode 2026-07-18 实跑核实）

| 层 | 测试数 | 文件数 | tsc |
|----|--------|--------|-----|
| 后端 | **277 passed** | 32 | 零错误 |
| 前端 | **179 passed** | 23 | 零错误 |

> ⚠️ 验收以本数字为准。原方案误写 288/189，实跑为 277/179。

## 一、根因（不是现象）

`setIsPlaying` 在生产代码有 **12 个写点（8 处组件/hook 直写 + 4 处 store 内部写）** [ZCode 修订：原写"9 处直写"口径含糊，改为明确计数]：

### 1.1 组件/hook 直写（8 处，grep `setIsPlaying` 排除 .test 和 store 定义实证）

| 文件:行 | 场景 |
|---------|------|
| `app/page.tsx:98` | unlockAudio：DJ 开场白前 setIsPlaying(false) 双保险 |
| `app/page.tsx:104` | unlockAudio：无 intro 时 setIsPlaying(true) |
| `hooks/useAudioPlayer.ts:131` | autoplay 被浏览器拒绝 → setIsPlaying(false) 回落 |
| `hooks/useSession.ts:29` | DJ 说完（onEnd/onError）→ resumePlaybackAfterSpeak → setIsPlaying(true) |
| `hooks/useSession.ts:184` | chat 推荐新歌且（无 DJ 或无回复）→ setIsPlaying(true) |
| `components/PlanTimeline.tsx:62` | 时间轴点歌 → setIsPlaying(true) |
| `components/QueueList.tsx:22` | 队列点歌 → setIsPlaying(true) |
| `components/RecommendCardList.tsx:42` | 推荐卡点歌 → setIsPlaying(true) |

### 1.2 store 内部写（4 处）

| 文件:行 | 场景 |
|---------|------|
| `store/radioStore.ts:130` | `togglePlay`：`isPlaying: !s.isPlaying` |
| `store/radioStore.ts:257` | `prevSong`：`_set({ ..., isPlaying: true })` |
| `store/radioStore.ts:285,306` | `nextSong`：两处 `isPlaying: true`（队列推进 + 换歌完成）|
| `store/radioStore.ts:335` | 停止路径：`isPlaying: false` |

**问题**：这 12 个写点互不知道对方存在。竞态实例：
- DJ 说话中（isSpeaking=true，歌曲应暂停）用户点推荐卡 → setIsPlaying(true) → 双音轨
- 换歌中（isTransitioning=true）DJ onEnd 触发续播 → 旧歌续播半秒才切 → "旧歌复活"
- chat 连发：第一条回复的 speakAIMessage 与第二条回复的 setIsPlaying 交错（chatAbortRef 只管 fetch，管不到播放状态）
- **nextSong 自动切歌时旧 transition 的 TTS 还在播 → onEnd 触发 resumePlaybackAfterSpeak → 旧歌复活**（场景 8，原方案遗漏）

当前靠 React 批处理 + isTransitioning 守卫**碰巧**没出大事；ASR 语音输入上线后触发频率翻倍，概率变事故（Mavis §3 原判）。

## 二、设计：单点仲裁 `playRequest`

### 2.1 核心 API（radioStore 新增）

```ts
type PlaySource = 'user' | 'dj' | 'auto' | 'system'
type PlayAction = 'play' | 'pause' | 'toggle'

// store 新增（radioStore.ts）
playRequest: (action: PlayAction, source: PlaySource) => void
```

### 2.2 仲裁规则（优先级与锁）

| 规则 | 行为 |
|------|------|
| R1 用户优先 | source='user' 的请求立即生效，并清除 pending 的自动续播标记 |
| R2 transition 锁 | isTransitioning=true 时：user 请求生效（用户换台意图明确）；dj/auto 请求**丢弃**并记日志（不排队——排队的旧意图在新歌上执行就是"旧歌复活"） |
| R3 speaking 锁 | isSpeaking=true 时：play 请求（非 user）挂起为 `pendingResume=true`，由唯一出口（resumePlaybackAfterSpeak）消费；pause 请求立即生效 |
| R4 autoplay 回落 | useAudioPlayer 的 NotAllowedError 是唯一 source='system' 的 pause，立即生效 |
| R5 幂等 | 请求结果与当前 isPlaying 相同 → no-op（记 dev 日志，不产生 set） |

### 2.3 迁移映射（9 写点 → playRequest）

| 原写点 | 迁移为 |
|--------|--------|
| page.tsx:98 `setIsPlaying(false)` | `playRequest('pause', 'dj')` |
| page.tsx:104 `setIsPlaying(true)` | `playRequest('play', 'user')`（unlockAudio 由用户手势触发） |
| useAudioPlayer.ts:131 `setIsPlaying(false)` | `playRequest('pause', 'system')` |
| useSession.ts:29（resumePlaybackAfterSpeak） | 唯一消费 `pendingResume` 的出口；内部改 `playRequest('play', 'dj')` |
| useSession.ts:184 `setIsPlaying(true)` | `playRequest('play', 'auto')` |
| PlanTimeline/QueueList/RecommendCardList 点歌 | `playRequest('play', 'user')` |
| togglePlay（store:130） | 内部改走 playRequest('toggle', 'user') |
| nextSong/prevSong（store:257/306） | 换歌流程内部置位，经 playRequest('play', 'auto') 仲裁 |

`setIsPlaying` 保留为 store **私有**（加注释"禁止组件直写，见 playRequest"），不删（测试大量在用）。

## 三、改法（文件:行 + 代码）

1. `store/radioStore.ts`：
   - state 新增 `pendingResume: boolean`（默认 false，不持久化——partialize 不动）
   - 新增 `playRequest` 实现（§2.2 五条规则，约 40 行）
   - `togglePlay`/`nextSong`/`prevSong` 内部改走 playRequest
   - `setIsPlaying` 注释标注私有

   **[ZCode 修订] §3.1 nextSong/prevSong 两阶段改法（原方案遗漏的语义推演）**：
   `nextSong`/`prevSong` 当前是一步原子 `_set({ currentSong, currentTime:0, isPlaying:true })`。改成走 playRequest 后，必须拆为**两阶段**，否则循环依赖或仲裁失效：

   ```ts
   // nextSong 改法（prevSong 同理）：
   nextSong: () => {
     const s = get()
     const next = /* 选下一首 */
     // 阶段 1：只切歌，不碰 isPlaying
     _set({ currentSong: next, currentTime: 0 }, false, 'radio/nextSong')
     // 阶段 2：经仲裁决定是否播放
     get().playRequest('play', 'auto')
   }
   ```

   **两阶段原子性说明**：阶段 1 和阶段 2 不是原子操作（中间可能被其他 set 插入）。但这是**可接受的**——因为：
   - 若两阶段之间 user 点了 pause，阶段 2 的 auto play 经 R1（用户优先）会被 R5 幂等合并或被 user pause 覆盖
   - 若两阶段之间处于 transition，阶段 2 经 R2 丢弃（符合"换歌中不该自动续播"）
   - currentSong 已变但 isPlaying=false 的中间态 → UI 显示"新歌名 + 暂停态"，不会"旧歌复活"（isPlaying=false 音频停止）

   **边界**：nextSong/prevSong 改完后，必须保证 `_set currentSong` 与 `playRequest` 之间没有其他代码路径会直接写 `isPlaying`（grep 确认 store 内只剩 playRequest 和私有 setIsPlaying）。

2. `app/page.tsx:98,104`：两处直写 → playRequest（按 §2.3 映射）
3. `hooks/useAudioPlayer.ts:131`：→ `playRequest('pause', 'system')`
4. `hooks/useSession.ts`：resumePlaybackAfterSpeak 改唯一出口（消费 pendingResume）；:184 → playRequest('play','auto')
5. `components/PlanTimeline.tsx:62` / `QueueList.tsx:22` / `RecommendCardList.tsx:42`：→ playRequest('play','user')

**边界（不要动）**：isSpeaking/isTransitioning 自身语义；djIntroToSong 测试流程；useTTS/useAudioPlayer 的 ref 模式（批 2 刚验证）；partialize 持久化字段。

## 四、所有终态（验收矩阵，执行者必须逐条自测）

| # | 场景 | 预期 |
|---|------|------|
| 1 | DJ 说话中点推荐卡（user play） | **[ZCode 裁决] 歌曲播放（用户优先），DJ 继续说完。** 理由：单用户应用，用户主动点歌 = 明确想听；DJ 串词是附加体验不能盖过用户操作；现状双音轨是 bug，新方案选"放歌+DJ 继续说"比"DJ 锁 user play"更符合直觉。技术实现：`playRequest('play','user')` 在 `isSpeaking=true` 时立即置 isPlaying=true，不挂 pendingResume；DJ onEnd 时 resumePlaybackAfterSpeak 检查 isPlaying 已 true → no-op（幂等）|
| 2 | DJ 说话中 chat 推荐触发 auto play | pendingResume=true，歌不响；DJ 说完唯一出口续播 |
| 3 | 换歌中（transition）DJ onEnd 续播 | 丢弃 + 日志，无旧歌复活 |
| 4 | 换歌中用户点播放 | 生效（用户意图 = 听当前这首歌） |
| 5 | autoplay 被拒 | system pause 生效，UI 显示暂停态 |
| 6 | 重复 play 请求 | no-op，无多余 set |
| 7 | intro 流程（已验证链路） | unlockAudio → intro → onEnd → 续播第一首，不回归 |
| 8 | **[ZCode 新增] nextSong 自动切歌时旧 transition TTS 还在播 → onEnd** | 仲裁丢弃旧 transition 的续播请求，无旧歌复活。这是 §一第三条竞态实例的单测对应，原方案遗漏 |

## 五、验证标准

- 新增 `radioStore.playRequest.test.ts`：覆盖 §四 矩阵 **1-8**（store 级单测，jsdom）[ZCode 修订：原写 1-6，补场景 7、8]
- 既有测试全绿（**基线 277/179 不可降级**），特别是 `djIntroToSong.test.ts` / `djIntroToSong.e2e.test.ts`（场景 7）
- tsc 双零
- E2E（铁律 5）：连发 2 条 chat + 快速换歌 + DJ 串词，DOM 观察无双 PLAYING 错乱、无旧歌复活；证据写进执行报告

## 六、风险与回滚

- 风险：unlockAudio/intro 链路回归（最高危）→ 场景 7 测试 + E2E 双保险
- 回滚：单 commit，revert 即恢复直写（行为等价于现状）

---

*方案由 KIMI 生成。*
