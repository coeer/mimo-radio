# Claudio 音乐电台复刻方案 v2.2（综合修正版）

> ⚠️ **历史规划文档**：本文件为早期重建规划快照，保留作为历史记录。
> 部分功能**已移除**：Fish Audio TTS（已由 MiMo TTS 三引擎取代）、飞书日程集成（已彻底删除）。
> 文中涉及这两个功能的章节仅供历史参考，不再代表当前实现。

> 目标：基于现有 `mimo-radio` 项目，复刻抖音 @秒秒Guo（抖音号：172391554）的 **Claudio** 个人 AI 音乐电台体验。
> 原始视频：`D:/Program Files/douyin/Download/抖音2026618-063537.mp4`（4分33秒，720×900竖屏）
> 核心变更：原视频使用 Claude Code，本方案使用 **MiMo（小米大模型）**。
> 文档用途：可直接交付给 AI 代理按步骤实现，所有任务都标注了真实文件路径和 diff 范围。
> 本版变更：基于 v2.1 综合修正，替换现状分析为真实代码调研结果，插入视频逐帧精确视觉规格，校准 API 路径，精简为 3 阶段可执行方案。

---

## 目录

1. [执行前的必读：前置验证 Sprint](#1-执行前的必读前置验证-sprint)
2. [项目背景与目标](#2-项目背景与目标)
3. [视频内容完整拆解（含逐帧精确视觉规格）](#3-视频内容完整拆解含逐帧精确视觉规格)
4. [现有项目现状分析（基于真实代码）](#4-现有项目现状分析基于真实代码)
5. [总体技术架构](#5-总体技术架构)
6. [复刻实施方案（3 阶段 + 文件级改动清单）](#6-复刻实施方案3-阶段--文件级改动清单)
7. [关键数据模型](#7-关键数据模型)
8. [核心 API 设计](#8-核心-api-设计)
9. [Prompt 工程规范](#9-prompt-工程规范)
10. [测试策略](#10-测试策略)
11. [数据库迁移方案](#11-数据库迁移方案)
12. [PWA 与移动端适配](#12-pwa-与移动端适配)
13. [合规、安全与隐私](#13-合规安全与隐私)
14. [落地路线图](#14-落地路线图)
15. [风险清单与对策](#15-风险清单与对策)
16. [附录：现有项目文件清单](#16-附录现有项目文件清单)

---

## 1. 执行前的必读：前置验证 Sprint

> ⚠️ **不要跳过本节**。以下 5 项验证是整栋房子的地基，任何一项失败都需要先调整产品范围或技术方案，再进入正式开发。

### 1.1 验证真实音乐源可用性

**目标**：确认 `netease.ts` 和 `qqmusic.ts` 能稳定返回可播放的 `audioUrl`。

**关键现状**：`engine.ts` 目前使用 `MOCK_SONGS` + 2 个本地 mp3（`track1.mp3`、`track3.mp3`）循环播放，`netease.ts` 在依赖里但 **engine 根本没调用**。这是首要验证项。

**执行步骤**：

1. 创建临时脚本 `backend/src/scripts/verify-music-sources.ts`
2. 对以下 10 首目标歌曲调用两个服务的搜索 + 获取 URL 方法：
   - If - Bread
   - Sign of the Times - Harry Styles
   - Fade Into You - Mazzy Star
   - Wicked Game - Chris Isaak
   - The Night We Met - Lord Huron
   - Nude - Radiohead
   - Dreams - Fleetwood Mac
   - 비행운 - MoonMoon
   - 颜色 - 许美静
   - A Walk - Tycho
3. 记录：
   - 搜索成功率
   - `audioUrl` 200 可播放成功率
   - URL 有效期（连续 24 小时测试）
   - Cookie/登录态有效期
   - 频控/反爬触发阈值

**验收标准**：
- 至少一个平台的搜索成功率 ≥ 80%
- `audioUrl` 可播放成功率 ≥ 70%
- URL 有效期 ≥ 30 分钟（否则需要设计刷新机制）

**失败对策**：
- Plan A：修复现有服务
- Plan B：接入 Spotify Web API / Apple Music API（需要开发者账号）
- Plan C：使用本地无版权争议曲库（50-100 首）作为 fallback，优先保证 AI DJ 体验跑通

### 1.2 验证 MiMo JSON 输出稳定性

**目标**：确认 MiMo 能在 system prompt 约束下稳定返回指定 JSON Schema。

**关键现状**：`mimo.ts` 已真实接入（OpenAI 兼容协议），已有 `generateRecommendationStrategy()` 和 `generateDJTransition()` 两个返回 JSON 的方法，且已有 JSON 容错解析（`replace(/```json\n?|\n?```/g, '')` + try-catch）。但现有方法返回的是简单 JSON（`{text, mood, genres, energy, reason}`），与视频要求的 `{say, play, reason, segue}` 长播报结构不同。

**执行步骤**：

1. 创建临时脚本 `backend/src/scripts/verify-mimo-json.ts`
2. 使用以下配置调用 MiMo 50 次：
   - `role: 'system'`：persona + 输出格式要求
   - `role: 'user'`：DJ 串词任务输入（参考视频《If - Bread》场景）
   - `temperature: 0.1`
   - `max_tokens: 1024`
   - 若支持：`response_format: { type: 'json_object' }`
3. 每次调用后检查 JSON 是否可解析、字段是否完整

**验收标准**：
- JSON 可解析率 ≥ 90%
- 字段完整率 ≥ 85%

**失败对策**：
- 增加 Few-shot 示例（`backend/src/prompts/examples/dj-script.example.md`）
- 使用 Zod 校验 + 3 次重试（`backend/src/utils/structuredOutput.ts`）
- 最终失败时返回 fallback 默认文案

### 1.3 验证 Fish Audio TTS 能力

**目标**：确认 TTS 可用、音色合适、是否支持时间戳。

**关键现状**：`backend/src/routes/dj.ts` 已有 `POST /api/v1/dj/tts` 端点，调用 `fishAudioService.synthesize()`，落盘 `static/audio/`（UUID 文件名），自动清理（maxFiles:50 / maxAge:24h / maxTotalSize:200MB）。但缺少 hash 缓存机制，同一句话会重复生成。

**执行步骤**：

1. 创建临时脚本 `backend/src/scripts/verify-tts.ts`
2. 用候选音色生成一段 100 字的 DJ 串词（参考视频原文）
3. 测试：
   - 音频是否能正常播放
   - 生成耗时
   - 是否返回 word/sentence 时间戳（用于逐句高亮）
   - 同一文本两次生成是否一致（验证缓存需求）

**验收标准**：
- TTS 生成成功率 ≥ 95%
- 单条生成耗时 ≤ 5 秒
- 音色符合"夜间电台 DJ"氛围

**失败对策**：
- 更换音色（`.env` 配置 `FISH_AUDIO_VOICE_ID`）
- 若不支持时间戳，将"逐句高亮"降级为"整段文案 + 进度条"
- 新增 `ttsPipeline.ts` 做 SHA256 hash 缓存，避免重复生成

### 1.4 验证 WebSocket 依赖

**目标**：确认 `ws` 库已安装且基础连通性正常。

**关键现状**：`backend/package.json` 的 `dependencies` 中没有 `ws`，但 `devDependencies` 中有 `@types/ws`。`backend/src/index.ts` 没有挂载 WebSocket。

**执行步骤**：

1. 检查 `backend/package.json` 中是否有 `"ws": "^x.x.x"`
2. 若不存在，执行 `cd backend && npm install ws`
3. 创建临时脚本验证 Express + ws 同端口挂载（参考 `index.ts` 的 `app.listen(PORT)` 模式）

**验收标准**：
- `ws` 已安装
- 基础 WebSocket 连接可建立
- 与现有 Express 路由不冲突

### 1.5 验证现有前端组件状态

**目标**：确认视频里需要的组件哪些已存在、哪些需要新建。

**关键现状**：`frontend/src/app/page.tsx` 已引用：DotMatrixClock、OnAirBadge、ThemeToggle、ParticleBackground、PlayerBar、ChatArea、InputArea、KimiCard、QueueList、TerminalLog。但缺少 SpeakingIndicator、DeviceSelector、PlanTimeline。

**执行步骤**：

1. 检查 `frontend/src/components/` 目录下实际文件
2. 确认 DotMatrixClock 的显示效果是否与视频一致（像素风点阵 `21:11`）
3. 确认 KimiCard 是否支持全屏播放器模式（大字号歌名 + 波形 + 歌词高亮）

**验收标准**：
- 已有组件列表与视频需求对齐
- 缺失组件清单明确

---

## 2. 项目背景与目标

### 2.1 背景

抖音博主 @秒秒Guo 展示了一个名为 **Claudio** 的个人 AI 音乐电台。它不是一个普通的音乐播放器，而是一个**具备人格、记忆、上下文感知能力的音乐 Agent**。它会在正确的时间播放合适的音乐，并用 AI DJ 的语音为每首歌讲述背景故事或推荐理由。

### 2.2 目标

基于现有 `mimo-radio` 项目，完整复刻 Claudio 的核心体验：

- 24 小时在线的 AI 私人电台
- 顶部点阵时钟 + 播放器 + 聊天界面二合一
- AI DJ 语音播报（歌曲介绍、过渡串词）
- 每日自动生成"今日电台"时间表
- 结合天气、日程、时间、心情做上下文感知推荐
- 支持自然语言点歌、聊天
- 支持把音乐推送到家庭音响
- 使用 MiMo 替代原视频中的 Claude Code

### 2.3 非目标

- 不做独立移动 App，保持 PWA/Web 形态
- 不开发新的音乐版权服务，依赖网易云/QQ 音乐现有 API
- 不重新训练音乐推荐模型，用 LLM + 规则 + 外部数据源实现
- 不对外公开发布音乐播放服务（仅限个人本地使用，详见第 13 节合规说明）

---

## 3. 视频内容完整拆解（含逐帧精确视觉规格）

> 以下规格基于 ffmpeg 对 `抖音2026618-063537.mp4`（4分33秒，720×900，48fps）每隔 5 秒抽帧（共 55 帧），逐帧视觉分析提取。

### 3.1 视觉界面

#### 3.1.1 首页/电台页（深色主题）

视频 00:15-00:25 展示深色主题电台首页：

```
背景：#0a0a0f（极深灰黑），带细微网格/点阵纹理

顶部栏：
  左侧：Claudio 头像（圆形）+ 名称 "Claudio"（白色，小字号）
  右侧："LOGIN" 按钮 + "DARK" / "LIGHT" 主题切换（小胶囊按钮）

中央上部：
  像素风点阵时钟：白色像素点阵，显示 "21:11"（小时:分钟）
  时钟下方："Monday"（星期，小字号灰色）
  再下方："20 APR 2026"（日期，更小字号灰色）
  再下方：绿色呼吸指示灯 "● ON AIR"（绿色小圆点 + 文字，有呼吸动画）

播放器卡片（中部）：
  左上角小图/专辑封面（小圆角矩形）
  歌名："If"（白色，中等字号）
  歌手："Bread"（灰色，小字号）
  进度条：细线，白色已播放部分 + 灰色未播放部分
  时间："1:22 / 3:14"（右侧，小字号灰色）
  控制按钮（从左到右）：⏮ 上一首、⏸ 暂停、⏭ 下一首、♡ 收藏、HIDE、LIST、FAV、VOL（小图标）

聊天区域（中下部）：
  AI DJ 头像（圆形，左侧）+ 名称 "Claudio" + "LIVE" 绿色标识
  聊天气泡，带时间戳 "20:08"
  用户消息和 AI 消息左右交替
  AI 消息示例（完整原文）：
    "This is Claudio. It's late on a Monday, and here's a song that
     moves with your breath. Back in 1971, David Gates picked up a
     nylon-string guitar and let every line end in a whisper —
     you'll feel yourself lift off the ground a little. This one's
     called If. After a long day with Claude Code, just breathe."
  底部输入框：占位文字 "Say something to the DJ..."（灰色）
  输入框右侧：语音输入按钮（麦克风图标）+ 发送按钮（圆形）

底部：
  "CLAUDIO FM"（品牌标识，小字号灰色）
  "CONNECTED"（连接状态，绿色小字）
```

#### 3.1.2 播放器全屏卡片（浅色主题）

视频 00:00-00:10 展示浅色主题全屏播放器：

```
背景：白色/浅灰色渐变
顶部：音频波形（白色/灰色细条，动态起伏，横跨屏幕宽度）
大字号歌名："Monday Night Exhale"（黑色，大字号）
歌手："If — Bread"（灰色，中等字号）
进度条 + 播放控制（同深色主题）
下方：AI DJ 解说文字列表，当前朗读句高亮（绿色背景高亮）
  示例高亮句："after a long day with Claude Code, just breathe."
底部：迷你波形条（更细的音频波形）
```

#### 3.1.3 个人主页/品味档案

视频 00:30-00:40 展示个人档案页：

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

#### 3.1.4 聊天推荐场景

视频 01:05-01:15 展示聊天式推荐：

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

底部输入框："Say something to the DJ..."
```

#### 3.1.5 今日电台时间轴

视频 01:20-01:30 展示终端风格时间轴：

```
终端启动日志：
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

#### 3.1.6 AI DJ 语音播报状态（Speaking...）

视频多处展示语音播报状态：

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

### 3.2 核心功能

#### 3.2.1 AI DJ 语音播报

- 歌曲开始播放前，AI DJ 会用语音介绍这首歌
- 解说内容包括：歌曲背景、创作故事、为什么适合当前场景、歌词意境
- 语音播报时界面顶部显示 `Speaking...`，并有音频波形动画
- 文字与语音同步，当前朗读句高亮显示

示例（视频中的《If - Bread》，完整原文）：

> "This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper — you'll feel yourself lift off the ground a little. This one's called If. After a long day with Claude Code, just breathe."

示例（视频中的《Sign of the Times — Harry Styles》）：

> "Some say this era of AI feels like a human odyssey, and rising at the same time into something no one has named yet. Six minutes of piano, falsetto and a faint hum of static, let it keep you company for a while."

#### 3.2.2 聊天式推荐

用户可以像聊天一样向 DJ 提需求：

- 用户："我今天要做内容，主要是展示你哈哈，帮我挑一首 BGM，前奏入耳就能吊起晚上那种氛围感"
- AI 回复："明白了，今天是周一，需要既宁静但又不死板的，我给你找了五首开头就定情绪的，先放给你听："
- 然后返回 5 首候选歌曲卡片（见 3.1.4）
- 用户可以继续对话，例如说"推荐一下"，AI 会介绍最推荐的一首

**现有代码实际实现**：`backend/src/routes/radio.ts` 的 `POST /api/v1/radio/:id/chat` 已实现了基于 `[QQ音乐:]` `[换歌:]` `[推荐:]` 标签的动作分流机制，但交互形式是文本回复而非卡片列表。

#### 3.2.3 每日电台自动规划

每天早上自动生成一整天的音乐时间表，视频中展示了一天的时间轴（见 3.1.5）。

#### 3.2.4 上下文感知

- 时间：周一晚上推荐舒缓音乐
- 天气：晴天/雨天/夜晚
- 日程：读取飞书日程，会议多→轻音乐，运动→节奏感强
- 心情：用户主动描述或从行为推断
- 听歌历史：跨平台 3000+ 歌单形成 taste profile

#### 3.2.5 音响推送

- 通过 UPnP 把音乐推送到家庭音响
- 视频中展示了 Bose SoundTouch 和 Naim 音响
- 支持 iPhone 扬声器作为输出选项

### 3.3 技术架构（视频揭示）

视频在 02:50 展示了"原理三件套"：

```
1. 播放器界面（a player）
   - Web App / PWA / localhost 都可以
   - 视频里用的是 PWA

2. 本地服务器（a local server）
   - 做所有事情的中枢
   - Node.js

3. 几个 API（a few APIs）
   - 各自管一件事
   - Claude 做大脑（本方案替换为 MiMo）
   - 网易云/Spotify 负责音乐
   - Fish Audio 做语音合成
   - 飞书 API 读日程
   - OpenWeather 接天气
   - UPnP 推音乐到家庭音响
```

视频 03:05 还展示了一张详细"施工图"，分层如下：

**第一层：外部上下文**
- USER/：用户品味语料（taste.md, routines.md, playlists.json, mood-rules.md）
- BRAIN/：Claude Code（本方案替换为 MiMo）
- MUSIC/：网易云 API（搜索、歌曲 URL、歌词、推荐）
- VOICE·I/O/：Fish Audio + 飞书 + 天气 + UPnP

**第二层：本地大脑**
- router.js：意图分流（简单指令直连、音乐走 NCM、自然语言走 LLM）
- context.js：Prompt 组装（taste + routines + 环境 + 历史 → system prompt）
- claude.js：大脑适配器（本方案为 mimo.js）
- scheduler.js：节律调度（07:00 规划、09:00 早间、每小时情绪检查、日历 hook）
- tts.js：声音管线（Fish Audio → cache/tts/*.mp3 → /tts/<hash>.mp3）
- state.db：状态 + 记忆（messages, plays, plan, prefs，跨重启持久）

**第三层：运行时聚合**
- context window 组装盒子：每次触发按 6 片拼成 prompt
  1. 系统提示词（system prompt / persona.md）
  2. 用户语料（user/*.md）
  3. 环境注入（weather, calendar, now）
  4. 已检索记忆（state.db / api/chat）
  5. 用户输入/工具结果（user/ai, tool result）
  6. 执行轨迹（scheduler, webhook）
- MODEL 前向过程：compute(fragments) → {say, play[], reason, segue}
- 后处理：NCM 解析队列 → TTS 合成 → WebSocket 推送 now-playing

**第四层：前端/PWA**
- PWA 运行在 localhost:8080
- HTTP Contract：6 条核心接口
  - GET /api/plan/today
  - GET /api/now-playing
  - WS /stream
  - POST /api/chat
  - POST /api/play
  - GET /api/profile

**注意**：视频里的 API 路径和实际 mimo-radio 代码不完全一致。实际代码用 `/api/v1/*` 前缀，且没有 `/api/plan/today`（实际是 `/api/v1/schedule/today`）、没有 `WS /stream`（未实现）。详见第 8 章。

---

## 4. 现有项目现状分析（基于真实代码）

> 以下分析基于直接读取 `mimo-radio` 项目 10+ 个真实源代码文件后的精确调研，非推测。

### 4.1 项目位置

```
D:/Coder/mimo-radio/
├── package.json
├── start.sh / start.ps1 / start.bat
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts              # Express 入口（已读）
│   │   ├── config.ts             # 环境变量（已读）
│   │   ├── types/index.ts        # 类型定义
│   │   ├── routes/
│   │   │   ├── radio.ts          # 电台路由（已读）
│   │   │   ├── dj.ts             # DJ 路由（已读）
│   │   │   ├── profile.ts
│   │   │   ├── import.ts
│   │   │   ├── context.ts
│   │   │   ├── upnp.ts
│   │   │   ├── schedule.ts       # 计划路由（已读）
│   │   │   └── qqmusic.ts
│   │   ├── services/
│   │   │   ├── aiFactory.ts
│   │   │   ├── engine.ts         # 曲库引擎（已读）
│   │   │   ├── mimo.ts           # MiMo 调用（已读，替代 Claude）
│   │   │   ├── netease.ts
│   │   │   ├── qqmusic.ts
│   │   │   ├── fishAudio.ts
│   │   │   ├── feishu.ts
│   │   │   ├── weather.ts
│   │   │   ├── upnp.ts
│   │   │   └── scheduler.ts      # 调度器（已读）
│   │   ├── middleware/
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.sql
│   │   └── utils/
│   └── static/
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx          # 电台主页（已读）
        │   └── profile/page.tsx  # 个人档案
        ├── components/
        │   ├── KimiCard.tsx
        │   ├── ChatArea.tsx
        │   ├── InputArea.tsx
        │   ├── PlayerBar.tsx
        │   ├── AudioWaveform.tsx
        │   ├── DotMatrixClock.tsx
        │   ├── OnAirBadge.tsx      # 已存在
        │   ├── ThemeToggle.tsx     # 已存在
        │   ├── ParticleBackground.tsx # 已存在
        │   ├── QueueList.tsx       # 已存在
        │   └── TerminalLog.tsx     # 已存在
        ├── hooks/
        │   ├── useAudioPlayer.ts
        │   └── useSession.ts
        ├── store/
        │   └── radioStore.ts
        └── lib/
```

### 4.2 已存在且可用的能力（真实状态）

| 能力 | 真实状态 | 对应文件 | 代码证据 |
|------|---------|---------|---------|
| **MiMo AI 大脑** | ✅ 已真实接入，OpenAI 兼容协议，4 个 AI 方法 | `backend/src/services/mimo.ts` | `chat()`/`chatWithImage()`/`generateRecommendationStrategy()`/`generateDJTransition()`/`generateIntro()`/`analyzePersonality()` |
| **安全工程** | ✅ 完整：helmet、rate limit、API Key auth、sessionToken、circuit breaker、promptGuard | `backend/src/index.ts`, `middleware/`, `utils/` | `app.use(helmet())`、`generalLimiter`/`aiLimiter`、`apiKeyAuth`、`fetchWithTimeout`、`promptGuard.ts` |
| **TTS 链路** | ✅ 已通：Fish Audio → 落盘 `static/audio/` → 自动清理 | `backend/src/routes/dj.ts` | `POST /api/v1/dj/tts` → `fishAudioService.synthesize()` → `writeFile(filepath, audio)` → `cleanupAudioFiles()` |
| **前端组件** | ✅ 齐全：DotMatrixClock、OnAirBadge、ThemeToggle、ParticleBackground、PlayerBar、ChatArea、InputArea、KimiCard、QueueList、TerminalLog | `frontend/src/components/` | `page.tsx` 已引用全部 10 个组件 |
| **前端页面** | ✅ 电台主页 `/` + 个人档案 `/profile` | `frontend/src/app/page.tsx`, `profile/page.tsx` | — |
| **键盘/无障碍** | ✅ 空格播放、左右快进、skip link | `frontend/src/app/page.tsx` | `useEffect` 监听 `keydown`（Space/ArrowLeft/ArrowRight），`<a href="#main-content">` skip link |
| **离线检测** | ✅ 网络状态监听 | `frontend/src/app/page.tsx` | `window.addEventListener('online'/'offline')` |
| **后端路由** | ✅ 8 个 API 路由已挂载 | `backend/src/index.ts` 114-122 | `app.use('/api/v1/radio', aiLimiter, radioRoutes)` 等 |
| **SQLite 数据库** | ✅ 已初始化，含 session 表 | `backend/src/db/index.ts` | `initDb()` 在 `app.listen()` 前调用 |
| **UPnP 设备发现** | ✅ 依赖已装（node-ssdp、upnp-device-client） | `backend/src/routes/upnp.ts` | `backend/package.json` dependencies |
| **天气/飞书** | ✅ 服务已存在（但 scheduler 没调用） | `backend/src/services/weather.ts`, `feishu.ts` | `radio.ts` 中 `Promise.allSettled([weatherService.getCurrent(), feishuService.getTodayEvents()])` |
| **网易云/QQ音乐** | ⚠️ 服务文件存在，但 **engine 没调用** | `backend/src/services/netease.ts`, `qqmusic.ts` | `engine.ts` 用 `MOCK_SONGS` + `LOCAL_TRACKS`（2 个本地 mp3），未 import netease/qqmusic |
| **scheduler 时段** | ⚠️ 14 个静态时段写死，未调用 MiMo | `backend/src/services/scheduler.ts` | `DEFAULT_SLOTS` 数组写死，天气写死 "晴 22/8℃" |
| **WebSocket** | ❌ 未挂载 | — | `index.ts` 无 ws，`package.json` dependencies 无 `ws` |
| **今日电台页面** | ❌ 前端没有 `/plan` | — | `page.tsx` 完全没引用 schedule 数据 |
| **用户语料** | ❌ 无 taste.md / routines.md | — | 无 `data/` 目录 |

### 4.3 主要差距（真实 Gap 清单）

1. **曲库是假的**：`engine.ts` 用 `MOCK_SONGS` + 2 个本地 mp3 循环播放。`netease.ts` 在依赖里但 engine 根本没调用。这是**最优先**的 gap。
2. **AI DJ 流程不完整**：TTS 与音乐播放的衔接不顺畅。现有 `generateDJTransition()` 返回 30-50 字简单过渡语，与视频里 100+ 字完整创作背景+情绪串词不一致。缺少 "Speaking..." 状态 + 波形动画。
3. **每日规划是写死的**：`scheduler.ts` 14 个静态时段、写死天气/日程，没有调用 MiMo 生成 plan。没有可视化时间轴页面。
4. **记忆/品味缺失**：没有 `taste.md` / `routines.md` / `playlists.json` / `mood-rules.md`。MiMo 推荐没有用户长期品味数据。
5. **Prompt 工程未标准化**：没有把上下文 6 片拼成 system prompt 的标准流程。没有 `persona.md` 文件。
6. **WebSocket 未实现**：`index.ts` 没挂 ws，计划书承诺的 `WS /stream` 推送不存在。前端靠 HTTP 轮询。
7. **测试/迁移缺失**：新增数据库表没有迁移方案，缺少测试计划。

### 4.4 关键 API 路径（真实 vs 视频/计划书）

视频和原计划书写的 `/api/radio/*`、`/api/plan/*`、`/api/now-playing` 是**错的或虚构的**。实际路径带 `/v1/` 前缀：

```
GET    /health                    # 健康检查（public）
POST   /api/v1/radio/create       # 创建电台会话（body: {mood, dj_enabled, user_input, model}）
POST   /api/v1/radio/:id/next     # 播放下一首（body: {model}）
POST   /api/v1/radio/:id/chat     # 聊天（body: {text, model}）
POST   /api/v1/radio/:id/feedback # 反馈（body: {action, reason}）
GET    /api/v1/radio/:id/queue    # 获取队列
GET    /api/v1/radio/songs        # 获取曲库（返回 mock 数据）
GET    /api/v1/radio/models       # 可用模型列表
POST   /api/v1/dj/transition      # 生成 DJ 过渡语（body: {prev_song, next_song, context, model}）
POST   /api/v1/dj/tts             # TTS 合成（body: {text}）
POST   /api/v1/dj/intro           # 生成开场白（body: {mood, context, model}）
POST   /api/v1/dj/analyze-image   # 图片分析（body: {text, image, model}）
GET    /api/v1/schedule/today     # 今日电台计划（返回写死数据）
GET    /api/v1/schedule/now       # 当前时段播放列表
GET    /api/v1/upnp/devices       # 发现 UPnP 设备
POST   /api/v1/upnp/play          # 推送到音响
POST   /api/v1/upnp/stop          # 停止推送
GET    /api/v1/profile            # 用户档案
POST   /api/v1/import             # 导入歌单
GET    /api/v1/context            # 获取上下文
POST   /api/v1/qqmusic/search     # QQ 音乐搜索
```

**不存在**（视频/计划书虚构）：
- `/api/plan/*` → 实际是 `/api/v1/schedule/*`
- `GET /api/v1/radio/:id/now-playing` → 实际用 `POST /api/v1/radio/:id/next` 返回当前歌曲
- `WS /stream` → 未实现

---

## 5. 总体技术架构

### 5.1 系统分层

```
┌─────────────────────────────────────────────┐
│  PWA 前端（Next.js 14 + React 18 + Zustand）  │
│  - 电台页 / 播放器 / 聊天 / 今日电台 / 个人档案 │
└──────────────────┬──────────────────────────┘
                   │ HTTP / WebSocket
┌──────────────────▼──────────────────────────┐
│  Node.js 中枢（Express + TypeScript）         │
│  - 路由 / 服务 / 调度器 / 数据库 / 工具函数    │
└──────────────────┬──────────────────────────┘
                   │ 外部 API
┌──────────────────▼──────────────────────────┐
│  MiMo（AI 大脑）                              │
│  网易云音乐 / QQ 音乐（歌曲源）                │
│  Fish Audio（TTS 语音合成）                   │
│  飞书（日程） / OpenWeather（天气）            │
│  UPnP/DLNA（音响推送）                        │
└─────────────────────────────────────────────┘
```

### 5.2 核心数据流时序

#### 5.2.1 创建电台会话

```
前端 POST /api/v1/radio/create
→ backend/src/routes/radio.ts
→ backend/src/services/engine.ts
→ 加载 state.db 中的今日计划 / 用户偏好
→ 如果没有计划，调用 planner.ts 生成
→ 返回初始播放队列
```

#### 5.2.2 播放下一首

```
前端 POST /api/v1/radio/:id/next
→ engine.ts
→ trackResolver.ts
→ netease.ts / qqmusic.ts（搜索并获取 audioUrl）
→ 返回 Track
→ 触发 WebSocket now-playing 事件
```

#### 5.2.3 AI DJ 播报

```
song will start
→ djScript.ts 生成串词
→ ttsPipeline.ts 生成/读取缓存 TTS
→ WebSocket 推送 dj-speaking 事件
→ 前端播放 TTS
→ TTS 结束
→ WebSocket 推送 now-playing
→ 前端播放歌曲
```

#### 5.2.4 每日计划生成

```
scheduler 触发（每天 07:00 或服务启动补偿）
→ planner.ts
→ contextCollector.ts 组装 6 片上下文
→ 调用 MiMo
→ 解析为 DailyPlan
→ trackResolver.ts 填充真实歌曲
→ 写入 SQLite plans 表
→ WebSocket 推送 plan-updated 事件
```

---

## 6. 复刻实施方案（3 阶段 + 文件级改动清单）

> 阶段划分原则：每个阶段结束都有可验证的里程碑，不阻塞下一阶段。
> 从 6 阶段精简为 3 阶段，因为：
> - "界面还原"（原阶段 1）大部分已完成（DotMatrixClock、OnAirBadge、ThemeToggle 等已存在）
> - "Claude→MiMo 迁移"（原阶段 6）已完成（MiMo 已真实接入）
> - 合并"音响推送"到阶段 C（工程完善）

### 阶段 A：打通真实音乐源（第 1 周前半）

**目标**：让播放器能播放真实歌曲，不再用 mock 数据。

**为什么最先做**：没有真实歌曲，后面所有 AI DJ 体验都是假的。

#### A1. 确认网易云/QQ 音乐 API 可用性
- **文件**：`backend/src/services/netease.ts`
- **任务**：检查现有实现是否能搜索歌曲、获取 `playUrl`、获取歌词
- **验证**：`curl -H "Authorization: Bearer $API_KEY" http://localhost:8001/api/v1/radio/songs` 返回真实歌曲列表
- **参考**：前置验证 1.1

#### A2. 修改 engine 接入真实音乐源
- **文件**：`backend/src/services/engine.ts`
- **关键现状**：`engine.ts` 第 21-33 行硬编码 `LOCAL_TRACKS = [track1.mp3, track3.mp3]`，`loadMockSongs()` 把 `MOCK_SONGS` 的 `playUrl` 指向这 2 个本地文件循环播放。`netease.ts` 和 `qqmusic.ts` 从未被 import。
- **改动**：
  - 删除 `MOCK_SONGS` 和 `LOCAL_TRACKS` 的硬编码依赖（保留作为 fallback）
  - `loadMockSongs()` 改为 `loadSongsFromPlatforms()`，调用 `netease.ts` + `qqmusic.ts` 搜索热门歌曲填充初始曲库
  - `filterByMood()` 保持现有逻辑，但作用于真实歌曲
- **新建**：`backend/src/services/trackResolver.ts`（计划书提到但未实现）
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
- **关键现状**：现有 `mimo.ts` 的 `generateDJTransition()` 返回 `{text: string}`（30-50 字简单过渡语），`generateIntro()` 返回 30 字开场白。视频里 Claudio 的播报是 100+ 字的完整创作背景+情绪串词。
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
- **参考视频原文**（《Sign of the Times — Harry Styles》）：
  > "Some say this era of AI feels like a human odyssey, and rising at the same time into something no one has named yet. Six minutes of piano, falsetto and a faint hum of static, let it keep you company for a while."

#### B2. 新增 TTS 预生成 + 缓存机制
- **新建文件**：`backend/src/services/ttsPipeline.ts`
- **关键现状**：现有 `/api/v1/dj/tts` 是即时生成、UUID 文件名、存 `static/audio/`、24h 清理。同一句话会重复生成。
- **流程**：
  1. 接收 `say` 文本
  2. 用 SHA256 生成 hash
  3. 检查 `backend/static/tts/<hash>.mp3` 是否存在
  4. 不存在则调用 `fishAudio.ts` 生成
  5. 返回 URL `/static/tts/<hash>.mp3`
- **缓存清理策略**：
  - 默认保留 30 天（`TTS_CACHE_MAX_AGE_DAYS=30`）
  - 超过期限自动清理
  - 启动时清理过期文件
- **音色选择**：`.env` 配置 `FISH_AUDIO_VOICE_ID`，默认选温暖、夜间电台感音色

#### B3. 前端顺序播放状态机
- **文件**：`frontend/src/hooks/useAudioPlayer.ts`
- **状态机**：
  ```
  idle → loading → speaking → playing → loading → speaking → playing
  ```
- **状态转换表**（保留 v2.1 详细设计）：

  | 当前状态 | 事件 | 下一个状态 | 说明 |
  |---------|------|-----------|------|
  | idle | user/start | loading | 开始生成 TTS |
  | loading | tts ready | speaking | 播放 TTS |
  | speaking | tts ended | playing | 播放歌曲 |
  | playing | time > 50% | loading | 预生成下一首 TTS |
  | playing | song ended | speaking | 播放下一首 TTS |
  | speaking/playing | user/next | loading | 取消当前，进入下一首 |
  | loading | tts failed | playing | 跳过播报，直接放歌 |

- **预生成策略**：
  - 当前歌曲播放超过 50% 时开始预生成下一首
  - 如果用户中途切歌，取消正在进行的预生成任务
  - 单曲循环不重复生成 TTS

#### B4. 新增 SpeakingIndicator 组件
- **新建文件**：`frontend/src/components/SpeakingIndicator.tsx`
- **样式**（视频精确规格）：
  - 顶部显示：`● Speaking...`（绿色文字）
  - 波形动画：白色细竖条，高度随机起伏，横跨屏幕宽度
  - 文字展示当前播报内容
  - **逐句高亮策略**：
    - 若 Fish Audio 返回时间戳：按时间戳高亮
    - 否则：按总时长/句子数估算高亮索引
    - 最简方案：整段文案 + 进度条，不强求逐句高亮

#### B5. 新增 DJ Script API 端点
- **文件**：`backend/src/routes/dj.ts`
- **新增**：`POST /api/v1/dj/script`
- **Body**：`{prev_song, next_song, context, model?}`
- **Response**：`{say, play, reason, segue, tts_url?}`（如果缓存命中则直接返回 tts_url）

**里程碑 B**：播放歌曲切换时，前端先显示 "Speaking..." 并播放 AI DJ 语音介绍，说完后自动播放歌曲。播报词包含创作背景和情绪串词，风格接近视频里的 Claudio。

---

### 阶段 C：每日电台智能化 + 工程完善（第 2 周后半 + 第 3 周）

**目标**：实现"每天早上自动生成今日电台计划"，补齐用户语料、WebSocket、设备推送、测试/迁移/PWA/合规。

#### C1. 新建 planner 服务（每日计划生成）
- **新建文件**：`backend/src/services/planner.ts`
- **输入**：`{date, weekday, weather, calendar, taste, routines}`
- **输出**：`DailyPlan` JSON（见第 7 章数据模型）
- **Prompt 规范**（参考视频时间轴）：
  ```markdown
  请为 {date}（{weekday}）生成一份个人 AI 电台的每日音乐计划。
  用户上下文：天气 {weather}，日程 {calendar}，品味 {taste}，作息 {routines}。
  要求：
  1. 按时间段划分（从用户起床时间到睡前）
  2. 每个时间段包含：场景名称、mood、描述、3-5 首推荐歌曲
  3. 歌曲优先来自用户品味中提到的艺人/标签；不确定是否存在的歌曲不要填充
  4. 输出为 JSON 格式
  ```
- **参考视频时间轴**（09:12-10:00 房间先醒…22:00-00:00 夜尾）

#### C2. 修改 scheduler 调用 planner
- **文件**：`backend/src/services/scheduler.ts`
- **关键现状**：`scheduler.ts` 第 31-46 行 `DEFAULT_SLOTS` 写死 14 个时段，第 68-94 行 `generateDailySchedule()` 写死天气/日程/歌曲。
- **改动**：
  - `generateDailySchedule()` 改为：先查 SQLite `plans` 表，有缓存则返回，无缓存则调用 `planner.ts` 生成
  - 新增定时任务：每天 07:00 自动调用 `planner.ts` 生成当日计划（推荐 `bullmq` + Redis，或 `node-cron` + 数据库任务表）
  - 服务启动时检查当日计划是否存在，缺失则立即补偿生成
  - 支持时区配置
  - 删除写死的天气/日程数据，改为真实调用 `weather.ts` + `feishu.ts`

#### C3. 新增数据库表 + 迁移方案
- **文件**：`backend/src/db/schema.sql` + `backend/src/db/migrations/`
- **新增表**（保留 v2.1 完整设计）：
  ```sql
  -- 播放历史
  CREATE TABLE plays (
    id INTEGER PRIMARY KEY,
    track_id TEXT,
    name TEXT,
    artist TEXT,
    played_at DATETIME,
    duration INTEGER,
    completed BOOLEAN,
    liked BOOLEAN,
    skipped_at INTEGER,
    completion_rate REAL
  );

  -- 用户偏好
  CREATE TABLE prefs (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME
  );

  -- 今日计划
  CREATE TABLE plans (
    date TEXT PRIMARY KEY,
    plan_json TEXT,
    created_at DATETIME
  );

  -- 会话消息
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    session_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME
  );

  -- 迁移版本
  CREATE TABLE migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME
  );
  ```
- **迁移执行逻辑**（保留 v2.1 设计）：
  - `migrations/` 目录：`001_add_plans_table.sql`、`002_add_plays_table.sql` 等
  - `db/index.ts` 中 `migrate()` 函数：读取目录、按文件名顺序执行未执行的迁移、记录版本号

#### C4. 新建前端 /plan 页面
- **新建文件**：`frontend/src/app/plan/page.tsx`
- **组件**：`frontend/src/components/PlanTimeline.tsx`
- **功能**：
  - 时间轴视图，展示当天所有时段
  - 当前时段高亮（绿色左边框）
  - 每个时段可展开看歌曲列表
  - 支持"重新生成今日计划"按钮
  - 支持跳过/替换某首歌

#### C5. 新建用户语料系统（MVP + 增强）
- **新建文件**：
  - `backend/src/services/tasteBuilder.ts`
  - `backend/src/services/contextCollector.ts`
  - `backend/src/prompts/persona.md`
- **数据目录**：`mimo-radio/data/`
  - `taste.md`（用户品味）
  - `routines.md`（日常作息）
  - `playlists.json`（歌单映射）
  - `mood-rules.md`（心情规则）
- **Phase 1（MVP）**：手动维护 `taste.md` 和 `playlists.json`，`tasteBuilder.ts` 只读取静态文件
- **Phase 2（增强）**：从网易云/QQ 音乐导入歌单，从历史播放记录更新 taste，定期重新生成
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
- **Token 预算与截断策略**（保留 v2.1 设计）：

  | 切片 | 上限（字符） | 截断策略 |
  |------|-------------|---------|
  | system prompt | 800 | 固定 |
  | taste.md | 3000 | 超出时按标签云 + 高频艺人摘要 |
  | routines.md | 1500 | 固定 |
  | weather/calendar | 800 | 固定 |
  | recent plays | 2000 | 最近 20 条，按时间倒序 |
  | messages history | 2000 | 最近 6-10 轮 |
  | execution trace | 1000 | 最近 3 条调度日志 |

#### C6. 集成 WebSocket 实时推送
- **文件**：`backend/src/index.ts`
- **关键现状**：没有 `ws` 依赖，没有 WebSocket 挂载。
- **新增**：`npm install ws`，集成到 Express 同端口
- **推送事件**：
  - `now-playing`：歌曲切换时推送 `{track, transition, tts_url}`
  - `dj-speaking`：AI 开始/结束说话时推送 `{speaking: boolean, script: DJScript, highlightedIndex?: number}`
  - `plan-updated`：今日计划生成/更新时推送 `{plan}`
  - `device-connected`：音响设备连接状态变化
  - `error`：错误通知
- **连接与重连策略**（保留 v2.1 设计）：
  - 连接时必须携带 `Authorization: Bearer <sessionToken>` 或 `X-API-Key`
  - 服务端单用户最多 3 个连接
  - 断线后前端按 1s/3s/5s 指数退避重连
  - 重连成功后立即请求 `GET /api/v1/radio/:id/queue` 补齐状态
  - WebSocket 仅作为增强，HTTP 轮询 5 秒兜底
- **前端**：`frontend/src/hooks/useWebSocket.ts` 订阅事件并更新 Zustand store

#### C7. 设备推送前端选择器
- **新建文件**：`frontend/src/components/DeviceSelector.tsx`
- **功能**：
  - 显示可用设备：本机扬声器、iPhone 扬声器、Bose SoundTouch、Naim、其他 DLNA 设备
  - 用户选择后，调用 `POST /api/v1/upnp/play` 切换输出
  - 前端继续显示播放状态，但音频实际从音响出
- **测试模式**：`UPNP_MOCK=true` 时返回虚拟设备，确保无真实设备也能验证流程

#### C8. 前端播放器卡片增强（全屏模式）
- **文件**：`frontend/src/components/KimiCard.tsx`
- **关键现状**：KimiCard 当前是信息展示卡片，不是全屏播放器。
- **新增**：全屏播放器模式（参考视频浅色主题）
  - 大字号歌名（如 "Monday Night Exhale"）
  - 顶部/背景音频波形
  - 歌词/解说文字逐句高亮（当前句绿色）
  - 底部迷你波形条

#### C9. 测试补全（保留 v2.1 完整设计）
- **后端单元测试**：`djScript.test.ts`、`planner.test.ts`、`ttsPipeline.test.ts`、`trackResolver.test.ts`、`contextAssembler.test.ts`
- **后端集成测试**：`dj.test.ts`、`schedule.test.ts`、`upnp.test.ts`
- **前端测试**：`DotMatrixClock.test.tsx`、`ChatArea.test.tsx`、`useAudioPlayer.test.ts`
- **E2E 测试**：Playwright 验证完整流程（创建会话 → 下一首 → Speaking... → 播放歌曲 → 聊天推荐）

#### C10. PWA 与移动端适配（保留 v2.1 完整设计）
- **Manifest**：`frontend/public/manifest.json`（name: "Claudio FM"、theme_color: "#0a0a0f"）
- **Service Worker**：`next-pwa` 或 Workbox，缓存策略（静态 Cache First、API Network First、TTS Cache First、歌曲不缓存）
- **移动端适配**：viewport、iOS Safari 安全区、音频自动播放限制（首次交互后才能自动播放）
- **iOS 音频策略**：使用 `<audio>` 元素而非 Web Audio API，处理 `AudioContext` 挂起

#### C11. 合规、安全与隐私（保留 v2.1 完整设计）
- **音乐合规**：网易云/QQ 音乐接口若为非官方逆向接口，存在版权和平台 ToS 风险，**仅限个人本地使用**
- **大模型 API 合规**：遵守 MiMo 服务条款
- **安全**：Cookie/凭证加密存储（`NETEASE_COOKIE`、`QQMUSIC_COOKIE` 不进入版本控制）、promptGuard 过滤所有用户输入、WebSocket 鉴权、API 调用上限
- **隐私**：用户日程/心情/播放历史仅存储在本地 SQLite，提供数据导出和删除功能

**里程碑 C**：
- 每天早上 07:00 自动生成今日电台计划
- 前端 `/plan` 页面展示时间轴
- WebSocket 实时推送 now-playing 和 DJ 说话状态
- 用户语料系统运转，MiMo 推荐基于真实 taste
- 支持推送到家庭音响
- 测试覆盖核心路径，数据库迁移可回滚
- PWA 可离线使用，移动端适配完成

---

### 6.4 文件级改动清单

| 阶段 | 文件 | 操作 | 说明 |
|------|------|------|------|
| A | `backend/src/services/engine.ts` | 修改 | 替换 mock，接入真实音乐源 |
| A | `backend/src/services/trackResolver.ts` | 新建 | mood → 真实歌曲解析 |
| A | `backend/src/services/netease.ts` | 检查 | 确认搜索/获取 URL 可用 |
| B | `backend/src/services/djScript.ts` | 新建 | 长播报生成（100-200 字） |
| B | `backend/src/services/ttsPipeline.ts` | 新建 | hash 缓存 TTS（30 天保留） |
| B | `backend/src/routes/dj.ts` | 修改 | 新增 `POST /api/v1/dj/script` |
| B | `frontend/src/hooks/useAudioPlayer.ts` | 修改 | 增加 speaking → playing 状态机 |
| B | `frontend/src/components/SpeakingIndicator.tsx` | 新建 | 语音播报状态 + 波形动画 |
| C | `backend/src/services/planner.ts` | 新建 | 每日计划生成 |
| C | `backend/src/services/scheduler.ts` | 修改 | 调用 planner，删除写死数据 |
| C | `backend/src/services/tasteBuilder.ts` | 新建 | 用户品味建模 |
| C | `backend/src/services/contextCollector.ts` | 新建 | 上下文组装（6 片 + Token 预算） |
| C | `backend/src/db/schema.sql` | 修改 | 新增 plays/prefs/plans/messages 表 |
| C | `backend/src/db/migrations/` | 新建 | 001-005 迁移文件 |
| C | `backend/src/db/index.ts` | 修改 | 新增 `migrate()` 函数 |
| C | `backend/src/index.ts` | 修改 | 集成 WebSocket `WS /api/v1/stream` |
| C | `frontend/src/app/plan/page.tsx` | 新建 | 今日电台时间轴页面 |
| C | `frontend/src/components/PlanTimeline.tsx` | 新建 | 时段卡片组件 |
| C | `frontend/src/components/DeviceSelector.tsx` | 新建 | 音响设备选择 |
| C | `frontend/src/hooks/useWebSocket.ts` | 新建 | WebSocket 订阅 |
| C | `frontend/src/components/KimiCard.tsx` | 修改 | 增加全屏播放器模式 |
| C | `backend/src/prompts/persona.md` | 新建 | Claudio 人格定义 |
| C | `backend/src/prompts/examples/dj-script.example.md` | 新建 | Few-shot 示例 |
| C | `backend/src/utils/structuredOutput.ts` | 新建 | Zod 校验 + 重试逻辑 |
| C | `mimo-radio/data/taste.md` | 新建 | 用户品味（初始模板） |
| C | `mimo-radio/data/routines.md` | 新建 | 日常作息（初始模板） |
| C | `mimo-radio/data/playlists.json` | 新建 | 歌单映射 |
| C | `mimo-radio/data/mood-rules.md` | 新建 | 心情规则 |
| C | `frontend/public/manifest.json` | 修改 | PWA manifest（Claudio FM） |
| C | `backend/package.json` | 修改 | 新增 `ws` 依赖 |

---

## 7. 关键数据模型

### 7.1 Track（歌曲）

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
  tags?: string[];      // mood / genre
  emotionTags?: string[];
  sceneTags?: string[];
}
```

### 7.2 TrackCandidate（计划候选）

```typescript
interface TrackCandidate {
  name: string;
  artist: string;
  reason?: string;
}
```

### 7.3 PlayQueue（播放队列）

```typescript
interface PlayQueue {
  id: string;
  name: string;
  tracks: Track[];
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.4 DJScript（DJ 串词）

```typescript
interface DJScript {
  say: string;        // 120-220 字符（中文）或 200-350 tokens（英文）
  play: string[];     // 接下来要播放的歌曲，可为空
  reason: string;     // ≤ 60 字符
  segue?: string;     // 用于两首歌之间，≤ 40 字符
}
```

### 7.5 DJMessage（DJ 消息）

```typescript
interface DJMessage {
  id: string;
  type: 'say' | 'recommend' | 'status';
  content: string;
  recommendations?: Track[];
  ttsUrl?: string;
  highlightedIndex?: number;  // 当前高亮句索引，由前端计算
  createdAt: string;
}
```

### 7.6 DailyPlan（每日计划）

```typescript
interface DailyPlan {
  date: string;
  summary: string;
  segments: PlanSegment[];
}

interface PlanSegment {
  start: string;          // HH:mm
  end: string;
  scene: string;          // 房间先醒 / 深度工作 / 午休 / 运动 / 晚间冥想 / 夜尾
  mood: string;           // gentle-awake / focus / chill / workout / sleep
  description: string;
  candidates: TrackCandidate[];  // 规划阶段生成
  tracks?: Track[];       // 播放前由 trackResolver 填充
}
```

### 7.7 UserContext（用户上下文）

```typescript
interface UserContext {
  now: string;
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

### 7.8 WS 事件

```typescript
type WSEvent =
  | { type: 'now-playing'; payload: { track: Track; transition?: DJScript } }
  | { type: 'dj-speaking'; payload: { speaking: boolean; script: DJScript; highlightedIndex?: number } }
  | { type: 'plan-updated'; payload: DailyPlan }
  | { type: 'device-connected'; payload: { deviceId: string; name: string } }
  | { type: 'error'; payload: { code: string; message: string } };
```

---

## 8. 核心 API 设计

### 8.1 电台相关

```http
POST /api/v1/radio/create
# 创建电台会话
Body: { mood?: string, dj_enabled?: boolean, user_input?: string, model?: string }
Response: { session_id, session_token, queue, current_song, intro_script, model }

POST /api/v1/radio/:id/next
# 播放下一首
Body: { model?: string }
Response: { song, transition, has_more, model }

POST /api/v1/radio/:id/chat
# 和 AI DJ 聊天
Body: { text: string, model?: string }
Response: { reply, action, action_data, messages, model, new_song? }
# 注意：现有实现中 AI 回复可能包含 [QQ音乐:xxx] [换歌:xxx] [推荐:xxx] 动作标签

POST /api/v1/radio/:id/feedback
# 反馈（喜欢/跳过/不喜欢）
Body: { action: 'skip' | 'like' | 'complete', reason?: string }
Response: { ok, action, song }

GET /api/v1/radio/:id/queue
# 获取当前队列
Response: { queue, current_index }

GET /api/v1/radio/songs
# 获取曲库（当前返回 mock 数据，阶段 A 后返回真实歌曲）
Response: Song[]

GET /api/v1/radio/models
# 可用模型列表
Response: { models: string[] }
```

**注意**：视频/计划书写的 `GET /api/v1/radio/:id/now-playing` **不存在**。获取当前播放状态通过 `POST /api/v1/radio/:id/next` 的返回或 `GET /api/v1/radio/:id/queue`。

### 8.2 计划相关

```http
GET /api/v1/schedule/today
# 获取今日电台计划（当前返回写死数据，阶段 C 后返回 MiMo 生成计划）
Response: DailySchedule

POST /api/v1/schedule/generate
# 重新生成今日计划（新增）
Body: { date?: string }
Response: { plan: DailyPlan }

PUT /api/v1/schedule/segment/:id
# 修改某个时段（新增）
Body: { scene?, mood?, tracks? }
Response: { ok, segment }
```

**注意**：视频/计划书写的 `/api/plan/*` **不存在**。实际路径是 `/api/v1/schedule/*`。

### 8.3 DJ 相关

```http
POST /api/v1/dj/script
# 请求 DJ 生成当前歌曲串词（新增）
Body: { prev_song?: Song, next_song: Song, context: SessionContext, model?: string }
Response: { success, data: DJScript }

POST /api/v1/dj/tts
# TTS 合成（已有）
Body: { text: string }
Response: { audio_url, text }

POST /api/v1/dj/transition
# 生成 DJ 过渡语（已有）
Body: { prev_song, next_song, context, model? }
Response: { text }

POST /api/v1/dj/intro
# 生成开场白（已有）
Body: { mood?, context?, model? }
Response: { text }

POST /api/v1/dj/analyze-image
# 图片分析（已有）
Body: { text?: string, image: string, model?: string }
Response: { result, mood }

GET /api/v1/dj/voices
# 获取可用 TTS 音色列表（新增）
Response: { voices: { id, name, description }[] }
```

### 8.4 设备相关

```http
GET /api/v1/upnp/devices
# 发现可用音响设备
Response: { devices: { id, name, type }[] }

POST /api/v1/upnp/play
# 推送到音响
Body: { deviceId: string, mediaUrl: string }
Response: { ok }

POST /api/v1/upnp/stop
# 停止推送
Body: { deviceId: string }
Response: { ok }
```

### 8.5 配置相关

```http
POST /api/v1/setup
# 首次启动配置（新增）
Body: { taste: string, routines: string, playlists: PlaylistInput[] }
Response: { ok }
```

### 8.6 WebSocket

```
WS /api/v1/stream
# 服务端主动推送：
# - now-playing 更新
# - DJ 开始说话
# - 计划更新
# - 设备连接状态
# - 错误通知
```

**连接与重连策略**（保留 v2.1 设计）：
- 连接时必须携带 `Authorization: Bearer <sessionToken>` 或 `X-API-Key`
- 服务端单用户最多 3 个连接
- 断线后前端按 1s/3s/5s 指数退避重连
- 重连成功后立即请求 `GET /api/v1/radio/:id/queue` 补齐状态
- WebSocket 仅作为增强，HTTP 轮询 5 秒兜底

---

## 9. Prompt 工程规范

### 9.1 调用方式改造

**关键现状**：`mimo.ts` 已真实接入，使用 OpenAI 兼容协议。现有调用方式是 `mimo.chat(messages)`，messages 中第一个元素是 `system` 角色。但现有实现没有区分不同任务的 temperature 和 max_tokens。

**改造目标**：按任务类型动态调整参数，增加 JSON 稳定性。

修改 `backend/src/services/mimo.ts`：

```typescript
const messages: AIChatMessage[] = [
  { role: 'system', content: persona },
  { role: 'user', content: taskPrompt },
];

const response = await mimo.chat({
  messages,
  temperature: isJsonTask ? 0.1 : 0.6,
  max_tokens: getMaxTokensForTask(taskType),
  // response_format: { type: 'json_object' }, // 若 MiMo 支持
});
```

按任务设置 `max_tokens` 和 `temperature`：

| 任务 | max_tokens | temperature | 说明 |
|------|-----------|-------------|------|
| DJ 串词 | 1024 | 0.6 | 需要创意，温度适中 |
| 每日计划 | 2048 | 0.2 | 结构化输出，低温稳定 |
| 聊天推荐 | 1536 | 0.4 | 平衡创意和结构化 |
| 意图分流 | 512 | 0.1 | 分类任务，低温精确 |

### 9.2 系统提示词

文件：`backend/src/prompts/persona.md`

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
  "say": "你要说的 DJ 串词（200 字以内）",
  "play": ["歌曲名 - 歌手名"],
  "reason": "推荐原因（50 字以内）",
  "segue": "从上一首过渡的衔接语（可选）"
}
```

### 9.3 Few-shot 示例

新增文件：

```
backend/src/prompts/examples/
├── dj-script.example.md
├── daily-plan.example.json
└── chat-recommend.example.json
```

`dj-script.example.md` 示例：

```markdown
## Example 1
Input:
- 当前歌曲：If - Bread
- 时间：周一 23:00
- 天气：晴，22°C
- 上一首：快节奏电子
- 用户心情：疲惫，刚结束工作

Output:
{
  "say": "This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper — you'll feel yourself lift off the ground a little. This one's called If. After a long day, just breathe.",
  "play": ["If - Bread"],
  "reason": "周一深夜需要尼龙弦吉他的温柔",
  "segue": "从电子节奏退回到一把木吉他的安静"
}
```

### 9.4 Context Window 组装

文件：`backend/src/services/contextAssembler.ts`

每次调用 MiMo 前，按以下 6 片组装 prompt：

1. **系统提示词**：`persona.md`
2. **用户语料**：`data/taste.md` + `data/routines.md` + `data/playlists.json`（受 Token 预算限制）
3. **环境注入**：`weather.ts` + `feishu.ts` + `now`
4. **已检索记忆**：SQLite `plays` 表 + `messages` 表的相关历史（最近 20 条 plays + 最近 6-10 轮 messages）
5. **用户输入/工具结果**：当前用户消息或工具返回
6. **执行轨迹**：`scheduler.ts` 的调度日志（最近 3 条）

Token 预算与截断策略：

| 切片 | 上限（字符） | 截断策略 |
|------|-------------|---------|
| system prompt | 800 | 固定 |
| taste.md | 3000 | 超出时按标签云 + 高频艺人摘要 |
| routines.md | 1500 | 固定 |
| weather/calendar | 800 | 固定 |
| recent plays | 2000 | 最近 20 条，按时间倒序 |
| messages history | 2000 | 最近 6-10 轮 |
| execution trace | 1000 | 最近 3 条调度日志 |

### 9.5 输出校验与重试

新增文件：`backend/src/utils/structuredOutput.ts`

流程：

1. 调用 MiMo
2. 清理 markdown code fence
3. 用 Zod 校验字段
4. 校验失败则重试 2-3 次，每次附带更严格指令
5. 全部失败则返回安全 fallback
6. 记录 `promptVersion + inputHash + rawOutput` 到 `failed_outputs` 表

```typescript
const DJScriptSchema = z.object({
  say: z.string().min(10).max(500),
  play: z.array(z.string()).optional(),
  reason: z.string().max(100),
  segue: z.string().max(80).optional(),
});
```

### 9.6 每日计划 Prompt

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
3. 歌曲优先来自用户品味中提到的艺人/标签；不确定是否存在的歌曲不要填充
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

## 10. 测试策略

### 10.1 单元测试

| 测试文件 | 测试目标 |
|---------|---------|
| `backend/src/services/djScript.test.ts` | mock MiMo 响应，断言 JSON 输出符合 Zod schema |
| `backend/src/services/planner.test.ts` | 断言 DailyPlan 结构、时间格式、字段完整 |
| `backend/src/services/ttsPipeline.test.ts` | mock Fish Audio，断言缓存命中、hash 一致 |
| `backend/src/services/trackResolver.test.ts` | mock 网易云/QQ 音乐，断言 fallback 顺序 |
| `backend/src/services/contextAssembler.test.ts` | 断言 6 片组装结果在 token 预算内 |

### 10.2 集成测试

| 测试文件 | 测试目标 |
|---------|---------|
| `backend/src/routes/dj.test.ts` | `POST /api/v1/dj/script` 端到端流程 |
| `backend/src/routes/schedule.test.ts` | `GET /api/v1/schedule/today` 返回有效计划 |
| `backend/src/routes/upnp.test.ts` | `UPNP_MOCK=true` 时返回虚拟设备 |

### 10.3 前端测试

| 测试文件 | 测试目标 |
|---------|---------|
| `frontend/src/components/DotMatrixClock.test.tsx` | 时间显示正确 |
| `frontend/src/components/ChatArea.test.tsx` | 消息渲染、推荐卡片点击 |
| `frontend/src/hooks/useAudioPlayer.test.ts` | 状态机转换正确（idle→loading→speaking→playing） |

### 10.4 E2E 测试

使用 Playwright 验证：

1. 打开首页
2. 创建电台会话
3. 点击下一首
4. 出现 "Speaking..."
5. TTS 播放结束后开始播放歌曲
6. 发送聊天消息，AI 返回推荐

---

## 11. 数据库迁移方案

### 11.1 迁移文件结构

```
backend/src/db/
├── index.ts
├── schema.sql
└── migrations/
    ├── 001_add_plans_table.sql
    ├── 002_add_plays_table.sql
    ├── 003_add_prefs_table.sql
    ├── 004_add_messages_table.sql
    └── 005_add_migrations_meta.sql
```

### 11.2 迁移执行逻辑

在 `backend/src/db/index.ts` 中实现 `migrate()`：

1. 创建 `migrations` 元数据表（如果不存在）
2. 读取 `migrations/` 目录下所有 `.sql` 文件
3. 按文件名顺序执行未执行的迁移
4. 记录已执行版本号

```typescript
function migrate(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const appliedVersions = db.prepare('SELECT version FROM migrations').all().map(r => r.version);
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  for (const file of migrationFiles) {
    const version = parseInt(file.split('_')[0]);
    if (appliedVersions.includes(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations (version) VALUES (?)').run(version);
  }
}
```

### 11.3 迁移文件示例

`001_add_plans_table.sql`：

```sql
CREATE TABLE IF NOT EXISTS plans (
  date TEXT PRIMARY KEY,
  plan_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 12. PWA 与移动端适配

### 12.1 PWA Manifest

更新 `frontend/public/manifest.json`：

```json
{
  "name": "Claudio FM",
  "short_name": "Claudio",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#0a0a0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 12.2 Service Worker

- 使用 `next-pwa` 或 Workbox
- 缓存策略：
  - 静态资源：Cache First
  - API 响应：Network First
  - TTS 音频：Cache First
  - 歌曲音频：不缓存（版权/URL 时效）

### 12.3 移动端适配

- viewport：`width=device-width, initial-scale=1, viewport-fit=cover`
- 适配 iOS Safari 安全区
- 处理移动端音频自动播放限制：
  - 首次用户交互后才能自动播放
  - 提供显式播放按钮
- 竖屏布局优化

### 12.4 iOS 音频策略

- 使用 `audio` 元素而非 Web Audio API 作为主播放
- 处理 `AudioContext` 挂起
- 后台播放时保持音频会话

---

## 13. 合规、安全与隐私

### 13.1 音乐合规

- 本方案使用的网易云/QQ 音乐接口若为**非官方逆向接口**，存在版权和平台 ToS 风险
- **建议仅限个人本地使用**，不对外公开发布音乐播放服务
- 如需对外发布，应接入正版音乐 API（Spotify、Apple Music、腾讯音乐官方等）
- 不要长期存储完整音乐文件，仅缓存 URL 和元数据

### 13.2 大模型 API 合规

- 使用 MiMo 时，遵守其服务条款
- 注意输出内容的版权归属
- 避免生成违法、歧视、敏感内容

### 13.3 安全

**现有安全栈（已存在，无需重复）**：
- `helmet`：安全响应头
- `express-rate-limit`：通用限流（15 分钟 200 请求）+ AI 端点限流（1 分钟 10 请求）
- `apiKeyAuth`：所有 `/api/*` 路由需要 API Key
- `sessionToken`：session 签名验证
- `fetchWithTimeout`：带 circuit breaker 的 HTTP 客户端
- `promptGuard`：用户输入过滤 + LLM 输出校验

**新增安全要求**：
- Cookie/凭证加密存储（如使用 `keytar` 或环境变量 + 文件权限）
- `NETEASE_COOKIE`、`QQMUSIC_COOKIE` 等高价值凭证不进入版本控制
- WebSocket 连接必须鉴权，限制单用户连接数（最多 3 个）
- 设置 API 调用上限，防止费用失控

### 13.4 隐私

- 用户的日程、心情、播放历史属于个人敏感数据
- 数据仅存储在本地 SQLite，不上传到第三方（除必要的 API 调用）
- 提供数据导出和删除功能
- 若未来对外服务，需增加用户同意机制

---

## 14. 落地路线图

### 前置验证 Sprint（2-3 天）

- [ ] 验证网易云/QQ 音乐源可用性（确认 engine.ts 是 mock）
- [ ] 验证 MiMo JSON 输出稳定性（测试长播报结构 {say, play, reason, segue}）
- [ ] 验证 Fish Audio TTS 能力（测试音色、耗时、时间戳）
- [ ] 验证 WebSocket 依赖（安装 ws，测试 Express 同端口挂载）
- [ ] 验证现有前端组件状态（确认哪些已存在、哪些缺失）

### 第 1 周：核心体验（AI DJ 语音播报 + 真实音乐源）

- Day 1：前置验证 Sprint
- Day 2-3：阶段 A — 打通真实音乐源（engine.ts + trackResolver.ts + netease/qqmusic）
- Day 4-5：阶段 B — 后端 `djScript.ts` + `ttsPipeline.ts` + `POST /api/v1/dj/script`

### 第 2 周：前端闭环 + 每日电台

- Day 1-2：阶段 B — 前端 `SpeakingIndicator.tsx` + `useAudioPlayer.ts` 状态机 + TTS/音乐顺序播放
- Day 3：阶段 B — MiMo prompt 调优，输出稳定 JSON（Few-shot + Zod 校验）
- Day 4-5：阶段 C — 后端 `planner.ts` + `scheduler.ts` 改造 + 数据库迁移

### 第 3 周：智能化 + 工程完善

- Day 1：阶段 C — 前端 `/plan` 时间轴页面 + `PlanTimeline.tsx`
- Day 2-3：阶段 C — `tasteBuilder.ts` + `contextCollector.ts` + 用户语料 MVP
- Day 4：阶段 C — WebSocket 集成 + `useWebSocket.ts`
- Day 5：阶段 C — UPnP 设备选择 + 推送 + `DeviceSelector.tsx`

### 第 4 周：测试 + PWA + 合规

- Day 1-2：测试补全（单元/集成/前端/E2E）
- Day 3：PWA 适配（manifest、Service Worker、移动端）
- Day 4：安全审计 + 合规检查
- Day 5：文档更新 + 验收

---

## 15. 风险清单与对策

| 风险 | 影响 | 优先级 | 对策 |
|------|------|--------|------|
| 网易云/QQ 音乐接口失效 | 无法播放真实歌曲 | 高 | 前置验证；接入多平台；本地 fallback 曲库 |
| MiMo JSON 输出不稳定 | DJ 播报/每日计划失败 | 高 | system prompt + Few-shot + Zod 校验 + 3 次重试 |
| Fish Audio 额度不足 | TTS 失败 | 中 | 缓存所有 TTS（hash 缓存）；失败时 fallback 到文字 |
| Cookie 泄露/失效 | 账号风险/音乐源中断 | 高 | 加密存储；定期轮换；监控 401/403 |
| WebSocket 连接不稳定 | 状态不同步 | 中 | 心跳、重连、HTTP 轮询兜底 |
| TTS 生成慢 | 歌曲切换卡顿 | 中 | 预生成 + 缓存 + 加载状态 |
| 用户语料过大 | 超出上下文窗口 | 中 | Token 预算 + 截断/摘要策略 |
| 服务器错过 07:00 计划生成 | 当日无计划 | 中 | 启动时补偿生成 + 持久化调度 |
| 移动端音频自动播放被拦截 | 无法自动播放 | 中 | 首次交互后播放 + 显式播放按钮 |
| 法律合规风险 | 版权/平台 ToS 问题 | 高 | 仅限个人本地使用；评估正版 API |
| Prompt 注入 | LLM 输出被操控 | 高 | promptGuard 过滤所有用户输入（已存在） |
| 费用失控 | LLM/TTS 成本激增 | 中 | 每日调用上限、缓存命中监控、异常熔断 |

---

## 16. 附录：现有项目文件清单

### 16.1 后端关键文件

```
backend/src/
├── index.ts              # Express 入口（已读：helmet/rate limit/apiKeyAuth/8 路由）
├── config.ts             # 环境变量（已读：MiMo/Fish Audio/飞书/天气/网易云配置）
├── types/index.ts        # 类型定义
├── routes/
│   ├── radio.ts          # 电台路由（已读：create/next/chat/feedback/queue/songs）
│   ├── dj.ts             # DJ 路由（已读：transition/tts/intro/analyze-image）
│   ├── profile.ts
│   ├── import.ts
│   ├── context.ts
│   ├── upnp.ts
│   ├── schedule.ts       # 计划路由（已读：today/now，返回写死数据）
│   └── qqmusic.ts
├── services/
│   ├── aiFactory.ts
│   ├── engine.ts         # 曲库引擎（已读：MOCK_SONGS + 2 本地 mp3）
│   ├── mimo.ts           # MiMo 调用（已读：4 个 AI 方法，OpenAI 兼容）
│   ├── netease.ts
│   ├── qqmusic.ts
│   ├── fishAudio.ts
│   ├── feishu.ts
│   ├── weather.ts
│   ├── upnp.ts
│   └── scheduler.ts      # 调度器（已读：14 写死时段）
├── middleware/
│   ├── auth.ts           # apiKeyAuth
│   ├── cors.ts
│   ├── error.ts
│   ├── requestId.ts
│   ├── sessionAuth.ts
│   └── validate.ts
├── db/
│   ├── index.ts
│   └── schema.sql
├── utils/
│   ├── fetchWithTimeout.ts  # circuit breaker
│   ├── promptGuard.ts       # 输入过滤 + 输出校验
│   ├── sessionToken.ts      # session 签名
│   ├── fileCleanup.ts       # 自动清理
│   └── logger.ts
└── mockData/
    └── songs.ts          # MOCK_SONGS
```

### 16.2 前端关键文件

```
frontend/src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx          # 电台主页（已读：引用 10 个组件）
│   └── profile/page.tsx  # 个人档案
├── components/
│   ├── KimiCard.tsx
│   ├── ChatArea.tsx      # 已存在
│   ├── InputArea.tsx     # 已存在
│   ├── PlayerBar.tsx     # 已存在
│   ├── AudioWaveform.tsx
│   ├── DotMatrixClock.tsx # 已存在
│   ├── OnAirBadge.tsx     # 已存在
│   ├── ThemeToggle.tsx    # 已存在
│   ├── ParticleBackground.tsx # 已存在
│   ├── QueueList.tsx      # 已存在
│   └── TerminalLog.tsx    # 已存在
├── hooks/
│   ├── useAudioPlayer.ts
│   └── useSession.ts
├── store/
│   └── radioStore.ts
└── lib/
```

**缺失组件**（需新建）：
- `SpeakingIndicator.tsx`（Speaking... 状态 + 波形）
- `DeviceSelector.tsx`（音响设备选择）
- `PlanTimeline.tsx`（时间轴时段卡片）

---

*文档生成时间：2026-06-18*
*文档路径：`D:/Coder/mimo-radio/docs/claudio-rebuild-plan-v2.2.md`*
*视频来源：抖音 @秒秒Guo（抖音号：172391554），`抖音2026618-063537.mp4`*
*基于 v2.1 综合修正，替换现状分析为真实代码调研结果，插入视频逐帧精确视觉规格，校准 API 路径，精简为 3 阶段可执行方案*
*审查依据：6 维度独立审查（技术可行性、产品完整性、实现路径、风险与遗漏、Prompt 工程、代码可执行性）*
