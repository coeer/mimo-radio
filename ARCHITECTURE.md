# MiMo AI 电台 — 架构规划

> 严格按照抖音视频中的方案实现

> **⚠️ 头注（2026-07-18，P1-3/P2-3）**：本文档为早期规划稿，多处与现状不符——AI 模型为 MiMo（非 Claude）、端口为后端 8001 / 前端 3000、路由全部 `/api/v1/*`、无 WebSocket、**UPnP 已下线（2026-07-18，P1-3）**、飞书/Fish Audio 已删除。阅读时以 `HANDOVER.md` 与源码为准。

---

## 一、整体架构（三层）

```
┌─────────────────────────────────────────────────────────────┐
│  1. 播放器界面（PWA）                                        │
│     - 手机比例竖屏卡片                                       │
│     - 播放器 + 聊天融合                                      │
│     - 支持离线缓存、添加到主屏幕                             │
└─────────────────────────────────────────────────────────────┘
                              ↑↓ WebSocket / HTTP
┌─────────────────────────────────────────────────────────────┐
│  2. 本地服务器（Node.js 中枢）                               │
│     - Express + TypeScript                                   │
│     - 统一调度所有 API                                       │
│     - 状态管理（当前播放、会话、用户偏好）                    │
│     - 推荐引擎（标签相似度 + 上下文加权）                     │
└─────────────────────────────────────────────────────────────┘
                              ↑↓ 各自管一件事
┌─────────────────────────────────────────────────────────────┐
│  3. 几个 API                                                │
│     Claude      → AI 大脑（推荐决策 + DJ 串词）              │
│     网易云音乐   → 音乐源（歌单、播放链接、封面）             │
│     OpenWeather → 天气（晴天/雨天/温度 → 推对应氛围音乐）    │
│     UPnP        → 音响推送（家庭音响播放）                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、前端（PWA 播放器界面）

### 技术选型
- **框架**: Next.js 14 + React 18 + TypeScript
- **样式**: Tailwind CSS
- **PWA**: next-pwa 插件
- **状态管理**: Zustand
- **音频**: HTML5 Audio API + Web Audio API（波形可视化）

### 页面结构
```
/                    → 电台主页（播放器卡片 + 输入框）
/profile             → 音乐人格报告
/manifest.json       → PWA 配置
/service-worker.js   → 离线缓存策略
```

### 播放器卡片 UI（精确还原视频）
```
┌────────────────────────────┐
│ C Kimi          ● Idle  │  ← 顶部栏：头像 + 名称 + 状态
│                            │
│  ▁▂▃▅▆▇▆▅▃▂▁▁▂▃▅▆▇      │  ← 音频波形（Canvas 动画）
│                            │
│  Monday Night              │  ← 歌名（大标题）
│  Exhale                    │  ← 副标题
│  If — Bread                │  ← 歌手
│                            │
│  ⏸ ━━━━━━━━──── 2:17/3:27 │  ← 进度条 + 时间
│                            │
│  Kimi • 0:05            │  ← 聊天记录区
│  Back in 1971, David...    │     （AI DJ 实时说话）
│                            │
│  Kimi • 0:11            │
│  you'll feel yourself...   │
│                            │
│  0:06 ▁▂▃▅▆▇▆▅▃▂▁   ⏸    │  ← 底部波形 + 暂停
└────────────────────────────┘
```

### 核心交互
1. **聊天输入** → 发送到 Node.js → Claude 解析意图 → 返回歌单
2. **心情快捷选择** → 🌙深夜 💪运动 📚学习 等
3. **歌单上传** → 网易云导出文件 → 解析入库
4. **语音播报** → MiMo TTS → 自动播放
5. **背景播放** → 手机锁屏也能继续播放

---

## 三、后端（Node.js 中枢）

### 技术选型
- **运行时**: Node.js 20 + TypeScript
- **框架**: Express.js
- **数据库**: SQLite（本地轻量）或 PostgreSQL
- **实时通信**: WebSocket（播报状态同步）
- **任务队列**: 内存队列（简单版）或 Bull（Redis）

### 目录结构
```
backend/
├── src/
│   ├── index.ts              # 入口：启动 Express + WebSocket
│   ├── config.ts             # 环境变量配置
│   ├── types/
│   │   └── index.ts          # TypeScript 类型定义
│   ├── routes/
│   │   ├── radio.ts          # 电台会话（创建、下一首、反馈）
│   │   ├── dj.ts             # AI DJ（串词生成、TTS）
│   │   ├── profile.ts        # 音乐人格报告
│   │   ├── import.ts         # 歌单导入
│   │   ├── context.ts        # 上下文（天气）
│   │   └── upnp.ts           # 音响推送
│   ├── services/
│   │   ├── claude.ts         # Claude API 封装
│   │   ├── netease.ts        # 网易云音乐 API
│   │   ├── weather.ts        # OpenWeather API
│   │   ├── upnp.ts           # UPnP 设备发现/推送
│   │   └── engine.ts         # 推荐引擎核心
│   ├── middleware/
│   │   ├── cors.ts           # 跨域
│   │   ├── error.ts          # 错误处理
│   │   └── logger.ts         # 请求日志
│   └── db/
│       ├── index.ts          # 数据库连接
│       └── schema.sql        # 表结构
├── package.json
├── tsconfig.json
├── .env.example              # 环境变量模板
└── .env                      # 实际配置（不提交 Git）
```

### API 路由设计

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/radio/create` | 创建电台会话（输入心情/聊天内容） |
| POST | `/api/radio/:id/next` | 下一首（可带 feedback） |
| POST | `/api/radio/:id/feedback` | 反馈（skip/like/complete） |
| GET | `/api/dj/transition` | 获取两首歌间的 DJ 串词 |
| POST | `/api/dj/tts` | TTS 合成语音 |
| GET | `/api/profile/personality` | 音乐人格报告 |
| POST | `/api/import/playlist` | 导入网易云歌单 |
| GET | `/api/context/weather` | 获取当前天气 |
| POST | `/api/upnp/play` | 推送到 UPnP 音响 |
| GET | `/api/upnp/devices` | 发现局域网音响 |

### 推荐引擎逻辑
```
输入: 用户消息（"今天下雨了，想听点安静的"）
     + 天气（雨天）
     + 时间（周二 14:00）
     + 用户历史偏好

↓

Claude 解析意图 → 输出推荐策略（JSON）
{
  "mood": "慵懒",
  "genres": ["爵士", "独立民谣"],
  "energy": "low",
  "reason": "雨天下午，适合放松"
}

↓

推荐引擎从歌单中筛选 → 按标签匹配度排序
→ 生成 20 首播放队列

↓

每首歌播放前：
  Claude 生成过渡串词
  MiMo TTS 合成语音
  → 前端自动播放语音 → 播放歌曲
```

---

## 四、API 详细设计

### 4.1 Claude（AI 大脑）

**功能**:
- 解析用户自然语言输入（"今天心情不好""推荐点运动的"）
- 生成推荐策略（mood/genre/energy）
- 生成 DJ 串词（介绍歌曲背景、过渡语）
- 生成音乐人格描述

**Prompt 设计**:
```
你是一个有品位的 AI DJ，叫 Kimi。
用户说："{user_input}"
当前天气：{weather}
当前时间：{time}

请输出：
1. 推荐策略（JSON）
2. DJ 开场白（50字以内，温暖自然）
```

### 4.2 网易云音乐

**功能**:
- 搜索歌曲（获取播放链接、封面、歌词）
- 获取用户歌单（需要登录 Cookie）
- 获取歌曲详情（标签、评论）

**实现方式**:
- 使用网易云未公开 API（需要解析网页或第三方库）
- 或者通过外链播放：`https://music.163.com/song/media/outer/url?id={song_id}.mp3`

### 4.3 MiMo TTS（语音合成）

**功能**:
- 将 DJ 串词转换为语音
- 支持多种声音风格（预置音色、文本描述生成、音频样本复刻）

**流程**:
```
DJ 串词文本 → MiMo TTS API → MP3 → 前端播放
```

### 4.4 OpenWeather（天气）

**功能**:
- 获取当前城市天气（温度、天气状况、湿度）
- 映射到音乐氛围：
  - 晴天 → 明亮/活力
  - 雨天 → 慵懒/爵士
  - 雪天 → 安静/古典
  - 高温 → 清凉/电子

### 4.5 UPnP（音响推送）

**功能**:
- 发现局域网内的 DLNA/UPnP 音响设备
- 将音乐推送到音响播放
- 支持播放/暂停/音量控制

**库**: ~~`node-ssdp` + `upnp-device-client`~~（UPnP 已下线 2026-07-18，依赖已删）

---

## 五、数据模型

### Song（歌曲）
```typescript
interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;        // 秒
  coverUrl?: string;
  playUrl?: string;        // 网易云外链
  emotionTags: string[];   // 情感标签：["励志", "兴奋"]
  sceneTags: string[];     // 场景标签：["运动", "开车"]
  genre?: string;
  year?: number;
  moodScore?: number;      // 1-10
  neteaseId?: string;
}
```

### RadioSession（电台会话）
```typescript
interface RadioSession {
  id: string;
  queue: Song[];
  currentIndex: number;
  djEnabled: boolean;
  context: {
    weather?: Weather;
    time: string;
    userInput?: string;
  };
  messages: ChatMessage[];
  createdAt: Date;
}
```

### ChatMessage（聊天记录）
```typescript
interface ChatMessage {
  id: string;
  sender: 'kimi' | 'user';
  text: string;
  timestamp: number;       // 会话内相对时间（秒）
  audioUrl?: string;       // TTS 语音 URL
}
```

### UserProfile（用户画像）
```typescript
interface UserProfile {
  personalityType: string;     // "深夜怀旧型"
  personalityDesc: string;     // 详细描述
  emotionDistribution: Record<string, number>;
  sceneDistribution: Record<string, number>;
  favoriteArtists: string[];
  totalSongs: number;
  totalListenTime: number;
}
```

---

## 六、开发顺序

### Phase 1：最小可用（MVP）
**目标**：能输入文字 → AI 推荐 → 播放音乐 → 显示聊天

1. 搭建 Node.js + Express 骨架
2. 接入 Claude API（解析意图 + 生成串词）
3. 网易云外链播放（不登录，用外链 URL）
4. 前端 PWA 卡片 UI
5. 基础推荐引擎（标签匹配）

### Phase 2：AI DJ 完整体验
**目标**：有语音、有波形、有上下文

6. 接入 MiMo TTS（预置/设计/复刻三引擎）
7. 前端波形可视化（Canvas）
8. 接入 OpenWeather 天气
9. Claude 上下文感知推荐

### Phase 3：高级功能
**目标**：完整的 Kimi 体验

10. 网易云登录 + 歌单同步
11. UPnP 音响推送
12. 音乐人格报告页
13. 离线缓存 + 背景播放
14. 分享卡片

---

## 七、环境变量（.env）

```
# 服务器
PORT=8001
NODE_ENV=development

# Claude / OpenAI
CLAUDE_API_KEY=sk-xxx
CLAUDE_MODEL=claude-3-5-sonnet-20241022

# 网易云音乐
NETEASE_COOKIE=xxx          # 登录后的 Cookie（可选）

# OpenWeather
OPENWEATHER_API_KEY=xxx
OPENWEATHER_CITY=Beijing

# UPnP（无需 Key，局域网自动发现）
```

---

## 八、启动方式

```bash
# 后端
cd backend
npm install
npm run dev        # localhost:8001

# 前端
cd frontend
npm install
npm run dev        # localhost:3000
```

---

规划完成。确认后我开始按 Phase 1 逐步实现。
