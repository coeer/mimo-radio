<p align="center">
  <h1 align="center">🎧 MiMo AI Radio</h1>
  <p align="center"><strong>你的私人 AI DJ，懂你心情、记得品味、陪你度过每一个深夜。</strong></p>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success" />
  <img src="https://img.shields.io/badge/license-MIT-blue" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" />
  <br/>
  <img src="https://img.shields.io/badge/Next.js-14.2-000?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Express-4.x-000?logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-3.x-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Zustand-5.x-433e38?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/AI-MiMo_v2.5-orange" />
  <img src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-backend_251_passed-success?logo=vitest" />
  <img src="https://img.shields.io/badge/tests-frontend_127_passed-success?logo=vitest" />
  <img src="https://img.shields.io/badge/types-strict-blue?logo=typescript" />
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎙️ AI DJ
- 自然语言交互：说出心情，"深夜爵士"、"来点轻音乐"
- AI 生成推荐策略 + DJ 开场白 + 换歌串词
- MiMo TTS 语音播报（3 引擎可切换）
- 关键词高亮（`**温暖**的旋律，陪你度过**深夜**`）

### 🧠 DJ 记忆
- **短期**：记得今晚第几首、刚才放过什么、说过什么
- **长期**：从收藏历史学习品味，"我记得你喜欢周杰伦"
- 跨会话不重复：每次串词有承接感不重复

</td>
<td width="50%">

### 🎵 音乐体验
- 网易云 + QQ 音乐双音源，免费歌可播
- 真实 LRC 歌词 + 专辑封面
- 队列 20 首可滚动
- 全屏播放器（大封面 + 歌词沉浸）

### 📱 PWA
- 添加到主屏幕、离线缓存
- 锁屏/耳机控制（MediaSession）
- 深色/浅色主题
- 粒子背景动效

</td>
</tr>
</table>

<details>
<summary><strong>More features</strong></summary>

- 📅 **每日电台时间轴** —— `/plan`：AI 规划的 6 时段 × 真实天气
- 📊 **音乐人格报告** —— `/profile`：统计 + SVG 雷达图
- 🎛️ **反馈闭环** —— like/unlike/skip/complete 落库，喂回推荐
- 🔄 **多 TTS 引擎** —— 预置音色 / 音色设计 / 音色复刻
- 🔊 **UPnP/DLNA** —— 音响推送
- 🎤 **ASR 语音输入** —— 说话点歌
- ⚡ **SSE / WebSocket 就绪** —— 流式文本 + 歌词同步（roadmap）

</details>

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 20
- **npm** ≥ 9

### 1. Clone & Install
```bash
git clone https://github.com/coeer/mimo-radio.git
cd mimo-radio
npm run install:all
```

### 2. Configure
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` — at minimum set:
```env
MIMO_API_KEY=your_mimo_api_key
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
SESSION_SECRET=your-random-secret-at-least-32-chars
```

### 3. Start
```bash
npm run dev
```
- Frontend → http://localhost:3000
- Backend → http://localhost:8001

### 4. Test
```bash
cd backend  && npm test   # 251 tests
cd frontend && npm test   # 127 tests
```

---

## 🏗 Architecture

```
┌───────────────────────────────────────────┐
│               PWA Frontend                 │
│     Next.js 14 · React 18 · Zustand 5     │
│          :3000 (dev) · :3001 (prod)       │
└──────────────────┬────────────────────────┘
                   │  HTTP REST
┌──────────────────┴────────────────────────┐
│              Node Backend                  │
│   Express 4 · TypeScript · better-sqlite3 │
│          :8001 (dev) · :8001 (prod)       │
└──────────────────┬────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌───────────┐
│  MiMo   │  │  网易云   │  │ QQ 音乐    │
│ v2.5 AI │  │ (免cookie)│  │(webbridge) │
└─────────┘  └──────────┘  └───────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | Next.js 14 (App Router) |
| **UI Library** | React 18 |
| **Styling** | Tailwind CSS 3 |
| **State** | Zustand 5 (persist + devtools) |
| **PWA** | next-pwa |
| **Backend Framework** | Express 4 |
| **Language** | TypeScript 5 (strict) |
| **Database** | better-sqlite3 (WAL mode) |
| **AI** | MiMo v2.5 (text) / MiMo TTS (speech) / MiMo ASR (voice) |
| **Testing** | Vitest 4 + supertest + @testing-library/react |
| **Music Sources** | 网易云音乐 API / QQ 音乐 (via webbridge) |
| **External** | OpenWeather / UPnP |

---

## 📁 Project Structure

```
mimo-radio/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Express entry
│   │   ├── routes/                  # radio · dj · profile · schedule · lyric
│   │   ├── services/                # engine · mimo · netease · qqSource · planner
│   │   ├── db/index.ts              # SQLite (sessions · songs · feedback · profile)
│   │   ├── middleware/              # auth · sessionAuth · validate · error
│   │   └── utils/                   # logger · djMemory · ssrfGuard · sessionToken
│   ├── data/                        # *.db files (gitignored)
│   └── static/                      # TTS audio files
├── frontend/
│   └── src/
│       ├── app/                     # page · profile · plan · settings
│       ├── components/              # KimiCard · ChatArea · FullscreenPlayer · QueueList
│       ├── hooks/                   # useAudioPlayer · useSession · useTTS
│       ├── store/radioStore.ts      # Zustand (5 slices)
│       └── types/api.ts
├── docs/
│   ├── plans/                       # Task specification docs
│   └── DSpro/                       # Self-test reports
├── COLLABORATION.md                 # Planner ↔ Executor contract
├── HANDOVER.md                      # Session handoff
└── ARCHITECTURE.md                  # Detailed architecture
```

---

## 🔧 Development

```bash
# Run all tests
npm test

# Type check
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# Single test file
cd backend && npx vitest run src/routes/radio.test.ts

# Build
npm run build
```

### Conventions
- TypeScript `strict: true` — no implicit `any`
- API response: `{ success: boolean, data?: T, error?: { message, code } }`
- `sessionToken` format: `sessionId.sig` (HMAC-SHA256, no expiry)
- `queue` / `currentSong` are in-memory only (not persisted by design)
- Dev mode skips API key auth

See [`COLLABORATION.md`](./COLLABORATION.md) for the full development contract.

---

## 🤝 Contributing

This project uses a **Planner ↔ Executor** collaboration model:

1. **Planner** writes task specs in `docs/plans/*.md` with root cause, exact changes, verification criteria
2. **Executor** implements strictly per spec, runs tests, reports status (`DONE` / `BLOCKED` / `NEEDS_CONTEXT`)
3. **Both** follow the contract in [`COLLABORATION.md`](./COLLABORATION.md)

Pull requests welcome. See open issues for current priorities.

---

## 📄 License

MIT © 2026

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/coeer">coeer</a> · Powered by <a href="https://www.xiaomimimo.com">MiMo AI</a></sub>
</p>
