# mimo-radio 协同工作协议（规划者 ↔ 执行者）

> **用途**：让"规划者 AI"（管方向、做深度理解与方案）与"执行者 AI"（按方案落代码、验证、回报）能高效协同。
> **生成时间**：2026-06-26
> **项目根**：`D:\Coder\mimo-radio`（Windows，Git Bash，**非 git 仓库**）
> **本文档是双方共同的契约**。开始任何工作前，双方都必须完整读完本文档。

---

## 一、角色分工（核心，不可越界）

### 🧭 规划者（Planner）—— **就是我**
**只负责"想清楚"，不直接写业务代码。**

- 通读代码库，建立全局理解（架构、数据流、约束、历史决策）
- 把模糊需求拆解成**可执行的、零歧义的任务规格**
- 识别风险、依赖、边界（明确"不要做什么"和"为什么"）
- 审查执行者的产出（spec 合规 → 代码质量两阶段）
- 决策取舍（当执行者遇到分叉时拍板）
- 维护本文档、`HANDOVER.md`、`docs/plans/*.md`

**我的产出物**：
- 任务规格文档（`docs/plans/*.md`）：每个任务含根因、文件:行号、改法代码、验证标准
- 审查报告：对照规格逐项核实，标注 🔴bug / 🟡隐患 / ⚪建议
- 决策记录：遇到"既要又要"时明确选哪个、为什么

### 🔧 执行者（Executor）—— **另一个 AI**
**只负责"按规格做对"，不自由发挥方向。**

- 严格按 `docs/plans/*.md` 的任务规格实现，**不偏离、不加戏、不删减**
- 改前先 Read 确认现状（行号可能已变），改后立即跑验证命令
- 遇到**规格未覆盖**的情况 → **停下来问规划者**，不要自行猜测
- 自测：单元测试 + tsc 类型检查 + 必要时浏览器冒烟
- 如实回报：改了哪些文件、测试结果（通过数/失败数）、自评发现的问题
- 状态用四态：`DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`
- **每次代码改动完成后，自动 `git commit && git push`**（无需规划者提醒）

**执行者的产出物**：
- 改动后的代码文件
- 验证日志（测试输出、tsc 输出）
- 如实的执行报告（不美化、不隐瞒失败）

### 🚫 红线（双方都禁止）
- **规划者**：不要直接动手改业务代码（会污染上下文、绕过审查）。除非执行者 BLOCKED 且修复 trivial。
- **执行者**：不要擅自改规格外的内容、不要"顺手优化"、不要为了过测试而改测试断言（除非规格要求）。
- **双方**：不要用 `localStorage.getItem('mimo-radio-store')` 诊断 store 状态（见第六节陷阱）。

---

## 二、项目全局认知（双方共享的事实）

### 2.1 它是什么
**MiMo AI 电台** —— 全栈 AI 个性化音乐电台。用户自然语言输入心情/场景 → MiMo 大模型生成推荐 + DJ 串词 → MiMo TTS 语音播报 → 网易云/QQ 音乐播放。对标一个 4分33秒的参考视频（规格在 `docs/claudio-rebuild-plan-v2.2.md`）。

### 2.2 三层架构
```
PWA 前端（Next.js 14 + React 18 + Zustand）  :3001
        ↕ HTTP（非 git，dev 放行鉴权）
Node 中枢（Express 4 + TS + better-sqlite3）  :8001
        ↕ 外部 API
MiMo 大模型 / 网易云 / QQ音乐(webbridge) / OpenWeather
```

### 2.3 技术栈速查
| 层 | 技术 |
|----|------|
| 后端 | Node 20, Express 4, TypeScript 5（strict）, better-sqlite3（WAL）, Vitest 4 |
| 前端 | Next.js 14（App Router）, React 18, Zustand 5（persist+devtools）, Tailwind 3, Vitest 4 + jsdom |
| AI | MiMo（`mimo-v2.5` 文本 / `mimo-v2.5-tts` 语音 / `mimo-v2.5-asr` 识别） |
| 桥接 | webbridge daemon（`127.0.0.1:10086`，控制真实浏览器拿 QQ 登录态播放 URL） |

### 2.4 当前测试基线（2026-06-26，修复后）
- **后端**：234 测试全过（29 个 test 文件），tsc 零错误
- **前端**：127 测试全过（20 个 test 文件），tsc 零错误
  - ⚠️ 既有 5 个 tsc 错误在 `frontend/src/hooks/useAudioPlayer.sideffects.test.ts`（`Song` 缺 `emotionTags/sceneTags`），**与本轮无关，不要动**

### 2.5 目录结构（只列关键）
```
mimo-radio/
├── HANDOVER.md                      # 上一轮会话交接（必读）
├── COLLABORATION.md                 # 本文件
├── docs/
│   ├── claudio-rebuild-plan-v2.2.md # 视频逐帧规格（对标基准）
│   └── plans/                       # 任务规格文档（执行者的输入）
│       ├── 2026-06-26-code-review-fixes.md   # 代码审查修复方案（17 任务）
│       └── 2026-06-26-post-review-fixes.md   # 体验改动审查修复（12 任务，已执行完）
├── logs/
│   ├── wb.py                        # webbridge 调用封装（自测用，见第五节）
│   ├── dev-backend*.log             # dev 日志
│   └── app-YYYY-MM-DD.log           # 按天轮转应用日志
├── backend/
│   ├── .env                         # 真实密钥（不入 git，别外泄）
│   └── src/
│       ├── index.ts                 # Express 入口 + 路由注册
│       ├── routes/                  # API 路由（radio/dj/profile/schedule/lyric/...）
│       ├── services/                # 业务逻辑（engine/mimo/netease/qqSource/planner/...）
│       ├── db/index.ts              # SQLite 操作（songs/sessions/profile/feedback）
│       ├── middleware/              # auth/sessionAuth/error/validate
│       └── utils/                   # logger/fetchWithTimeout/ssrfGuard/sessionToken
└── frontend/
    └── src/
        ├── app/                     # page.tsx / profile/ / plan/ / settings/
        ├── components/              # KimiCard/ChatArea/FullscreenPlayer/...
        ├── hooks/                   # useAudioPlayer/useSession/useTTS/useLyric/...
        ├── store/radioStore.ts      # Zustand 全局状态（5 个 slice）
        └── types/api.ts             # 前端类型镜像（与后端对齐）
```

---

## 三、关键约束与历史决策（执行者必读，违反必出 bug）

这些是踩过坑、用户拍过板的决策。**改动时必须遵守，不要"修正"它们。**

1. **sessionToken 保持原版 `sessionId.sig` 格式**（HMAC-SHA256，**无过期校验**）。用户明确要求"等上线再加过期"。不要嵌入 expiresAt。
2. **sessionToken + sessionId 都不持久化**到 localStorage。reload 后会话干净重建。持久化只存偏好：`djEnabled`/`currentModel`/`ttsVoice`。
3. **queue / currentSong / messages 是内存态**（前两个从不持久化；messages 已确认为死代码，不持久化）。
4. **SSRF 白名单含 `127.0.0.1`/`localhost`** —— webbridge daemon 是合法本地调用（`:10086`），不要删白名单。如需收紧，收紧到端口级而非删除。
5. **dev 模式 API 认证放行**：`.env` 没配 `API_KEY`，`apiKeyAuth` 在 dev 直接 next()。生产才 fail-fast。
6. **Fish Audio / 飞书已彻底删除**（代码+文档+构建产物），不要恢复。
7. **DJ 串词字数**：`generateIntro` 50-100 字，`generateDJTransition` 80-150 字。对齐视频深度。
8. **网易云音源**：免 cookie，只返回 fee=8 免费歌（128kbps mp3）；现已补封面（`_batchGetSongDetails`）和歌词（`getLyric`）。
9. **QQ 音源**：依赖 webbridge + 浏览器登录 y.qq.com。未就绪时自动回落网易云。现已补封面（`albumMid` → `T002R300x300M000`）。
10. **planner 的 `resolveTracks` 是 fire-and-forget + 就地 mutate**：当天首次请求 tracks 可能为空，第二次请求正常。**不要改成 await**（会触发 30s 全局超时）。若要优化，加 `tracksLoaded` 标记让前端轮询。

---

## 四、协作流程（一个任务的完整生命周期）

```
┌─────────────────────────────────────────────────────────┐
│  1. 规划者：分析需求 → 写任务规格到 docs/plans/*.md      │
│     （含根因/文件:行号/改法/验证/边界）                  │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│  2. 执行者：Read 规格 → Read 现状（行号可能变）          │
│     → 实现 → 自测（test+tsc）→ 回报四态状态              │
└────────────────────────┬────────────────────────────────┘
                         ▼
              ┌──────────┴──────────┐
              │ 执行者遇到规格未覆盖？│
              └──────────┬──────────┘
          是  ┌──────────┴──────────┐  否
              ▼                     ▼
   ┌──────────────────┐   ┌─────────────────────────────┐
   │ NEEDS_CONTEXT     │   │  3. 规划者：spec 合规审查    │
   │ → 问规划者 → 补规格│   │     → 代码质量审查           │
   └──────────────────┘   │     → 通过则任务完成         │
                          │     → 不通过则回退第 2 步     │
                          └─────────────────────────────┘
```

### 规格文档的必备字段（规划者必须提供）
每个任务规格必须包含，缺一不可：
- **根因**：为什么有问题（引用具体文件:行号 + 代码）
- **改法**：精确到文件:行号，给出完整代码片段（不是"优化一下"这种模糊话）
- **验证标准**：跑哪个测试、tsc 是否过、功能怎么验
- **边界**：明确"不要动什么"、"降级方案是什么"

### 执行者回报模板
```
任务：F2 handleLike 语义
状态：DONE
改动文件：
  - frontend/src/components/KimiCard.tsx（第 60 行删 `!`）
验证：
  - tsc：零错误
  - vitest：127 passed
自评：无副作用，liked 现在正确反映 toggle 后状态
```

---

## 五、验证与自测工具链（执行者必备）

### 5.1 基础验证（每次改动后必跑）
```bash
# 后端
cd D:/Coder/mimo-radio/backend && npx tsc --noEmit && npx vitest run
# 前端
cd D:/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run
# 单个测试文件
cd D:/Coder/mimo-radio/backend && npx vitest run src/routes/radio.test.ts
```

### 5.2 服务启停
```bash
# 启后端（前台，看日志）
cd D:/Coder/mimo-radio/backend && npx tsx src/index.ts
# ⚠️ 后台启动时 tsx watch 热重载不可靠！改后端代码后必须：
#   1. 找 PID: netstat -ano | grep ":8001" | grep LISTENING
#   2. 杀: taskkill //PID <PID> //F
#   3. 重启
# 启前端
cd D:/Coder/mimo-radio/frontend && npm run dev
```
- 后端默认 `:8001`（`.env` 的 `API_BASE_URL`），前端 `:3001`（next dev 默认 3000，看实际）
- webbridge daemon `:10086`（独立常驻，不在本项目代码里，别动它）

### 5.3 webbridge 浏览器自测（端到端验证用）
封装在 `logs/wb.py`，自动处理 Windows 中文 JSON body 问题：
```bash
cd D:/Coder/mimo-radio/logs
python wb.py navigate '{"url":"http://localhost:3001"}'    # 导航
python wb.py snapshot                                       # 页面无障碍树
python wb.py screenshot                                     # 截图
python wb.py evaluate '<json>'                              # 执行 JS
```
**复杂 JS 用 Python 生成 JSON 文件避免 shell 转义**：
```bash
python -c "import json; json.dump({'code':'(function(){...})()'}, open('/tmp/e.json','w',encoding='utf-8'), ensure_ascii=False)"
python wb.py evaluate /tmp/e.json
```
- 触发 React onChange 要用 native setter：
  ```js
  var el=document.querySelector("input");
  var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
  s.call(el,"文字"); el.dispatchEvent(new Event("input",{bubbles:true}));
  ```

### 5.4 日志位置
- 后端实时日志：`logs/dev-backend*.log`
- 应用日志：`logs/app-YYYY-MM-DD.log`（按天轮转，14 天清理）
- 诊断 ASR/TTS/换歌：`grep -iE "tts|transition|asr|feedback" logs/dev-backend*.log`

---

## 六、诊断陷阱（踩过的坑，别重蹈）

### ❌ 陷阱 1：用 localStorage 读 zustand store
```js
// 错！partialize 不存的字段（queue/currentSong/sessionId/sessionToken）永远读不到
JSON.parse(localStorage.getItem('mimo-radio-store')).state.queue  // 永远 []
```
**正解**：用 DOM（`document.querySelector('h2')?.textContent`）或 `useRadioStore.getState()`。

### ❌ 陷阱 2：后台启动后端 + 改代码不重启
tsx watch 在 stdout 重定向到文件时热重载失效。改后端代码必须**手动杀进程重启**。

### ❌ 陷阱 3：把单用户本地应用当高并发服务设计
这是 PWA + 本地 Node + SQLite 的**单用户**应用。不要引入乐观锁、双缓冲、分布式锁等多用户高并发模式——复杂度高于问题本身。（审查方案里已拒绝过这类过度设计。）

### ❌ 陷阱 4：在非 git 仓库用 git 操作
`git diff` / `git stash` 都无效。改动直接落盘，**靠测试 + 代码审查兜底**，无法回滚。

### ❌ 陷阱 5：硬编码 webm 却后端只收 wav/mp3
（F1 已修）类似坑：前后端契约必须对齐，改一边要查另一边。

---

## 七、当前项目状态与待办（2026-06-26）

### ✅ 已完成（对标视频规格 ~95%）
- AI 推荐歌单（MiMo + 本地相似度算法）
- AI DJ 语音播报（开场白 + 换歌串词 TTS，三引擎）
- 聊天式推荐 + 换歌 + 推荐卡片
- 专辑封面（网易云 + QQ 双源）、真实歌词 LRC（双轨降级 DJ 解说）
- 每日电台时间轴页 `/plan`（终端风格 + 真实天气 + AI 时段 + 可点击播放）
- 个人主页 `/profile`（真实统计 + SVG 雷达图 + 数据不足降级）
- 反馈落库（feedback 表 + like/unlike/skip/complete）
- ASR 语音输入、MediaSession、键盘控制、深浅主题、粒子背景
- 12 项体验改动的审查修复（F1-F12，全部验证通过）

### 📋 已知待办（未做，按优先级）
| 优先级 | 项 | 说明 |
|--------|-----|------|
| 🔴 高 | SSE 流式文本 | DJ 文本/推荐回复边生成边显示。架构级改造（后端 SSE + 前端消费），需单独立项 |
| 🔴 高 | WebSocket 实时推送 | 歌词进度同步、播放状态同步。架构级，单独立项 |
| 🟡 中 | 用户品味长期记忆 | `taste.md`/`routines.md` 缺失，反馈数据虽落库但未喂回推荐 |
| 🟡 中 | P2 审查问题 | helmet CSP、颜色对比度 WCAG AA、next/dynamic 代码分割、独立 ErrorBoundary |
| 🟡 中 | `useAudioPlayer.sideffects.test.ts` 5 个 tsc 错误 | Song 缺 emotionTags，历史问题，运行时测试通过 |
| 🟢 低 | UPnP / 歌单导入端到端测试 | 功能存在，依赖外部环境未验证 |

### 📄 关键文档索引
| 文档 | 用途 |
|------|------|
| `HANDOVER.md` | 上一轮会话交接，含完整改动清单 + 决策记录 |
| `COLLABORATION.md` | **本文件**，协同契约 |
| `docs/claudio-rebuild-plan-v2.2.md` | 视频逐帧规格（对标基准，55 帧拆解） |
| `docs/plans/2026-06-26-code-review-fixes.md` | 代码审查方案（17 任务，含安全/稳定性/测试） |
| `docs/plans/2026-06-26-post-review-fixes.md` | 体验改动审查修复（12 任务，**已执行完**） |
| `ARCHITECTURE.md` | 架构说明 |

---

## 八、协同检查清单（每次开工前过一遍）

**规划者开工前确认**：
- [ ] 任务规格写进 `docs/plans/*.md`，含根因/行号/改法/验证/边界
- [ ] 识别了依赖关系（A 必须先于 B）
- [ ] 明确了"不要做什么"

**执行者开工前确认**：
- [ ] 完整读了 `COLLABORATION.md` + 对应的 `docs/plans/*.md` 规格
- [ ] 知道当前测试基线（后端 234 / 前端 127）作为回归参照
- [ ] 改前 Read 确认行号（可能已漂移）
- [ ] 知道第三节的历史决策（不违反）

**每个任务完成后**：
- [ ] 执行者：跑了 tsc + vitest，如实回报四态状态
- [ ] 规划者：做了 spec 合规 + 代码质量两阶段审查
- [ ] 双方：确认测试基线没回退（后端≥234 / 前端≥127）

---

## 九、沟通协议

- **执行者遇到歧义**：立即停下，用 `NEEDS_CONTEXT` 状态提问，附上具体文件:行号和你看到的矛盾点。**不要猜测后继续**。
- **规划者审查发现问题**：明确指出文件:行号 + 期望行为 + 修复方向，回退给执行者。不要自己改（除非 trivial 且执行者 BLOCKED）。
- **双方意见分歧**：以**用户需求 + 视频规格 + 测试通过**为最高裁决标准。历史决策（第三节）除非用户明确推翻，否则保持。
- **范围蔓延**：执行者发现规格外的"顺便可以修"的问题，记到待办列表，**不要在当前任务里顺手改**。

---

## 十、协作经验沉淀（实战复盘，双方必读）

> 本节基于本项目的真实协作历史提炼。每一条法则都对应一次具体的踩坑或进步，不是理论。

### 10.1 核心洞察：执行者表现 = 聪明程度 × 规划者给的约束质量

本项目经历了三批执行者交付，质量曲线如下：

| 批次 | 约束条件 | 引入的新问题 | 教训 |
|------|---------|------------|------|
| A（体验改动 12 项） | 无前置约束，方案较粗 | **2 个低级错误**（ASR 格式契约不一致、handleLike 双重否定语义反向） | "照方案敲键盘，不推演后果"的典型 |
| B（UX r1+r2+S1/S2） | 有 A 的教训，方案更细 | **2 个边界遗漏**（resolveTracks 失败致无限轮询、复制粘贴漏 clearTimeout） | "只考虑 happy path，没推演失败终态" |
| C（定时器重构） | 有三条铁律 + 方案精确到终态 | **0 个** | "理解了为什么这么做"，注释直接引用铁律 |

**结论**：同一执行者，在不同约束下表现天差地别。C 的优秀有一半功劳属于那份带"三条铁律"和"写给执行者的话"的方案文档。

**推论（规划者必记）**：不要假设执行者会自己想清楚边界。**方案里没写到的，执行者大概率不会想到**。规划者的核心责任是把"终态"和"约束"写全，而不是只写"怎么改"。

### 10.2 规划者责任：方案质量五要素

一份合格的方案（`docs/plans/*.md`）必须包含以下五要素，缺一就容易让执行者犯错：

1. **根因（不是现象）**：执行者报告"首次访问失败"，规划者必须挖到"30s 全局超时 < 60s planner 超时"这种确定性根因，不能停在"可能超时"。
2. **精确改法（含完整代码）**：给行号 + 完整代码片段，不要给"优化一下"这种模糊话。执行者是机械执行，模糊 = 出错。
3. **验证标准（可观测）**：跑哪个测试、看什么日志、DOM 检查什么字段。"功能正常"不是验证标准。
4. **所有终态（含失败路径）**：异步逻辑必须列出成功/失败/超时各自置什么状态。**只写 happy path 是 B 批无限轮询 bug 的直接原因。**
5. **边界（不要做什么）**：明确"不动什么"、"降级方案是什么"。防止执行者范围蔓延。

### 10.3 执行者铁律（写异步代码时强制自检）

这三条来自 B 批的复制粘贴泄漏，C 批已验证有效（注释直接引用）：

**铁律 1：资源分配与清理必须成对出现在同一个 try/finally 里。**
任何资源一旦分配（setTimeout/addEventListener/new AbortController），立即想"它在哪释放"。绝不允许跨函数、跨 catch 分支的隐式清理。

**铁律 2：不要用复制粘贴做重试，用循环。**
重试本质是"重复执行 N 次"。复制粘贴 N 遍代码是反模式——每份副本都需独立维护。正确做法是把"单次执行"抽成纯函数，用循环驱动。

**铁律 3：写完异步逻辑，问自己三个问题。**
- 每个 setTimeout 都有对应的 clearTimeout 吗？
- 最坏情况下会累积多少未清理的资源？
- 如果这段代码失败 10 次，会留下什么副作用？

**铁律 4：替换已验证的修复方案前，必须理解原方案为什么这么写。**
不要只看表面"换成 hook 更优雅"就改。F2 用 ref 读 DOM 是因为 getAttribute 同步拿真实值；换成 useTheme 的 state（useState 异步初始值）在 `[]` 依赖下闭包捕获的是初始值——丢了"同步"属性就回归了。**改之前问自己：原方案的关键属性是什么？我的新方案保住了吗？**

**铁律 5：性能类改动必须附 Profiler 实测证据。**
"代码看着对"不等于"性能真的提升了"。性能优化（重渲染减少、延迟降低）必须用 React DevTools Profiler 录制验证，报告附实测数据（如"KimiCard 5 秒内渲染 0 次，ProgressBar 20 次"）。**不看 Profiler 等于没验证性能。** 常规功能改动跑测试就够，但性能改动是特例——必须量化证明。

### 10.4 规划者审查的三个层次

复核执行者产出时，不能只看"测试过没过"，要逐层深入：

1. **规格依从**：方案要求改的点是否都改了？有没有偏离/加戏/删减？
2. **终态完整性**：异步逻辑要推演所有失败路径（fetch 失败 × tracksLoaded true/false × 初始/自动重试 的组合）。**这一层最容易漏**——B 批的无限轮询就是规划者第一轮审查时只看了 happy path。
3. **工程整洁度**：有没有复制粘贴？有没有资源泄漏？魔法数字有没有命名？——这是把"做对"升级为"做得干净"的层面。

### 10.5 教训传递机制：让方案"携带"历史经验

C 批成功的核心，是 B 批的教训被**结构化地写进了下一份方案**（supplement-2 的第〇节"写给执行者的话"）。这个机制要固化：

- 规划者发现执行者某次犯错后，**不能只在对话里说**（下一轮执行者读不到），**必须写进下一个方案的约束章节**。
- 约束要用"信号识别"格式，不要用空泛的"要注意质量"。
  - ❌ 错误："注意定时器清理"
  - ✅ 正确："当你发现自己在复制一段含资源分配的代码时，停下来——那是抽象的信号。把它抽成函数。"

### 10.6 协作案例索引（供复盘查阅）

| 案例 | 执行者 | 文档位置 | 教训 |
|------|--------|---------|------|
| ASR 格式契约不一致（F1） | 早期执行者 | 已执行，见对话记录 | 改一端必须查另一端的 schema |
| handleLike 双重否定（F2） | 早期执行者 | 已执行，见对话记录 | 写 `!` 前推演 toggle 后状态 |
| 无限轮询（S1） | DSpro r2 | 已执行 | 异步流程必须列出所有终态 |
| 定时器泄漏 | DSpro → 修复 | supplement-2 第〇节 | 复制粘贴是抽象信号，用循环 |
| AIService 接口违反约束 | DSpro 第一次 | dj-personality-memory review | 加粗约束不可突破，TS 实现可比接口多可选参数（不要"觉得报错就改"） |
| FullscreenPlayer 闭包回归 | DSflash 视觉质感轮 | fullscreen-theme-regression-fix | 替换已验证方案前必须理解原方案**为什么这么写**；ref 读 DOM 是同步的，state 是异步的——`[]` 依赖下闭包捕获的是初始值 |
| E2E 全标"待实测" | DSflash 视觉质感轮 | 同上 | "待实测"不是验证是拖延；跑一次 E2E（哪怕一次）就能抓到闭包回归——退出后变深色一眼可见 |
| 性能改动无 Profiler 证据 | DSflash 流畅性轮 | 本次记录 | 性能优化不看 Profiler 等于没验证；报告说"≈0 渲染"但没附 Profiler 录制数据。下次报性能改动必须附"KimiCard N 秒内渲染 X 次"的实测数据 |

---

## 十一、产出物署名规范（执行者强制）

所有执行者产出的文件（自测报告、执行报告、修复方案、代码文件等），必须在以下三处标注署名 **DSflash**：

### 11.1 文件名
所有自测报告、执行报告、修复方案 MD 文件，以 `-DSflash` 结尾。

```
✅ 正确：selftest-2026-06-28-real-user-journey-DSflash.md
❌ 错误：selftest-2026-06-28-real-user-journey.md
```

### 11.2 头部元信息
每个文件正文第一行必须是 YAML 风格的元信息块：

```yaml
---
author: DSflash
task: 任务简述（一句话）
created: YYYY-MM-DD
---
```

### 11.3 尾部落款
每个文件的正文末尾必须有署名行：

```
---
*报告由 DSflash 生成。*
```

### 11.4 追溯规则
- 规划者审查时，如果文件缺少三处署名中的任意一处，**按"未完成"处理，打回重写**。
- 署名为最终责任标注。文件内容由 DSflash 负责，规划者审查后承担审核责任。
- 此规范自 2026-06-28 起生效，之前已产出的历史文件不追溯修改。

---

*本文档由规划者维护。项目状态变化时（完成新任务、测试基线变动、新增约束）由规划者更新。执行者以最新版为准。第十节为协作经验沉淀，随项目演进持续追加新案例。*
