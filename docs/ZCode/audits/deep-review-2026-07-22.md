---
author: 规划者（ZCode）
task: mimo-radio 深度代码评审（master @ 473f140）—— 对齐 KIMI 颗粒度
created: 2026-07-22
method: 4 路 opus reviewer subagent 并行（后端正确性+安全 / 前端正确性 / 测试质量 / 工程卫生）+ ZCode 主控整合 + 6 项高风险独立源码验证
baseline: 后端 305 passed / 32 文件，前端 204 passed / 24 文件，tsc 双零（独立实跑）
audience: 用户、KIMI（对齐颗粒度用）
---

# mimo-radio 深度代码评审报告

> **对齐基准**：本报告颗粒度对齐 KIMI `docs/KIMI/code-review-2026-07-17.md`（项目最高质量评审，14 发现全属实）。
> **方法**：4 路 opus reviewer subagent 并行深扫（隔离上下文）→ ZCode 主控整合（severity 裁决 + 交叉去重）→ 6 项高风险发现独立源码验证（不盲信 subagent）。
> **重点**：多轮修复后（305/204）的**回归**、**修复是否真修对**、**KIMI 当初没发现的新洞**、**"测试绿也照样错"的延续**。

## 实证基线（ZCode 独立实跑）

| 项目 | 结果 |
|------|------|
| 后端测试 | **305 passed / 32 文件**（2.9s）|
| 前端测试 | **204 passed / 24 文件**（7.3s）|
| 后端 tsc | 0 错误 |
| 前端 tsc | 0 错误 |
| 后端 ESLint | **34 errors / 19 warnings**（lint 跑不通，见 E-1）|

## 总体判断

**工程质量较 KIMI 2026-07-17 评审时显著提升**：SSRF IPv6+DNS / F4 仲裁层 / app 工厂 / 熔断 / tasteCache / feedback TTL / gracefulShutdown 等主干修复质量高，SSRF async 化是本轮最佳。但多轮修复引入了**两类系统性遗留**：

1. **资源成对清理的边界遗漏**（C1 铁律）—— `startPeriodicCleanup` 的 dispose 被丢弃、`planner.withTimeout` 的 setTimeout 不 clear、`KimiCard.likeDebounceRef` 卸载不清。gracefulShutdown 补了 session/feedback 两个 timer，漏了 fileCleanup 的第三个。
2. **F4 仲裁层 pendingResume 生命周期不完整** —— 切歌不清 pendingResume（僵尸残留）+ prevSong 用 user source 穿透 DJ 锁 + resumePlaybackAfterSpeak 无 currentSong 时不消费。三者在"DJ 说话中换歌"场景组合出状态错乱。

加上 KIMI 当初洞察的延续——**"测试绿也照样错"**：F4 场景 3/8 的弱断言（手摆 false + 断言 false，R2 锁被删测试也照绿）+ planner 仍零测试 + 无 coverage 阈值。

一句话：**骨架更扎实了，但有几个"绿也照样错"的洞，集中在 pendingResume 生命周期和资源清理的边界**。

---

## 🔴 严重（7 项）

### R-1. `backend/src/index.ts:61` — `startPeriodicCleanup` 返回的 dispose 被丢弃，gracefulShutdown 漏清第三个 timer
```ts
// index.ts:61（启动时）
startPeriodicCleanup(resolve(process.cwd(), 'static/audio'))   // 返回值 () => clearInterval 丢了
// fileCleanup.ts:87-94
export function startPeriodicCleanup(...): () => void {
  cleanupAudioFiles(...).catch(() => {})
  const timer = setInterval(...)
  return () => clearInterval(timer)   // ← 有 dispose，但调用方没接
}
// index.ts:115-130 gracefulShutdown 只调了 stopSessionCleanup + stopFeedbackCleanup
```
**根因**：B2-5 gracefulShutdown 改造梳理资源时，把 db 的两个 timer 配了对，漏了 fileCleanup 的第三个。**已独立验证**（fileCleanup.ts:93 确实 return dispose，index.ts:61 确实没接）。
**为什么重要**：SIGTERM 后 event loop 挂着未清的 setInterval，进程走 5s 强退兜底而非优雅退出——gracefulShutdown 的设计意图被削弱。铁律 1 的边界遗漏。

### R-2. `backend/src/services/planner.ts:154-159` — `withTimeout` 的 setTimeout 永不清理，每次计划泄漏 12 个 timer
```ts
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ])
}
```
**根因**：经典 Promise.race 超时模式未配 clearTimeout。对比同仓库 `fetchWithTimeout.ts:167` 的 `finally { clearTimeout }` 是正确写法，这里没对齐。`resolveTracks` 对每首歌调一次（planner.ts:146），6 时段 × 2 首 = 12 个泄漏 timer 挂到 8s 超时。
**为什么重要**：`/schedule/today` 和启动预热每次都泄漏一批。单用户量级不爆，但属铁律 1 违反。

### R-3. `frontend/src/store/radioStore.ts:320` — `prevSong` 用 `source='user'`，DJ 说话中切上一首穿透 R1 导致双音轨
```ts
prevSong: () => {
  ...
  _set({ currentSong: prev, currentTime: 0 }, false, 'radio/prevSong')
  get().playRequest('play', 'user')   // ← R1 user 优先，即使 isSpeaking 也立即 isPlaying=true
},
```
**根因**：prevSong 本质是程序换歌（与 nextSong 同语义），但 source 用了 'user'。R1 用户优先 → 即使 `isSpeaking=true` 也立即置 `isPlaying=true` 并清 pendingResume。结果：DJ 说话中切上一首 → 歌立即播 → 双音轨。`useAudioPlayer` Effect 2 的 `if (isSpeaking) audio.pause()` 兜住了实际播放，但 UI 显示 On Air 实际无声，且 DJ 说完后不续播。**已独立验证**（radioStore.ts:320 确认 source='user'）。
**为什么重要**：与 nextSong（source='auto'，会被 R3 挂起）语义不一致。建议 prevSong 也用 'auto' 或新增换歌专用 source。

### R-4. `frontend/src/store/radioStore.ts:348-354` — `nextSong` 切歌时不清 pendingResume，旧 pending 会"僵尸残留"
```ts
const updates: Partial<RadioState> = { currentSong: data.song, currentTime: 0 }
// ...（没 pendingResume: false）
_set(updates, false, 'radio/nextSong')
get().playRequest('play', 'auto')   // 若 isSpeaking 仍 true，又挂一个 pendingResume
```
**根因**：pendingResume 必须与"为哪首歌挂起"绑定。换歌前若 pendingResume=true（上一首 DJ 解说中的 auto play），阶段 1 切歌没清 → 阶段 2 可能又挂一个 → 旧 pending 是为旧歌挂的，语义错位。`clearSession` 清了，但 nextSong/prevSong 切歌路径都没清。**已独立验证**（updates 只含 currentSong/currentTime/queue，无 pendingResume）。
**为什么重要**：DJ 说话中换歌 → DJ 说完自动播了新歌（用户可能根本没想播）。建议阶段 1 固定 `_set({ currentSong, currentTime:0, pendingResume: false })`。

### R-5. `frontend/src/store/radioStore.playRequest.test.ts:96-105` — 场景 3 弱断言：R2 transition 锁被删测试也照绿（假绿）
```ts
// 场景 3：换歌中 DJ auto play → 丢弃
isPlaying: false,                    // ← 初始就 false
...
playRequest('play', 'auto')          // 即使没 R2 锁，isPlaying 也是 false
expect(after.isPlaying).toBe(false)  // ← 断言 false，锁在不在都过
```
**根因**：场景 3 初始 isPlaying=false，断言也是 false——即使有人误删 R2 transition 锁（radioStore.ts:298-303 的 early return），这个测试照样绿。这是 KIMI 当初"测试绿也照样错"洞察的直接延续。场景 8（nextSong 两阶段）同理，只手摆 `playRequest('play','auto')` 没真调 nextSong 的 fetch/queue/transition 链路。**已独立验证**。
**为什么重要**：F4 仲裁层最复杂的并发路径用"手摆 + 弱断言"绕过了真实验证。应改成 `isPlaying:true` 初始 + 断言保持 true（证明锁丢弃了 play 请求），场景 8 应真调 mock fetch 的 nextSong()。

### R-6. `backend/eslint.config.mjs:11` + `backend/tsconfig.json:21` — 后端 lint 跑不通（34 errors），lint 门完全失效
```
✖ 53 problems (34 errors, 19 warnings)
错误全为：Parsing error: "parserOptions.project"... The file ...test.ts was not found in any of the provided project(s)
```
**根因**：tsconfig exclude 了 `src/**/*.test.ts`（P2-1 修复，让 dist 不含 test.js），但 eslint config 的 `files: ['src/**/*.ts']` 仍匹配 test 文件，type-aware parser 找不到 project 就 parse 失败。32 个 test 文件 × 0:0 error。**已独立验证**（npm run lint 实跑 34 errors）。
**为什么重要**：根 package.json 的 `lint` 聚合脚本永远非零退出；CI 接入 lint 会全红；"lint 通过"门形同虚设。修法：eslint config 加 `ignores: ['src/**/*.test.ts']` 或为 test 单独配不带 `parserOptions.project` 的 block。

### R-7. `.git/config` — git remote 仍含明文 GitHub PAT（第 7 次记录）
```
remote.origin.url = https://coeer:ghp_***REDACTED***@github.com/...（原完整 token 已脱敏，推送时被 GitHub Push Protection 拦截）
```
**根因**：全面审核 P0-1 发现至今未处理。本轮 push 时 GitHub Push Protection 拦了一次（MiNiMax 把 token 抄进 handover 文档），已脱敏 + amend，但**本地 .git/config 里的原 token 仍在**，且未在 GitHub 撤销。
**为什么重要**：任何读 `.git/config` 的进程/备份/IDE 都能拿到活跃 token。这不是代码问题，是用户操作——**必须在 GitHub 撤销该 token 并改 SSH**。

---

## 🟡 中等（14 项，按域分组）

### 后端正确性

**B-1. `services/musicSource.ts:26-56` — QQ 音源冷启动首轮失效 + isReady 竞态**
`qqReadyCache` 初始 null → 首次调用进 isReady 分支（异步）→ 同步走到 `if (qqReadyCache === false)` 为假（null≠false）→ 返回 QQ（实际可能未就绪）。"智能回落"首轮失效，要等 30s 后才生效。且 30s TTL 到期后连续两次调用会并发 isReady（各 25s webbridgeEval），后写者覆盖。建议初次 null 时先回落网易云，或 getMusicSource 改 async。

**B-2. `app.ts:116-126` — `req.setTimeout(30000)` 误用，keep-alive 空闲连接被误触 408**
`req.setTimeout` 设的是 socket 空闲超时不是单请求超时。keep-alive 下 socket 空闲 30s 就触发回调（此时不在处理请求），`req.destroy()` 断开连接。前端 fetch 默认 keep-alive，会偶发断连重连。应用 `server.setTimeout` 或 `connect-timeout` 中间件。

**B-3. `services/mimo.ts:222-226` — `analyzePersonality` 没用 `extractJsonObject`（同文件唯一漏网）**
手写正则去 markdown 围栏 + JSON.parse。模型输出前导文字就抛 → catch 兜底。同文件 `generateRecommendationStrategy`（:136）正确用了 extractJsonObject（含 ReDoS 截断 + 容错定位）。应统一。

**B-4. API envelope 远未统一**（KIMI B8 升级版）
B4 改动只统一了 qqmusic/musicSource 的**错误分支**。成功响应仍 4 种 shape：`{success:true,...}` / `{session_id,...}`无success / `{ok:true,...}` / 裸 payload。前端按端点各自解构，脆弱。若有意渐进迁移，应在文档标注"成功 envelope 未统一"。

**B-5. `middleware/aiLimiter.ts:19` — `skip: NODE_ENV==='test'` 与项目"dev 放行"策略不一致**
项目其它放行是"显式 production 才严格"（sessionToken/auth/index）。但 aiLimiter 只 test 跳过，dev 手测 1 分钟调 11 次 /create 就 429。与 dev 放行心智冲突。建议 dev 也跳过或文档注明。

**B-6. `utils/fetchWithTimeout.ts:91` — 端口推断用 `url.startsWith('https')` 脆弱**
应 `parsed.protocol === 'https:'`。当前数据下不构成漏洞（白名单 host 的默认 port 都不在白名单），但逻辑脆。

### 前端正确性

**F-1. `hooks/useSession.ts:35-37` — `resumePlaybackAfterSpeak` 无 currentSong 时不清 pendingResume（僵尸）**
DJ 说完但 currentSong 为空（intro 场景 + createSession 未塞 queue）→ 既不 play 也不清 pendingResume → 残留。下次任何 playRequest 都不消费它。建议无论有无 currentSong 都处理 pendingResume。

**F-2. `hooks/useAudioPlayer.ts:107-138` — Effect 2 依赖整个 currentSong 对象，换歌瞬间 playUrl 未就绪窗口**
nextSong 阶段 1 `_set({currentSong:newSong})` → Effect 2 重跑 → `!currentSong?.playUrl` return（新歌 playUrl 还没异步获取）→ audio 停旧 src。Effect 1 拿到 url 再 setCurrentSong → Effect 2 又重跑。中间窗口若 isPlaying 翻转可能播旧歌尾巴。建议 Effect 2 依赖 `currentSong?.id`。

**F-3. `components/InputArea.tsx:37-49` — 两个独立 `[]` effect，cleanup 逆序导致 mountedRef 守卫失效**
React cleanup 按注册逆序：MediaRecorder cleanup（effect 2）先于 mountedRef=false（effect 1）→ onstop 回调读 mountedRef 仍是 true → 守卫失效，setState 卸载组件。建议合并为单 effect，cleanup 里先 mountedRef=false 再 stop。

**F-4. `app/settings/page.tsx:55-86` — previewVoice 连点竞态，无 AbortController（F3 同类问题未复用）**
连点 A→B：A fetch 在途 B 发出 → A resolve `new Audio(urlA).play()` → B resolve 覆盖 ref → audioA 没人停，双音轨。和 useTTS ttsAbortRef 解决的是同类问题，settings 页没复用。

**F-5. `components/KimiCard.tsx:132-154` — likeDebounceRef 卸载不清（铁律 1 漏点）**
切歌导致 KimiCard 卸载，pending 的 500ms setTimeout 仍触发 fetch（悬挂请求）。建议加 unmount cleanup clearTimeout。

**F-6. `components/PlayerBar.tsx:22-24` — F5 换歌重置 localTime 但不同步 duration**
换歌后头几秒 duration 可能是旧值（setDuration 未触发 tick effect 重跑），`Math.min(t+1, oldDuration)` 用旧值截断。视觉小瑕疵。

### 测试质量

**T-1. `services/planner.ts`（188 行）零测试**（KIMI C4 未解）
generateDailyPlan 含并发去重 + 缓存 + AI 失败兜底 + tracksLoaded 双路径 + withTimeout。是规划器大脑，至今零直接测试。KIMI 当初标的，现在还在。

**T-2. `fetchWithTimeout.test.ts` — HALF_OPEN 恢复探针零覆盖**
熔断器 OPEN→HALF_OPEN（30s 后放一个 probe）是故障恢复关键状态，测试只覆盖 CLOSED→OPEN。HALF_OPEN 语义错会导致永久 OPEN 或雪崩。

**T-3. 全项目无 coverage 阈值**
vitest.config.ts 无 coverage.thresholds，test 脚本不带 --coverage。305/204 的"量"无"质"的强制约束，新模块可零测试合并。

**T-4. `djIntroToSong.e2e.test.ts` 文件名带 "e2e" 但实为 renderHook 单测**
无真实浏览器、无 DOM 观察、无 playwright/cypress。F4"连发 chat + 换歌 + DJ 串词 → DOM 无双 PLAYING"的真 E2E 不存在。命名误导。

---

## 🔵 建议（12 项，择要）

| # | 位置 | 建议 |
|---|------|------|
| L-1 | `index.ts:36-54` | 语句中间的 import 提到文件头（ESM 提升但可读性差）|
| L-2 | `planner.ts:73` | DEFAULT_SLOTS 魔法下标 → 按 label 查找 |
| L-3 | `qqSource.ts:157` | `targetSig` 声明未用（可能返回错误歌曲 URL）|
| L-4 | `logger.ts:96-110` | droppedCount 暴露为 metric 或周期 warn |
| L-5 | `log.ts:40-46` | `...ctx` 展开覆盖 source/ip/ua（日志伪造盲点）—— ctx 放前，元数据放后 |
| L-6 | `db/index.ts:33` | gracefulShutdown 加 `db.pragma('wal_checkpoint(TRUNCATE)')` 或 db.close() |
| L-7 | `ssrfGuard.ts:5-20` | 补 `100.64.0.0/10`（CGN）和 `198.18.0.0/15`（基准测试）私网段 |
| L-8 | `auth.ts:10-15` | secureCompare 长度不等提前 return 泄漏长度（可 HMAC 后比较）|
| L-9 | `useSession.ts:16-53` | setHandlers 移进 useEffect（渲染期执行副作用是反模式）|
| L-10 | `ChatArea.tsx:91` | `msg.timestamp || Date.now()` 兜底在 render 求值会漂移（timestamp 迁移后是死代码）|
| L-11 | `FullscreenPlayer.tsx:148` | 主题切换用 useLayoutEffect 避免 flash（当前用 useEffect + 硬编码色规避）|
| L-12 | README/HANDOVER | 测试基线数字 288/189 → 305/204（COLLABORATION 已改，README/HANDOVER 漏改）|

---

## ✅ 做得好（本轮新确认，16 项）

### 架构与主干修复（本轮重点核实）

1. **SSRF async + DNS rebinding 校验**（ssrfGuard.ts）—— 本轮改动质量最高。IPv6 字面量剥方括号 + IPv4-mapped + 6to4 + ULA + 多记录 fail-closed + DNS 失败 fail-closed，白名单优先级重排（端口>host>isSafeUrl）逻辑清晰。测试 251 行覆盖 IPv6/DNS/边界。
2. **F4 playRequest 5 条规则**（radioStore.ts:280-313）—— R5 幂等前置过滤、R1 user 优先清 pendingResume、R2 transition 锁丢弃不排队、R3 speaking 锁挂起。规则顺序合理，`_set` 直接写避免递归。
3. **nextSong 两阶段原子性方向对**（radioStore.ts:344-354）—— 阶段 1 切歌不动 isPlaying，阶段 2 经 playRequest 仲裁，3 条路径（fetch 成功/失败 fallback/本地）全覆盖。避免了"切歌瞬间 isPlaying=true 撑过 transition"。
4. **readBodySafely**（fetchWithTimeout.ts:178-199）—— try/finally 完整，超时 `res.body?.cancel()` 取消底层流，cancel 失败静默吞。铁律 1 范本。
5. **熔断状态机**（fetchWithTimeout.ts:136-166）—— 5xx 计入、4xx 不计、2xx 重置、HALF_OPEN one-probe。逻辑正确。
6. **app 工厂 createApp**（app.ts）—— 纯构建无副作用，启动流程在 index.ts，测试 import 真实 app。根治了 B5 镜像测试快照漂移。
7. **feedback TTL + gracefulShutdown**（db/index.ts + index.ts）—— start/stopFeedbackCleanup 成对（虽漏了 fileCleanup 的第三个，见 R-1），SIGINT/SIGTERM 钩子 + shuttingDown 防重入 + 5s 强退兜底。
8. **tasteCache 分 key**（tasteCache.ts:27-30）—— Map<limit, entry>，注释精准描述原单槽 bug。隐藏数据正确性 bug 被测出并修对。
9. **logger sanitize 源头治理**（logger.ts:140-143）—— formatLog 入口统一处理 `\r\n`，prod/dev 两格式都过 safeMessage。
10. **body-parser 顺序**（app.ts:68-71）—— 路径级放宽（25mb/12mb）在全局 1mb 之前，注释说明顺序原因。error.ts 识别 entity.too.large 返 413。

### 异步资源与防重入

11. **useAudioPlayer cleanupRef 模式**（useAudioPlayer.ts:15,58-101）—— async 分支注册的监听通过 ref 暴露给同步 cleanup。F2 正确修复。
12. **useTTS ttsAbortRef + AbortError 静默不兜底**（useTTS.ts:111-113）—— 被 abort 的 fetch 返 null，不走 speechSynth（否则照样双音轨）。F3 关键正确性点。
13. **handleLike getState() 读最新值**（KimiCard.tsx:139）—— F1 闭包陈旧规避到位。
14. **chat 防重入 pendingId 精确替换**（useSession.ts:161-180）—— 按 id findIndex 替换，连发/abort/错误路径都精确匹配。

### 测试质量亮点

15. **security-headers.test.ts 引用 HELMET_OPTIONS 共享源**（test:5）—— 根治 B5 快照漂移。还加了 style-src 不允许 unsafe-inline 的回归用例。
16. **全项目零 toMatchSnapshot**（grep 0 命中）—— 从机制上杜绝快照漂移类问题。

### 工程卫生

- UPnP/node-ssdp/@types/ws 清理彻底（零残留）；tsconfig exclude test 生效（dist 零 *.test.js）；.gitignore 完整（无构建产物/密钥/二进制入库）；DJ 串词字数契约一致（60-120）；NEXT_PUBLIC_API_BASE 用法正确（KIMI C5 已解）；前端组件/后端 services/config 字段零死代码模块。

---

## 与 KIMI 2026-07-17 评审的对比（演进核实）

| KIMI 当初发现 | 现状 |
|--------------|------|
| R1 body 上限矛盾 | ✅ 已修（路径级覆盖 + 413 识别）|
| R2 鉴权 fail-open | ✅ 已修（显式 production fail-closed）|
| B1 aiLimiter 挂载错误 | ✅ 已修（共享单例 + 只挂 POST）|
| B2 fetchWithTimeout 两洞 | ✅ 已修（readBodySafely + 5xx 熔断）|
| B4 UPnP 死代码 | ✅ 已删（含 node-ssdp 收尾）|
| B5 helmet 测试快照漂移 | ✅ 已修（HELMET_OPTIONS 共享源）|
| B6 tasteCache 未分 key | ✅ 已修（Map<limit>）|
| B7 部署配置漂移 | ✅ 已修（端口/死配置/.env.example）|
| F1 收藏反向 | ✅ 已修（getState 读最新值）|
| F2 监听泄漏 | ✅ 已修（cleanupRef）|
| F3 TTS 旧串词复活 | ✅ 已修（ttsAbortRef）|
| F4 全屏 seek | ✅ 已修（onSeek 双调用）+ **F4 仲裁层已完成**（本轮新做）|
| F5 PlayerBar 滞留 | ✅ 已修（currentSong?.id effect）|
| 🔵 SSRF DNS 解析 | ✅ 已修（async + dns.lookup）—— **超越 KIMI 当初建议**|
| C2 dist 含 test.js | ✅ 已修（tsconfig exclude）|
| C3 构建产物入库 | ✅ 已修（gitignore + git rm）|
| **C4 planner 零测试** | ❌ **仍未解**（T-1）|
| C5 ARCHITECTURE 过时 | 🟡 有头注，正文未重写 |

**结论**：KIMI 当初 14 个发现 + 🔵 建议，**绝大部分已修复**，且 SSRF 超越了当初建议。**唯一完全未解的是 planner 零测试**（T-1）。本轮新增的 🔴 集中在"修复引入的边界遗漏"（timer 清理 / pendingResume 生命周期）而非"未修的旧债"。

---

## 给执行者的优先级建议（ZCode 裁决）

### 🔴 必修（上线前）
1. **R-7 git PAT 撤销**（用户做，非代码）
2. **R-6 lint 修复**（eslint config 排除 test 或分 block）—— lint 门失效
3. **R-1 startPeriodicCleanup dispose**（接返回值 + gracefulShutdown 调）
4. **R-2 planner withTimeout clearTimeout**（对齐 fetchWithTimeout 模式）

### 🟡 应修（本轮 hotfix）
5. **R-3 prevSong source 'user'→'auto'** + **R-4 nextSong 切歌清 pendingResume** + **F-1 resumePlaybackAfterSpeak 无歌时清 pendingResume**（三个组合修，pendingResume 生命周期闭环）
6. **R-5 场景 3/8 弱断言**（isPlaying 初始改 true + 真调 nextSong mock fetch）
7. **T-1 planner 补测试**（并发去重 + 缓存 + tracksLoaded 双路径）

### 🟢 可排期
8. B-1~B-6 后端中等项 / F-2~F-6 前端中等项 / T-2~T-4 测试缺口 / L-1~L-12 建议

---

*本报告由规划者（ZCode）出具，对齐 KIMI `code-review-2026-07-17.md` 颗粒度。方法：4 路 opus reviewer subagent 并行深扫 + ZCode 主控整合 + 6 项高风险独立源码验证。总计 🔴7 / 🟡14 / 🔵12 / ✅16。工程质量较 KIMI 评审时显著提升，残留集中在资源清理边界 + pendingResume 生命周期 + 测试弱断言。*
