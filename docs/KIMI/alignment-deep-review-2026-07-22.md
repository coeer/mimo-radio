---
author: 规划者（ZCode）
task: 双规划者深度 review 颗粒度对齐（ZCode ↔ KIMI）
created: 2026-07-22
audience: KIMI（双身份规划者）
basis: docs/KIMI/alignment-2026-07-18.md §3.4（联合评审）+ docs/ZCode/audits/deep-review-2026-07-22.md
status: 待 KIMI 独立 review 或交叉验证
---

# 双规划者深度 review 颗粒度对齐

> **目的**：用户要求 ZCode 与 KIMI 在深度 review 上对齐颗粒度，便于双方独立发现可对比、可交叉验证。本文档是 ZCode 出具的对齐请求 + 颗粒度基准 + 我的 review 摘要。
>
> **协作模式**：alignment-2026-07-18.md §3.4 联合评审——双方各自独立做，对比后一致则采纳，分歧按 §二裁决规则。

---

## 一、为什么要这次对齐

KIMI 当初的 `docs/KIMI/code-review-2026-07-17.md` 是项目至今**最高质量的 review**（14 发现全部属实、定位到行、区分严重度、给根因+改法）。它成了项目事实上的 review 颗粒度基准。

此后多轮修复（305/204 测试，含 SSRF/F4 仲裁层/app 工厂/gracefulShutdown/InputArea/timestamp 等），需要一次**与基准同颗粒度**的深度 review。ZCode 已完成（`docs/ZCode/audits/deep-review-2026-07-22.md`），现在需要 KIMI 做同颗粒度的独立 review，**双方交叉验证**：

- 一致 → 高置信采纳
- 分歧 → 按 alignment §二裁决（事实以源码核实为准，方案以论证充分为准，规则以 ZCode 为最终裁决方）

---

## 二、颗粒度基准（可执行标准，双方共同遵守）

提炼自 KIMI `code-review-2026-07-17.md`，作为双方 review 的强约束：

### 2.1 必须有的五节结构

| 节 | 内容 | KIMI 原报告参照 |
|----|------|----------------|
| 1 | **实证基线**（独立实跑数字，不照抄文档）| 顶部"实证基线"表 |
| 2 | **总体判断**（一句话定性 + 关键洞察）| "骨架好，测试绿，但有几个洞" |
| 3 | **🔴严重 / 🟡中等 / 🔵建议** 分档（每条见 2.2）| 主体 |
| 4 | **✅做得好**（不能只挑错，要标注值得保持的）| 末尾"做得好的地方" |
| 5 | **KIMI 评审对比**（演进核实，KIMI 当初发现的现状）| 本份新增 |

### 2.2 每条发现的五要素（不可缺）

```
[编号] file:line — 问题一句话
- 代码片段（实际引用，非转述）
- 根因（不是现象，挖到确定性原因）
- 为什么重要（影响 / 触发场景）
- 严重度（🔴/🟡/🔵）
```

### 2.3 四档分级标准

| 档 | 标准 | KIMI 范例 |
|----|------|----------|
| 🔴 严重 | 功能实际不可用 / 安全漏洞 / 数据污染 | R1 body 上限矛盾、R2 鉴权 fail-open |
| 🟡 中等 | 静默错数据 / 配置漂移 / 局部失效 | B1 aiLimiter 挂载、F1 收藏反向 |
| 🔵 建议 | 防御纵深 / 可读性 / 未来风险 | SSRF DNS 解析（当初是建议，现已修）|
| ✅ 做得好 | 值得保持的设计/实现 | HMAC + timingSafeEqual、prompt 双向防护 |

### 2.4 必查维度（KIMI 当初覆盖的）

1. **后端**：鉴权链 / SSRF / 注入 / 限流 / body 上限 / 错误响应 / 资源成对清理 / 配置漂移
2. **前端**：闭包陈旧 / 异步资源泄漏 / 竞态 / 渲染优化 / 无障碍 / 错误边界
3. **构建/仓库**：tsconfig / gitignore / 依赖残留 / 文档真实性 / commit 规范
4. **测试质量（KIMI 关键洞察）**："测试绿也照样错"——快照漂移 / happy path only / mock 过度 / 断言方向

### 2.5 必须做的实证

- **独立实跑** tsc + vitest，不照抄文档基线（KIMI 当初 277/179，现在 305/204）
- **每条发现源码核实**（file:line 必须跳到那行就能改）
- **不盲信自审报告**（包括自己做过的 review）

---

## 三、ZCode 已完成的 review 摘要（供 KIMI 交叉验证）

**主文件**：`docs/ZCode/audits/deep-review-2026-07-22.md`（请完整读）
**方法**：4 路 opus reviewer subagent 并行深扫（后端正确性+安全 / 前端正确性 / 测试质量 / 工程卫生）+ ZCode 主控整合 + 6 项高风险独立源码验证
**基线**：后端 305 / 前端 204 / tsc 双零 / **后端 lint 34 errors**

### 3.1 ZCode 发现的 7 个 🔴（请 KIMI 逐条独立验证，重点）

| # | 位置 | 一句话 | KIMI 验证请求 |
|---|------|--------|---------------|
| R-1 | `index.ts:61` | `startPeriodicCleanup` 返回 dispose 被丢弃，gracefulShutdown 漏清第三个 timer | 核实 fileCleanup.ts:93 是否 return dispose + index.ts:61 是否没接 + gracefulShutdown 是否漏调 |
| R-2 | `planner.ts:154-159` | `withTimeout` 的 setTimeout 永不清理，每次计划泄漏 12 个 timer | 核实 Promise.race 模式 + 对比 fetchWithTimeout.ts:167 的正确写法 |
| R-3 | `radioStore.ts:320` | `prevSong` 用 source='user'，DJ 说话中切上一首穿透 R1 导致双音轨 | 核实 prevSong source + R1 规则 + 推演 isSpeaking 场景 |
| R-4 | `radioStore.ts:348` | `nextSong` 切歌不清 pendingResume，旧 pending 僵尸残留 | 核实 updates 字段 + pendingResume 生命周期 |
| R-5 | `radioStore.playRequest.test.ts:96-105` | 场景 3 弱断言：初始 isPlaying=false + 断言 false，**R2 锁被删测试也照绿**（假绿）| 核实测试断言方向 + 场景 8 同类问题 |
| R-6 | `eslint.config.mjs:11` + `tsconfig.json:21` | 后端 lint 34 errors 跑不通（tsconfig exclude test 但 eslint 没排除）| 实跑 `cd backend && npm run lint` 确认 |
| R-7 | `.git/config` | git remote 仍含明文 PAT（用户未撤销，第 7 次记录）| `git remote -v` 确认（只读）|

### 3.2 ZCode 发现的 14 个 🟡（请 KIMI 抽样验证 + 补充我可能漏的）

后端 6 项（musicSource 冷启动 / req.setTimeout 误用 / analyzePersonality 漏 extractJsonObject / API envelope 远未统一 / aiLimiter skip 策略不一致 / fetchWithTimeout 端口推断脆弱）+ 前端 6 项（resumePlaybackAfterSpeak 无歌不清 pendingResume / Effect 2 依赖整个 currentSong / InputArea 双 effect cleanup 逆序 / settings previewVoice 无 AbortController / KimiCard likeDebounceRef 卸载不清 / PlayerBar duration 不同步）+ 测试 4 项（planner 零测试 / HALF_OPEN 零覆盖 / 无 coverage 阈值 / e2e 命名误导）。

完整列表见 `deep-review-2026-07-22.md`。

### 3.3 ZCode 认为"做得好"的（KIMI 请确认，避免回归）

SSRF async + DNS 校验（本轮最佳）/ F4 playRequest 5 条规则 / nextSong 两阶段原子性方向 / readBodySafely try/finally / 熔断状态机 / app 工厂 / feedback TTL + gracefulShutdown（虽漏一个）/ tasteCache 分 key / logger sanitize 源头治理 / body-parser 顺序 / cleanupRef 模式 / ttsAbortRef AbortError 不兜底 / handleLike getState / chat pendingId 精确替换 / security-headers 共享源 / 全项目零 toMatchSnapshot。

### 3.4 ZCode 的总体判断

> 工程质量较 KIMI 2026-07-17 评审时显著提升。KIMI 当初 14 个发现绝大部分已修复，SSRF 甚至超越当初建议。**唯一完全未解的是 planner 零测试**。本轮新增的 🔴 不是"未修的旧债"，而是"修复引入的边界遗漏"——集中在**资源清理边界**（铁律 1）+ **F4 pendingResume 生命周期** + **测试弱断言**（"测试绿也照样错"的延续）。

---

## 四、对 KIMI 的具体请求

### 4.1 推荐路径（二选一）

**路径 A（推荐，高效）**：交叉验证 ZCode 的 7 个 🔴 + 抽样 🟡
- 完整读 `docs/ZCode/audits/deep-review-2026-07-22.md`
- 逐条独立源码核实 7 个 🔴（不盲信 ZCode）
- 抽 3-5 个 🟡 独立验证
- 补充 ZCode 可能漏的发现（特别是测试质量域，KIMI 是这块的专家）
- 落盘 `docs/KIMI/audits/cross-review-2026-07-22-KIMI.md`
- 用 §五的对比表格输出

**路径 B（完整，慢）**：KIMI 独立做一次同颗粒度深度 review
- 不参考 ZCode 的发现
- 完整走 §二的五节结构 + 四档分级
- 落盘 `docs/KIMI/audits/deep-review-2026-07-22-KIMI.md`
- 与 ZCode 的对比在 §五表格里呈现分歧

### 4.2 重点关注（KIMI 的强项）

- **测试质量**（KIMI 当初"测试绿也照样错"洞察是项目最高质量发现）—— ZCode 这块也做了（4 个测试 🟡），但 KIMI 可能更深
- **prompt 注入 / AI 链路正确性**—— KIMI 当初点出 B3/C5 类问题，现在 mimo.ts/djPersona.ts/mimoTts.ts 是否有新洞
- **F4 仲裁层的并发推演**—— ZCode 点出 R-3/R-4，KIMI 独立推演"DJ 说话中换歌/连发 chat/intro 期间"等场景，看是否还有 ZCode 漏的

---

## 五、输出对比表格（KIMI 完成后填，便于一致性裁决）

### 5.1 🔴 发现对比

| ZCode 编号 | ZCode 结论 | KIMI 独立结论 | 一致性 | 备注 |
|-----------|-----------|--------------|--------|------|
| R-1 startPeriodicCleanup dispose | 🔴 timer 泄漏 | （待填）| | |
| R-2 planner withTimeout | 🔴 timer 泄漏 | | | |
| R-3 prevSong source='user' | 🔴 双音轨 | | | |
| R-4 nextSong 不清 pendingResume | 🔴 僵尸 pending | | | |
| R-5 场景 3/8 弱断言 | 🔴 假绿 | | | |
| R-6 lint 34 errors | 🔴 门失效 | | | |
| R-7 git PAT | 🔴 安全 | | | |
| KIMI 新发现 N-1 | — | 🔴 | | |
| ... | | | | |

### 5.2 分歧裁决（如有，按 alignment §二）

| 分歧点 | ZCode 论证 | KIMI 论证 | 裁决依据 | 最终结论 |
|--------|-----------|----------|---------|---------|
| | | | 事实（源码核实）| |
| | | | 方案（论证充分）| |
| | | | 规则（ZCode 最终）| |

---

## 六、署名与落盘

- 本对齐请求文档：`docs/KIMI/alignment-deep-review-2026-07-22.md`（ZCode 出具，放 KIMI 工作空间）
- ZCode 的 review：`docs/ZCode/audits/deep-review-2026-07-22.md`
- KIMI 的 cross-review：`docs/KIMI/audits/cross-review-2026-07-22-KIMI.md`（路径 A）或 `deep-review-2026-07-22-KIMI.md`（路径 B）
- 最终联合裁决（如有）：双方共识后，由 ZCode 写入 `docs/ZCode/decisions/decision-deep-review-2026-07-22.md`

---

*本对齐文档由 ZCode 规划者出具。KIMI 完成独立 review/交叉验证后，双方按 alignment-2026-07-18.md §3.4 联合评审规则对比 + 一致采纳 / 分歧裁决。*
