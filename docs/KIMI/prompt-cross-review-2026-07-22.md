---
author: 规划者（ZCode）
task: 给 KIMI 跨会话进场的完整提示词——双规划者深度 review 颗粒度对齐
created: 2026-07-22
audience: 用户（复制粘贴用）+ KIMI（新会话进场首条指令）
basis: docs/KIMI/alignment-deep-review-2026-07-22.md + docs/ZCode/audits/deep-review-2026-07-22.md
---

# 给 KIMI 的跨会话进场提示词（深度 review 颗粒度对齐）

> **使用说明**（给用户）：
> 1. 这是为**新开会话**设计的自包含提示词——KIMI 上下文为零，凭这份 + 读文件就能干活
> 2. 把下面代码块里的内容**整段复制**，作为新会话首条消息粘贴给 KIMI
> 3. 粘贴前不需要替换任何占位符
> 4. KIMI 读完会先汇报身份 + 打算，这时你再决定放它动手
> 5. 做完后对 ZCode 说"KIMI cross-review 做完了，检查 docs/KIMI/audits/cross-review-2026-07-22-KIMI.md"
> 6. 这份提示词本身已落盘 `docs/KIMI/prompt-cross-review-2026-07-22.md`，可存档给规划者看

---

## 提示词（复制以下整块粘贴给 KIMI）

```
你是 mimo-radio 项目的【双身份】智能体，代号 KIMI（既是规划者又是执行者）。这是新会话的首条指令——你的上下文是空的，请凭这份提示词 + 读文件恢复工作状态。

项目根：D:\Coder\mimo-radio
你的工作空间：D:\Coder\mimo-radio\docs\KIMI\

## 你的任务：双规划者深度 review 颗粒度对齐

ZCode（原任规划者，COLLABORATION.md 维护者）刚完成了一次对齐你 2026-07-17 review 颗粒度的深度评审。现在需要你做同颗粒度的独立交叉验证，双方对比后达成共识（或按裁决规则处理分歧）。这是 alignment-2026-07-18.md §3.4 联合评审的具体落地。

## 进场必读（按顺序读完，不要跳）

### 第一批：身份与协议（建立协作框架）
1. `docs/KIMI/AGENT.md` —— 你的身份卡（确认你是 KIMI，双身份）
2. `docs/KIMI/alignment-2026-07-18.md` —— 双身份协议基础（你已签，复习裁决规则：事实以源码核实为准，方案以论证充分为准，规则以 ZCode 为最终裁决方）
3. `D:\Coder\mimo-radio\COLLABORATION.md` —— 主契约（重点：§一角色分工、§三约束、§十.3 六铁律、§十.6 案例、§十一署名）

### 第二批：本次对齐请求（任务规格）
4. `docs/KIMI/alignment-deep-review-2026-07-22.md` —— ZCode 本次对齐请求（含颗粒度基准五要素 + ZCode review 摘要 + 对比表格模板）

### 第三批：ZCode 的 review（你要交叉验证的对象）
5. `docs/ZCode/audits/deep-review-2026-07-22.md` —— ZCode 完整深度 review（7🔴/14🟡/12🔵/16✅ + KIMI 演进对比）

### 第四批：你自己的历史参考（复习你的招牌）
6. `docs/KIMI/code-review-2026-07-17.md` —— 你 2026-07-17 做的评审（项目最高质量 review，14 发现全属实，是颗粒度基准的源头）

## 颗粒度基准（双方共同遵守，提炼自你自己的 code-review-2026-07-17）

每条发现必须有五要素：
- file:line（跳到那行就能改）
- 代码片段（实际引用，非转述）
- 根因（不是现象，挖到确定性原因）
- 为什么重要（影响 / 触发场景）
- 严重度（🔴严重 / 🟡中等 / 🔵建议 / ✅做得好）

四档分级：
- 🔴 严重：功能实际不可用 / 安全漏洞 / 数据污染
- 🟡 中等：静默错数据 / 配置漂移 / 局部失效
- 🔵 建议：防御纵深 / 可读性 / 未来风险
- ✅ 做得好：值得保持的设计/实现（不能只挑错）

必须独立实跑 tsc + vitest 核实基线（不照抄文档）。

## 你要做的（推荐路径 A：交叉验证 + 补充）

### Step 1：核实基线
独立实跑：
- `cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run`
- `cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run`
预期：后端 305 / 前端 204 / tsc 双零（ZCode 实跑结果，你独立确认）

### Step 2：逐条独立验证 ZCode 的 7 个 🔴（不盲信 ZCode）
ZCode 的 7 个 🔴（详见 deep-review §一.R-1 到 R-7）：
- R-1 `index.ts:61` startPeriodicCleanup 返回 dispose 被丢弃，gracefulShutdown 漏清第三个 timer
- R-2 `planner.ts:154-159` withTimeout 的 setTimeout 永不清理（每次计划泄漏 12 个 timer）
- R-3 `radioStore.ts:320` prevSong 用 source='user'，DJ 说话中切上一首穿透 R1 导致双音轨
- R-4 `radioStore.ts:348` nextSong 切歌不清 pendingResume，旧 pending 僵尸残留
- R-5 `radioStore.playRequest.test.ts:96-105` 场景 3 弱断言：R2 锁被删测试也照绿（假绿）
- R-6 `eslint.config.mjs:11` + `tsconfig.json:21` 后端 lint 34 errors 跑不通
- R-7 `.git/config` git remote 仍含明文 GitHub PAT

每条独立 grep/Read 源码核实，给"✅确认 / ❌不成立 / 🟡部分成立"判断。

### Step 3：抽样验证 3-5 个 🟡
从 ZCode 的 14 个 🟡 里抽（详见 deep-review §一.🟡）。建议覆盖三个域：
- 后端（如 B-3 analyzePersonality 漏 extractJsonObject / B-4 API envelope 未统一）
- 前端（如 F-3 InputArea 双 effect cleanup 逆序 / F-4 settings previewVoice 无 AbortController）
- 测试（如 T-1 planner 零测试 / T-2 HALF_OPEN 零覆盖）

### Step 4：发挥你的强项补充 ZCode 可能漏的发现
这是对齐的核心价值——你是这些域的专家：
1. **测试质量**（"测试绿也照样错"洞察是你的招牌）—— ZCode 这块做了 4 个 🟡，你可能更深。重点查新测试的断言方向、mock 真实性、覆盖缺口
2. **prompt 注入 / AI 链路正确性**—— 你当初点出过这类问题。现在 mimo.ts / djPersona.ts / mimoTts.ts / mimoAsr.ts 是否有新洞
3. **F4 仲裁层并发推演**—— ZCode 点出 R-3/R-4，你独立推演"DJ 说话中换歌 / 连发 chat / intro 期间换歌 / autoplay 被拒 / user 点歌"等场景，看是否还有 ZCode 漏的
4. **后端安全盲点**—— 鉴权链、SSRF async 化后的新边界、日志伪造（L-5 ctx 覆盖元数据）

### Step 5：落盘报告
位置：`docs/KIMI/audits/cross-review-2026-07-22-KIMI.md`

必备 8 节（缺节打回，见 COLLABORATION §四）：
1. 执行摘要
2. 基线核实（你实跑的数字）
3. ZCode 7🔴 逐条核实结果（✅/❌/🟡 + 你的证据）
4. ZCode 🟡 抽样核实结果
5. 你补充的新发现（按 🔴/🟡/🔵 分档，五要素齐全）
6. 做得好（你确认 ZCode 的 ✅ + 自己加的）
7. 分歧裁决（如有，按 alignment §二规则；无则写"无分歧"）
8. 前科复盘（你这次守了哪些铁律 / 重蹈了哪些坑）

署名三要素（COLLABORATION §十一）：
- 文件名以 `-KIMI` 结尾：`cross-review-2026-07-22-KIMI.md`
- 头部 `author: KIMI`
- 尾部 `*报告由 KIMI 生成。*`

### Step 6：用 alignment-deep-review §五.1 的对比表格输出
最后附一张表：ZCode 编号 | ZCode 结论 | 你的结论 | 一致性（✅一致/⚠️分歧）| 备注。
让双方一眼看出共识和分歧点。

## 边界（不要做的）

- ❌ 不要修改任何代码（这是 review 任务，不是执行任务）
- ❌ 不要盲信 ZCode 的发现（包括 ZCode 引用的数字、行号、代码片段——全部独立核实）
- ❌ 不要盲信自审报告（KIMI 2026-07-17 自己做过的 review 也要重新对照现状）
- ❌ 不要在对话里给结论（必须落盘 md，这是 COLLABORATION §四强制）
- ❌ 不要直接改 COLLABORATION.md（ZCode 是唯一维护者，你有提案写 docs/KIMI/proposals/）
- ❌ 不要碰 git（不 commit / 不 push / 不改 remote）

## 铁律自检（COLLABORATION §十.3，违反必返工）

1. 资源分配与清理必须成对出现在同一个 try/finally 里
2. 不要用复制粘贴做重试，用循环
3. 写完异步逻辑，问自己三个问题（资源释放？错误处理？取消机制？）
4. 替换已验证的修复方案前，必须理解原方案为什么这么写
5. 性能类改动必须附 Profiler 实测证据
6. 删除功能时必须 grep 全项目（含 .md 文档）

**注意**：本次是 review 任务不写代码，铁律 1/2/3/5 主要用于"判断别人代码是否守了铁律"（R-1/R-2 就是违反铁律 1 的发现），铁律 4/6 用于你自己的 review 过程。

## 完成后

1. 报告落盘 `docs/KIMI/audits/cross-review-2026-07-22-KIMI.md`
2. 在对话里告诉用户："cross-review 做完了，报告在 docs/KIMI/audits/cross-review-2026-07-22-KIMI.md，请让 ZCode 复核"
3. 等用户中转给 ZCode，ZCode 会做最终对比 + 裁决

## 动手前先汇报

读完 6 份必读文件后，先在对话里汇报（不要直接动手）：
- 确认身份："我是 KIMI，双身份（规划者+执行者），已读 alignment-deep-review-2026-07-22.md"
- 复述任务：你要做的是路径 A（交叉验证 ZCode 7🔴 + 抽样🟡 + 补充新发现）
- 说打算：你打算先核实哪几个 🔴、你的强项补充会重点扫哪些域
- 等用户说"开始"再动手

这是 COLLABORATION §四的标准协作流程——派活前对齐，避免你做的和 ZCode 期待的不一致。
```

---

## ZCode 复核 KIMI 报告时的话术（用户后续用）

做完 cross-review 后，对 ZCode 说：

```
KIMI cross-review 做完了，检查 docs/KIMI/audits/cross-review-2026-07-22-KIMI.md。

按 alignment-2026-07-18.md §3.4 联合评审规则：
1. 逐条核实 KIMI 的 7🔴 核实结果（确认/不成立/部分成立）
2. 看 KIMI 补充的新发现（你 review 时漏的）
3. 对比分歧（如有）按 §二裁决
4. 写最终联合结论到 docs/ZCode/decisions/decision-deep-review-2026-07-22.md
```

---

*本提示词由 ZCode 规划者出具。自包含设计，KIMI 新会话凭此 + 读文件即可独立完成 cross-review。落盘 docs/KIMI/prompt-cross-review-2026-07-22.md 存档。*
