# mimo-radio 下一步计划（2026-07-05 基于代码实况核实）

> **生成时间**：2026-07-05（规划者）
> **基于**：逐行代码核实，不靠记忆靠 grep。HANDOVER 第五节与实际代码有偏差，本文档以代码为准。
> **配套**：先读 `COLLABORATION.md` + `HANDOVER.md`

---

## 一、当前真实状态（代码核实，非记忆）

### 测试基线
- **后端**：274 passed（31 文件），tsc 零错误
- **前端**：173 passed（21 文件），tsc 零错误（sideffects 5 个既有错误**已修**）
- **Git**：已接入 GitHub，trunk-based，本地远程一致

### 已完成（按 roadmap 轮次）

| 轮次 | 任务 | 状态 | 核实方式 |
|------|------|------|---------|
| 第 1 轮 序3 | JSON 兜底 mood='随机' | ✅ 已完成 | `mimo.ts:147` 确认 `mood: '随机'`（非 userInput） |
| 第 1 轮 序10 | sideffects test tsc | ✅ 已完成 | tsc 零 sideffects 错误 |
| 第 1 轮 序8 | reason 字段 | ✅ 已删除 | `db/index.ts` grep reason = 0 |
| 第 4 轮 序6A | helmet CSP | ✅ 已完成 | `index.ts` contentSecurityPolicy 配置 + 14 supertest |
| 第 4 轮 序6B | WCAG 对比度 | ✅ 已完成 | color-contrast.ts + 41 测试 + 14 处修正 |
| 第 4 轮 序6C | next/dynamic 代码分割 | ✅ 已完成 | plan/profile 的 PlanTimeline/ProfileCard `dynamic(ssr:false)` |
| 第 4 轮 序6D | ErrorBoundary | ✅ 已完成 | 4 路由全包 + onError + 5 测试 |
| 第 4 轮 序7 | tasteCache | ✅ 已完成 | tasteCache.ts 30s TTL + invalidate |

### 部分完成（需补完）

| 任务 | 已做 | 残留 | 位置 |
|------|------|------|------|
| **String(err) → toErrorMeta** | 10/13 处已改 | **3 处残留**（index.ts:236 的 uncaughtException、logger.ts:189/195 是 toErrorMeta 自身实现，属正常） | 实际只剩 index.ts:236 一处真正该改（uncaughtException 用 `err.stack \|\| String(err)`） |
| **req as any 类型扩展** | 2/3 处已改 | **1 处残留**（index.ts:94 `(req as any).requestId`） | types/express.d.ts 已有 requestId 声明，这行可直接读 `req.requestId` |

### 未做（待执行）

| 轮次 | 任务 | 状态 |
|------|------|------|
| 第 2 轮 序4 | chat AbortController + 防重入 | ❌ 未做（`useSession.ts` grep AbortController = 0） |
| 第 2 轮 序5 | composeSystemPrompt 统一 4 入口 | ❌ 未做（`djPersona.ts` grep composeSystemPrompt = 0） |
| 第 3 轮 序1 | **F4 isPlaying 仲裁层** | ❌ 未做（`playController.ts` 不存在） |

---

## 二、下一步执行计划（3 件事，按紧迫度排序）

### 🔴 第一优先：第 3 轮 F4 isPlaying 仲裁层

**为什么最紧迫**：这是唯一的 P0。MediaSession（锁屏控制）已上线，ASR 待上线——两者都依赖严格的 isPlaying 仲裁。当前靠 React 批处理兜底，**触发概率在上升**。第一次出现锁屏/耳机控制异常时再改"将非常疼"。

**做什么**（Mavis §3 完整方案）：
1. 新建 `frontend/src/store/playController.ts`——单点 reducer
2. 16 个写点改为 `playController.dispatch(action)`
3. reducer 内部：算唯一 next isPlaying + 调一次 audio.play()/pause()
4. 新增 `playController.test.ts`——枚举 8 个 action 组合

**成本**：大（3-5 天，跨 8 文件）
**建议执行者**：**DSflash**（做过 ProgressBar 抽离，熟悉组件订阅，但**必须附 Profiler 证据**——铁律 5）
**验证**：锁屏暂停→解锁，KimiCard 显示与 audio 真实状态严格一致 + Profiler 录制

---

### 🟠 第二优先：第 2 轮 chat 防重入 + prompt 统一

**为什么紧迫**：用户连发 3 条消息 → 前两个 AI 回复**静默丢失**（token 已消耗）——这是正在发生的体验问题。

**做什么**：
1. `useSession.ts` sendChatMessage 加 AbortController——重复进入 abort 上一个 fetch
2. `updateLastKimiMessage` 改按 pending message id 精确替换
3. `djPersona.ts` 新增 `composeSystemPrompt(intent, extras)` 统一 4 入口

**成本**：中（1-2 天）
**建议执行者**：**DSpro**（做过 chat 搜索前置，熟悉 radio.ts）
**验证**：连发 3 条 → 只 1 个 fetch + 1 个回复

---

### 🟢 第三优先：残留补完（顺手做，10 分钟）

**String(err) 最后 1 处**：`index.ts:236` 的 uncaughtException handler——`err.stack || String(err)` 改为 `...toErrorMeta(err)`（注意：这是 process-level uncaughtException，toErrorMeta 可能不处理非 Error 对象，需确认）

**req as any 最后 1 处**：`index.ts:94` `(req as any).requestId` → 直接 `req.requestId`（types/express.d.ts 已声明 requestId）

**成本**：极低
**建议**：并入第一或第二优先轮次顺手做

---

## 三、外部环境验证（有条件时做）

| 项 | 需要什么 | 验证什么 |
|----|---------|---------|
| QQ 音源端到端 | webbridge 打开 y.qq.com 登录 tab | 搜索/封面/播放 URL/歌词全链路 |
| ASR 语音输入 | 真实浏览器 + 麦克风 | 录音→识别→填入输入框 |
| MediaSession 锁屏 | 真实移动设备 | 锁屏暂停/播放/下一首响应 |

**建议**：在 F4 仲裁层做完后（isPlaying 仲裁正确），再做 MediaSession 实测——否则锁屏控制 bug 可能是 F4 竞态，测了也分不清根因。

---

## 四、项目完成度评估

| 维度 | 完成度 | 说明 |
|------|--------|------|
| 核心播放 | ✅ 100% | 播放/点歌/换歌/收藏/队列 |
| AI DJ | ✅ 95% | 三层记忆闭环（唯一缺口：净分品味排序） |
| 页面 UI | ✅ 100% | 4 页面全通，封面/主题/歌词沉浸 |
| 流畅性 | ✅ 90% | 换歌反馈+重渲染优化，剩 F4 仲裁 |
| 安全 | ✅ 95% | CSP+SSRF+WCAG 已做，剩 String(err)/req as any 各 1 处 |
| 上线就绪 | 🟡 85% | 缺 F4 仲裁 + chat 防重入（两者都是上线前必做） |
| 外部验证 | 🟡 50% | QQ/ASR/MediaSession 代码在但未实测 |

**总完成度：约 92%**。剩余 8% 是 F4 仲裁层 + chat 防重入 + 外部验证。

---

## 五、建议执行路线

| 轮次 | 做什么 | 执行者 | 成本 | 紧迫度 |
|------|--------|--------|------|--------|
| **下一轮** | F4 isPlaying 仲裁层 + 残留补完 | **DSflash** | 3-5 天 | 🔴 最高 |
| 再下一轮 | chat 防重入 + composeSystemPrompt | **DSpro** | 1-2 天 | 🟠 高 |
| 有环境时 | QQ/ASR/MediaSession 实测 | 任意 | 低 | 🟢 条件触发 |

**一句话**：核心体验完整了（92%），上线只差 F4 仲裁层（isPlaying 单点控制）和 chat 防重入（连发不丢回复）。做完这两件 + 外部验证，就可以上线。

---

*本计划基于 2026-07-05 代码实况核实。HANDOVER 第五节部分项过时（序3/8/10/6 已完成但标"待办"），建议下次执行者顺手更新。*
