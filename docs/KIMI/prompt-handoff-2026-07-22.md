---
author: 规划者（ZCode）
task: 给 Kimi Code CLI 的中转提示词（两份：看裁决 + 接 🔴 必修活）
created: 2026-07-22
usage: 用户在 ZCode 窗口和 Kimi CLI 窗口之间复制粘贴当信使
---

# 中转给 Kimi Code CLI 的提示词（两份）

> **使用说明**（给用户）：
> - Kimi Code CLI 在另一个窗口跑，ZCode 没法直接通信，你在中间当信使
> - **第一份提示词**：让 Kimi 看联合裁决 + 给反馈（轻量，先建立共识）
> - **第二份提示词**：让 Kimi 接 🔴 必修活（重量，执行 + 报告）
> - 两份可以分两次派（推荐），也可以合并成一次（看 Kimi 的上下文余量）
> - 每份都标了"拖这些文件给 Kimi"，整文件拖过去即可（不用选中复制）

---

## 第一份提示词：让 Kimi 看联合裁决 + 给反馈

### 拖这些文件给 Kimi（让它读）

```
docs/ZCode/decisions/decision-deep-review-2026-07-22.md   ← ZCode 的联合裁决（核心）
docs/KIMI/audits/cross-review-2026-07-22-KIMI.md          ← 你（Kimi）自己的 cross-review（复习）
```

### 提示词（复制以下整块粘贴给 Kimi CLI）

```
你是 mimo-radio 项目的双身份规划者 KIMI。我刚（在另一个 ZCode 会话里）完成了对你 cross-review 的联合评审裁决，现在把结果中转给你。

项目根：D:\Coder\mimo-radio

请读这两份文件：
1. docs/ZCode/decisions/decision-deep-review-2026-07-22.md —— ZCode 的联合裁决
2. docs/KIMI/audits/cross-review-2026-07-22-KIMI.md —— 你自己刚做的 cross-review（复习）

裁决摘要（详见 decision 文件）：
- 基线共识：305/204 双零，无分歧
- 你的 4 项推翻（R-3/R-4/R-5 场景3/F-3）**全部经 ZCode 独立验证为正确**——ZCode 走查了源码 + 写了一次性 vitest 实验（React 18 cleanup 顺序实测声明正序）确认
- 你的 N-1（nextSong 阶段2 死路径）被定为"本轮最高价值新发现"
- ZCode 原 7🔴 校准为 4🔴（R-3/R-4/R-5 降级，R-1/R-2/R-6/R-7 维持）
- 你新增 6 项（N-1~N-6）全部采纳
- 联合最终：4🔴 / 13🟡 / 14🔵 / 18✅

请给我反馈：
1. 对裁决有无异议？特别是：
   - 你认同 N-1 被定为"最高价值新发现"吗？
   - 你认同 R-3/R-4 降到 🟡/🔵（而不是维持 🔴）吗？
   - 你对 F-3 被撤销有无异议（你之前做了实验说 React cleanup 是声明正序，ZCode 复核实验也确认了）
2. 你补充的 N-1~N-6 里，有没有哪条你认为是 🔴 被错降到 🟡/🔵 的？
3. 裁决 §九的下一步动作建议（🔴 必修 4 项 + 🟡 应修），你打算接哪几项？还是全接？

边界：
- 这是反馈环节，不要写代码
- 反馈直接在对话里给即可（不用落盘 md），因为这是讨论不是正式产出
- 如有异议无法在对话解决，我们走 alignment §二.4（用户裁决）

读完文件后先复述你的理解（确认我们认知一致），再给反馈。等你说"无异议"或提出具体分歧后，再进入下一步派活。
```

### 等待 Kimi 回复

Kimi 给反馈后，你把它的回复贴回 ZCode 窗口给我。我会：
- 如果**无异议** → 直接进入第二份提示词（派 🔴 必修活）
- 如果**有分歧** → 我处理分歧，必要时更新裁决文档

---

## 第二份提示词：让 Kimi 接 🔴 必修活

> **前置条件**：第一份提示词后 Kimi 无异议（或分歧已解决）再用这份。

### 拖这些文件给 Kimi（让它读）

```
docs/ZCode/decisions/decision-deep-review-2026-07-22.md   ← 裁决（背景，§九有动作清单）
docs/KIMI/alignment-2026-07-18.md                         ← 双身份协议（如已读可跳）
D:\Coder\mimo-radio\COLLABORATION.md                      ← 主契约（铁律 + 报告规范）
```

### 提示词（复制以下整块粘贴给 Kimi CLI）

```
你是 mimo-radio 项目的双身份规划者 KIMI。联合评审已完成（你看过的 decision-deep-review-2026-07-22.md），现在进入执行阶段。请接手 🔴 必修项。

项目根：D:\Coder\mimo-radio
你的工作空间：docs/KIMI/

## 任务：🔴 必修 4 项（详见 decision §九，按顺序做）

### Task 1: R-6 后端 lint 修复
- 位置：backend/eslint.config.mjs + backend/tsconfig.json
- 问题：tsconfig exclude 了 src/**/*.test.ts（让 dist 不含 test.js），但 eslint config 的 files: ['src/**/*.ts'] 仍匹配 test 文件，type-aware parser 找不到 project 就 parse 失败 → 34 errors
- 改法：eslint config 加 ignores: ['src/**/*.test.ts']，或为 test 单独配一个不带 parserOptions.project 的 block
- 验证：cd backend && npm run lint → 应 0 errors（warnings 可保留）
- ⚠️ 不要为了过 lint 而改测试文件本身

### Task 2: R-1 + N-6 timer 清理（同族，一起做）
- 位置：backend/src/index.ts:61（startPeriodicCleanup）+ backend/src/index.ts:70（planner 预热 setTimeout）
- 问题：
  - R-1: startPeriodicCleanup 返回 dispose 函数 () => clearInterval(timer)，但 index.ts:61 没接返回值，gracefulShutdown（index.ts:115-130）也没调它
  - N-6: planner 预热的 setTimeout(..., 3000) 也无 unref/无清理（同族漏点）
- 改法：
  - 接住 startPeriodicCleanup 返回值存模块级变量，在 gracefulShutdown 里调
  - planner 预热的 setTimeout 句柄也存起来，gracefulShutdown 里 clearTimeout，或加 .unref()
- 验证：cd backend && npx tsc --noEmit && npx vitest run → 305 passed 不回归

### Task 3: R-2 planner withTimeout clearTimeout
- 位置：backend/src/services/planner.ts:154-159
- 问题：Promise.race 超时模式没配 clearTimeout，每次计划泄漏 12 个 timer（挂到 8s）
- 改法：对齐 fetchWithTimeout.ts:167-169 的正确写法（timer ref 拿出来，race 后 finally clearTimeout）
- 验证：cd backend && npx vitest run src/services/planner.test.ts（如果有）或全测

### Task 4: R-7 git PAT —— 不是你的活，跳过
（这是用户操作，Kimi 做不了。提醒用户去 GitHub 撤销 token + 改 SSH）

## 执行纪律（alignment + COLLABORATION §四）

1. 每个 Task 改前 Read 现状确认行号（可能漂移）
2. 每个 Task 改后跑 tsc + 相关 vitest
3. 全部完成后跑全量验证：backend 305 + frontend 204 + tsc 双零
4. 一次性 commit（4 个 Task 一个 commit "fix: 深度 review 🔴 必修——lint 修复 + timer 清理 + withTimeout clearTimeout"）
5. push 到 master

## 报告（强制落盘）

位置：docs/KIMI/reports/exec-deep-review-p0-2026-07-22-KIMI.md

8 节齐全（缺节打回，见 COLLABORATION §四）：
1. 执行摘要
2. 改动明细（表格：文件 | 改动 | 行号）
3. 验证结果（lint 输出 / tsc / vitest 数字）
4. 与规格的偏差（如有声明，无则写"无偏差"）
5. 自评（你发现的问题/风险）
6. 前科复盘（铁律 1：资源成对——你是怎么把 timer 都配对的；铁律 4：lint 修复时是否动了不该动的）
7. 状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）
8. 落款 *报告由 KIMI 生成。*

署名三要素（COLLABORATION §十一）：
- 文件名 -KIMI 后缀
- 头部 author: KIMI
- 尾部 *报告由 KIMI 生成。*

## 边界（不要做的）

- ❌ 不要碰 🟡 应修项（N-1/N-2/N-3/R-3/F-4/R-5 等）—— 那是下一轮
- ❌ 不要改 COLLABORATION.md（ZCode 唯一维护者）
- ❌ 不要碰 git PAT（Task 4 跳过）
- ❌ 不要为了过 lint 而改测试断言（铁律：除非规格要求，不为过测试改断言）

## 动手前先汇报

读完文件后先汇报（不要直接动手）：
- 确认任务：4 个 Task（实际 3 个，Task 4 跳过）
- 说打算：你打算先做哪个、改前打算 Read 哪几个文件确认行号
- 等用户说"开始"再动手

做完后告诉用户："做完了，报告在 docs/KIMI/reports/exec-deep-review-p0-2026-07-22-KIMI.md，请让 ZCode 复核"。
```

### 等待 Kimi 做完

Kimi 做完后报告落盘 `docs/KIMI/reports/exec-deep-review-p0-2026-07-22-KIMI.md`，你回到 ZCode 窗口对我说：

```
KIMI 🔴 必修做完了，检查 docs/KIMI/reports/exec-deep-review-p0-2026-07-22-KIMI.md。
```

我会按标准流程逐项核实 + 打分 + 前科提醒。

---

## 中转注意事项

1. **Kimi CLI 是新会话**：它的上下文是空的，第一份提示词里的文件路径它都得现读
2. **不要合并两份提示词**：第一份是讨论（轻），第二份是执行（重）。分开能让 Kimi 专注
3. **如果 Kimi 在第一份提出异议**：先别派第二份，把异议贴回 ZCode 处理完再说
4. **拖文件而不是复制内容**：md 文件整文件拖给 Kimi 比复制粘贴可靠（不会丢格式）

---

*本中转指南由 ZCode 规划者出具。落盘 docs/KIMI/prompt-handoff-2026-07-22.md 存档。*
