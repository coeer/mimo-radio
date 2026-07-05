---
author: Mavis
role: 规划者视角独立复审（与同日 MiNiMax 执行者视角审计有意互补）
created: 2026-07-03
---

# MiMo AI Radio — 规划者视角独立审计

> **与同日 `docs/MiNiMax/audits/audit-mimoradio-2026-07-03-MiNiMax.md` 的关系**：
> 我不是重复那份工作。我的切入角度是有意补不同的 —— **MiNiMax 聚焦安全态势 + 5 月版对照 + 中间件链**；本报告聚焦 **AI 业务逻辑深度、状态架构债、错误恢复路径、性能与重渲染、TypeScript 类型安全**。两份叠加才是项目全景。
>
> 共同遵守 COLLABORATION.md §10.1 的"零修改"约定：本报告只读代码，未触碰任何业务文件。

---

## 📌 TL;DR（执行摘要）

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟢 通过（修复 F4 + 1 个 P1 后可生产） |
| 严重度分布（本报告新发现） | 🔴 1 / 🟠 4 / 🟡 6 / 🟢 5 |
| 测试基线实测 | 后端 **253/253**（2.20s）/ 前端 **127/127**（5.90s，含 canvas not-implemented warnings 但不影响通过率） |
| 与 MiNiMax 互不重复 | 16 类决策债 + 5 类代码债 |
| 关键行动项 | 1 条 P0（架构）+ 4 条 P1（业务）+ 6 条 P2（工程） |

**最值得拎出来的一句话**：F4 isPlaying 仲裁层缺失 **不再只是"已落债暂缓"** —— 我数了 8 个文件 20+ 写点，**只靠 React 批处理兜底随时可能崩**。这是当前最值得动手的。

---

## § 1 与 MiNiMax 报告的差异化定位（我刻意没复制的角度）

| MiNiMax 已覆盖 | 本报告不重复 |
|------|------|
| API 认证 / SSRF / Prompt 注入三层防御 | ✅ 跳过 |
| 5 月版 → 当前状态对比（10 项） | ✅ 跳过 |
| 中间件链（helmet + compression + cors + 限流 + timeout） | ✅ 跳过 |
| 与 COLLABORATION.md 测试基线核对 | ✅ 简略复核 |
| ASR/Image 1MB 限制 P1（与全局 1MB 冲突） | ✅ 已记录到 §6 |
| 已知 P2（SIGTERM / ARCHITECTURE 文档 / CI / session_token query） | ✅ 已记录到 §6 |

**我的新视角**：

1. **AI 业务逻辑** —— prompt 设计、JSON 解析边界、记忆注入策略
2. **状态架构债** —— F4 isPlaying 仲裁、多切片耦合、状态写入路径数
3. **错误恢复路径** —— 用户感知、链路一致性、silent swallow
4. **性能工程债** —— 长会话行为、不必要的 DB 询、O(n²) 数组操作
5. **TypeScript 类型安全** —— `as any` 系统性、可收紧点
6. **测试质量** —— canvas jsdom warning、覆盖率断点

---

## § 2 严重度与发现汇总（**本报告新发现，不与 MiNiMax 重复**）

| 级别 | 发现 | 位置 |
|------|------|------|
| 🔴 P0 | F4 isPlaying 状态仲裁缺失（已不再"暂缓"） | 见 §3 |
| 🟠 P1.1 | AI chat JSON 兜底语义反人类 | `backend/src/services/mimo.ts:142-144` |
| 🟠 P1.2 | 错误日志 String(err) 漏改（8 处） | 见 §4.2 表 |
| 🟠 P1.3 | AI prompt 重复样板（4 处） | 见 §4.3 |
| 🟠 P1.4 | `/chat` 无取消机制 + 用户可连点 | `frontend/src/hooks/useSession.ts:137-189` |
| 🟡 P2.1 | 每次 chat 都查 liked/disliked DB | `backend/src/routes/radio.ts:223, 355` |
| 🟡 P2.2 | `addMessage` 数组 O(n²) 复制 | `frontend/src/store/radioStore.ts:188-193` |
| 🟡 P2.3 | chat system prompt 体积每次全量 | `backend/src/routes/radio.ts:365-398` |
| 🟡 P2.4 | page.tsx 播放编排 effect 时序混淆 | `frontend/src/app/page.tsx:91-105` |
| 🟡 P2.5 | DJ TTS mp3 不缓存（生成浪费） | `backend/src/routes/dj.ts:80-125` |
| 🟡 P2.6 | `req as any` 系统性（生产代码 5 处） | 见 §4.6 表 |
| 🟢 P3.1 | 反应堆 MediaSession strict mode 中间帧空 handler | `frontend/src/hooks/useAudioPlayer.ts:151-197` |
| 🟢 P3.2 | useAudioPlayer 卸载未清 store 播放态 | `useAudioPlayer.ts:215-226` |
| 🟢 P3.3 | persona 文件路径硬编码 `__dirname/../../data/` | `backend/src/services/djPersona.ts:40` |
| 🟢 P3.4 | jest/jsdom 不支持 canvas（AudioWaveform 测试盲区） | `frontend/src/components/AudioWaveform.tsx` |
| 🟢 P3.5 | reason 字段存储但不进 prompt（埋点残缺） | `backend/src/db/index.ts:113` |

---

## § 3 🔴 P0：F4 isPlaying 状态仲裁缺失（不再只是"暂缓"）

### 证据（8 个文件 20+ 写点）

我数了一遍，比 HANDOVER 说的"24+ 处"**收敛后仍有 20 处分散写入**：

| 文件:行号 | 写点 | 触发场景 |
|-----------|------|---------|
| `frontend/src/store/radioStore.ts:127` | `togglePlay` | 用户点 ▶⏸ 按钮 |
| `frontend/src/store/radioStore.ts:128` | `setIsPlaying` | 通用底层 |
| `frontend/src/hooks/useAudioPlayer.ts:118` | `s.setIsPlaying(false)` | NotAllowedError 兜底 |
| `frontend/src/hooks/useAudioPlayer.ts:157` | `setIsPlaying(true)` | MediaSession play action |
| `frontend/src/hooks/useAudioPlayer.ts:162` | `setIsPlaying(false)` | MediaSession pause action |
| `frontend/src/app/page.tsx:45` | `togglePlay` | Space 键 |
| `frontend/src/app/page.tsx:97` | `s.setIsPlaying(false)` | P1 修复双保险 |
| `frontend/src/app/page.tsx:103` | `s.setIsPlaying(true)` | 播放编排 effect |
| `frontend/src/hooks/useSession.ts:27` | `s.setIsPlaying(true)` | TTS end 续播 |
| `frontend/src/hooks/useSession.ts:176` | `s.setIsPlaying(true)` | chat 回复续播 |
| `frontend/src/hooks/useSession.ts:99-103` | **注释禁止** | 但代码内部仍可能误触 |
| `frontend/src/components/FullscreenPlayer.tsx:258, 310` | `togglePlay` | 全屏按钮 |
| `frontend/src/components/KimiCard.tsx:268, 308` | `togglePlay` | 主卡片按钮 |
| `frontend/src/components/PlanTimeline.tsx:62, 219` | `setIsPlaying(true)` / `togglePlay` | 时间轴点击 |
| `frontend/src/components/RecommendCardList.tsx:42` | `setIsPlaying(true)` | 推荐卡片 |
| `frontend/src/components/QueueList.tsx:22` | `setIsPlaying(true)` | 队列点击 |

加上 `useAudioPlayer.ts:100` 在 `isSpeaking` 时**只调 `audio.pause()` 不动 `isPlaying`** —— **isPlaying 和 audio 真实状态在 isSpeaking 期间完全脱钩**，续播才能合上。

### 触发场景（哪些边界最容易翻车）

1. **用户按锁屏 MediaSession 暂停 + 立即按页面 ▶ 按钮**：两次写入 5ms 内，React 批处理不一定 combine，状态可能进入 `isPlaying=true` 但 audio 还在 pause。
2. **DJ 说话过程中用户点 ▶**：isSpeaking + isPlaying=true 同时为真。audio.pause() 优先于 audio.play()，但 timing 在 Edge / Safari 上未必稳定。
3. **`page.tsx:91` 播放编排 effect**：依赖 `[audioUnlocked, introScript, introPlayed, speakAIMessage]`，**没监听 isPlaying 也不监听 currentSong**。当 `setIntroPlayed(true)` 让 effect 重跑，第二次进入分支判断 `s.isPlaying` 已经第一次被改过，整个 if/else 链不再幂等。**实际可能重复触发 setIsPlaying(true)**。
4. **Next.js 路由切换**：`useAudioPlayer` 在 /profile /plan /settings 卸载，`useEffect` 只清 audioRef，不重置 `isPlaying`。切回来 KimiCard 的 ▶ 状态仍是上一次结果。

### 影响

- **当前没出过大事故靠两件事**：React 18 批处理 + Zustand 异步更新 + 浏览器 audio.play() 默认返回的 Promise 内部 pool
- **触发概率在上升**：MediaSession 锁屏控制（已上）、ASR 真实设备调试（待上）、QQ 音源 playUrl 异步（已上）—— 三者都依赖严格的 isPlaying 仲裁
- 一旦因竞态出现"应播不播 / 应停不停"，传统 bug 报告里会很难复现，且**会被 React 重渲染时机掩盖**

### 建议改法（写给规划者参考，不在本次动手）

引入 `playController` 中间层（可放在 `frontend/src/store/playController.ts`）：

```ts
type PlayAction =
  | { type: 'USER_TOGGLE' }
  | { type: 'USER_SEEK'; time: number }
  | { type: 'AUDIO_ENDED' }
  | { type: 'MEDIA_SESSION_PLAY' | 'MEDIA_SESSION_PAUSE' }
  | { type: 'DJ_SPEAKING_START' | 'DJ_SPEAKING_END' }
  | { type: 'QUEUE_NEXT' }
  | { type: 'ROUTE_LEAVE' }

// 单点 reducer：当前 song + audio 状态 + DJ 状态 → 唯一 next isPlaying
function reduce(target: boolean, audio: HTMLAudioElement | null): () => Promise<void> {
  if (!audio) return async () => {}
  return async () => {
    try {
      target ? await audio.play() : audio.pause()
    } catch (e) { /* 统一捕获，标准 NotAllowedError 提示 */ }
  }
}
```

所有写点 → `playController.dispatch(action)` → reducer 算一次 → 一次 setIsPlaying + 一次 audio 调用。

### 验证方法（改造后）

1. `cd frontend && npx tsc --noEmit && npx vitest run` 仍 127/127 通过
2. 新增 `playController.test.ts`：枚举 8 个 action 组合的 (当前状态, action) → (期望 isPlaying, 期望 audio 命令)
3. 浏览器实测：锁屏暂停 → 解锁开页面，KimiCard 显示与 audio 真实状态严格一致

### 不做这个的代价

- HANDOVER §5 已经记录"暂缓触发"
- 当前没可复现 bug，**但 MediaSession + ASR 上线后会爆**
- 建议在"准备上线前"做（不是现在），但**第一次遇到锁屏/耳机控制异常再动将非常疼**（已踩过 FullscreenPlayer 闭包回归的坑）

### 边界

- 不要顺手改 store 各 slice 的 owner
- 不要改 audio.play()/pause() 顺序（"DJ 说话时音乐暂停" 是预期）
- 不要动 MediaSession metadata 更新逻辑

---

## § 4 🟠 P1（4 个，影响核心体验或工程一致性）

### § 4.1 P1.1：AI chat JSON 兜底语义反人类

**位置**：`backend/src/services/mimo.ts:135-144`

```ts
try {
  const json = JSON.parse(response.replace(/```json\n?|\n?```/g, ''))
  return {
    mood: typeof json.mood === 'string' ? json.mood : userInput,
    genres: Array.isArray(json.genres) ? json.genres : [],
    ...
  }
} catch {
  return { mood: userInput, genres: [], energy: 'medium', reason: response.slice(0, 50) }
}
```

**问题**：
1. **`mood: userInput` 兜底**：用户输入"我想听安静的爵士" → JSON 解析失败 → mood = "我想听安静的爵士" → 喂给 `filterByMood(songs, "我想听安静的爵士")`（`engine.ts:104`），用 `s.emotionTags.some(t => t.toLowerCase().includes(lowerMood))` 子串匹配 → **若任何歌曲有"安静"标签会意外命中**。结果：**用户说 A，推荐出 B 的标签 B 的歌**。
2. **JSON 正则脆弱**：`replace(/```json\n?|\n?```/g, '')` 不处理大小写（`\`\`\`JSON`）、单反引号、多段嵌套。有 `extractJsonObject`（`utils/extractJson.ts:13`，合理用 lastIndexOf 防 ReDoS），但 mimo.ts 没复用。
3. **`reason: response.slice(0, 50)` 兜底**：用前 50 字 AI 输出当推荐理由。若 AI 在 JSON 块之前写了普通解释，这 50 字会被广播给前端。

**触发场景**：模型偶发换格式 / 用单反引号包裹 / 输出多段嵌套。LLM 实际有 5-15% 概率输出非严格 JSON。

**建议改法**：
- 复用 `extractJsonObject`（已存在）
- 解析失败的 mood 兜底用 `'随机'` 或 `'放松'`（中性），**不要 userInput**
- 失败统一返回 `null` 让上层决策

**验证**：写 `mimo.test.ts` 用 mock fetch 返回 `` ```JSON\n{"mood":"x","genres":[]}\n``` `` 断言能解出 JSON；同时返回纯文本断言 mood 是 `'随机'` 不是 userInput。

---

### § 4.2 P1.2：错误日志 `String(err)` 漏改（8 处）

HANDOVER §II/2.B 说"10 个 services 已统一 `toErrorMeta`"。我 grep 全工程后**确实 routes/utils/services 仍有 8 处使用 `String(err)` 或 `String(reason)`**（不含测试文件）：

| 文件:行号 | 当前形态 | 建议改 |
|-----------|---------|--------|
| `backend/src/routes/radio.ts:114` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/routes/radio.ts:319` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/routes/radio.ts:444` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/routes/radio.ts:460` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/index.ts:189` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/index.ts:200` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/index.ts:208` | `error: err.stack \|\| String(err)` | `...toErrorMeta(err)` |
| `backend/src/index.ts:212` | `reason: String(reason)` | `...toErrorMeta(reason)` |
| `backend/src/routes/schedule.ts:56` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/utils/fileCleanup.ts:78` | `error: String(err)` | `...toErrorMeta(err)` |
| `backend/src/db/index.ts:113` | `error: err instanceof Error ? err.message : String(err)` | `...toErrorMeta(err)` |

注：grep 显示 11 处，但部分被 if/includes 重复计数。**实际 ≥ 9 处漏改**。

**影响**：logger.toErrorMeta 在 `backend/src/utils/logger.ts:189` 已存在并被声明为"解决业务 catch 里 String(err) 丢失堆栈的问题"。**没用它 = 堆栈信息不全，出问题时排查更难**。

**建议改法**：机械扫描 ESLint 规则禁止 `String(err)` / `String(reason)` 出现在 catch 分支；或在 logger.ts 加 `error: string | unknown` 的归一化函数 `toErrMeta(err)` 让所有 catch 都过它。

**边界**：不动 `String(err)` 出现在非 catch 路径的合法用法。

---

### § 4.3 P1.3：AI prompt 重复样板（4 处）

**问题**：`personaBlock + tasteBlock + memoryBlock` 这三段在 4 个地方独立拼接：

| 位置 | 串成方式 |
|------|---------|
| `backend/src/services/mimo.ts:106-130` (`generateRecommendationStrategy`) | 手拼 user prompt |
| `backend/src/services/mimo.ts:147-183` (`generateDJTransition`) | system: persona / user: prompt + memorySection |
| `backend/src/services/mimo.ts:185-203` (`generateIntro`) | system: persona / user: prompt |
| `backend/src/routes/radio.ts:365-398` (chat) | 整段 systemPrompt，persona + 关键词高亮规则 + taste + chatMemory + 推荐规则 + 时段/天气 |

**影响**：
- 改 persona 要改 3 处 + chat（4）
- 改"关键词高亮"规则只在 chat 有，DJ 串词另写一套 → 风格漂移
- 改 tasteBlock 字数限制（3 → 5），要在 transition 和 chat 各改一次 → 已踩过

**建议改法**：在 `services/djPersona.ts` 加 `composeSystemPrompt(intent: 'intro' | 'transition' | 'chat' | 'recommend', extras)`，所有调用点统一走它。

**边界**：保持向后兼容 chat 的"60-120字 + 关键词 1-3 处"等具体字数规则；不擅自收紧。

---

### § 4.4 P1.4：`/chat` 无取消机制 + 用户可连点

**位置**：`frontend/src/hooks/useSession.ts:137-189`

```ts
const sendChatMessage = useCallback(async (text) => {
  ...
  s.setIsCreating(true)
  s.addMessage({ sender: 'kimi', text: '', timestamp: 0, isPending: true })
  try {
    const res = await fetch(`${API_BASE}/api/v1/radio/${sid}/chat`, {
      method: 'POST',
      ...
    })
    ...
    s.updateLastKimiMessage(data.reply, { ... })
    ...
  } catch (err) {
    s.updateLastKimiMessage('网络有点卡，稍后再聊。', { isPending: false })
  } finally {
    s.setIsCreating(false)
  }
}, [...])
```

**问题**：
1. 用户连发 "你懂什么是孤独吗" / "想听一首孤独的歌" / "什么歌都行" 三条：
   - 三次 `setIsCreating(true)` + 三个 pending message
   - 三次 fetch 同时飞行
   - 三个 AI 回复几乎同时到
   - `updateLastKimiMessage` 只更新**最后一条** kimi（`radioStore.ts:198-212` 用 `[...s.messages].reverse().findIndex`）
   - 前两个 AI 回复**丢失但不告知用户**，token 已消耗
2. 没有 AbortController，前端无 cancel 入口（UI 也无 cancel 按钮）
3. `page.tsx:141` `handleSend` 用 `if (!inputText.trim() || isCreating) return` 守卫，**但 sendChatMessage 自己 `setIsCreating(true)` 是异步的** —— InputArea 的 Enter 第一次能触发，紧接着第二次 Enter 在 React 提交前就已被守卫拦截。**这条 OK**。但**首次点击和 InputArea 防抖之间有微秒空窗**，实测可能在低端机上漏掉。

**触发场景**：长 AI 响应（30s 超时）+ 用户焦虑连发 + 网络抖动。

**建议改法**：
- 在 `useSession` 内用 `AbortController` ref，给 sendChatMessage 注入 SIG_CANCEL，重复进入时取消旧的
- `updateLastKimiMessage` 改为按 pending message id 精确替换，避免 last-write-wins
- 或：在 InputArea 处就把连点去除（onPointerDown 后 1s 内 disabled）

**边界**：不要改 `finally { setIsCreating(false) }` —— 这条对了一半，cancel 后也应该 false。

---

## § 5 🟡 P2（6 个，工程债）

### § 5.1 P2.1：每次 chat 都查 liked/disliked DB

**位置**：
- `backend/src/routes/radio.ts:223-224`（transition 路径）
- `backend/src/routes/radio.ts:355-356`（chat 路径）

每次 transition + 每次 chat = 4 次 SQLite 查询（liked 取 3 + disliked 取 3 + liked 取 5 + disliked 取 3）。

**建议改法**：
- 在 `services/userTaste.ts` 加 in-memory cache，30s 滑动窗，TTL 到期重读
- 或在 session 开始 createSession 时读一次写到 session.context，下次读 session.context

**边界**：反馈 (like/skip) 写入后**必须** invalidate 当前 cache，否则用户点了 like 后续串词看不到。

---

### § 5.2 P2.2：`addMessage` 数组 O(n²) 复制

**位置**：`frontend/src/store/radioStore.ts:188-193`

```ts
addMessage: (msg) => set(
  (s) => ({
    messages: [...s.messages, { ...msg, id: crypto.randomUUID() }],
  }),
  false,
  'chat/addMessage',
)
```

每次 push 都是 O(n)。100 条消息时 push 一次约 100 次对象引用拷贝 + React 全比较。

**触发场景**：长 chat session（用户聊 200+ 句）+ ChatArea 每次消息都触发整树 reconcile。

**建议改法**：上 immer middleware（zustand 内置支持）或保留单条消息 stream ID → 用 Map<id, message> 存储 + selector derive ordered list。

**边界**：不动 `updateLastKimiMessage`（已用 copy + 索引替换，OK）。

---

### § 5.3 P2.3：chat system prompt 每次全量

**位置**：`backend/src/routes/radio.ts:365-398`

`personaBlock` (~400 token) + `searchContext` + `tasteBlock` + `chatMemoryBlock` + `songContext` + 时段 + 推荐规则 ≈ **1.5k-2.5k token 系统 prompt**。

每次 chat 都重发：
- persona 在一整个 session 里不变 → 可缓存
- tasteBlock 在 session 内变化慢 → 同上
- chatMemoryBlock 每次会更新 → 每 chat 重算

**建议改法**：
- 短期：personaBlock 上服务端 LRU cache（key = "persona-v1"），命中直接返回构造好的字符串
- 中期：AI 服务支持 prompt caching（OpenAI / 一些本地推理有）→ personaBlock 一段 key 让 SDK 复用

**边界**：如果 MiMo API 不支持 caching 此项搁置。

---

### § 5.4 P2.4：page.tsx 播放编排 effect 时序混淆

**位置**：`frontend/src/app/page.tsx:91-105`

```ts
useEffect(() => {
  if (!audioUnlocked) return
  const s = useRadioStore.getState()
  if (s.introScript && !s.introPlayed && !s.isSpeaking && !s.isPlaying) {
    s.setIntroPlayed(true)        // ← 修改依赖
    s.setIsPlaying(false)
    speakAIMessage(s.introScript)
    return
  }
  if ((!s.introScript || s.introPlayed) && s.currentSong && !s.isPlaying && !s.isSpeaking) {
    s.setIsPlaying(true)
  }
}, [audioUnlocked, introScript, introPlayed, speakAIMessage])
```

**问题**：
1. `setIntroPlayed(true)` 立即让 effect 重跑（依赖变了）—— 第二次进入时 `s.introPlayed === true` && `s.introScript === <已有>` → 走第二个分支 → `setIsPlaying(true)`。
   - 正常路径：第一次跑 → 播 intro（intro onEnd 调用 resumePlaybackAfterSpeak → setIsPlaying(true)）→ 第二次 effect 跑 → 仍是 setIsPlaying(true)，**幂等，OK**。
   - 异常路径：intro TTS 失败 → onError 调 resumePlaybackAfterSpeak → setIsSpeaking(false) + setIsPlaying(true)。同时 effect 第二次跑 → 又 setIsPlaying(true)，幂等。
2. 但 **speakAIMessage 的 onStart 会异步 setIsSpeaking(true)**，effect 第二次跑时 `s.isSpeaking` 可能已经 true → 跳出。**第一次 effect 跑期间的 setIsPlaying(false) 仍有副作用**——下一次依赖变了又会重跑，可能在 `isSpeaking=true` 时 setIsPlaying(true) 撞 audio.pause()。

**触发概率**：低（要 onStart 异步与 effect 重跑撞上）。
**影响**：可能让 KimiCard 显示"正在播放"但实际 audio 在 pause。

**建议改法**：把播放编排提炼成一个显式 state machine；或 useReducer。

**边界**：这是 P0 F4 改造的一部分，单独做不值。

---

### § 5.5 P2.5：DJ TTS mp3 不缓存

**位置**：`backend/src/routes/dj.ts:80-125`

每次 DJ 串词都生成新文件。常用串词（"深夜安静"）可能 50+ 次产生相似 MP3。

**建议改法**：在 `backend/src/static/audio/` 加一层 Redis-like 简单 LRU（已有 `fileCleanup.ts:23-78`），key = `hash(text + voice + engine)`。

**边界**：上线前不必做。

---

### § 5.6 P2.6：`req as any` 系统性（生产代码 5 处）

| 文件:行号 | 用法 | 建议 |
|-----------|------|------|
| `backend/src/middleware/sessionAuth.ts:38` | `(req as any).sessionId = result.sessionId` | 用 `types/express.d.ts` 扩展 `Request` 类型 |
| `backend/src/middleware/requestId.ts:16` | `(req as any).requestId = id` | 同上 |
| `backend/src/middleware/validate.ts:29` | `req.params = result.data as any` | 用 `Partial<Request>` 包装 |
| `backend/src/middleware/validate.ts:44` | `req.query = result.data as any` | 同上 |
| `backend/src/index.ts:66` | `reqId = (req as any).requestId` | 类型扩展后直读 |

**已有基础**：`types/express.d.ts:1-13` 已声明。但只声明了 requestId，没扩 sessionId。

**建议改法**：扩展 `types/express.d.ts`：

```ts
declare global {
  namespace Express {
    interface Request {
      requestId: string
      sessionId?: string
    }
  }
}
```

**影响**：零运行时收益；纯类型安全收益。五年内谁拼错字段名 TS 会立刻标红。

**边界**：不动测试文件里的 `as any`（mock 必要）。

---

## § 6 🟢 P3（5 个低优）

### § 6.1 MediaSession strict mode 中间帧空 handler

`useAudioPlayer.ts:151-197` 在 useEffect mount 注册 setActionHandler，cleanup setActionHandler(null)。React 18 Strict Mode 跑 mount → cleanup → mount 时，**第二次 mount 注册之前有一帧 5 个 handler 全部为 null**。

如果用户在这帧按锁屏 pause，会 NotFoundError。**概率小（毫秒级），但建议加 50ms 延迟的二次注册**。

### § 6.2 useAudioPlayer 卸载未清 store 播放态

`useEffect` cleanup 只清 audioRef，不调 `setIsPlaying(false)`。切换到 /profile /plan /settings 回来后，KimiCard 仍是旧 isPlaying 显示。

### § 6.3 persona 文件路径硬编码

`backend/src/services/djPersona.ts:40` `path.join(__dirname, '../../data/dj-persona.json')`。**`__dirname` 是 dist 目录相对**，源码运行和 build 后运行路径不同。打包/迁移容易出问题。

**建议**：`config.personaFile` 走 `.env`。

### § 6.4 jsdom 不支持 canvas（AudioWaveform 测试盲区）

`frontend/src/components/AudioWaveform.tsx` 使用 Canvas API。`npx vitest run` 输出 `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package`，但所有测试仍 pass —— 说明 AudioWaveform **关键路径无测试覆盖**或 mock 不完整。

**建议**：`test-setup.ts` 加 mock 或显式 expect `getContext()` 被调用。

### § 6.5 reason 字段存储但不进 prompt（埋点残缺）

`db/index.ts:113` `saveFeedback` 写入 reason 到 feedback 表。`routes/radio.ts:525` logger 记录 reason。**没有任何 prompt 把 reason 喂给 AI**。

如果意图是"用户在 skip 时告诉原因，AI 后续学习避免"——**目前没实现**。要么去掉 reason 字段（YAGNI），要么加上 `feedback → taste block` 链路。

---

## § 7 COLLABORATION §3 决策遵守情况自查（执行者守则层面）

| §3 决策 | 是否遵守 | 备注 |
|---------|---------|------|
| 1. sessionToken 保持原版无过期 | ✅ 未提议改 | |
| 2. sessionToken/sessionId 不持久化 | ✅ 未提议改 | |
| 3. queue/currentSong 内存态 | ✅ 未提议改 | |
| 4. SSRF 白名单含 127.0.0.1 | ✅ 未提议删 | 但见下方脚注 |
| 5. dev 模式 API 认证放行 | ✅ 未提议收紧 | |
| 6. Fish Audio / 飞书已删除 | ✅ 未提议恢复 | |
| 7. DJ 串词 60-120 字 | ✅ 未涉及 | |
| 8. 网易云免 cookie fee=8 | ✅ 未提议改 | |
| 9. QQ webbridge 浏览器登录 | ✅ 未提议改 | |
| 10. planner resolveTracks fire-and-forget | ✅ 未提议改 await | |

**脚注**：第 4 条 SSRF 白名单保护范围未扩展——`musicSource` 注册里的 QQ 走 webbridge 也走 SSRF。如果未来加新外部 API（如 Spotify/Tidal），白名单扩展规则应当文档化。

---

## § 8 给下一步的建议

### 优先级排序（按触发概率 × 修复成本）

| 序 | 做什么 | 成本 | 触发概率 | 时机 |
|---|--------|------|---------|------|
| 1 | F4 isPlaying 仲裁改造（§3） | 大（3-5 天，跨 8 文件） | **升高中** | 上线前必做；最迟 ASR 真实设备调试前 |
| 2 | `String(err)` 漏改（§4.2） | 极小（机械替换） | N/A | 顺手做，今天就能 commit |
| 3 | AI JSON 兜底语义（§4.1） | 小（30 行） | 偶发 | 顺手做 |
| 4 | AI prompt 样板统一（§4.3） | 中（1 天，需测试） | 持续 | persona 再迭代前 |
| 5 | 类型扩展 `Request`（§5.6） | 极小 | N/A | 顺手做 |
| 6 | `/chat` cancel + 防重（§4.4） | 中（1 天） | 高 | 用户反馈问题前 |
| 7 | addMessage 数据结构（§5.2） | 中（需测试回归） | 长会话才显 | 优化阶段 |
| 8 | 其余 P2/P3 | 小到大不等 | 低 | 各自触发再做 |

### 不建议现在做的

- **SSE / WebSocket**：COLLABORATION §7 已 grill-me 否决
- **AI JSON Schema**（用 zod 严格结构化 AI 输出）：收益模糊；fallback 路径越多越脆
- **CDN/缓存层**：单用户本地应用没必要
- **拆分 router**：当前 552 行的 radio.ts 不算巨型，分散反而难维护

### 必须做但当前可缓的

- P2.1 ~ P2.5：每个改动相对独立，下一轮迭代批量做合适
- P3.1 MediaSession strict mode：等真实锁屏调试再补不迟

---

## § 9 待完善的局限（避免伪权威）

1. 本审计为只读代码分析，**未做端到端实测**（只能用 `npx vitest run` 验证测试基线）
2. 未对 AI prompt 做实际调试验证（MiNiMax 同条件；不调 AI 无法确认 JSON 解析失败概率）—— **§4.1 的 5-15% 概率是经验估计，需实际统计**
3. **生产环境 runtime 数据没有**：不靠内存 log 无法判断 `String(err)` 影响多大
4. 没有用 React DevTools Profiler 录制 F4 实际行为 —— §3 的影响值是基于代码静态推断
5. 部分 P3（用户感知层面）需要 dev mode 真机跑才能确认；本审计以静态分析为限

---

*报告由 Mavis（规划者视角）生成。独立于同日 MiNiMax 执行者视角审计；二者合计才是 mimo-radio 当前状态的全景。*
