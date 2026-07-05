# mimo-radio 下一步完整方案（整合 Mavis 独立审计）

> **生成时间**：2026-07-03（规划者）
> **基于**：Mavis 独立审计（`docs/reports/audit-2026-07-03-independent-Mavis.md`）+ 历史待办 + 代码核实
> **核心变化**：F4 isPlaying 从"暂缓"升级为 P0；新增 4 个 P1（JSON 兜底/String(err)/chat 防重入/prompt 统一）；品味记忆/WebSocket 状态修正
> **配套**：先读 `COLLABORATION.md` + `HANDOVER.md`（已更新）

---

## 〇、优先级总览（按"用户感知 × 触发概率 ÷ 修复成本"排序）

| 序 | 优先级 | 任务 | 成本 | 触发概率 | 时机 |
|---|--------|------|------|---------|------|
| 1 | 🔴 P0 | **F4 isPlaying 仲裁层** | 大（3-5天，跨8文件） | **升高中**（MediaSession+ASR） | 上线前必做 |
| 2 | 🟠 P1 | **String(err) 13处 → toErrorMeta** | 极小（机械替换） | N/A | 顺手做，今天commit |
| 3 | 🟠 P1 | **JSON 兜底 mood=userInput 修复** | 小（30行） | 偶发（5-15%） | 顺手做 |
| 4 | 🟠 P1 | **chat 无取消 + 连发丢回复** | 中（1天） | **高**（焦虑用户连发） | 用户反馈前做 |
| 5 | 🟠 P1 | **AI prompt 样板统一（4处→1处）** | 中（1天） | 持续（每次改persona） | persona迭代前 |
| 6 | 🟡 P2 | **P2 安全质量批量**（CSP/WCAG/代码分割/ErrorBoundary） | 中 | 上线必做 | 准备上线时 |
| 7 | 🟡 P2 | **req as any 类型扩展** | 极小 | N/A | 顺手做 |
| 8 | 🟡 P2 | **chat DB 查询缓存** | 小 | 中频 | 优化阶段 |
| 9 | 🟡 P2 | **reason 字段链路补全或删除** | 小 | N/A | 顺手做 |
| 10 | 🟢 低 | sideffects test tsc 5 错误 | 极小 | N/A | 顺手做 |
| 11 | 🟢 低 | QQ/ASR/MediaSession 端到端实测 | 低（需环境） | N/A | 有浏览器/设备时 |

---

## 一、执行路线（分 4 轮）

### 第 1 轮：低成本顺手做（1 天，序 2/3/7/9/10）

这 5 项成本极低、无依赖、可一个执行者一轮做完。做完 commit 一次。

| 序 | 任务 | 改法概要 | 文件 |
|---|------|---------|------|
| 2 | String(err) → toErrorMeta | grep `String(err)` 全仓 catch 分支，机械替换为 `...toErrorMeta(err)` | radio.ts/index.ts/db/schedule/fileCleanup（13处） |
| 3 | JSON 兜底修复 | catch 返回 `mood: '随机'`（非 userInput）；复用 `extractJsonObject` | mimo.ts:135-144 |
| 7 | req as any 类型扩展 | 扩展 `types/express.d.ts` 加 `sessionId?`，删除 `as any` | sessionAuth/requestId/validate（3处） |
| 9 | reason 字段 | 要么补 `feedback → tasteBlock` 链路（把 reason 喂给 DJ），要么删字段（YAGNI）。**建议删**——单用户私人电台，skip 原因不必学 | db/index.ts/radio.ts |
| 10 | sideffects test tsc | 给 Song mock 补 `emotionTags: []/sceneTags: []` | useAudioPlayer.sideffects.test.ts |

**验证**：tsc 零错误（含消除 5 个既有错误）+ vitest ≥253/127。

---

### 第 2 轮：chat 防重入 + prompt 统一（1-2 天，序 4/5）

这两项有依赖关系（prompt 统一会改 chat handler，chat 防重入也改 chat handler），应一起做。

#### 序 4：chat 无取消 + 连发丢回复

**根因**（Mavis P1.4）：用户连发 3 条 → 3 个 fetch 同时飞 → `updateLastKimiMessage` 用 reverse findIndex 只更新最后一条 kimi → 前两个回复丢失。

**改法**：
1. `useSession.ts` 的 `sendChatMessage` 加 `AbortController` ref——重复进入时 abort 上一个 fetch
2. `updateLastKimiMessage` 改为按 **pending message id** 精确替换（不是"最后一条 kimi"）
3. InputArea 的 Enter 防抖（onKeyDown 后 500ms 内 disabled）作为前端兜底

**验证**：连发 3 条 → 只发 1 个 fetch（前两个被 abort）→ 1 个回复正常显示。

#### 序 5：AI prompt 样板统一

**根因**（Mavis P1.3）：personaBlock + tasteBlock + memoryBlock 在 intro/transition/chat/recommend 4 处独立拼接，改一处要改 4 次。

**改法**：在 `djPersona.ts` 新增 `composeSystemPrompt(intent, extras)` 统一构造。所有调用点走它：
```ts
// djPersona.ts 新增
export function composeSystemPrompt(
  intent: 'intro' | 'transition' | 'chat' | 'recommend',
  extras: { memoryBlock?: string; tasteBlock?: string; searchContext?: string; songContext?: string; timeWeather?: string }
): { system: string; user: string }
```

**注意**：保持各入口的字数约束（60-120 统一）和关键词高亮规则。不擅自收紧。

**验证**：改 personaBlock 一处 → 4 个入口行为一致 + tsc/test 全过。

---

### 第 3 轮：F4 isPlaying 仲裁层（3-5 天，序 1）⭐ 核心

这是**当前最大的架构债**。Mavis 审计从"暂缓"升级为"上线前必做"——我认同。

**为什么升级**：
- 16 个写点分散在 8 个文件，当前靠 React 批处理兜底
- MediaSession（锁屏控制）已上线、ASR 待上线——两者都依赖严格的 isPlaying 仲裁
- 第一次出现锁屏/耳机控制异常时再改，"将非常疼"（已踩过 FullscreenPlayer 闭包回归的坑）

**改法**（Mavis §3 给了完整方案，执行者照做）：
1. 新建 `frontend/src/store/playController.ts`——单点 reducer
2. 所有写点改为 `playController.dispatch(action)`
3. reducer 内部：算唯一 next isPlaying + 调一次 audio.play()/pause()
4. 新增 `playController.test.ts`——枚举 8 个 action 组合的状态转换

**风险**：这是跨 8 文件的架构改造，**必须充分测试**。建议：
- 改完后用 React DevTools Profiler 验证（铁律 5）
- E2E 测 4 个触发场景（锁屏+页面双写、DJ 说话时点播放、编排 effect 时序、路由切换）
- 给一个执行者单独做这一轮，不混其他任务

**验证标准**：
- tsc + vitest 全过（新增 playController.test.ts）
- 锁屏暂停 → 解锁开页面，KimiCard 显示与 audio 真实状态**严格一致**
- DJ 说话时点播放 → 不出现"应播不播/应停不停"

**给执行者的前科提醒**（写进方案顶部）：
> 这是跨 8 文件的架构改造。**不要为了"统一"顺手改其他逻辑**（如 audio.play()/pause() 顺序、"DJ 说话时暂停歌曲"是预期行为不要改）。只改 isPlaying 写入路径，不动业务逻辑。

---

### 第 4 轮：上线前加固（序 6/8 + 外部验证）

| 序 | 任务 | 改法概要 |
|---|------|---------|
| 6 | helmet CSP | `index.ts` 的 helmet() 配 Content-Security-Policy（限制 script/style/img/media-src） |
| 6 | WCAG 对比度 | grep CSS 变量色值，用对比度工具检查，不达标的调亮/调暗 |
| 6 | next/dynamic 代码分割 | /plan、/profile、/settings 的重型组件改 dynamic import |
| 6 | 独立 ErrorBoundary | 每个路由包独立 ErrorBoundary，崩溃不白屏 |
| 8 | chat DB 缓存 | userTaste.ts in-memory cache 30s TTL，feedback 写入时 invalidate |
| 11 | QQ/ASR/MediaSession 实测 | 需浏览器/真机环境，webbridge 无法模拟 |

**验证**：CSP 配完后 curl 确认 header / Lighthouse 跑无障碍审计 / DevTools Network 确认代码分割生效。

---

## 二、已否决的（不做）

| 项 | 否决理由 | 否决来源 |
|----|---------|---------|
| SSE 流式文本 | 瓶颈是 AI 速度不是传输 | grill-me |
| WebSocket 实时推送 | LRC 已本地高亮，不需推送 | grill-me |
| 上下文推荐（天气融入搜索） | 用户感知弱，DJ 串词已承担 | grill-me |
| 波形 RMS | CORS 可能解不了，降级可接受 | grill-me |
| CDN/缓存层 | 单用户本地应用无必要 | Mavis §8 |
| AI JSON Schema（zod 严格化） | fallback 路径越多越脆 | Mavis §8 |
| 拆分 radio.ts | 552 行不算巨型，分散反难维护 | Mavis §8 |

---

## 三、给执行者的分工建议

| 轮次 | 适合的执行者 | 理由 |
|------|------------|------|
| 第 1 轮（低成本顺手做） | **MiNiMax 或 DSpro** | 机械替换为主，需仔细（13处 String(err) 不能漏） |
| 第 2 轮（chat+prompt） | **DSpro** | 后端逻辑改造，DSpro 做过 chat 搜索前置，熟悉 radio.ts |
| 第 3 轮（F4 仲裁层） | **DSflash** | 前端架构改造，DSflash 做过 ProgressBar 抽离，熟悉组件订阅。**但必须附 Profiler 证据**（铁律 5） |
| 第 4 轮（上线加固） | **MiNiMax** | 批量配置类任务（CSP/代码分割/ErrorBoundary），MiNiMax 有审计经验 |

---

## 四、执行检查清单

### 第 1 轮
- [ ] String(err) 13处 → toErrorMeta（grep 确认零残留）
- [ ] JSON 兜底 mood='随机'（非 userInput）+ 复用 extractJsonObject
- [ ] req as any 3处 → express.d.ts 类型扩展
- [ ] reason 字段：删除（YAGNI）或补链路
- [ ] sideffects test Song mock 补 emotionTags/sceneTags
- [ ] tsc 零错误（含消除 5 个既有）+ vitest ≥253/127
- [ ] git commit + push

### 第 2 轮
- [ ] chat AbortController + 按 pending id 精确替换
- [ ] InputArea Enter 防抖
- [ ] composeSystemPrompt 统一 4 入口
- [ ] tsc + vitest 全过
- [ ] E2E：连发 3 条 → 只 1 个 fetch + 1 个回复
- [ ] git commit + push

### 第 3 轮（F4 核心）
- [ ] playController.ts 新建 + reducer
- [ ] 16 个写点改为 dispatch
- [ ] playController.test.ts（8 个 action 组合）
- [ ] **Profiler 证据**（KimiCard isPlaying 变化时渲染次数）
- [ ] E2E 4 场景（锁屏/说话时播放/编排时序/路由切换）
- [ ] tsc + vitest 全过
- [ ] git commit + push

### 第 4 轮
- [ ] helmet CSP 配置
- [ ] WCAG 对比度检查+修正
- [ ] next/dynamic 代码分割
- [ ] 独立 ErrorBoundary
- [ ] chat DB 缓存（userTaste.ts）
- [ ] QQ/ASR/MediaSession 实测（如有环境）
- [ ] tsc + vitest 全过
- [ ] git commit + push

---

## 五、一句话总结

**核心体验已完整（90%），剩下的主要是上线前加固（F4 仲裁 + CSP + 质量审查）。** Mavis 审计发现了 4 个我之前没找到的真实问题（JSON 兜底、chat 防重入、String(err)、prompt 统一），全部已整合进路线。**最紧迫的是 F4——从"暂缓"升级为"上线前必做"，因为 MediaSession + ASR 上线后竞态概率上升。**

---

*本方案整合了 Mavis 独立审计（16 类发现）+ 历史待办状态修正。4 轮分阶段执行，每轮独立验证。HANDOVER 第五节和 COLLABORATION 案例索引已同步更新。*
