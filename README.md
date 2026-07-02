# MiMo AI Radio

AI DJ 电台。你说一句话，它帮你选歌、解说、陪伴。

打开页面，输入"深夜爵士"或"周杰伦的晴天"——MiMo AI 理解你的心情，从网易云和 QQ 音乐找到真实歌曲，生成 DJ 串词，用 TTS 朗读出来。每换一首歌，DJ 都会承接上一首的情绪余韵继续往下说。它记得今晚放过什么，也记得你收藏过哪些歌手，像一个真正的深夜电台主持人。

**核心体验：**

- 自然语言点歌推荐，不需要菜单和按钮
- AI DJ 有短期记忆（今晚的历史）和长期品味（你的收藏偏好）
- PWA 可安装到桌面，锁屏/耳机控制，深色浅色主题
- 网易云 + QQ 音乐双音源，真实歌词和封面

---

## 快速开始

```bash
git clone https://github.com/coeer/mimo-radio.git
cd mimo-radio
npm run install:all
cp backend/.env.example backend/.env   # 填入 MIMO_API_KEY 等
npm run dev                            # 前端 :3000  后端 :8001
```

### 环境变量

`backend/.env` 必填项：

```env
MIMO_API_KEY=your_key
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
SESSION_SECRET=随机字符串至少32字符
```

测试：

```bash
cd backend  && npm test    # 251 tests
cd frontend && npm test    # 127 tests
```

---

## 怎么工作

```
你说一句话 → MiMo AI 理解意图 → 网易云/QQ音乐搜歌 → AI DJ 生成串词 → TTS 朗读
```

DJ 有短期记忆（记得今晚放过什么）+ 长期品味（从收藏历史学习你喜欢的歌手）。

---

## 架构

```
PWA 前端 (Next.js 14 + React 18 + Zustand)    :3000
        ↕
Node 后端 (Express 4 + TypeScript + SQLite)    :8001
        ↕
MiMo AI / 网易云 / QQ音乐 / OpenWeather
```

---

## 目录

```
mimo-radio/
├── backend/src/          # Express 后端
│   ├── routes/           # radio, dj, profile, schedule
│   ├── services/         # engine, mimo, netease, qqSource
│   ├── db/               # SQLite (sessions, songs, feedback)
│   └── utils/            # djMemory, ssrfGuard, logger
├── frontend/src/         # Next.js 前端
│   ├── components/       # KimiCard, ChatArea, FullscreenPlayer
│   ├── hooks/            # useAudioPlayer, useSession, useTTS
│   └── store/            # Zustand
├── docs/plans/           # 任务规格
├── docs/DSpro/           # 自测报告
├── COLLABORATION.md      # 协同契约
└── ARCHITECTURE.md       # 架构说明
```

---

## 技术栈

Next.js 14 · React 18 · Express 4 · TypeScript 5 · Tailwind CSS 3 · Zustand 5 · better-sqlite3 · MiMo AI v2.5 · Vitest 4

---

## License

MIT
