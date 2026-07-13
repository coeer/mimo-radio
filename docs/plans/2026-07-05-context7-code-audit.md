---
author: 规划者
task: Context7 文档驱动代码审计计划——用实时文档检查项目代码的 API 误用/过时用法/反模式
created: 2026-07-05
---

# Context7 文档驱动代码审计计划

> **目标**：用 Context7 拉取每个依赖库的**当前版本精确文档**，逐一对照项目代码，找出 API 误用、过时用法、反模式
> **为什么做**：AI 执行者写代码靠记忆，记忆里的 API 可能有偏差（参数名记错、版本差异、废弃 API）。Context7 能拉实时文档做精确对照
> **配套**：先读 `COLLABORATION.md` + 各执行者的 `AGENT.md`

---

## 一、审计范围（7 个库 × 具体检查点）

项目依赖的 7 个核心库，每个有明确的检查点：

| 库 | 项目版本 | Context7 ID | 检查重点 |
|----|---------|-------------|---------|
| **Next.js** | 14.2.35 | `/vercel/next.js/v14.3.0-canary.87` | dynamic import 用法、App Router metadata、use client 边界 |
| **React** | 18 | 反查 React 18 文档 | useEffect 依赖数组、useState 批处理、memo 用法 |
| **Zustand** | 5.0.13 | `/pmndrs/zustand` | persist/partialize、selector 订阅、devtools middleware |
| **Express** | 4.19.2 | `/expressjs/expressjs` | 路由注册、中间件顺序、error handler 位置 |
| **Zod** | 3.22.4 | `/colinhacks/zod` | schema 定义、validate 中间件、enum/refine 用法 |
| **Helmet** | 8.1.0 | `/helmetjs/helmet` | CSP directives 配置、useDefaults 语义 |
| **Vitest** | 4.1.6 | `/vitestjs/vitest` | test/it/describe、mock、vi.fn、jsdom 配置 |

---

## 二、审计方法（给执行者的标准操作流程）

### 每个库的审计步骤

```
1. 用 Context7 拉取该库当前版本的文档
   → context7 resolve-library-id（库名）
   → context7 query-docs（库 ID + 具体问题）

2. 拿到文档后，对照项目代码
   → grep 项目里该库的所有 API 调用点
   → 逐个对比文档里的正确用法

3. 记录偏差
   → API 签名不匹配（参数名/数量/类型）
   → 废弃 API 使用
   → 反模式（文档明确说"不要这么做"但代码这么做了）
   → 版本差异（项目版本 vs 文档版本的 API 变化）
```

### 判定标准

| 发现类型 | 严重度 | 说明 |
|---------|--------|------|
| **API 签名错误**（参数名/类型不对） | 🔴 | 代码可能跑通但是靠巧合，随时会坏 |
| **废弃 API** | 🟠 | 当前能用但未来升级会坏 |
| **反模式** | 🟠 | 文档明确说"不要这么做" |
| **版本差异** | 🟡 | 当前版本可用但有更好的替代 |
| **无偏差** | ✅ | 代码和文档一致 |

---

## 三、7 个库的具体检查清单

### 3.1 Next.js 14（检查 5 个点）

**拉文档命令**：
```
context7 query-docs: "Next.js 14 App Router dynamic import ssr metadata use client"
```

**检查点**：
- [ ] `next/dynamic` 的 `ssr: false` + `loading` 参数是否正确（:plan/profile 的 dynamic 用法）
- [ ] `'use client'` 指令是否只在该用的组件用（不该用的用了会失去 SSR 优势）
- [ ] `metadata` export 是否用对（layout.tsx 的 metadata 对象格式）
- [ ] `next/link` 的 `href` + `prefetch` 用法
- [ ] `next.config.mjs` 的配置项是否有过时的（reactStrictMode 等）

### 3.2 React 18（检查 4 个点）

**检查点**：
- [ ] **useEffect 依赖数组**：项目 23 处 useEffect，逐个检查依赖数组是否完整（漏依赖 = 闭包陈旧 bug，如 F2 闭包回归）
- [ ] **useState 批处理**：连续多个 setState 是否依赖 React 18 自动批处理（React 18 的自动批处理 vs React 17 的手动）
- [ ] **memo 用法**：ProgressBar/LyricDisplay/AudioWaveform 等 memo 子组件的 props 是否稳定（不稳定 = memo 失效）
- [ ] **useCallback/useMemo**：14 处使用，检查依赖数组是否正确

### 3.3 Zustand 5（检查 4 个点）

**拉文档命令**：
```
context7 query-docs: "Zustand 5 persist partialize selector devtools middleware"
```

**检查点**：
- [ ] **persist + partialize**：radioStore.ts 的 partialize 配置是否正确（只持久化 djEnabled/currentModel/ttsVoice）
- [ ] **selector 订阅**：`useRadioStore((s) => s.xxx)` 的每个订阅是否返回稳定引用（返回新对象/数组 = 无限重渲染）
- [ ] **devtools middleware**：devtools 的 name 配置 + action name 是否用对
- [ ] **store 组合**：5 个 slice 的组合方式是否符合 Zustand 5 推荐模式

### 3.4 Express 4（检查 3 个点）

**检查点**：
- [ ] **中间件顺序**：helmet → compression → cors → rateLimit → auth → routes → errorHandler（顺序对不对）
- [ ] **路由注册**：`app.use('/api/v1/xxx', routes)` 是否都在 auth 之后
- [ ] **error handler 位置**：errorHandler 是否在所有路由之后（Express 错误中间件必须最后注册）

### 3.5 Zod 3（检查 3 个点）

**检查点**：
- [ ] **schema 定义**：13 处 `z.object/z.string/z.enum`，检查枚举值是否和实际使用匹配
- [ ] **validate 中间件**：validateBody/validateParams/validateQuery 是否正确消费 safeParse 结果
- [ ] **错误响应**：校验失败时的响应格式是否统一

### 3.6 Helmet 8（检查 2 个点）

**拉文档命令**：
```
context7 query-docs: "helmet 8 contentSecurityPolicy directives useDefaults crossOriginEmbedderPolicy"
```

**检查点**：
- [ ] **CSP directives**：index.ts 的 9 条 directive 是否有遗漏或冲突（如 `script-src` 限制太严导致 inline script 被拦）
- [ ] **useDefaults: false**：这个设置是否正确（我们想完全控制 CSP，不与 helmet 默认合并）

### 3.7 Vitest 4（检查 2 个点）

**检查点**：
- [ ] **jsdom 配置**：vitest.config.ts 的 environment + setupFiles 是否正确
- [ ] **mock 用法**：测试里的 vi.fn/vi.mock 是否符合 Vitest 4 最新 API

---

## 四、执行分工

| 库 | 检查点数 | 建议执行者 | 理由 |
|----|---------|-----------|------|
| Next.js + React | 9 | **DSflash** | 前端组件多，DSflash 做过 ProgressBar 抽离，熟悉组件层 |
| Zustand | 4 | **DSflash** | 同上（store 是前端） |
| Express + Zod + Helmet | 8 | **DSpro** | 后端路由/中间件，DSpro 做过 chat 搜索前置，熟悉 radio.ts |
| Vitest | 2 | **MiNiMax** | 测试配置，MiNiMax 写了 +67 个测试，最熟 |

**或者**：一个执行者全部做（如果时间充裕）。总共 23 个检查点，Context7 拉文档 + grep 对照，预计 2-3 小时。

---

## 五、报告要求

按 COLLABORATION 第四节"执行者报告规范"产出报告，放在执行者自己的 `reports/` 目录。

报告格式：
```markdown
# Context7 文档驱动代码审计报告

## 一、审计范围
（列出审计了哪些库 × 哪些检查点）

## 二、发现汇总
| 库 | 检查点 | 结果 | 严重度 | 位置 |
|----|--------|------|--------|------|
| Next.js | dynamic import ssr:false | ✅ 无偏差 | — | plan/page.tsx:18 |
| React | useEffect 依赖数组 | 🔴 漏依赖 | P1 | xxx.tsx:45 |
| ... | ... | ... | ... | ... |

## 三、详细发现（逐个）
（每个非 ✅ 的发现：当前代码 vs 文档正确用法 + Context7 文档引用 + 改法建议）

## 四、Context7 文档摘要
（拉取的关键文档片段，供规划者核实）

## 五、结论
（总检查点 N / 无偏差 N / 发现问题 N / 严重度分布）
```

---

## 六、给执行者的提醒

1. **先拉文档再对照**——不要凭记忆判断"这个 API 应该是对的"。用 Context7 拉当前版本精确文档，拿文档原文对照代码。

2. **Context7 使用方法**：
   ```
   第一步：resolve-library-id（库名）→ 拿到 Context7 library ID
   第二步：query-docs（library ID + 具体问题）→ 拿到文档片段
   ```

3. **重点查 useEffect 依赖数组**——项目 23 处 useEffect，这是最容易藏 bug 的地方（闭包陈旧/无限循环/漏触发）。逐个过依赖数组，和 React 18 文档对照。

4. **重点查 Zustand selector**——`useRadioStore((s) => s.xxx)` 如果返回新对象/数组（如 `(s) => s.messages.filter(...)`），会导致无限重渲染。检查每个 selector 返回的是稳定引用还是新创建的。

5. **不要修代码**——这是审计任务，只记录发现。修改由规划者审批后另起任务。

6. **报告附 Context7 文档引用**——每个发现要附"文档怎么说的"（Context7 返回的原文片段），让规划者能核实你的判断。

---

## 七、执行检查清单

- [ ] 3.1 Next.js 5 检查点（dynamic/client/metadata/link/config）
- [ ] 3.2 React 4 检查点（useEffect 依赖/批处理/memo/useCallback）
- [ ] 3.3 Zustand 4 检查点（persist/selector/devtools/slice 组合）
- [ ] 3.4 Express 3 检查点（中间件顺序/路由注册/error handler）
- [ ] 3.5 Zod 3 检查点（schema/validate/错误响应）
- [ ] 3.6 Helmet 2 检查点（CSP directives/useDefaults）
- [ ] 3.7 Vitest 2 检查点（jsdom/mock）
- [ ] 报告产出（含 Context7 文档引用 + 严重度分级）
- [ ] git commit + push

---

*本计划用 Context7 实时文档驱动审计，23 个检查点覆盖 7 个核心库。执行者拉文档→对照代码→记录偏差，不修代码。*
