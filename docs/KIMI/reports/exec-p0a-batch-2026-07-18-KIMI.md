---
author: KIMI
task: 批 3 执行报告——P0a-1 helmet 单一来源 / P0a-2 端口口径 / P0a-3 全屏 seek / P0a-4 aiLimiter 拆挂载 / P0a-5 死代码
created: 2026-07-18
status: DONE
---

# 执行报告：批 3（P0a 机械清理，原 ZCode 自做，批量流交 KIMI）

## 一、执行摘要

| 项 | 内容 | 状态 |
|----|------|------|
| P0a-1 | B5 helmet 测试同步——抽 `config/securityHeaders.ts` 单一来源 | ✅ 15/15（+1 B5 回归用例） |
| P0a-2 | B7 端口口径：.env.example 8001 + CORS 补 3000 + start 脚本 + AGENTS.md | ✅ |
| P0a-3 | F4 全屏进度条 seek（P0 提级） | ✅ **E2E 实测通过** |
| P0a-4 | B1 aiLimiter 拆挂载——共享模块，只挂 POST | ✅ **E2E 实测通过**（15×GET 不 429 / 第 11 次 POST 429） |
| P0a-5 | 死代码清理 TtsEngineSwitcher + MarkdownText | ✅ grep 确认零引用后删除 |

基线变化：后端 288 → **289**（32 文件），前端 **189**（23 文件，无增减），tsc 双零。

## 二、改动明细

### P0a-1（B5 helmet）

| 文件 | 改动 | 行号 |
|------|------|------|
| `backend/src/config/securityHeaders.ts` | **新建**：`HELMET_OPTIONS` 单一来源（CSP directives + COEP=false），头注写明 B5 教训 | 全文 |
| `backend/src/index.ts` | 29 行内联 helmet 配置 → `app.use(helmet(HELMET_OPTIONS))` | 16, 32-36 |
| `backend/src/middleware/security-headers.test.ts` | 重写：引用共享配置（不再自我复制快照）；修正 B5 漂移断言（`style-src 'self' 'unsafe-inline'` → `'self'`）；新增「style-src 不允许 unsafe-inline」回归用例 | 全文 |

### P0a-2（B7 端口）

| 文件 | 改动 |
|------|------|
| `backend/.env.example:2` | `PORT=8000` → `PORT=8001` |
| `backend/src/config.ts:15` | CORS 白名单补 `http://localhost:3000` + `http://127.0.0.1:3000`（保留 3001/3002/3003 兼容） |
| `start.sh:74,94` / `start.bat:51,63` / `start.ps1:62,83` | 前端地址 3001 → 3000（各 2 处） |
| `D:\Coder\AGENTS.md:211` | mimo-radio 前端 3001 → 3000 |

### P0a-3（F4 全屏 seek）

| 文件 | 改动 | 行号 |
|------|------|------|
| `frontend/src/components/FullscreenPlayer.tsx` | `FullscreenProgressBar` 加 `onSeek` prop，onClick 里 `setCurrentTime(t)` 后调 `onSeek?.(t)`（照搬 KimiCard ProgressBar 双调用模式）；`FullscreenPlayer` 加 `onSeek` prop 并透传 | 16, 27-37, 134, 293 |
| `frontend/src/app/page.tsx` | `<FullscreenPlayer onSeek={handleSeek} />` | 171 |

### P0a-4（B1 aiLimiter）

| 文件 | 改动 | 行号 |
|------|------|------|
| `backend/src/middleware/aiLimiter.ts` | **新建**：单一实例共享模块（含"别各自 new"注释 + test 环境 skip 注释） | 全文 |
| `backend/src/index.ts` | 删 aiLimiter 定义 + 整 router 挂载（`app.use('/api/v1/radio', radioRoutes)`） | 38-47, 119-120 |
| `backend/src/routes/radio.ts` | import + 挂 `POST /create`、`/:id/next`、`/:id/chat`；GET /models /songs /queue 不挂；feedback 保留自己的 30/min limiter | 14, 103, 186, 266 |
| `backend/src/routes/dj.ts` | import + 挂 `POST /tts /intro /analyze-image /asr /transition`；GET /tts-voices 不挂 | 11, 64, 81, 129, 141, 177 |

**规格外补充（偏差声明见 §四）**：`aiLimiter` 加 `skip: () => process.env.NODE_ENV === 'test'`。

### P0a-5（死代码）

| 操作 | 对象 |
|------|------|
| 删除 | `frontend/src/components/TtsEngineSwitcher.tsx`、`frontend/src/components/MarkdownText.tsx`（grep 确认 src 零 import） |
| 注释清理 | `frontend/src/components/TypewriterText.tsx:23` 原注释引用已删除的 MarkdownText，改为注明已删除 |

## 三、验证结果

### 单测 / 类型

```
backend: 32 文件 289 passed（288 + 1 B5 回归），tsc 零错误
frontend: 23 文件 189 passed（无增减），tsc 零错误
```

### E2E（webbridge 真实浏览器 + 重启的后端 8001 新代码）

| 项 | 场景 | 结果 |
|----|------|------|
| P0a-3 | 全屏 → 进度条 75% 处点击 → 时间 2:16 跳到 3:16 并**继续从 3:19→3:58→4:01 前进**（无弹回）；3 秒后只读采样各显示收敛（PlayerBar 5s sync 追上） | ✅ 无弹跳 |
| P0a-4 | 15× `GET /api/v1/radio/models` → **全部 200**（原会消耗 aiLimiter 配额） | ✅ |
| P0a-4 | 11× `POST /api/v1/radio/create` → 前 10 次 200，**第 11 次 429**（POST 限流仍生效） | ✅ |

## 四、与规格的偏差

1. **P0a-4：aiLimiter 增加 `skip: () => process.env.NODE_ENV === 'test'`**（规格未写）。根因：原实现挂在 index.ts（测试不 import index.ts，天然豁免）；移入 radio.ts/dj.ts 后，radio.test.ts 在 1 分钟内多次调 /create 命中 10/min → 8 个测试 429 连锁失败。skip 是让测试环境保持原有豁免语义的**最小改动**（vitest 默认 NODE_ENV=test；生产/开发行为不变，E2E 已实证 429 生效）。备选方案（改测试断言/每用例等 61s）都更差。
2. 其余各项无偏差。

## 五、自评

- **P0a-1**：测试仍走"复刻 app 挂载"模式（index.ts 不可导入），但配置已同源——漂移风险从"配置副本"降为"app 骨架副本"（只含 helmet 一行，风险极低）。P2-2 的 app 工厂函数会根治。
- **P0a-2**：CORS 同时补了 `127.0.0.1:3000`（规格只写 localhost:3000）——同源不同写法浏览器视为不同 origin，属于同一修复的完整覆盖。
- **P0a-4**：`skip` 依赖 vitest 的 NODE_ENV=test 约定，若未来测试显式设 NODE_ENV=development 会失效——已在模块注释写明原因，改动者可见。
- **P0a-4 验收边界**：feedback 30/min 的 E2E 未单独打满（需合法 session 造 30 次反馈，成本高）；挂载顺序（feedbackLimiter 在具体路由、aiLimiter 不在其路径上）已源码核实，feedback 路径上只有 feedbackLimiter。
- **P0a-5**：docs 下的引用（playbook、评审、MiNiMax 报告等）为历史时点记录，保留原文。

## 六、铁律回顾

| 铁律 | 本批如何遵守 |
|------|-------------|
| 1 资源成对 try/finally | 无新资源分配 |
| 2 不用复制粘贴做重试 | dj.ts 5 处挂载用 sed 统一机械替换（同构编辑），非逻辑复制 |
| 3 异步三问 | 无异步逻辑 |
| 4 替换已验证方案前理解原方案 | P0a-4 先确认"测试豁免"原是 index.ts 挂载的副产品，才用 skip 显式保留该语义；P0a-3 照搬 KimiCard 已验证的双调用模式未自造 |
| 5 性能/E2E 证据 | P0a-3/P0a-4 均附真实浏览器/真实服务实测数据（§三），无"待实测" |
| 6 删除功能 grep 全项目 | P0a-5 删前 grep src 零 import、删后复查；TypewriterText 注释引用一并清理；md 历史记录保留 |

---

*报告由 KIMI 生成。*
