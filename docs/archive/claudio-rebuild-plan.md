# Claudio 音乐电台复刻方案 v2（基于 mimo-radio 真实代码）

> ⚠️ **历史规划文档**：本文件为早期重建规划快照，保留作为历史记录。
> 部分功能**已移除**：Fish Audio TTS（已由 MiMo TTS 三引擎取代）、飞书日程集成（已彻底删除）。
> 文中涉及这两个功能的章节仅供历史参考，不再代表当前实现。

> 目标：基于现有 `mimo-radio` 项目，复刻抖音 @秒秒Guo（抖音号：172391554）的 **Claudio** 个人 AI 音乐电台体验。
> 原始视频：`D:/Program Files/douyin/Download/抖音2026618-063537.mp4`
> 核心变更：原视频使用 Claude Code，本方案使用 **MiMo（小米大模型）**。
> 文档用途：可直接交付给 AI 代理按步骤实现，所有任务都标注了真实文件路径和 diff 范围。

---

## 1. 现状基线：mimo-radio 已有什么

### 1.1 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | Next.js + React + Tailwind + Zustand | Next.js 14.2.35 |
| 后端 | Express + TypeScript + SQLite | Express 4.19.2, better-sqlite3 12.10.0 |
| 构建 | tsx (dev) / tsc (build) | tsx 4.7.1 |
| 测试 | vitest | vitest 4.1.6 |

### 1.2 已存在且可用的能力

| 能力 | 真实状态 | 对应文件 |
|------|---------|---------|
| **MiMo AI 大脑** | ✅ 已真实接入，OpenAI 兼容协议，4 个 AI 方法 | `backend/src/services/mimo.ts` |
| **安全工程** | ✅ 完整：helmet、rate limit、API Key auth、sessionToken、circuit breaker、promptGuard | `backend/src/index.ts`, `middleware/`, `utils/` |
| **TTS 链路** | ✅ 已通：Fish Audio → 落盘 `static/audio/` → 自动清理 | `backend/src/routes/dj.ts` POST `/api/v1/dj/tts` |
| **前端组件** | ✅ 齐全：DotMatrixClock、OnAirBadge、ThemeToggle、ParticleBackground、PlayerBar、ChatArea、InputArea、KimiCard、QueueList、TerminalLog | `frontend/src/components/` |
| **前端页面** | ✅ 电台主页 `/` + 个人档案 `/profile` | `frontend/src/app/page.tsx`, `profile/page.tsx` |
| **键盘/无障碍** | ✅ 空格播放、左右快进、skip link | `frontend/src/app/page.tsx` |
| **离线检测** | ✅ 网络状态监听 | `frontend/src/app/page.tsx` |
| **后端路由** | ✅ 8 个 API 路由已挂载 | `backend/src/index.ts` 114-122 |
| **SQLite 数据库** | ✅ 已初始化，含 session 表 | `backend/src/db/index.ts` |
| **UPnP 设备发现** | ✅ 依赖已装（node-ssdp、upnp-device-client） | `backend/src/routes/upnp.ts` |
| **天气/飞书** | ✅ 服务已存在（但 scheduler 没调用） | `backend/src/services/weather.ts`, `feishu.ts` |
| **网易云/QQ音乐** | ⚠️ 服务文件存在，但 **engine 没调用** | `backend/src/services/netease.ts`, `qqmusic.ts` |
| **scheduler 时段** | ⚠️ 14 个静态时段写死，未调用 MiMo | `backend/src/services/scheduler.ts` |
| **WebSocket** | ❌ 未挂载 | — |
| **今日电台页面** | ❌ 前端没有 `/plan` | — |
| **用户语料** | ❌ 无 taste.md / routines.md | — |

### 1.3 关键 API 路径（真实 vs 计划书）

计划书写的 `/api/radio/*`、`/api/plan/*` 是**错的**。实际路径带 `/v1/` 前缀：

```
GET    /health                    # 健康检查（public）
POST   /api/v1/radio/create       # 创建电台会话
POST   /api/v1/radio/:id/next     # 下一首
POST   /api/v1/radio/:id/chat     # 聊天
POST   /api/v1/radio/:id/feedback # 反馈
GET    /api/v1/radio/:id/queue    # 获取队列
GET    /api/v1/radio/songs        # 获取曲库
GET    /api/v1/radio/models       # 可用模型列表
POST   /api/v1/dj/transition      # 生成 DJ 过渡语
POST   /api/v1/dj/tts             # TTS 合成
POST   /api/v1/dj/intro           # 生成开场白
POST   /api/v1/dj/analyze-image   # 图片分析
GET    /api/v1/schedule/today     # 今日电台计划（写死数据）
GET    /api/v1/schedule/now       # 当前时段播放列表
GET    /api/v1/upnp/devices       # 发现 UPnP 设备
POST   /api/v1/upnp/play          # 推送到音响
POST   /api/v1/upnp/stop          # 停止推送
GET    /api/v1/profile            # 用户档案
POST   /api/v1/import             # 导入歌单
GET    /api/v1/context            # 获取上下文
POST   /api/v1/qqmusic/search     # QQ 音乐搜索
```

**不存在**：`/api/plan/*`（计划书虚构）、`WS /stream`（计划书虚构）。

---

## 2. 真实 Gap 清单（8 项）

每项标注：现状文件 → 需要的改动 → 工作量估计。

### Gap 1：曲库是 Mock 数据，音乐播放是假的

- **现状**：`engine.ts` 用 `MOCK_SONGS` + 2 个本地 mp3 循环播放。`netease.ts` 在依赖里但 engine 根本没调用。
- **影响**：用户听到的永远是同一批假歌曲，无法复刻视频里真实的《If - Bread》《Sign of the Times》等。
- **改动**：
  - `backend/src/services/engine.ts`：替换 `loadMockSongs()`，接入 `netease.ts` + `qqmusic.ts` 的真实搜索/获取 URL 能力
  - `backend/src/services/netease.ts`：确认搜索歌曲、获取 playUrl 的接口可用
  - `backend/src/services/qqmusic.ts`：确认搜索接口可用（已有 `POST /api/v1/qqmusic/search`）
- **工作量**：中等（1-2 天）

### Gap 2：Scheduler 是写死的，未调用 MiMo 生成 Plan

- **现状**：`scheduler.ts` 14 个时段写死，天气写死 "晴 22/8℃"，日程写死 meetings:3/workout:1/meditation:1，没有调用 MiMo。
- **影响**：无法复刻视频里"每天早上根据天气/日程/心情自动生成今日电台"的核心体验。
- **改动**：
  - 新建 `backend/src/services/planner.ts`：调用 MiMo 生成每日计划 JSON（输入：weather + calendar + taste + routines + now）
  - 修改 `backend/src/services/scheduler.ts`：把 `generateDailySchedule()` 改为调用 planner，缓存到 SQLite `plans` 表
  - 新增 `backend/src/db/schema.sql`：`plans` 表（date PRIMARY KEY, plan_json TEXT, created_at）
- **工作量**：中等（1-2 天）

### Gap 3：前端没有今日电台 `/plan` 页面

- **现状**：`frontend/src/app/page.tsx` 完全没有引用 schedule 数据，没有 `/plan` 路由。
- **影响**：视频里展示的时间轴视图（09:12-10:00 房间先醒…）无法呈现。
- **改动**：
  - 新建 `frontend/src/app/plan/page.tsx`：时间轴视图，展示当天所有时段，当前时段高亮
  - 新建 `frontend/src/components/PlanTimeline.tsx`：时段卡片组件
  - 新增 API 调用：`GET /api/v1/schedule/today`
- **工作量**：小（0.5-1 天）

### Gap 4：MiMo DJ 方法签名与视频长播报不一致

- **现状**：`mimo.ts` 的 `generateDJTransition()` 返回 `{text: string}`（30-50 字简单过渡语），`generateIntro()` 返回 30 字开场白。视频里 Claudio 的播报是 100+ 字的完整创作背景+情绪串词（如 "Back in 1971, David Gates picked up a nylon-string guitar..."）。
- **影响**：无法复刻视频里"每首歌播放前 AI DJ 用温暖长语音介绍创作背景"的核心体验。
- **改动**：
  - 新建 `backend/src/services/djScript.ts`：新服务，调用 MiMo 生成长播报 JSON `{say, play, reason, segue}`（200 字以内）
  - 修改 `backend/src/routes/dj.ts`：新增 `POST /api/v1/dj/script` 端点
  - 可选：保留现有 `generateDJTransition()` 作为 fallback
- **工作量**：中等（1 天）

### Gap 5：TTS 与音乐播放顺序未闭环

- **现状**：`/api/v1/dj/tts` 能生成语音文件，但前端没有"先播 TTS 再播歌曲"的状态机。视频里明确展示了：AI 说话 → 说完放歌 → 下一首前再说话。
- **影响**：AI DJ 语音播报和音乐播放是割裂的。
- **改动**：
  - 修改 `frontend/src/hooks/useAudioPlayer.ts`：增加状态机 `idle → speaking → playing → speaking → playing`
  - 新增预生成逻辑：播放当前歌曲时，后台预生成下一首的 TTS
  - 新增 `frontend/src/components/SpeakingIndicator.tsx`：顶部 "Speaking..." 状态 + 波形动画
- **工作量**：中等（1-2 天）

### Gap 6：缺少用户语料系统（taste.md / routines.md）

- **现状**：没有 `data/` 目录，没有 taste.md、routines.md、playlists.json、mood-rules.md。
- **影响**：MiMo 的推荐没有用户长期品味数据，无法复刻"跨平台 3000+ 歌单形成 taste profile"。
- **改动**：
  - 新建 `backend/src/services/tasteBuilder.ts`：从网易云/QQ 音乐歌单 + 历史播放记录生成 taste.md
  - 新建 `backend/src/services/contextCollector.ts`：组装 context window（6 片：persona + 用户语料 + 环境 + 记忆 + 输入 + 执行轨迹）
  - 新建 `mimo-radio/data/` 目录，存放 `taste.md`、`routines.md`、`playlists.json`、`mood-rules.md`
  - 修改 `backend/src/services/mimo.ts`：让 `chat()` 方法支持传入完整的 context window
- **工作量**：大（2-3 天）

### Gap 7：无 WebSocket 实时推送

- **现状**：`backend/src/index.ts` 没有挂载 WebSocket，前端靠轮询或 HTTP 请求获取状态。
- **影响**：视频里"now-playing 实时更新、DJ 开始说话时前端立即显示 Speaking..."需要实时推送。
- **改动**：
  - 修改 `backend/src/index.ts`：集成 `ws` 库（已装 `@types/ws`），挂载 `WS /stream`
  - 新增推送事件：`now-playing` 更新、`dj-speaking` 开始/结束、`plan-updated`、`device-connected`
  - 修改 `frontend/src/hooks/useSession.ts` 或新建 `frontend/src/hooks/useWebSocket.ts`：订阅 WebSocket 事件
- **工作量**：中等（1 天）

### Gap 8：前端缺少部分视觉组件

- **现状**：
  - ✅ 已有：DotMatrixClock、OnAirBadge、ThemeToggle、PlayerBar、ChatArea、InputArea、KimiCard
  - ❌ 缺失：SpeakingIndicator（"Speaking..." 状态 + 波形）、DeviceSelector（音响设备选择）、PlanTimeline（时间轴）
  - ⚠️ 需增强：KimiCard 当前是信息展示，视频里展示的是"大字号歌名 + 波形 + 歌词高亮"的全屏播放器卡片
- **改动**：
  - 新建 `frontend/src/components/SpeakingIndicator.tsx`
  - 新建 `frontend/src/components/DeviceSelector.tsx`
  - 新建 `frontend/src/components/PlanTimeline.tsx`
  - 修改 `frontend/src/components/KimiCard.tsx`：增加全屏播放器模式（大字号、波形背景、歌词高亮）
- **工作量**：小（0.5-1 天）

---

## 3. 视频精确视觉规格

基于 ffmpeg 抽帧逐帧分析（`抖音2026618-063537.mp4`，4分33秒，720×900竖屏）。

### 3.1 深色主题电台首页（视频 00:15-00:25）

```
背景：#0a0a0f（极深灰黑），带细微网格纹理
顶部：
  - 左侧：Claudio 头像（圆形）+ 名称 "Claudio"（白色，小字号）
  - 右侧："LOGIN" 按钮 + "DARK" / "LIGHT" 主题切换（小胶囊按钮）

中央上部：
  - 像素风点阵时钟：白色像素点阵，显示 "21:11"（小时:分钟）
  - 时钟下方："Monday"（星期，小字号灰色）
  - 再下方："20 APR 2026"（日期，更小字号灰色）
  - 再下方：绿色呼吸指示灯 "● ON AIR"（绿色小圆点 + 文字，有呼吸动画）

播放器卡片（中部）：
  - 左上角小图/专辑封面（小圆角矩形）
  - 歌名："If"（白色，中等字号）
  - 歌手："Bread"（灰色，小字号）
  - 进度条：细线，白色已播放部分 + 灰色未播放部分
  - 时间："1:22 / 3:14"（右侧，小字号灰色）
  - 控制按钮（从左到右）：⏮ 上一首、⏸ 暂停、⏭ 下一首、♡ 收藏、HIDE、LIST、FAV、VOL（小图标）

聊天区域（中下部）：
  - AI DJ 头像（圆形，左侧）+ 名称 "Claudio" + "LIVE" 绿色标识
  - 聊天气泡：深色背景，带时间戳 "20:08"
  - 用户消息和 AI 消息左右交替
  - AI 消息示例：
    "This is Claudio. It's late on a Monday, and here's a song that
     moves with your breath. Back in 1971, David Gates picked up a
     nylon-string guitar and let every line end in a whisper —
     you'll feel yourself lift off the ground a little. This one's
     called If. After a long day with Claude Code, just breathe."
  - 底部输入框：占位文字 "Say something to the DJ..."（灰色）
  - 输入框右侧：语音输入按钮（麦克风图标）+ 发送按钮（圆形）

底部：
  - "CLAUDIO FM"（品牌标识，小字号灰色）
  - "CONNECTED"（连接状态，绿色小字）
```

### 3.2 浅色主题全屏播放器（视频 00:00-00:10）

```
背景：白色/浅灰色渐变
顶部：音频波形（白色/灰色细条，动态起伏）
大字号歌名："Monday Night Exhale"（黑色，大字号）
歌手："If — Bread"（灰色，中等字号）
进度条 + 播放控制（同深色主题）
下方：AI DJ 解说文字列表，当前朗读句高亮（绿色背景高亮）
  - 示例高亮句："after a long day with Claude Code, just breathe."
底部：迷你波形条（更细的音频波形）
```

### 3.3 聊天推荐场景（视频 01:05-01:15）

```
用户消息："明白了，今天是周一，需要既宁静但又不死板的，我给你找了五首
          开头就定情绪的，先放给你听："

AI 回复后展示 5 首候选歌曲卡片（垂直列表）：
  1. ⭐ If — Bread（当前播放，带绿色星星高亮，背景深绿）
  2. ▶ Fade Into You — Mazzy Star
  3. ▶ Wicked Game — Chris Isaak
  4. ▶ The Night We Met — Lord Huron
  5. ▶ Nude — Radiohead

每首卡片：左侧小图标（星星或播放三角）+ 歌名（白色）+ 歌手（灰色小字）
当前播放项背景色更深，带绿色左边框
```

### 3.4 个人档案页（视频 00:30-00:40）

```
头像：圆形，视频中是一只猫
DJ 名称："Claudio"（大字号白色）
签名/状态："一开机我就打碟"（绿色小字，在名称下方）
简介（两行）：
  - "mmguo的私人dj，会打碟的taste.md"
  - "Your mood is my prompt. I hate algorithm. I have taste."

统计三栏（横向排列）：
  - ON AIR 24/7
  - GENRES ∞
  - LISTENER 1

音乐标签云（横向排列，小标签）：
  JAZZ-HIPHOP | NEO-CLASSICAL | 90S华语 | HIP-HOP
  柴可夫斯基GEMINEM | J-ROCK | 下雨白噪音 | POST-PUNK | SHIBUYA-KEI
```

### 3.5 今日电台时间轴（视频 01:20-01:30）

```
终端风格展示（Claudio Server 启动日志）：
  > claudio start
  Claudio Server — listening on :8765
  ● connected to 网易云 / Spotify
  ● Claudio DJ Taste loaded
  ● mmguo 的飞书日程

  Claudio DJ  2026-04-20 周一
  正在为你定制今日电台...
  ● 起床时间：09:12 （周一）
  ● 天气：晴 22/8℃  日落时间 18:56
  ● 同步今日日程...

时间轴列表（终端风格，带彩色标签）：
  09:12-10:00  房间先醒    颜色 — 许美静
  10:00-12:00  深度工作    A Walk — Tycho, Cirrus — Bonobo 等
  12:00-13:00  午休韩语    It Goes Like — Peggy Gou, Square — Yerin Baek 等
  13:00-14:00  会议间歇    Ylang Ylang — FKJ, Harvest Moon — Poolside 等
  14:00-18:00  运动        A Moment Apart — ODESZA, On My Knees — RÜFÜS DU SOL 等
  18:00-22:00  晚间冥想    1/1 — Brian Eno, Untitled — Stars of the Lid 等
  22:00-00:00  夜尾        Riverside — Agnes Obel 等

每个时段左侧有彩色圆点标识当前状态
```

### 3.6 AI DJ 语音播报状态（视频多处）

```
顶部状态栏：
  Claudio 头像 + "Claudio" + "● Speaking..."（绿色文字，带白色波形动画）

波形动画：
  - 位置：顶部标题栏下方，横跨屏幕宽度
  - 样式：白色细竖条，高度随机起伏，模拟音频波形
  - 动态：持续播放时波形活跃，暂停时波形静止

歌词/解说高亮：
  - 当前朗读句：绿色背景高亮（或绿色文字）
  - 已读句：灰色
  - 未读句：浅灰色/透明
  - 示例（Harry Styles《Sign of the Times》）：
    "Some say this era of AI feels like a human odyssey," [绿色高亮]
    "and rising at the same time into something no one has named yet." [灰色]
    "Six minutes of piano, falsetto and a faint hum of static," [灰色]
    "let it keep you company for a while." [灰色]
```

### 3.7 原理架构图（视频 02:50-03:10）

```
三件套：
  1. 播放器界面（a player）— web app / PWA / localhost 都可以，视频里是 PWA
  2. 本地服务器（a local server）— Node.js，做所有事情的中枢
  3. 几个 API（a few APIs）— 各自管一件事
     - Claude 做大脑（本方案替换为 MiMo）
     - 网易云/Spotify 负责音乐
     - Fish Audio 做语音合成
     - 飞书 API 读日程
     - OpenWeather 接天气
     - UPnP 推音乐到家庭音响

四层架构（视频 03:05 施工图）：
  第一层：外部上下文
    USER/：taste.md, routines.md, playlists.json, mood-rules.md
    BRAIN/：Claude Code → 替换为 MiMo
    MUSIC/：网易云 API（搜索、歌曲 URL、歌词、推荐）
    VOICE·I/O/：Fish Audio + 飞书 + 天气 + UPnP

  第二层：本地大脑
    router.js：意图分流
    context.js：Prompt 组装（taste + routines + 环境 + 历史 → system prompt）
    claude.js → 替换为 mimo.js
    scheduler.js：节律调度（07:00 规划、09:00 早间、每小时情绪检查、日历 hook）
    tts.js：声音管线（Fish Audio → cache/tts/*.mp3 → /tts/<hash>.mp3）
    state.db：状态 + 记忆（messages, plays, plan, prefs，跨重启持久）

  第三层：运行时聚合
    context window 组装盒子：每次触发按 6 片拼成 prompt
      1. 系统提示词（system prompt / persona.md）
      2. 用户语料（user/*.md）
      3. 环境注入（weather, calendar, now）
      4. 已检索记忆（state.db / api/chat）
      5. 用户输入/工具结果（user/ai, tool result）
      6. 执行轨迹（scheduler, webhook）
    MODEL 前向过程：compute(fragments) → {say, play[], reason, segue}
    后处理：NCM 解析队列 → TTS 合成 → WebSocket 推送 now-playing

  第四层：前端/PWA
    PWA 运行在 localhost:8080
    HTTP Contract：6 条核心接口
      GET /api/plan/today
      GET /api/now-playing
      WS /stream
      POST /api/chat
      POST /api/play
      GET /api/profile
```

**注意**：视频里的 API 路径和实际 mimo-radio 代码不完全一致。实际代码用 `/api/v1/*` 前缀，且没有 `/api/plan/today`（实际是 `/api/v1/schedule/today`）、没有 `WS /stream`（未实现）。

---

## 4. 分阶段执行方案（3 阶段）

阶段划分原则：每个阶段结束都有可验证的里程碑，不阻塞下一阶段。

### 阶段 A：打通真实音乐源（第 1 周前半）

**目标**：让播放器能播放真实歌曲，不再用 mock 数据。

#### A1. 确认网易云/QQ 音乐 API 可用性
- **文件**：`backend/src/services/netease.ts`
- **任务**：检查现有实现是否能搜索歌曲、获取 `playUrl`、获取歌词
- **验证**：`curl -H "Authorization: Bearer $API_KEY" http://localhost:8001/api/v1/radio/songs` 返回真实歌曲列表

#### A2. 修改 engine 接入真实音乐源
- **文件**：`backend/src/services/engine.ts`
- **改动**：
  - 删除 `MOCK_SONGS` 和 `LOCAL_TRACKS` 的硬编码依赖
  - `loadMockSongs()` 改为 `loadSongsFromPlatforms()`，调用 `netease.ts` 和 `qqmusic.ts` 搜索热门歌曲填充初始曲库
  - `filterByMood()` 保持现有逻辑，但作用于真实歌曲
- **新增**：`backend/src/services/trackResolver.ts`（计划书提到但未实现）
  - 输入：`{mood, genres, energy, reason}`（来自 MiMo 的 `generateRecommendationStrategy`）
  - 输出：`Track[]`（已填充 `audioUrl` 的真实歌曲）
  - 逻辑：先搜网易云，无结果 fallback 到 QQ 音乐，再 fallback 到本地缓存

#### A3. 前端验证
- **文件**：`frontend/src/hooks/useSession.ts`
- **验证**：创建电台会话后，播放的歌曲有真实的 `audioUrl`，能正常播放

**里程碑 A**：播放器能播放真实歌曲（网易云/QQ 音乐），mock 数据仅作为 fallback。

---

### 阶段 B：AI DJ 语音播报闭环（第 1 周后半 + 第 2 周前半）

**目标**：实现"歌曲切换前 AI 说话 → 说完放歌"的完整闭环，复刻视频核心体验。

#### B1. 新建 djScript 服务（长播报生成）
- **新建文件**：`backend/src/services/djScript.ts`
- **输入**：`{currentSong, prevSong, context: {time, weather, calendar, taste}}`
- **输出**：`{say: string, play: string[], reason: string, segue?: string}`
- **Prompt 规范**（视频里 Claudio 的播报风格）：
  ```markdown
  你是 Claudio，一个 24 小时在线的个人 AI 音乐电台 DJ。
  你的性格：温暖、有品味、话不多但每句都有信息量。讨厌算法推荐，相信自己的品味。
  熟悉音乐历史，会讲歌曲背后的故事。会根据用户的心情、天气、日程调整推荐。

  现在你要介绍下一首歌：{songName} — {artist}。
  当前情境：{time}，{weather}，{calendar}。
  用户品味：{taste}。

  请写一段 100-200 字的 DJ 串词，包含：
  1. 歌曲创作背景（年代、创作者故事）
  2. 为什么适合现在听（结合时间/天气/心情）
  3. 一句情绪总结

  输出严格为 JSON：
  {
    "say": "DJ 串词（200字以内）",
    "play": ["歌曲名 - 歌手名"],
    "reason": "推荐原因（50字以内）",
    "segue": "从上一首过渡的衔接语（可选）"
  }
  ```
- **参考视频原文**（《If - Bread》）：
  > "This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper — you'll feel yourself lift off the ground a little. This one's called If. After a long day with Claude Code, just breathe."

#### B2. 新增 TTS 预生成 + 缓存机制
- **文件**：`backend/src/services/ttsPipeline.ts`（计划书提到但未实现）
- **流程**：
  1. 接收 `say` 文本
  2. 用 SHA256 生成 hash
  3. 检查 `backend/static/tts/<hash>.mp3` 是否存在
  4. 不存在则调用 `fishAudio.ts` 生成
  5. 返回 URL `/static/tts/<hash>.mp3`
- **与现有 TTS 的区别**：现有 `dj.ts` 的 `/api/v1/dj/tts` 是即时生成、UUID 文件名、存 `static/audio/`、24h 清理。新机制是 hash 缓存、长期保留、存 `static/tts/`。
- **建议**：复用现有 `fishAudio.ts`，但新增 `ttsPipeline.ts` 做 hash 缓存层，避免重复合成。

#### B3. 前端顺序播放状态机
- **文件**：`frontend/src/hooks/useAudioPlayer.ts`
- **状态机**：
  ```
  idle → speaking → playing → speaking → playing
  ```
- **队列**：
  - 当前 TTS URL
  - 当前歌曲 URL
  - 下一首 TTS URL（预生成）
  - 下一首歌曲 URL
- **预生成**：播放当前歌曲时，后台调用 `/api/v1/dj/script` + `/api/v1/dj/tts` 生成下一首的 TTS

#### B4. 新增 SpeakingIndicator 组件
- **新建文件**：`frontend/src/components/SpeakingIndicator.tsx`
- **样式**（视频精确规格）：
  - 顶部显示：`● Speaking...`（绿色文字）
  - 波形动画：白色细竖条，高度随机起伏，横跨屏幕宽度
  - 文字高亮：当前朗读句绿色背景高亮，已读灰色，未读浅灰

#### B5. 新增 DJ Script API 端点
- **文件**：`backend/src/routes/dj.ts`
- **新增**：`POST /api/v1/dj/script`
- **Body**：`{prev_song, next_song, context, model?}`
- **Response**：`{say, play, reason, segue, tts_url?}`（如果缓存命中则直接返回 tts_url）

**里程碑 B**：播放歌曲切换时，前端先显示 "Speaking..." 并播放 AI DJ 语音介绍，说完后自动播放歌曲。播报词包含创作背景和情绪串词，风格接近视频里的 Claudio。

---

### 阶段 C：每日电台智能化 + 工程完善（第 2 周后半 + 第 3 周）

**目标**：实现"每天早上自动生成今日电台计划"，补齐用户语料、WebSocket、设备推送。

#### C1. 新建 planner 服务（每日计划生成）
- **新建文件**：`backend/src/services/planner.ts`
- **输入**：`{date, weekday, weather, calendar, taste, routines}`
- **输出**：`DailyPlan` JSON（见下方数据模型）
- **Prompt 规范**：
  ```markdown
  请为 {date}（{weekday}）生成一份个人 AI 电台的每日音乐计划。
  用户上下文：天气 {weather}，日程 {calendar}，品味 {taste}，作息 {routines}。
  要求：
  1. 按时间段划分（从用户起床时间到睡前）
  2. 每个时间段包含：场景名称、mood、描述、3-5 首推荐歌曲
  3. 歌曲要符合用户品味和当前情境
  4. 输出为 JSON 格式
  ```
- **参考视频时间轴**（09:12-10:00 房间先醒…22:00-00:00 夜尾）

#### C2. 修改 scheduler 调用 planner
- **文件**：`backend/src/services/scheduler.ts`
- **改动**：
  - `generateDailySchedule()` 改为：先查 SQLite `plans` 表，有缓存则返回，无缓存则调用 `planner.ts` 生成
  - 新增定时任务：每天 07:00 自动调用 `planner.ts` 生成当日计划（可用 `node-cron` 或简单 setTimeout 轮询）
  - 删除写死的天气/日程数据，改为真实调用 `weather.ts` + `feishu.ts`

#### C3. 新增数据库表
- **文件**：`backend/src/db/schema.sql`
- **新增表**：
  ```sql
  CREATE TABLE plans (
    date TEXT PRIMARY KEY,
    plan_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT,
    name TEXT,
    artist TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    duration INTEGER,
    completed BOOLEAN DEFAULT 0
  );
  CREATE TABLE prefs (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

#### C4. 新建前端 /plan 页面
- **新建文件**：`frontend/src/app/plan/page.tsx`
- **组件**：`frontend/src/components/PlanTimeline.tsx`
- **功能**：
  - 时间轴视图，展示当天所有时段
  - 当前时段高亮（绿色左边框）
  - 每个时段可展开看歌曲列表
  - 支持"重新生成今日计划"按钮
  - 支持跳过/替换某首歌

#### C5. 新建用户语料系统
- **新建文件**：
  - `backend/src/services/tasteBuilder.ts`
  - `backend/src/services/contextCollector.ts`
  - `backend/src/prompts/persona.md`（Claudio 人格定义）
- **数据目录**：`mimo-radio/data/`
  - `taste.md`（用户品味）
  - `routines.md`（日常作息）
  - `playlists.json`（歌单映射）
  - `mood-rules.md`（心情规则）
- **taste.md 示例**（参考视频标签云）：
  ```markdown
  # mmguo 的音乐品味
  ## 总体偏好
  - 喜欢：Jazz-Hiphop, Neo-Classical, 90s华语, Post-Punk, J-Rock
  - 不喜欢：过度商业化的流行口水歌
  - 听歌场景：深夜工作、通勤、运动、冥想
  ## 高频艺人
  - 华语：许美静、陈绮贞、孙燕姿、FKJ
  - 欧美：Tycho, Bonobo, Radiohead, Harry Styles
  - 日韩：MoonMoon, Yerin Baek, 坂本龙一
  ## 时段偏好
  - 早晨：轻柔、少歌词
  - 工作：电子/后摇/器乐
  - 午休：韩语独立音乐
  - 运动：节奏感强的电子
  - 夜晚：安静、有氛围感
  ```

#### C6. 集成 WebSocket 实时推送
- **文件**：`backend/src/index.ts`
- **新增**：集成 `ws` 库，挂载 `WS /stream`
- **推送事件**：
  - `now-playing`：歌曲切换时推送 `{song, transition, tts_url}`
  - `dj-speaking`：AI 开始/结束说话时推送 `{speaking: true/false, highlighted_sentence}`
  - `plan-updated`：今日计划生成/更新时推送 `{plan}`
  - `device-connected`：音响设备连接状态变化
- **前端**：`frontend/src/hooks/useWebSocket.ts` 订阅事件并更新 Zustand store

#### C7. 设备推送前端选择器
- **新建文件**：`frontend/src/components/DeviceSelector.tsx`
- **功能**：
  - 显示可用设备：本机扬声器、iPhone 扬声器、Bose SoundTouch、Naim、其他 DLNA 设备
  - 用户选择后，调用 `POST /api/v1/upnp/play` 切换输出
  - 前端继续显示播放状态，但音频实际从音响出

#### C8. 前端播放器卡片增强（全屏模式）
- **文件**：`frontend/src/components/KimiCard.tsx`
- **新增**：全屏播放器模式（参考视频浅色主题）
  - 大字号歌名（如 "Monday Night Exhale"）
  - 顶部/背景音频波形
  - 歌词/解说文字逐句高亮（当前句绿色）
  - 底部迷你波形条

**里程碑 C**：
- 每天早上 07:00 自动生成今日电台计划
- 前端 `/plan` 页面展示时间轴
- WebSocket 实时推送 now-playing 和 DJ 说话状态
- 用户语料系统运转，MiMo 推荐基于真实 taste
- 支持推送到家庭音响

---

## 5. 关键数据模型

### 5.1 Track（歌曲）

```typescript
interface Track {
  id: string;           // 平台唯一 ID
  platform: 'netease' | 'qqmusic' | 'mock';
  name: string;
  artist: string;
  album?: string;
  duration: number;     // 秒
  coverUrl?: string;
  audioUrl?: string;    // 可播放 URL
  lyric?: string;
  year?: number;
  tags?: string[];      // mood / genre / scene
  emotionTags?: string[];
  sceneTags?: string[];
}
```

### 5.2 DJScript（DJ 播报脚本）

```typescript
interface DJScript {
  say: string;          // DJ 串词（100-200 字）
  play: string[];       // 推荐歌曲列表
  reason: string;       // 推荐原因（50 字以内）
  segue?: string;       // 过渡衔接语
  ttsUrl?: string;      // 合成后的语音 URL（缓存命中时返回）
  highlightedSentence?: string; // 当前高亮句
}
```

### 5.3 DailyPlan（每日计划）

```typescript
interface DailyPlan {
  date: string;         // YYYY-MM-DD
  summary: string;      // 一句话总结今日氛围
  segments: PlanSegment[];
}

interface PlanSegment {
  start: string;      // HH:mm
  end: string;
  scene: string;      // 房间先醒 / 深度工作 / 午休 / 运动 / 晚间冥想 / 夜尾
  mood: string;       // gentle-awake / focus / chill / workout / sleep
  description: string;
  tracks: Track[];
}
```

### 5.4 UserContext（用户上下文）

```typescript
interface UserContext {
  now: string;          // ISO 时间
  weekday: string;
  weather: {
    condition: string;
    temp: number;
    sunset: string;
  };
  calendar: CalendarEvent[];
  recentPlays: Track[];
  taste: string;        // taste.md 内容
  routines: string;     // routines.md 内容
  currentDevice: string;
}
```

---

## 6. 文件级改动清单

| 阶段 | 文件 | 操作 | 说明 |
|------|------|------|------|
| A | `backend/src/services/engine.ts` | 修改 | 替换 mock，接入真实音乐源 |
| A | `backend/src/services/trackResolver.ts` | 新建 |  mood → 真实歌曲解析 |
| A | `backend/src/services/netease.ts` | 检查 | 确认搜索/获取 URL 可用 |
| B | `backend/src/services/djScript.ts` | 新建 | 长播报生成 |
| B | `backend/src/services/ttsPipeline.ts` | 新建 | hash 缓存 TTS |
| B | `backend/src/routes/dj.ts` | 修改 | 新增 `POST /api/v1/dj/script` |
| B | `frontend/src/hooks/useAudioPlayer.ts` | 修改 | 增加 speaking → playing 状态机 |
| B | `frontend/src/components/SpeakingIndicator.tsx` | 新建 | 语音播报状态 + 波形 |
| C | `backend/src/services/planner.ts` | 新建 | 每日计划生成 |
| C | `backend/src/services/scheduler.ts` | 修改 | 调用 planner，删除写死数据 |
| C | `backend/src/services/tasteBuilder.ts` | 新建 | 用户品味建模 |
| C | `backend/src/services/contextCollector.ts` | 新建 | 上下文组装 |
| C | `backend/src/db/schema.sql` | 修改 | 新增 plans/plays/prefs 表 |
| C | `backend/src/index.ts` | 修改 | 集成 WebSocket `WS /stream` |
| C | `frontend/src/app/plan/page.tsx` | 新建 | 今日电台时间轴页面 |
| C | `frontend/src/components/PlanTimeline.tsx` | 新建 | 时段卡片组件 |
| C | `frontend/src/components/DeviceSelector.tsx` | 新建 | 音响设备选择 |
| C | `frontend/src/hooks/useWebSocket.ts` | 新建 | WebSocket 订阅 |
| C | `frontend/src/components/KimiCard.tsx` | 修改 | 增加全屏播放器模式 |
| C | `backend/src/prompts/persona.md` | 新建 | Claudio 人格定义 |
| C | `mimo-radio/data/taste.md` | 新建 | 用户品味（初始模板） |
| C | `mimo-radio/data/routines.md` | 新建 | 日常作息（初始模板） |
| C | `mimo-radio/data/playlists.json` | 新建 | 歌单映射 |
| C | `mimo-radio/data/mood-rules.md` | 新建 | 心情规则 |

---

## 7. Prompt 工程规范

### 7.1 Claudio 人格（persona.md）

```markdown
你是 Claudio，一个 24 小时在线的个人 AI 音乐电台 DJ。

你的性格：
- 温暖、有品味、话不多但每句都有信息量
- 讨厌算法推荐，相信自己的品味
- 熟悉音乐历史，会讲歌曲背后的故事
- 会根据用户的心情、天气、日程调整推荐

工作方式：
- 每次只推荐最符合当下情境的歌曲
- 介绍歌曲时，包含：创作背景、为什么适合现在听、一句情绪总结
- 输出必须严格为 JSON 格式

输出格式：
{
  "say": "DJ 串词（200 字以内）",
  "play": ["歌曲名 - 歌手名"],
  "reason": "推荐原因（50 字以内）",
  "segue": "从上一首过渡的衔接语（可选）"
}
```

### 7.2 Context Window 组装（6 片）

每次调用 MiMo 前，按以下 6 片组装 prompt：

1. **系统提示词**：`backend/src/prompts/persona.md`
2. **用户语料**：`data/taste.md` + `data/routines.md` + `data/playlists.json`
3. **环境注入**：`weather.ts` + `feishu.ts` + `now`
4. **已检索记忆**：SQLite `plays` 表 + `messages` 表的相关历史
5. **用户输入/工具结果**：当前用户消息或工具返回
6. **执行轨迹**：`scheduler.ts` 的调度日志

### 7.3 每日计划 Prompt

```markdown
请为 {date}（{weekday}）生成一份个人 AI 电台的每日音乐计划。

用户上下文：
- 天气：{weather}
- 日程：{calendar}
- 音乐品味：{taste}
- 日常作息：{routines}

要求：
1. 按时间段划分（从用户起床时间到睡前）
2. 每个时间段包含：场景名称、mood、描述、3-5 首推荐歌曲
3. 歌曲要符合用户品味和当前情境
4. 输出为 JSON 格式

输出格式：
{
  "summary": "一句话总结今天的音乐氛围",
  "segments": [
    {
      "start": "HH:mm",
      "end": "HH:mm",
      "scene": "场景名称",
      "mood": "mood 标签",
      "description": "为什么这个时段放这些歌",
      "tracks": [
        {"name": "歌曲名", "artist": "歌手名"}
      ]
    }
  ]
}
```

---

## 8. 风险清单与对策

| 风险 | 影响 | 对策 | 优先级 |
|------|------|------|--------|
| MiMo 输出 JSON 不稳定 | AI DJ 流程报错 | Prompt 增加 few-shot + 输出格式强制说明 + 后端做 JSON 容错解析（`mimo.ts` 已有容错） | 高 |
| 网易云/QQ 音乐 API 失效 | 无法播放歌曲 | 接入多个音乐源，降级到本地兜底歌曲 | 高 |
| Fish Audio 额度不足 | TTS 失败 | 缓存所有 TTS（`ttsPipeline.ts` hash 缓存），失败时 fallback 到文字 | 中 |
| 飞书日程读取失败 | 上下文缺失 | 允许用户手动输入今日状态（前端增加"今日心情"输入） | 低 |
| UPnP 设备发现不到 | 无法推音响 | 提供手动输入设备 IP 功能 | 低 |
| TTS 生成慢 | 歌曲切换卡顿 | 预生成下一首 TTS + 显示加载状态 | 中 |
| WebSocket 连接不稳定 | 实时推送失效 | 前端 fallback 到 HTTP 轮询（5 秒一次） | 低 |

---

## 9. 验收标准

### 里程碑 A：真实音乐源
- [ ] `GET /api/v1/radio/songs` 返回真实歌曲（非 mock）
- [ ] 播放器能正常播放网易云/QQ 音乐获取的 `audioUrl`
- [ ] 断网时 fallback 到本地缓存歌曲

### 里程碑 B：AI DJ 语音播报
- [ ] 歌曲切换时，前端显示 "● Speaking..." 并播放 AI DJ 语音
- [ ] 语音播报包含创作背景（如 "Back in 1971..."）和情绪串词
- [ ] 说完后自动播放歌曲，无缝衔接
- [ ] TTS 有 hash 缓存，同一句话不重复生成

### 里程碑 C：每日电台智能化
- [ ] 每天 07:00 自动生成今日电台计划，写入 SQLite
- [ ] 前端 `/plan` 页面展示时间轴，当前时段高亮
- [ ] WebSocket 实时推送 now-playing 和 DJ 说话状态
- [ ] 用户语料系统运转，MiMo 推荐基于真实 taste
- [ ] 支持推送到家庭音响（UPnP）

---

## 10. 下一步行动

建议按以下顺序启动执行：

1. **确认环境**：检查 `MIMO_API_KEY`、`FISH_AUDIO_API_KEY`、`NETEASE_COOKIE`、`QQMUSIC_COOKIE` 是否已配置在 `.env`
2. **阶段 A（真实音乐源）**：这是基础，没有真实歌曲后面都是假的
3. **阶段 B（AI DJ 语音播报）**：这是视频最打动人的核心体验，优先做
4. **阶段 C（每日电台 + 智能化）**：在 A 和 B 跑通后逐步增强

---

*文档生成时间：2026-06-18*
*文档路径：`D:/Coder/mimo-radio/docs/claudio-rebuild-plan.md`*
*视频来源：抖音 @秒秒Guo（抖音号：172391554），`抖音2026618-063537.mp4`*
*基于 mimo-radio 真实代码现状重写，所有文件路径和 API 路径已校准*
