# mimo-radio 会话交接文档

> 生成时间：2026-06-26
> 用途：新会话快速接手 mimo-radio 项目当前状态

---

## 一、项目位置与启动

- **项目根**：`D:\Coder\mimo-radio`
- **后端**：`backend/`（端口 8001），`npm run dev`（tsx watch）
- **前端**：`frontend/`（端口 3000），`npm run dev`（next dev）
- **一键启动**：根目录 `npm run dev`（concurrently 编排）
- **webbridge daemon**：`http://127.0.0.1:10086`（kimi-webbridge，控制真实浏览器）

### ⚠️ 启动注意
- **后台启动 dev server 时 tsx watch 的热重载不可靠**（stdout 重定向到文件导致 watch 失效）。改后端代码后**必须手动重启**（杀 8001 端口进程重启）。
- 前端 Next.js HMR 相对可靠，但改 `next.config.mjs` / `store` 后建议完整重启。

---

## 二、本轮会话做了什么（按时间顺序）

### 阶段 A：代码审查（3 路 Explore agent）
- 安全 / 后端质量 / 前端 全面审查
- 产出：识别 20 个问题（3 P0 + 5 P1 + 12 P2）

### 阶段 B：日志系统优化（已合入）
- 后端 logger 增强：LOG_LEVEL 环境变量、toErrorMeta（错误带堆栈）、异步写入队列、14天保留期清理
- requestId 贯通错误中间件
- 认证中间件加日志（auth.ts / sessionAuth.ts）
- 10 个 services 的 catch 统一 toErrorMeta（替代 String(err)）
- 前端 lib/logger.ts 封装 + 后端 /api/v1/log 上报端点
- 14 处裸 console 替换为 logger
- **测试全过**：backend 230 + frontend 126

### 阶段 C：P0+P1 修复（7 项，已合入）
| # | 修复 | 文件 |
|---|------|------|
| P0-1 | sessionToken 不持久化到 localStorage | radioStore.ts partialize |
| P0-2 | MediaSession API 集成（锁屏/耳机控制） | useAudioPlayer.ts（+3 effect）|
| P1-1 | SSRF 防护全局化 + 白名单（含 webbridge localhost） | fetchWithTimeout.ts + ssrfGuard.ts |
| P1-2 | 音量条连真实 volume | radioStore + KimiCard + useAudioPlayer |
| P1-3 | RecommendCard 推断 platform | RecommendCardList.tsx + types/api.ts |
| P1-4 | QQ playUrl 失败自动跳过 | useAudioPlayer.ts |
| P1-5 | AudioWaveform RAF 30fps 限帧 | AudioWaveform.tsx |
- **已回退**：P0-3 session token 过期校验（用户要求保留原 id.sig 格式，无上线需求）

### 阶段 D：删除 Fish Audio + 飞书（已合入）
- 整删 feishu.ts / feishu.test.ts + 构建产物
- 类型联动：删 CalendarEvent + SessionContext.calendar
- 联动改：mimo.ts（删日程 prompt）、radio.ts（删 feishu 调用）、context.ts（删 /calendar 端点）
- 配置清：config.ts / .env.example / ssrfGuard.ts
- 前端：TerminalLog 删飞书文案
- 文档：ARCHITECTURE.md + 5 个 review/qa 文档清理；docs/claudio-rebuild-plan*.md 加废弃声明

### 阶段 E：系统性自测（kimi webbridge 真实浏览器）
- 缺陷分析：对照视频 4:33 规格，识别 7 项差距
- 3 轮随机点击测试
- **修复 SSRF 误杀 webbridge**（加 127.0.0.1/localhost 白名单）——**这个必须重启后端才生效**

### 阶段 F：交互修复（5 个工作块，已合入）
| 块 | 修复 | 验证 |
|----|------|------|
| 1 | partialize 移除 sessionId（避免有sid无歌的不一致态）| ✅ |
| 2 | DJ 串词 30字→80-150字、开场白→50-100字 | outputLength:96 ✅ |
| 3 | 去强制自动创建，改为引导态（TerminalLog 开机动画） | reload 后 hasSong:false ✅ |
| 4 | 队列 6首→20首可滚动（max-h-240px overflow-y-auto） | count:20 scrollable ✅ |
| 5 | 离线文案"播放本地缓存"→"部分功能不可用" | ✅ |

### 阶段 G：体验修复 + 模式扫描（2026-06-27）
- Bug 1 全屏主题闭包修复（FullscreenPlayer useRef）
- Bug 2 点歌一致性架构修复（搜索前置：意图识别→先搜索→真实结果喂AI→newSong=搜索结果[0]）
- F1 收藏爱心即时更新（订阅 likedSongIds 数组）
- F3 REPLAY 错位标记（"(旧解说)"）
- F5 AI 不编造年份（prompt 去年份引导）
- F6 推荐数量不编造（prompt 约束）
- SSRF 端口级白名单（127.0.0.1:10086）
- 测试基线：后端 242 / 前端 127

---

## 三、当前代码状态

### 测试状态
- **后端**：242 测试全过，tsc 零错误
- **前端**：127 测试全过，tsc 零错误（`useAudioPlayer.sideffects.test.ts` 有 5 个既有 tsc 错误，与本次改动无关，运行时测试通过）
- **Git**：非 git 仓库，无版本控制（改动未提交，注意备份）

### 服务运行状态（会话结束时）
- 后端 8001：运行中（dev-backend4.log）
- 前端 3000：运行中（dev-frontend5.log）
- 改动已通过 HMR / 重启生效

### 改动文件汇总（本轮全部）
**后端**：
- `config.ts`（日志配置 + 删 feishu）
- `utils/logger.ts` + `logger.test.ts`（日志增强）
- `utils/sessionToken.ts` + test（回退到原版 id.sig）
- `utils/fetchWithTimeout.ts`（SSRF 校验）
- `utils/ssrfGuard.ts`（白名单：webbridge + 外部域名 - 飞书）
- `utils/promptGuard.ts`（未改，仅审查）
- `middleware/error.ts`（requestId）
- `middleware/auth.ts` + `sessionAuth.ts`（认证日志）
- `routes/radio.ts`（删 feishu 调用）
- `routes/context.ts`（删 /calendar）
- `routes/log.ts`（新增：前端日志上报端点）
- `services/mimo.ts`（DJ 串词加深 + 删日程 prompt + toErrorMeta）
- `services/*.ts`（10 个文件 toErrorMeta）
- `types/index.ts`（删 CalendarEvent + Fish 注释）
- `types/express.d.ts`（新增：requestId 类型）
- `index.ts`（cleanupOldLogs + 注册 log 路由）
- **删除**：`services/feishu.ts`、`services/feishu.test.ts`

**前端**：
- `store/radioStore.ts`（partialize：token+sessionId 都不持久化 + volume 状态）
- `hooks/useSession.ts`（createSession，原版，**注意：防重入锁已回退**）
- `hooks/useAudioPlayer.ts`（MediaSession + volume + QQ失败跳过）
- `hooks/useTTS.ts`（Fish→MiMo 注释）
- `app/page.tsx`（引导态 + ref 守卫 + 离线文案）
- `components/KimiCard.tsx`（音量条 controlled）
- `components/RecommendCardList.tsx`（platform 推断）
- `components/AudioWaveform.tsx`（RAF 限帧）
- `components/QueueList.tsx`（队列滚动）
- `components/TerminalLog.tsx`（删飞书文案）
- `components/TtsEngineSwitcher.tsx`（Fish 注释）
- `components/ErrorBoundary.tsx` + 多个组件（console→logger）
- `lib/logger.ts`（新增：前端日志封装）
- `types/api.ts`（Song 加 neteaseId）
- `next.config.mjs`（reactStrictMode 保持默认开启）

---

## 四、关键技术决策（必须记住）

1. **sessionToken 格式**：保持原版 `sessionId.sig`（HMAC-SHA256，无过期校验）。用户明确要求不改，等上线再加过期。
2. **sessionToken/sessionId 都不持久化**到 localStorage（partialize 只存 djEnabled/currentModel/ttsVoice）。reload 后会话干净重建。
3. **queue/currentSong 不持久化**（内存态）——这是设计如此，**不要用 localStorage.getItem 诊断 store 状态**（会误报为空），必须用 DOM/UI 或 store 订阅验证。
4. **SSRF 白名单**含 `127.0.0.1`/`localhost`（webbridge daemon 是合法本地调用）。
5. **dev 模式 API 认证放行**（.env 没配 API_KEY，auth.ts 的 dev 便利性，生产 fail-fast）。
6. **Fish Audio / 飞书已彻底删除**（代码+文档+构建产物）。
7. **DJ 串词字数**：intro / transition / chat 三入口统一 **60-120 字**（2026-06-29 统一，原 50-100/80-150/30-80 已废弃）。

---

## 五、未完成 / 待办（按优先级）

> 更新于 2026-07-03。整合 Mavis 独立审计发现 + 历史轮次状态修正。

### ✅ 已完成（原标"待办"但实际已做）
- ~~用户品味长期记忆~~：**已完成**。feedback 闭环（getLikedArtists → loadNeteaseSongs 搜索加权 + chat/transition tasteBlock 注入）。
- ~~换歌 isTransitioning 防重入~~：**已完成**。"换台中..."即时反馈 + 4 入口统一守卫。
- ~~重渲染优化~~：**已完成**。KimiCard/FullscreenPlayer 进度条+歌词抽离 memo 子组件。
- ~~DJ recentUserSaid~~：**已完成**。换歌时 DJ 能"听见"用户聊天内容。

### 🔴 P0（上线前必做，Mavis 审计升级）
1. **F4 isPlaying 仲裁层缺失**：8 个文件 16+ 写点直接调 setIsPlaying，无单点控制。当前靠 React 批处理兜底，**MediaSession + ASR 上线后触发概率上升**。Mavis 审计论证了从"暂缓"升级到"上线前必做"——第一次遇到锁屏/耳机控制异常再动成本极高。建议引入 `playController` reducer 单点仲裁（见 `docs/reports/audit-2026-07-03-independent-Mavis.md` §3）。

### 🟠 P1（影响核心体验，应尽快做）
2. **AI chat JSON 兜底 mood=userInput**（Mavis P1.1）：`mimo.ts:143` JSON 解析失败时 mood 兜底成完整用户输入 → 喂给 filterByMood 子串匹配 → 意外命中无关标签。**改法**：兜底用中性词（'随机'），复用 extractJsonObject。
3. **`/chat` 无取消机制**（Mavis P1.4）：用户连发 3 条 → 3 个 fetch 同时飞 → updateLastKimiMessage 只更新最后一条 → 前两个 AI 回复**丢失但不告知**，token 已消耗。**改法**：AbortController + 按 pending message id 精确替换。
4. **`String(err)` 漏改 13 处**（Mavis P1.2）：routes/index.ts/db 等 13 处 catch 用 `String(err)` 丢失堆栈。已有 `toErrorMeta` 但未复用。**改法**：机械替换为 `...toErrorMeta(err)`，极低成本。
5. **AI prompt 样板重复 4 处**（Mavis P1.3）：personaBlock+tasteBlock+memoryBlock 在 intro/transition/chat/recommend 4 处独立拼接。改 persona 要改 4 处。**改法**：抽 `composeSystemPrompt(intent, extras)` 统一构造。

### 🟡 P2（工程债，上线前批量做）
6. **P2 安全与质量**：helmet CSP 未配、WCAG 颜色对比度未查、next/dynamic 代码分割未做、独立 ErrorBoundary 未做。
7. **每次 chat 查 liked/disliked DB 4 次**（Mavis P2.1）：无缓存。**改法**：in-memory cache 30s TTL 或 session 开始时读一次。
8. **reason 字段不喂 AI**（Mavis P3.5）：feedback 的 reason 只存 logger，不进 prompt。要么加 feedback→taste 链路，要么去掉字段（YAGNI）。
9. **req as any 3 处**（Mavis P2.6）：sessionAuth/requestId/validate 用 `as any` 绕类型。**改法**：扩展 `types/express.d.ts`。
10. **addMessage O(n²)**（Mavis P2.2）：长会话性能劣化。低优先级。

### 🟢 低优先级 / 需外部环境
11. `useAudioPlayer.sideffects.test.ts` 5 个既有 tsc 错误（Song 缺 emotionTags）。
12. UPnP / 歌单导入端到端测试（依赖外部硬件/数据）。
13. ASR 语音输入需真实移动设备验证（MediaSession 已删除，见 `docs/plans/2026-07-05-remove-media-session.md`）。
14. QQ 音源完整链路需 webbridge 开 y.qq.com tab。
15. TTS mp3 不缓存（Mavis P2.5）、prompt 缓存（Mavis P2.3）——单用户应用低优先级。

### ❌ 已否决（grill-me 审议）
- ~~SSE 流式文本~~：解决的不是真实瓶颈（AI 生成速度才是）。
- ~~WebSocket 实时推送~~：LRC 已按时间戳本地高亮，不需服务器推送。
- ~~上下文推荐（天气融入搜索）~~：用户感知弱，DJ 串词已承担上下文感。
- ~~波形 RMS~~：CORS 可能解不了，当前降级可接受。

---

## 六、关键诊断方法（避免重蹈覆辙）

### ❌ 错误：用 localStorage 读 zustand store
```js
// 错！partialize 不存的字段（queue/currentSong/sessionId/sessionToken）永远读不到
JSON.parse(localStorage.getItem('mimo-radio-store')).state.queue  // 永远 []
```

### ✅ 正确：用 DOM / 内存 store 验证
```js
// 读 DOM（反映真实渲染状态）
document.querySelector('h1,h2,h3')?.textContent  // 当前歌名
document.body.innerText.match(/ON AIR|PLAYING/)  // 播放状态

// 或用 zustand 的 getState（需组件内或暴露到 window）
```

### webbridge 调用封装
- `logs/wb.py`：封装了 webbridge 调用（自动处理 Windows 中文 JSON 文件 body 问题）
- 用法：`python wb.py navigate '{"url":"..."}'` / `python wb.py snapshot` / `python wb.py evaluate '{"code":"..."}'`

### 后端日志位置
- `logs/app-YYYY-MM-DD.log`（按天轮转，14天清理）
- 实时 dev 日志：`logs/dev-backend*.log` / `logs/dev-frontend*.log`

---

## 七、视频目标对照（4分33秒参考视频）

**视频路径**：`D:\Program Files\douyin\Download\抖音2026618-063537.mp4`
**视频拆解**：`docs/claudio-rebuild-plan-v2.2.md` §3（逐帧视觉规格）

### 已达成（~92%）
- ✅ AI 个性化歌单（MiMo 替代 Claude）
- ✅ AI DJ 语音播报（MiMo TTS 替代 Fish Audio，三引擎）
- ✅ DJ 串词深度（80-150字，对齐视频）
- ✅ 聊天式推荐 + 换歌
- ✅ 三大视觉界面（首页/全屏/个人主页）
- ✅ 深色/浅色主题
- ✅ 键盘控制 + 无障碍
- ✅ MediaSession（锁屏/耳机控制）
- ✅ 队列完整可滚动
- ✅ 引导态首屏（用户输入触发）

### 未达成（~8%）
- ❌ 每日电台时间轴页面
- ❌ WebSocket 实时推送
- ❌ 用户品味长期记忆
- ❌ UPnP 实测（功能存在，未端到端验证）

---

## 八、环境备忘

- **Node**：v20+
- **Python**：3.13（用于 webbridge 封装脚本）
- **OS**：Windows 11，Git Bash
- **webbridge**：daemon 在 127.0.0.1:10086，session 名用 `mimo-radio-selftest`
- **MIMO_API_KEY**：已配在 `backend/.env`
- **API_KEY**：未配（dev 放行认证）
