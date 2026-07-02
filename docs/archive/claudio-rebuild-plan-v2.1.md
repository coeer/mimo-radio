# Claudio 音乐电台复刻方案 v2.1（审查修正版）

> ⚠️ **历史规划文档**：本文件为早期重建规划快照，保留作为历史记录。
> 部分功能**已移除**：Fish Audio TTS（已由 MiMo TTS 三引擎取代）、飞书日程集成（已彻底删除）。
> 文中涉及这两个功能的章节仅供历史参考，不再代表当前实现。

> 目标：基于现有 `mimo-radio` 项目，复刻抖音 @秒秒Guo（抖音号：172391554）的 **Claudio** 个人 AI 音乐电台体验。
> 原始视频：`D:/Program Files/douyin/Download/抖音2026618-063537.mp4`
> 核心变更：原视频使用 Claude Code，本方案使用 **MiMo（小米大模型）**。
> 文档用途：可直接交付给 AI 代理按步骤实现，所有任务都标注了真实文件路径和 diff 范围。
> 本版变更：根据 6 维度独立审查反馈修正，补充了前置验证、Prompt 工程、测试、迁移、合规、PWA 等关键细节。

---

## 目录

1. [执行前的必读：前置验证 Sprint](#1-执行前的必读前置验证-sprint)
2. [项目背景与目标](#2-项目背景与目标)
3. [视频内容完整拆解](#3-视频内容完整拆解)
4. [现有项目现状分析](#4-现有项目现状分析)
5. [总体技术架构](#5-总体技术架构)
6. [复刻实施方案](#6-复刻实施方案)
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

> ⚠️ **不要跳过本节**。以下 4 项验证是整栋房子的地基，任何一项失败都需要先调整产品范围或技术方案，再进入正式开发。

### 1.1 验证真实音乐源可用性

**目标**：确认 `netease.ts` 和 `qqmusic.ts` 能稳定返回可播放的 `audioUrl`。

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

**执行步骤**：

1. 创建临时脚本 `backend/src/scripts/verify-mimo-json.ts`
2. 使用以下配置调用 MiMo 50 次：
   - `role: 'system'`：persona + 输出格式要求
   - `role: 'user'`：DJ 串词任务输入
   - `temperature: 0.1`
   - `max_tokens: 1024`
   - 若支持：`response_format: { type: 'json_object' }`
3. 每次调用后检查 JSON 是否可解析、字段是否完整

**验收标准**：
- JSON 可解析率 ≥ 90%
- 字段完整率 ≥ 85%

**失败对策**：
- 增加 Few-shot 示例
- 使用 Zod 校验 + 3 次重试
- 最终失败时返回 fallback 默认文案

### 1.3 验证 Fish Audio TTS 能力

**目标**：确认 TTS 可用、音色合适、是否支持时间戳。

**执行步骤**：

1. 创建临时脚本 `backend/src/scripts/verify-tts.ts`
2. 用候选音色生成一段 100 字的 DJ 串词
3. 测试：
   - 音频是否能正常播放
   - 生成耗时
   - 是否返回 word/sentence 时间戳（用于逐句高亮）
   - 同一文本两次生成是否一致（缓存验证）

**验收标准**：
- TTS 生成成功率 ≥ 95%
- 单条生成耗时 ≤ 5 秒
- 音色符合"夜间电台 DJ"氛围

**失败对策**：
- 更换音色
- 若不支持时间戳，将"逐句高亮"降级为"整段文案 + 进度条"

### 1.4 验证 WebSocket 依赖

**目标**：确认 `ws` 库已安装且基础连通性正常。

**执行步骤**：

1. 检查 `backend/package.json` 中是否有 `"ws": "^x.x.x"`
2. 若不存在，执行 `cd backend && npm install ws`
3. 创建临时脚本验证 Express + ws 同端口挂载

**验收标准**：
- `ws` 已安装
- 基础 WebSocket 连接可建立

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

## 3. 视频内容完整拆解

### 3.1 视觉界面

#### 3.1.1 首页/电台页

- 深色背景，带细微网格/点阵纹理
- 顶部中央：像素风点阵时钟 `21:11`
- 时钟下方：星期 + 日期，例如 `Monday 20 APR 2026`
- 日期下方：`ON AIR` 绿色呼吸指示灯
- 右上角：`LOGIN` 按钮 + `DARK`/`LIGHT` 主题切换
- 中部：当前播放卡片
  - 顶部小图/专辑封面
  - 歌名 + 歌手，例如 `If - Bread`
  - 进度条 + 当前时间/总时长
  - 播放控制：上一首、播放/暂停、下一首、收藏、HIDE、FAV、VOL
- 中下部：聊天区域
  - AI DJ 头像 + 名称 `Claudio`
  - `LIVE` 状态标识
  - 聊天气泡，带时间戳
  - 底部输入框：`Say something to the DJ...`
  - 语音输入按钮、发送按钮
- 底部：`CLAUDIO FM` 品牌标识 + `CONNECTED` 连接状态

#### 3.1.2 播放器全屏卡片

视频开头展示了另一种更聚焦的播放器视图：

- 全屏卡片，顶部有音频波形
- 大字号歌名 `Monday Night Exhale`
- 歌手 `If — Bread`
- 进度条 + 播放控制
- 下方是 AI 正在朗读的歌词/解说文字，当前句高亮
- 底部迷你波形条

#### 3.1.3 个人主页/品味档案

- 头像（视频中是一只猫）
- DJ 名称 `Claudio`
- 签名/状态：`一开机我就打碟`
- 简介：`mmguo的私人dj，会打碟的taste.md`、`Your mood is my prompt. I hate algorithm. I have taste.`
- 统计：`ON AIR 24/7`、`GENRES ∞`、`LISTENER 1`
- 音乐标签云：
  - `JAZZ-HIPHOP`
  - `NEO-CLASSICAL`
  - `90S华语`
  - `HIP-HOP`
  - `柴可夫斯基GEMINEM`
  - `J-ROCK`
  - `下雨白噪音`
  - `POST-PUNK`
  - `SHIBUYA-KEI`

### 3.2 核心功能

#### 3.2.1 AI DJ 语音播报

- 歌曲开始播放前，AI DJ 会用语音介绍这首歌
- 解说内容包括：歌曲背景、创作故事、为什么适合当前场景、歌词意境
- 语音播报时界面顶部显示 `Speaking...`，并有音频波形动画
- 文字与语音同步，当前朗读句高亮显示

示例（视频中的《If - Bread》）：

> "This is Claudio. It's late on a Monday, and here's a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper — you'll feel yourself lift off the ground a little. This one's called If. After a long day with Claude Code, just breathe."

#### 3.2.2 聊天式推荐

用户可以像聊天一样向 DJ 提需求：

- 用户："我今天要做内容，主要是展示你哈哈，帮我挑一首 BGM，前奏入耳就能吊起晚上那种氛围感"
- AI 回复："明白了，今天是周一，需要既宁静但又不死板的，我给你找了五首开头就定情绪的，先放给你听："
- 然后返回 5 首候选歌曲卡片
- 用户可以继续对话，例如说"推荐一下"，AI 会介绍最推荐的一首

#### 3.2.3 每日电台自动规划

每天早上自动生成一整天的音乐时间表，视频中展示了一天的时间轴：

| 时间段 | 场景 | 示例歌曲 |
|--------|------|---------|
| 09:12-10:00 | 房间先醒 | 颜色 - 许美静 |
| 10:00-12:00 | 深度工作 | A walk - Tycho, Cirrus - Bonobo 等 |
| 12:00-13:00 | 午休韩语 | It Goes Like - Peggy Gou, Square - Yerin Baek 等 |
| 13:00-14:00 | 会议间歇 | Ylang Ylang - FKJ, Harvest Moon - Poolside 等 |
| 14:00-18:00 | 运动 | A Moment Apart - ODESZA, On My Knees - RÜFÜS DU SOL 等 |
| 18:00-22:00 | 晚间冥想 | 1/1 - Brian Eno, Untitled - Stars of the Lid 等 |
| 22:00-00:00 | 夜尾 | Riverside - Agnes Obel 等 |

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

---

## 4. 现有项目现状分析

### 4.1 项目位置

```
D:/Coder/mimo-radio/
├── package.json
├── start.sh / start.ps1 / start.bat
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── types/index.ts
│   │   ├── routes/
│   │   │   ├── radio.ts
│   │   │   ├── dj.ts
│   │   │   ├── profile.ts
│   │   │   ├── import.ts
│   │   │   ├── context.ts
│   │   │   ├── upnp.ts
│   │   │   ├── schedule.ts
│   │   │   └── qqmusic.ts
│   │   ├── services/
│   │   │   ├── aiFactory.ts
│   │   │   ├── engine.ts
│   │   │   ├── mimo.ts
│   │   │   ├── netease.ts
│   │   │   ├── qqmusic.ts
│   │   │   ├── fishAudio.ts
│   │   │   ├── feishu.ts
│   │   │   ├── weather.ts
│   │   │   ├── upnp.ts
│   │   │   └── scheduler.ts
│   │   ├── middleware/
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.sql
│   │   └── utils/
│   └── static/
└── frontend/
    └── src/
        ├── app/
        ├── components/
        ├── hooks/
        ├── store/
        └── lib/
```

### 4.2 已有能力对照

| Claudio 能力 | mimo-radio 已有 | 完成度 |
|-------------|----------------|--------|
| PWA 播放器界面 | Next.js + PWA | 60%，需视觉还原 |
| AI DJ 语音播报 | fishAudio.ts + dj.ts | 40%，需补齐流程 |
| 每日电台规划 | scheduler.ts | 30%，需增强场景 |
| 上下文感知 | context.ts + weather + feishu | 50%，需整合到推荐 |
| 聊天式推荐 | radio.ts + engine.ts | 50%，需优化交互 |
| 音响推送 | upnp.ts | 60%，需前端设备选择 |
| 用户品味档案 | profile.ts | 30%，需歌单导入 |
| AI 大脑 | mimo.ts | 80%，已替代 Claude |

### 4.3 主要差距

1. **界面差距**：现有界面不像 Claudio，缺少点阵时钟、ON AIR 灯、聊天式推荐卡片
2. **AI DJ 流程差距**：TTS 与音乐播放的衔接不顺畅，缺少"Speaking..."状态
3. **每日规划差距**：没有可视化的时间轴，没有按场景自动生成歌单
4. **记忆/品味差距**：没有形成 taste.md / routines.md 等用户语料文件
5. **Prompt 工程差距**：没有把上下文 6 片拼成 system prompt 的标准流程
6. **测试/迁移差距**：新增数据库表没有迁移方案，缺少测试计划

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

## 6. 复刻实施方案

### 阶段 1：界面还原

**目标**：让 mimo-radio 的前端视觉上接近 Claudio。

#### 1.1 全局主题

- 新增/更新 `frontend/src/styles/globals.css` 变量：
  - `--bg-primary: #0a0a0f`
  - `--bg-secondary: #12121a`
  - `--text-primary: #ffffff`
  - `--text-secondary: #8a8a9a`
  - `--accent: #10b981` （ON AIR 绿色）
  - `--grid-color: rgba(255,255,255,0.03)`
- 背景：深色 + 点阵网格纹理（CSS `radial-gradient` 或 SVG pattern）
- 字体：Space Grotesk（显示字体）、JetBrains Mono（时钟/等宽）

#### 1.2 顶部点阵时钟

- 文件：`frontend/src/components/DotMatrixClock.tsx`（已有，需确认效果一致）
- 要求：
  - 小时:分钟 格式，例如 `21:11`
  - 点阵像素风格
  - 每秒刷新
  - 下方显示 `Monday` 和 `20 APR 2026`
  - `ON AIR` 绿色呼吸灯

#### 1.3 主题切换

- 文件：`frontend/src/components/ThemeToggle.tsx`（已有，需接入全局主题）
- Dark/Light 切换按钮
- 使用 next-themes 或 Zustand 存储主题状态
- Light 主题用于展示，参考视频 00:34 的浅色模式

#### 1.4 播放器卡片

- 文件：`frontend/src/components/PlayerCard.tsx`
- 包含：
  - 专辑封面（圆角卡片）
  - 歌名（大字号）
  - 歌手
  - 进度条（可拖动）
  - 当前时间 / 总时长
  - 控制按钮：上一首、播放/暂停、下一首、收藏、隐藏、音量
- 顶部或背景显示音频波形

#### 1.5 聊天区域

- 文件：`frontend/src/components/ChatArea.tsx`
- 包含：
  - AI DJ 头像 + `Claudio` 名称 + `LIVE` 标识
  - 聊天气泡列表
  - AI 消息类型：
    - 文本消息
    - 歌曲推荐卡片（5 首列表）
    - 正在输入/语音状态
  - 用户输入框：`Say something to the DJ...`
  - 语音输入按钮
  - 发送按钮

#### 1.6 个人档案页

- 路由：`frontend/src/app/profile/page.tsx`（已有，需增强）
- 包含：
  - 头像
  - DJ 名称
  - 签名/状态
  - 统计：ON AIR 24/7、GENRES ∞、LISTENER 1
  - 音乐标签云
  - 导入歌单入口

#### 1.7 今日电台页

- 路由：`frontend/src/app/plan/page.tsx`（新增）
- 包含：
  - 时间轴视图
  - 每个时间段的场景标签
  - 歌曲列表
  - 当前时段高亮

---

### 阶段 2：AI DJ 语音播报

**目标**：实现歌曲切换时的 AI DJ 语音介绍。

#### 2.1 触发时机

- 自动触发：
  - 电台启动时
  - 每首歌播放前
  - 用户切换歌曲时
- 手动触发：
  - 用户点击"介绍这首歌"

#### 2.2 DJ 串词生成服务

- 文件：`backend/src/services/djScript.ts`
- 输入：
  - 当前歌曲：{ name, artist, album, year? }
  - 上一首歌曲
  - 当前时间
  - 天气
  - 当前日程上下文
  - 用户偏好
  - 历史播放记录
- 输出（JSON）：

```json
{
  "say": "This is Claudio. It's late on a Monday, and here's a song that moves with your breath...",
  "play": ["If - Bread"],
  "reason": "周一晚上需要舒缓的尼龙弦吉他",
  "segue": "从上一首的轻快节奏过渡到晚安氛围"
}
```

#### 2.3 TTS 管线

- 文件：`backend/src/services/ttsPipeline.ts`
- 流程：
  1. 接收 `say` 文本
  2. 用 SHA256 生成 hash
  3. 检查 `backend/static/tts/<hash>.mp3` 是否存在
  4. 不存在则调用 `fishAudio.ts` 生成
  5. 返回 URL `/static/tts/<hash>.mp3`
- 缓存清理策略：
  - 默认保留 30 天
  - 超过 `TTS_CACHE_MAX_AGE_DAYS` 自动清理
  - 启动时清理过期文件
- 音色选择：
  - 在 `.env` 配置 `FISH_AUDIO_VOICE_ID`
  - 默认选一个温暖、夜间电台感的音色

#### 2.4 播放器顺序控制

- 文件：`frontend/src/hooks/useAudioPlayer.ts`
- 状态机：

```
idle → loading → speaking → playing → loading → speaking → playing
```

- 状态转换：

| 当前状态 | 事件 | 下一个状态 | 说明 |
|---------|------|-----------|------|
| idle | user/start | loading | 开始生成 TTS |
| loading | tts ready | speaking | 播放 TTS |
| speaking | tts ended | playing | 播放歌曲 |
| playing | time > 50% | loading | 预生成下一首 TTS |
| playing | song ended | speaking | 播放下一首 TTS |
| speaking/playing | user/next | loading | 取消当前，进入下一首 |
| loading | tts failed | playing | 跳过播报，直接放歌 |

- 预生成策略：
  - 当前歌曲播放超过 50% 时开始预生成下一首
  - 如果用户中途切歌，取消正在进行的预生成任务
  - 单曲循环不重复生成 TTS

#### 2.5 "Speaking..." 状态

- 文件：`frontend/src/components/SpeakingIndicator.tsx`
- 顶部显示：`● Speaking...`
- 音频波形动画
- 文字展示当前播报内容
- **逐句高亮策略**：
  - 若 Fish Audio 返回时间戳：按时间戳高亮
  - 否则：按总时长/句子数估算高亮索引
  - 最简方案：整段文案 + 进度条，不强求逐句高亮

---

### 阶段 3：每日电台自动规划

**目标**：每天早上自动生成"今日电台"时间表。

#### 3.1 调度器增强

- 文件：`backend/src/services/scheduler.ts`
- 使用持久化调度：
  - 推荐 `bullmq` + Redis，或 `node-cron` + 数据库任务表
  - 服务启动时检查当日计划是否存在，缺失则立即补偿生成
  - 支持时区配置
- 新增任务：
  - `planToday`：每天 07:00 执行
  - `morningGreeting`：每天 09:00 执行
  - `hourlyMoodCheck`：每小时执行
  - `calendarHook`：日程变更时执行

#### 3.2 今日计划生成服务

- 文件：`backend/src/services/planner.ts`
- 输入：
  - 天气
  - 飞书日程
  - 用户 taste.md / routines.md
  - 当前日期/星期
  - 历史播放偏好
- 输出：

```json
{
  "date": "2026-04-20",
  "summary": "周一，晴，日程较满，晚上需要放松",
  "segments": [
    {
      "start": "09:12",
      "end": "10:00",
      "scene": "房间先醒",
      "mood": "gentle-awake",
      "description": "轻柔唤醒，不突兀",
      "tracks": [
        { "name": "颜色", "artist": "许美静" }
      ]
    }
  ]
}
```

#### 3.3 歌曲填充

- 文件：`backend/src/services/trackResolver.ts`
- 根据 `mood` 和 `tracks` 列表：
  - 调用网易云/QQ 音乐搜索
  - 选择最匹配的结果
  - 获取歌曲 URL
  - 写入数据库
- 搜索失败时：
  - 从本地 fallback 曲库选择同 mood 歌曲
  - 记录失败日志

#### 3.4 前端时间轴

- 文件：`frontend/src/app/plan/page.tsx`
- 展示当天所有时段
- 当前时段高亮
- 用户可以：
  - 查看每个时段的歌曲
  - 跳过/替换某首歌
  - 重新生成今日计划

---

### 阶段 4：上下文感知推荐

**目标**：让推荐基于真实上下文，而不只是随机播放。

#### 4.1 上下文收集器

- 文件：`backend/src/services/contextCollector.ts`
- 收集：
  - `now`：当前时间、星期、时段
  - `weather`：天气、温度、日落时间
  - `calendar`：今日日程事件（会议、运动、冥想等）
  - `recentPlays`：最近播放的歌曲
  - `userTaste`：taste.md 内容
  - `device`：当前播放设备
- Token 预算与截断策略：

| 切片 | 上限（字符） | 截断策略 |
|------|-------------|---------|
| system prompt | 800 | 固定 |
| taste.md | 3000 | 超出时按标签云 + 高频艺人摘要 |
| routines.md | 1500 | 固定 |
| weather/calendar | 800 | 固定 |
| recent plays | 2000 | 最近 20 条，按时间倒序 |
| messages history | 2000 | 最近 6-10 轮 |
| execution trace | 1000 | 最近 3 条调度日志 |

#### 4.2 用户品味建模（MVP + 增强）

**Phase 1（MVP）**：
- 手动维护 `mimo-radio/data/taste.md`
- 手动维护 `mimo-radio/data/playlists.json`
- `tasteBuilder.ts` 只读取静态文件，不自动抓取

**Phase 2（增强）**：
- 从网易云/QQ 音乐导入歌单
- 从历史播放记录更新 taste
- 定期（每周）重新生成 taste.md

`taste.md` 示例：

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

#### 4.3 推荐引擎增强

- 文件：`backend/src/services/engine.ts`
- 推荐策略：
  - 规则层：根据场景/ mood 直接匹配
  - LLM 层：MiMo 做最终排序和解释
  - 探索层：偶尔插入新风格歌曲

#### 4.4 聊天式点歌

- 文件：`backend/src/routes/radio.ts`
- 接口：`POST /api/v1/radio/:id/chat`
- 处理流程：
  1. 用户输入文本
  2. router 判断意图
  3. 如果是音乐需求，生成候选歌单
  4. 返回给前端，展示为推荐卡片
  5. 用户点击后入队播放

---

### 阶段 5：音响推送与多设备

**目标**：支持把音乐推送到外部音响。

#### 5.1 设备发现

- 文件：`backend/src/services/upnp.ts`
- 使用 SSDP 发现局域网 UPnP/DLNA 设备
- 缓存设备列表
- 发现失败时支持手动输入 IP

#### 5.2 前端设备选择

- 文件：`frontend/src/components/DeviceSelector.tsx`
- 显示可用设备：
  - 本机扬声器
  - iPhone 扬声器
  - Bose SoundTouch
  - Naim
  - 其他 DLNA 设备
- 用户选择后，后端切换输出

#### 5.3 推送控制

- 接口：`POST /api/v1/upnp/play`
- 参数：`{ deviceId, mediaUrl }`
- 流程：
  1. 后端把歌曲 URL 推送到音响
  2. 前端继续显示播放状态（但音频实际从音响出）
  3. 进度同步通过音响状态查询
- 测试模式：
  - `UPNP_MOCK=true` 时返回虚拟设备，确保无真实设备也能验证流程

---

### 阶段 6：工程完善与 Claude→MiMo 迁移

**目标**：确保项目健壮、可维护，并把 Claude 完全替换为 MiMo。

#### 6.1 迁移 Claude 调用到 MiMo

- 检查所有调用 Claude 的位置
- 文件重点：
  - `backend/src/services/aiFactory.ts`
  - 所有使用 Claude 的 route/service
- 统一改为 `mimo.ts`
- Prompt 调整：
  - 将 `persona.md` 作为 `system` 消息
  - 将具体任务作为 `user` 消息
  - 为 JSON 输出任务设置低温（0.1-0.3）
  - 为创意串词设置适度温度（0.5-0.7）
  - 按任务动态调整 `max_tokens`

#### 6.2 状态持久化

- 文件：`backend/src/db/index.ts`
- 新增表：

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

#### 6.3 测试补全

- 后端：`backend/src/**/*.test.ts`
  - `djScript.test.ts`
  - `planner.test.ts`
  - `contextCollector.test.ts`
  - `ttsPipeline.test.ts`
  - `trackResolver.test.ts`
- 前端：`frontend/src/**/*.test.tsx`
  - `DotMatrixClock.test.tsx`
  - `ChatArea.test.tsx`
  - `PlayerCard.test.tsx`

#### 6.4 文档更新

- 更新 `mimo-radio/ARCHITECTURE.md`
- 更新 `mimo-radio/action-plan.md`
- 新增 `mimo-radio/docs/user-guide.md`

---

## 7. 关键数据模型

### 7.1 Track（歌曲）

```typescript
interface Track {
  id: string;           // 平台唯一 ID
  platform: 'netease' | 'qqmusic' | 'local';
  name: string;
  artist: string;
  album?: string;
  duration: number;     // 秒
  coverUrl?: string;
  audioUrl?: string;    // 可播放 URL
  lyric?: string;
  year?: number;
  tags?: string[];      // mood / genre
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

GET /api/v1/radio/:id/now-playing
# 获取当前播放状态

POST /api/v1/radio/:id/next
# 播放下一首

POST /api/v1/radio/:id/chat
# 和 AI DJ 聊天
Body: { message: string }
Response: { success: true, data: DJMessage }

POST /api/v1/radio/:id/feedback
# 反馈（喜欢/跳过/不喜欢）
Body: { trackId: string, action: 'like' | 'skip' | 'dislike' }
```

### 8.2 计划相关

```http
GET /api/v1/schedule/today
# 获取今日电台计划

POST /api/v1/schedule/generate
# 重新生成今日计划

PUT /api/v1/schedule/segment/:id
# 修改某个时段
```

### 8.3 DJ 相关

```http
POST /api/v1/dj/script
# 请求 DJ 生成当前歌曲串词
Response: { success: true, data: DJScript }

POST /api/v1/dj/tts
Body: { text: string }
Response: { success: true, data: { ttsUrl: string } }

GET /api/v1/dj/voices
# 获取可用 TTS 音色列表
```

### 8.4 设备相关

```http
GET /api/v1/upnp/devices
# 发现可用音响设备

POST /api/v1/upnp/play
Body: { deviceId: string, mediaUrl: string }

POST /api/v1/upnp/stop
Body: { deviceId: string }
```

### 8.5 配置相关

```http
POST /api/v1/setup
# 首次启动配置
Body: { taste: string, routines: string, playlists: PlaylistInput[] }
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

**连接与重连策略**：
- 连接时必须携带 `Authorization: Bearer <sessionToken>` 或 `X-API-Key`
- 服务端单用户最多 3 个连接
- 断线后前端按 1s/3s/5s 指数退避重连
- 重连成功后立即请求 `GET /api/v1/radio/:id/now-playing` 补齐状态
- WebSocket 仅作为增强，HTTP 轮询 5 秒兜底

---

## 9. Prompt 工程规范

### 9.1 调用方式改造

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

按任务设置 `max_tokens`：

| 任务 | max_tokens | temperature |
|------|-----------|-------------|
| DJ 串词 | 1024 | 0.6 |
| 每日计划 | 2048 | 0.2 |
| 聊天推荐 | 1536 | 0.4 |
| 意图分流 | 512 | 0.1 |

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
2. **用户语料**：`taste.md` + `routines.md` + `playlists.json`（受 Token 预算限制）
3. **环境注入**：`weather` + `calendar` + `now`
4. **已检索记忆**：从 `state.db` 检索的相关历史（最近 20 条 plays + 最近 6-10 轮 messages）
5. **用户输入/工具结果**：当前用户消息或工具返回
6. **执行轨迹**：scheduler 的调度日志

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
| `frontend/src/hooks/useAudioPlayer.test.ts` | 状态机转换正确 |

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

- Cookie/凭证加密存储（如使用 `keytar` 或环境变量 + 文件权限）
- `NETEASE_COOKIE`、`QQMUSIC_COOKIE` 等高价值凭证不进入版本控制
- 所有用户输入经过 `promptGuard.ts` 过滤
- WebSocket 连接必须鉴权，限制单用户连接数
- 设置 API 调用上限，防止费用失控

### 13.4 隐私

- 用户的日程、心情、播放历史属于个人敏感数据
- 数据仅存储在本地 SQLite，不上传到第三方（除必要的 API 调用）
- 提供数据导出和删除功能
- 若未来对外服务，需增加用户同意机制

---

## 14. 落地路线图

### 前置验证 Sprint（2-3 天）

- [ ] 验证网易云/QQ 音乐源可用性
- [ ] 验证 MiMo JSON 输出稳定性
- [ ] 验证 Fish Audio TTS 能力
- [ ] 验证 WebSocket 依赖

### 第 1 周：核心体验（AI DJ 语音播报）

- Day 1-2：完成后端 `djScript.ts` + `ttsPipeline.ts`
- Day 3：完成前端 `SpeakingIndicator.tsx` + TTS/音乐顺序播放
- Day 4：完成 MiMo prompt 调优，输出稳定 JSON
- Day 5：联调测试，确保"AI 能说话、说完放歌"

### 第 2 周：界面还原

- Day 1-2：`DotMatrixClock.tsx` + 主题切换
- Day 3-4：`PlayerCard.tsx` + 波形可视化
- Day 5：`ChatArea.tsx` + 推荐卡片

### 第 3 周：每日电台 + 上下文感知

- Day 1-2：`planner.ts` + `trackResolver.ts`
- Day 3：前端 `/plan` 时间轴页面
- Day 4-5：`contextCollector.ts` + 用户语料 MVP

### 第 4 周：音响推送 + 工程完善

- Day 1-2：UPnP 设备选择 + 推送
- Day 3-4：Claude→MiMo 全面迁移 + 数据库迁移
- Day 5：测试补全 + 文档更新

---

## 15. 风险清单与对策

| 风险 | 影响 | 优先级 | 对策 |
|------|------|--------|------|
| 网易云/QQ 音乐接口失效 | 无法播放真实歌曲 | 高 | 前置验证；接入多平台；本地 fallback 曲库 |
| MiMo JSON 输出不稳定 | DJ 播报/每日计划失败 | 高 | system prompt + Few-shot + Zod 校验 + 3 次重试 |
| Fish Audio 额度不足 | TTS 失败 | 中 | 缓存所有 TTS；失败时 fallback 到文字 |
| Cookie 泄露/失效 | 账号风险/音乐源中断 | 高 | 加密存储；定期轮换；监控 401/403 |
| WebSocket 连接不稳定 | 状态不同步 | 中 | 心跳、重连、HTTP 轮询兜底 |
| TTS 生成慢 | 歌曲切换卡顿 | 中 | 预生成 + 缓存 + 加载状态 |
| 用户语料过大 | 超出上下文窗口 | 中 | Token 预算 + 截断/摘要策略 |
| 服务器错过 07:00 计划生成 | 当日无计划 | 中 | 启动时补偿生成 + 持久化调度 |
| 移动端音频自动播放被拦截 | 无法自动播放 | 中 | 首次交互后播放 + 显式播放按钮 |
| 法律合规风险 | 版权/平台 ToS 问题 | 高 | 仅限个人本地使用；评估正版 API |
| Prompt 注入 | LLM 输出被操控 | 高 | promptGuard 过滤所有用户输入 |
| 费用失控 | LLM/TTS 成本激增 | 中 | 每日调用上限、缓存命中监控、异常熔断 |

---

## 16. 附录：现有项目文件清单

### 16.1 后端关键文件

```
backend/src/
├── index.ts              # Express 入口
├── config.ts             # 环境变量
├── types/index.ts        # 类型定义
├── routes/
│   ├── radio.ts
│   ├── dj.ts
│   ├── profile.ts
│   ├── import.ts
│   ├── context.ts
│   ├── upnp.ts
│   ├── schedule.ts
│   └── qqmusic.ts
├── services/
│   ├── aiFactory.ts
│   ├── engine.ts
│   ├── mimo.ts           # MiMo 调用（替代 Claude）
│   ├── netease.ts
│   ├── qqmusic.ts
│   ├── fishAudio.ts
│   ├── feishu.ts
│   ├── weather.ts
│   ├── upnp.ts
│   └── scheduler.ts
├── middleware/
├── db/
│   ├── index.ts
│   └── schema.sql
└── utils/
```

### 16.2 前端关键文件

```
frontend/src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx          # 电台主页
│   └── profile/page.tsx  # 个人档案
├── components/
│   ├── KimiCard.tsx
│   ├── ChatArea.tsx
│   ├── InputArea.tsx
│   ├── PlayerBar.tsx
│   ├── AudioWaveform.tsx
│   └── DotMatrixClock.tsx
├── hooks/
│   ├── useAudioPlayer.ts
│   └── useSession.ts
├── store/
│   └── radioStore.ts
└── lib/
```

---

*文档生成时间：2026-06-18*
*文档路径：`D:/Coder/mimo-radio/docs/claudio-rebuild-plan-v2.1.md`*
*审查依据：6 维度独立审查（技术可行性、产品完整性、实现路径、风险与遗漏、Prompt 工程、代码可执行性）*
