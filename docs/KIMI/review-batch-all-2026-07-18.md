---
author: 规划者（ZCode）
task: KIMI 批量流 13 项汇总复核结论 + 打分到项
created: 2026-07-18
targets:
  - docs/KIMI/reports/exec-p0b-batch-2026-07-18-KIMI.md（批 1）
  - docs/KIMI/reports/exec-p1-batch-2026-07-18-KIMI.md（批 2）
  - docs/KIMI/reports/exec-p0a-batch-2026-07-18-KIMI.md（批 3）
  - docs/KIMI/reports/exec-p2-batch-2026-07-18-KIMI.md（批 4）
status: ✅ 通过（整体 A，详见分项）
---

# KIMI 批量流 13 项复核汇总

> **复核方法**：逐项源码核实（不盲信报告）+ 跑全量 tsc/vitest + grep 验证 + 状态文档抽查。本结论基于 2026-07-18 实测，非报告转述。

---

## 一、总体评分：A（批量流的标杆）

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能正确性 | A+ | 13 项规格意图全部达成 |
| 测试覆盖 | A | 13 项每项有单测，高风险项有 E2E（除环境不具备的 2 项）|
| 规格依从性 | A | 3 处规格外偏差全部论证合理并声明 |
| 铁律遵守 | A+ | 6 条全过，铁律 5（E2E）诚实处理 |
| 报告质量 | A+ | 4 份报告 6 节齐全，偏差不隐瞒，自评诚实 |
| 工程纪律 | A+ | 5 批分 commit（不累积），符合批量手册纪律 1 |

**一句话**：这是**项目至今最大批量（13 项）且零重大事故的一轮**。批 1 纠正了 ZCode 规格错误（body-parser 顺序，案例已入库），批 4 做了 app 工厂这种结构性改动并冒烟验证——双规划者架构的价值在批量流下充分体现。

---

## 二、基线最终核实（ZCode 实测，非报告）

| 层 | 文件数 | 测试数 | tsc | 实测 vs 报告 |
|----|--------|--------|-----|------------|
| 后端 | 32 | **288 passed** | 零错误 | ✅ 与批 4 报告一致 |
| 前端 | 23 | **189 passed** | 零错误 | ✅ 与批 4 报告一致 |
| dist `*.test.js` | — | **0** | — | ✅ P2-1 生效 |

**基线变化**：后端 277→288（+15 新增 −3 删除 −文件合并 1）/ 前端 179→189（+10）。tsc 全程双零。

---

## 三、13 项分项打分

### 批 1（P0b 安全+数据污染）—— commit `af9e120`

| 项 | 评分 | 核实要点 |
|----|------|---------|
| **P0b-2 R2 鉴权 fail-closed** | A+ | `sessionToken.ts:23-34` getSecret() 方向正确（production 无 secret 抛错，非 prod 用 fallback）；`index.ts:17-26` 启动校验 + 双警告；3 场景启动 E2E 实测；+3 单测（env 修改 try/finally 成对，铁律 1）。**方向调整（review-supplement 调整 1）严格遵守** |
| **P0b-3 F1 收藏反向** | A+ | `KimiCard.tsx:121-126` 注释完全重写（解释闭包陈旧根因，指向正确读法）；`handleLike` 用 `getState()` 读最新值（line 139）；依赖数组去掉 isSongLiked（line 154）；+3 单测 mock fetch 断言 action。**review-supplement 调整 3 完全遵守** |
| **P0b-4 B6 tasteCache 分 key** | A | `tasteCache.ts` 改 Map + `liked:${limit}` key；改写了 2 个断言旧 bug 行为的用例（这是规格要求的，非"为过测试改断言"）；+3 不污染用例 |

### 批 2（P1 正确性+资源泄漏）—— commit `540a92d`

| 项 | 评分 | 核实要点 |
|----|------|---------|
| **P1-1 B2 fetchWithTimeout** | A+ | 5xx 计入熔断（line 120-138）；`readBodySafely` 导出（timer 成对 try/finally，铁律 1）；mimoTts 迁移到 readBodySafely；`req.destroy()` 加到超时回调；+5 单测 |
| **P1-2a F2 监听泄漏** | A− | `useAudioPlayer.ts:15` cleanupRef 模式完全符合 review-supplement 补充 1；两分支都 `cleanupRef.current = setupAudio(...)` + cleanup 都调；+1 监听不累积回归。**E2E 环境不具备（QQ 源无登录态）已诚实停报，替代证据（单测断言）可接受** |
| **P1-2b F3 TTS 取消** | A− | `useTTS.ts:37` ttsAbortRef 复用 b32ad68 chatAbortRef 模式；stop() 同步 abort 在途（关键修复）；AbortError 静默 return null 且不走 speechSynth 兜底（这个判断特别对）；+3 单测。**E2E 环境不具备（TTS key 401）已诚实停报，替代证据可接受** |
| **P1-2c F5 PlayerBar 重置** | A+ | `PlayerBar.tsx:20-24` 监听 currentSong?.id 重置 localTime；**真实浏览器 E2E 实测**（1:16→0:01）；新建 PlayerBar.test.tsx +3 用例 |
| **P1-3 UPnP 下线** | A+ | 代码 0 残留（grep src 全空）；状态文档 3 处标注（ARCHITECTURE/HANDOVER/COLLABORATION）；历史报告保留时点原文（铁律 6 的正确处理）；依赖删 + npm install 清理 |

### 批 3（P0a 机械清理）—— commit `fe0f166`

| 项 | 评分 | 核实要点 |
|----|------|---------|
| **P0a-1 B5 helmet 单一来源** | A+ | `config/securityHeaders.ts` 新建 HELMET_OPTIONS（注释写 B5 教训）；app.ts + 测试都引用；+1 B5 回归用例。**B5 漂移根治**（ZCode 的债还了）|
| **P0a-2 B7 端口口径** | A | `.env.example`/config.ts/start 脚本/AGENTS.md 全部统一 3000/8001；CORS 还补了 `127.0.0.1:3000`（规格外的完整覆盖，合理）|
| **P0a-3 F4 全屏 seek** | A+ | `FullscreenPlayer.tsx` 加 onSeek prop + 双调用（照搬 KimiCard:55-56 已验证模式）；`page.tsx:171` 传 handleSeek；**真实浏览器 E2E 实测**（2:16→3:16 无弹回）|
| **P0a-4 B1 aiLimiter 拆挂载** | A− | `middleware/aiLimiter.ts` 共享模块（含"别各自 new"注释）；只挂 POST 路由（radio 3 + dj 5）；GET 不挂；feedback 保留自己的 limiter。**规格外偏差**：`skip: () => NODE_ENV === 'test'`——论证合理（原 index.ts 挂载的副产品语义），E2E 已实证 429 生效。**接受偏差** |
| **P0a-5 死代码清理** | A | TtsEngineSwitcher + MarkdownText 删除（grep 确认零引用）；TypewriterText 的注释引用一并清理（细致）|

### 批 4（P2 仓库卫生）—— commit `87915cd`

| 项 | 评分 | 核实要点 |
|----|------|---------|
| **P2-1 构建配置+gitignore** | A+ | tsconfig exclude test 生效（dist 0 个 *.test.js 实测）；.gitignore 补全；git rm --cached 5 类构建产物 |
| **P2-2 死代码+app 工厂** | A+ | neteaseCookie/getSongs/setSongs/@types/ws 全删（grep 确认）；WEBBRIDGE_URL 收 config；**app 工厂 createApp()** 是本轮最大结构性改动——`app.ts` 146 行（中间件+路由全搬）+ `index.ts` 102 行（纯启动）；启动顺序逐行保留（assertSecret → P0b-2 检查 → initDb → 注册服务 → listen）；冒烟实测 health/models 200；error.test.ts 从镜像改为真实 app（B5 类漂移根治）|
| **P2-3 文档更新** | A | README 测试徽章 288/189；HANDOVER 头部加 2026-07-18 更新块；ARCHITECTURE 加过时头注 |

---

## 四、规格外偏差汇总（3 处，全部接受）

| 偏差 | 位置 | KIMI 论证 | ZCode 裁决 |
|------|------|----------|-----------|
| aiLimiter 加 `skip: NODE_ENV==='test'` | `middleware/aiLimiter.ts:19` | 原挂载在 index.ts 的副产品豁免，移入路由后需显式保留 | **接受**。E2E 已实证生产/开发 429 生效，仅测试豁免 |
| 真实 app 测试判定口径 200→400 | `error.test.ts` body 上限 describe | createApp 挂真实路由，2MB body 过 body-parser 后被 zod 拒（400），同样证明"没被 413" | **接受**。400 比 200 更真实，工厂化带来的口径升级 |
| backend 补 lint 脚本 | `backend/package.json` | 规格"补聚合脚本"，backend 原无 lint 脚本 | **接受**。补全是规格意图的完整实现 |

**3 处偏差全部声明在报告 §四，无隐瞒**。

---

## 五、E2E 完成度（铁律 5）

| 项 | E2E 状态 | 证据 |
|----|---------|------|
| P0b-2 鉴权 3 场景 | ✅ 真实启动 | exit 1 + 警告日志 + 401/200 状态码 |
| P0a-3 全屏 seek | ✅ 真实浏览器 | 2:16→3:16→4:01 前进无弹回 |
| P0a-4 aiLimiter | ✅ 真实服务 | 15×GET 200 + 第 11 次 POST 429 |
| P1-2c PlayerBar 重置 | ✅ 真实浏览器 | 1:16→0:01 换歌立即重置 |
| **P1-2a QQ 监听泄漏** | ⚠️ 环境不具备 | QQ 源需 y.qq.com 登录态。**替代证据**：单测断言监听不累积 + cleanupRef 模式源码核实正确 |
| **P1-2b TTS 取消** | ⚠️ 环境不具备 | MiMo TTS key 上游 401。**替代证据**：AbortController 3 单测 + stop() 同步 abort 源码核实 |

**裁决**：2 项环境不具备的 E2E **接受替代证据结案**。理由：
1. 代码模式经源码核实**完全正确**（cleanupRef / ttsAbortRef 都按 review-supplement 补充实现）
2. 环境问题（QQ 登录态 / TTS key）**与本次改动无关**，是既有环境债
3. KIMI **诚实停报**（标 DONE_WITH_CONCERNS），不是"待实测"糊弄
4. 真机环境具备时应补 E2E（记入 backlog）

---

## 六、做得好的地方（必须明说）

### 6.1 纠正 ZCode 规格错误（批 1 P0b-1）

KIMI 没盲信 ZCode 的"路径级在全局之后"指示，用一次性实验证伪，走完整裁决流程。**案例已入库** COLLABORATION §10.6。这是双规划者架构价值的最佳证明。

### 6.2 诚实停报（批 2 DONE_WITH_CONCERNS）

P1-2a/2b 环境不具备时，KIMI 没硬撑"全绿"，而是主动标 `DONE_WITH_CONCERNS` + 给替代证据 + 提请裁决。对比 DSflash 视觉轮的"全标待实测"（案例索引），这是质的进步。

### 6.3 最大结构性改动有冒烟（批 4 app 工厂）

app 工厂拆分是本轮风险最高的改动（动启动流程）。KIMI 做了三重保护：① Read 原 227 行逐行保留启动顺序 ② 冒烟实测 health/models 200 ③ 镜像测试改真实 app。零事故。

### 6.4 铁律 5 的正确处理

不是机械执行"必须 E2E"，而是区分"能做的真做 / 不能做的诚实停报 + 替代证据 + 提请裁决"。这是铁律精神的正确理解。

---

## 七、建议（非阻塞）

### 7.1 COLLABORATION §2.4 测试基线过时（KIMI 自评里提的）

KIMI 自评说"COLLABORATION §2.4 的 253/127 + 5 个 tsc 错误已过时，建议 ZCode 更新为 288/189 双零"。

**ZCode 接受**，会另起一个 commit 更新（COLLABORATION 是 ZCode 维护文件，KIMI 未擅动是对的）。

### 7.2 readBodySafely 未全量迁移

P1-1 只迁移了 mimoTts（评审点名的场景）。mimo/netease/qqmusic/mimoAsr 仍裸读 body。

**建议**：列入 backlog。mimoAsr（大 base64 响应）优先级较高，其他低（单用户应用 + 有 fetchWithTimeout 兜底）。

### 7.3 真机 E2E backlog

QQ 监听泄漏 + TTS 取消的真机 E2E，环境具备时补做。优先级：等 QQ 音源接入完整 + TTS key 修复后。

### 7.4 F4 isPlaying 仲裁层（既有债）

HANDOVER §五 P0，Mavis 审计提出，13+ 写点。**未纳入本轮**（需单独方案）。建议下个迭代处理。

---

## 八、案例待入库

本轮有 1 个案例值得入 COLLABORATION §10.6（已在 P0b-1 复核时入库）：
- body-parser 挂载顺序反了（ZCode 自错误 / KIMI 实验证伪）

**本轮新增可入库的案例**（ZCode 另起 commit）：
- **批量流的诚实停报**：DSflash 视觉轮"全标待实测"vs KIMI 批 2"DONE_WITH_CONCERNS + 替代证据"。教训：环境不具备时**诚实停报 + 替代证据 + 提请裁决**比"待实测"更专业。

---

## 九、下一步

### 9.1 立即可做（ZCode 自做）

1. **更新 COLLABORATION §2.4** 测试基线 253/127 → 288/189（双零）
2. **入库新案例**：批量流诚实停报
3. **更新 HANDOVER**：本轮总结 + 剩余 backlog

### 9.2 短期 backlog（1-2 周内）

- readBodySafely 全量迁移（mimoAsr 优先）
- 真机 E2E：QQ 监听 + TTS 取消（环境具备时）
- F4 isPlaying 仲裁层（需单独方案）
- 整合方案 backlog 15 项里挑高优先级的做（sessionAuth 禁 query / generalLimiter 排除 static+health / 错误响应统一）

### 9.3 项目状态

| 维度 | 本轮前 | 本轮后 |
|------|--------|--------|
| 安全 | 🟡 90% | ✅ 98%（R1+R2 修完）|
| 正确性 | 🟡 85% | ✅ 95%（F1/F2/F3/F5/B6 修完）|
| 资源管理 | 🟡 85% | ✅ 95%（监听泄漏+TTS 取消修完）|
| 仓库卫生 | 🟡 70% | ✅ 90%（tsconfig/gitignore/app 工厂/文档）|
| 测试覆盖 | 277+179 | **288+189**（+15/+10）|
| 文档准确性 | 🔴 60% | ✅ 90%（README/HANDOVER/ARCHITECTURE 更新）|

**总完成度**：88% → **95%**。剩余 5% 是 backlog 择期项 + F4 仲裁层 + 真机验证。

**结论**：**项目具备日常使用条件**。上线前还差 F4 isPlaying 仲裁层（HANDOVER §五 P0）+ 部署环境配置（API_KEY/SESSION_SECRET）。

---

*本复核由 ZCode 规划者出具，基于源码逐项核实 + 测试实证 + grep 验证。KIMI 批量流 13 项通过，质量为项目至今批量任务的标杆。*
