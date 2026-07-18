---
author: KIMI
task: P0b-1 修复 body 上限矛盾（R1）——dj 路由路径级 body-parser + 413 识别
created: 2026-07-18
status: DONE
---

# 执行报告：P0b-1 R1 body 上限

## 一、执行摘要

修复评审发现 R1：全局 `express.json({limit:'1mb'})` 把 ASR（schema 允许 20MB base64）和 analyze-image（10MB）的合法请求 413 拦截，且 error.ts 不识别 `entity.too.large`，413 被包装成 500。本次在全局 1mb **之前**插入两条路径级 body-parser（asr 25mb / analyze-image 12mb），errorHandler 开头识别 `entity.too.large` 返回 413 + `PAYLOAD_TOO_LARGE`。改 2 个源文件 + 1 个测试文件，新增 4 个测试用例。后端 281 passed（基线 277 + 4），tsc 零错误。执行中实证纠正了规格的挂载顺序错误（见 §四 偏差说明）。

## 二、改动明细

| 文件 | 改动内容 | 行号（改后） |
|------|---------|-------------|
| `backend/src/index.ts` | 在全局 `express.json({limit:'1mb'})` 前插入 `/api/v1/dj/asr`（25mb）和 `/api/v1/dj/analyze-image`（12mb）两条路径级 body-parser，附顺序原理注释 | 89-94 |
| `backend/src/middleware/error.ts` | errorHandler 开头（AppError 判断之前）识别 `err.type === 'entity.too.large'` → 413 + `code: 'PAYLOAD_TOO_LARGE'` + requestId warn 日志 | 22-29 |
| `backend/src/middleware/error.test.ts` | 新增 `/too-large` 触发路由 + 1 个 413 单测 + 「body 上限挂载顺序」describe（镜像 index.ts 顺序，3 场景） | 27-30, 85-91, 95-123 |

**未动**（按复核/裁决指示）：`index.ts:149`（改后 155）的 `app.use('/api/v1/dj', aiLimiter, djRoutes)` —— aiLimiter 拆解留给 P0a-4；全局 1mb 不变；`express.urlencoded` 不变。

## 三、验证结果

- **tsc**：`cd backend && npx tsc --noEmit` → 零错误
- **vitest**：`cd backend && npx vitest run` → **33 文件 281 passed**（基线 277 + 新增 4：1 个 entity.too.large→413 直测 + 3 个挂载顺序场景）
- **3 场景覆盖**（按 ZCode 复核建议 1）：
  - 2MB → `/api/v1/dj/asr` → 200（放宽生效）
  - 2MB → `/api/v1/dj/analyze-image` → 200（放宽生效）
  - 2MB → `/api/v1/radio/create` → 413 `PAYLOAD_TOO_LARGE`（全局 1mb 未破坏）
- **grep 确认**（按 ZCode 复核建议 2）：`413|PAYLOAD_TOO_LARGE|entity.too.large` 仅出现在 `error.ts`（处理）+ `error.test.ts`（测试）+ `index.ts`（注释引用），无逻辑分叉
- **前置实验**（动手前，一次性测试已删）：证伪规格的"路径级在全局之后"顺序——该顺序下 2MB→/dj/asr 仍 413；正确顺序（路径级在全局之前）下 200，普通路由仍 413

## 四、与规格的偏差（如有）

**纠正了 ZCode 规格的挂载顺序错误，详见 `docs/KIMI/verdict-p0b-1-body-parser-order-2026-07-18.md`** —— 规格 `fix-plan-integrated-2026-07-17.md` P0b-1 与复核文档注意点 2 要求"路径级在全局 1mb 之后"，实测该顺序下放宽不生效（全局先 413）。我按"事实层面以源码核实为准"停下上报，ZCode 独立实验复现后裁决采纳我的顺序（路径级在全局之前）。除顺序外，方案其余部分与规格/裁决 §四 完全一致，无其他偏差。

## 五、自评

- **测试镜像的漂移风险**：3 场景测试在 error.test.ts 里复刻了 index.ts 的挂载顺序（index.ts 未导出 app 且 import 即 listen，无法直接 supertest）。这是 B5（helmet 测试漂移）的同类风险——已在 index.ts:93 和 error.test.ts:94 互相加注释引用，改一边必须同步另一边。若后续 P0a/P2 把 app 构建抽成可导入的工厂函数，应改为直接测真实 app。
- **limit 余量**：asr schema 上限 20MB 字符（base64），25mb parser 余量 ~25%；analyze-image 10MB 字符配 12mb，余量一致。合理。
- **urlencoded 未放宽**：`/dj/asr`、`/dj/analyze-image` 前端都发 JSON，urlencoded 1mb 不影响。如未来改表单提交需重估。
- **25mb 上限的安全性**：单用户本地应用，25mb 对内存无压力；generalLimiter（15 分钟 200 次）在前，无放大风险。

## 六、铁律回顾

| 铁律 | 本次如何遵守 |
|------|-------------|
| 1 资源成对 try/finally | 不涉及资源分配 |
| 2 不用复制粘贴做重试 | 两条 body-parser 是不同路径/限额，非重试逻辑 |
| 3 异步三问 | 中间件同步逻辑，无定时器/监听/取消问题 |
| 4 替换已验证方案前理解原方案 | **核心实践**：没有盲信规格的顺序指示，先用一次性实验核实 body-parser 行为（`_body` 跳过机制），拿到证据再动手；规格被证伪后走裁决流程而非擅自改 |
| 5 性能改动附 Profiler 证据 | 非性能改动 |
| 6 删除功能 grep 全项目 | 无删除；新增逻辑用 grep 确认 413 处理无重复分叉 |

**前科对照**（复核文档 §六）：413 返回 message 用中性文案 "Request body too large"，不带内部细节（对照 Mavis JSON 兜底教训）；测试互相引用注释防 B5 式漂移。

---

*报告由 KIMI 生成。*
