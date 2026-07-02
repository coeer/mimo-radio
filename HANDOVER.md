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
7. **DJ 串词**：generateDJTransition 80-150字，generateIntro 50-100字（对齐视频深度）。

---

## 五、未完成 / 待办（按优先级）

> 更新于 2026-06-27。已完成项见第四节"关键技术决策"和本轮 plans。

### 🟡 中优先级（已知技术债，暂缓但有记录）
1. **isPlaying 状态 24+ 写点（F4 架构债）**：8 个文件 24+ 处直接调 `setIsPlaying`，缺仲裁层。当前靠 React 批处理 + Zustand 异步更新兜底，未报告可复现竞态。**触发条件**：出现 TTS resume vs MediaSession 切歌的竞态 bug 时再做架构改造（引入中心化 play/pause action）。
2. **WebSocket 未实现**（视频 WS /stream，当前 HTTP）。
3. **用户品味长期记忆**：feedback 已落库（like/skip/complete），但推荐算法不读 feedback。需把收藏的歌手/风格作为搜索加权。
4. **P2 审查问题**：helmet CSP、颜色对比度（WCAG AA）、next/dynamic 代码分割、独立 ErrorBoundary。

### 🟢 低优先级
5. `useAudioPlayer.sideffects.test.ts` 的 5 个既有 tsc 错误（Song 缺 emotionTags，运行时测试通过）。
6. UPnP / 歌单导入 / 每日规划的端到端测试（依赖外部环境）。
7. ASR / MediaSession 锁屏控制需真实移动设备验证（webbridge 无法模拟）。
8. QQ 音源完整链路需 webbridge 开 y.qq.com tab（未覆盖自测）。

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
