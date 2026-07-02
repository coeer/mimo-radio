# MiMo AI Radio 全栈代码审查报告

**审查日期**: 2026-06-24  
**审查范围**: backend/src (~35 文件) + frontend/src (~30 文件) + 配置文件  
**审查人**: Bob (Software Architect)

---

## 总体评价

**一句话**: 架构设计清晰、安全防线完备的全栈 AI 电台应用，代码质量中上，但存在一个严重的 API Key 泄露问题和若干中等风险需优先处理。

---

## 各维度评分与分析

### 1. 架构合理性 — 8/10

**优点**:
- 三层架构（前端 PWA → Express 中枢 → 外部 API）设计合理，职责清晰
- **策略模式**用得漂亮：`MusicSource` 接口（网易云/QQ 双音源可切换）和 `TtsEngine` 接口（MiMo 预置/设计/复刻三引擎可切换），统一抽象+智能回落
- `AIService` 接口统一 AI 调用，`fetchWithTimeout` 封装超时+断路器
- 中间件分层：auth → cors → requestId → validate → error，顺序正确

**问题**:
- `engine.ts` 中 `songPool` 是模块级全局可变状态，`loadNeteaseSongs` 每次调用都替换整个曲库，多用户场景下会互相覆盖
- `musicSource.ts` / `ttsEngine.ts` 的 `currentSourceId` / `currentEngineId` 是进程级全局变量，一个用户的切换操作会影响所有用户
- `radio.ts` 路由文件 474 行，混合了 HTTP 处理、业务逻辑、AI 调用、搜索推荐，建议拆分 service 层

### 2. 代码质量 — 7/10

**优点**:
- 常量抽取到 `constants.ts`，无魔法数字
- 命名规范（camelCase 一致），函数粒度合理
- Zod schema 验证覆盖所有 POST 端点
- TypeScript strict 模式开启

**问题**:
- `qqmusic.ts` 多处 `as any` 类型断言
- `radio.ts` 中 `[QQ音乐:xxx]` / `[换歌:xxx]` / `[推荐:xxx]` 是魔法字符串，应抽取为常量或枚举
- `netease.ts:154` 正则 `/(\d+)\s*-\s*(.+?)\s*-\s*(.+?)(?:\n|$)/g` 存在 ReDoS 风险（`.+?` 在长行上可能回溯爆炸）
- `COMMON_HEADERS` 在 `netease.ts` 和 `qqmusic.ts` 中重复定义

### 3. 安全性 — 6/10 ⚠️

**做得好的**:
- `timingSafeEqual` 防时序攻击（auth.ts, sessionToken.ts）
- `promptGuard.ts` 防 Prompt 注入（正则过滤 + XML 分隔符隔离 + 输出校验）
- `ssrfGuard.ts` 防 SSRF（阻止私有 IP/localhost）
- `helmet` 安全头、`express-rate-limit` 限流（通用 200/15min + AI 10/min）
- Zod 输入校验 + 长度限制
- Session Token HMAC-SHA256 签名防篡改
- 生产环境强制要求 API_KEY

**严重问题**:
- 🔴 **`backend/.env` 包含真实 API Key**（`tp-c2u4mc1n34hjttomynth3nzu1ldczj27k0bwr8tn38jzrvsw`）。虽然 `.gitignore` 排除了 `.env`，但该文件已存在于磁盘上，需确认是否曾被提交到 Git 历史。**建议立即轮换此 Key**。

**其他安全问题**:
- `djPersona.ts:154` 将 AI 生成的 JSON 直接 `fs.writeFileSync` 写入磁盘，无校验
- `sessionAuth.ts:17` 从 `req.query?.session_token` 读取 session token — URL 中暴露 token 会被浏览器历史/日志记录
- `radio.ts:306` `sanitizePromptInput(text)` 被调用了两次（第 254 行和第 306 行），冗余但无害
- UPnP `play()` 方法是空实现（返回 `{ success: false }`），但路由已暴露，可能误导调用方

### 4. 错误处理 — 7/10

**优点**:
- `AppError` 类 + `errorHandler` 中间件统一格式
- 外部 API 调用全部有 try-catch + 兜底策略（天气/飞书/网易云/QQ 音乐）
- 电台创建失败有 graceful fallback（fallback intro text）
- 断路器模式（`fetchWithTimeout`）防止级联故障

**问题**:
- `index.ts:134-146` 中 `loadPersona()` / `registerMusicSource()` / `registerQQMusicSource()` 在模块顶层调用，如果抛异常会导致整个进程崩溃，无 graceful startup
- `db/index.ts:76` `getSongs()` 解析 JSON 失败时无错误处理，会直接抛异常
- `planner.ts:115` 异步 `resolveTracks` 的错误被 `.catch()` 吞掉，只记日志不通知调用方
- `schedule.ts:20,54-57` 路由中 `catch` 后用 `res.json()` 返回兜底而非 `next(err)`，绕过了统一错误处理

### 5. TypeScript 类型安全 — 7/10

**优点**:
- `strict: true` 开启
- 接口定义清晰（Song, RadioSession, AIService, TtsEngine, MusicSource）
- 前后端类型分离但对齐（`frontend/src/types/api.ts` 注释说明与后端对齐）
- `declare module` 补丁覆盖无类型依赖（better-sqlite3, node-ssdp）

**问题**:
- `qqSource.ts:39` `webbridgeEval` 返回 `Promise<any>` — 应定义返回类型
- `validate.ts:29,45` `req.params = result.data as any` / `req.query = result.data as any` — 类型断言
- `index.ts:65` `(req as any).requestId` — 应扩展 Express Request 类型（已有 `sessionId` 扩展，可一并添加）
- `ttsEngine.ts:38` `if (preferred && preferred.id !== currentEngineId)` 永远为 false（逻辑 bug，但无害）

### 6. 测试覆盖 — 7/10

**优点**:
- 后端 20 个测试文件，覆盖 middleware / services / utils / routes
- 前端 15 个测试文件，覆盖 store / hooks / components
- `promptGuard.test.ts` 质量高（14 个用例覆盖注入模式、输出校验、边界情况）
- `radio.test.ts` 用 supertest 做集成测试，验证 session 创建/切歌/边界检查/XSS 防御
- `radioStore.test.ts` 覆盖 18 个用例，含边界情况

**问题**:
- 无端到端（E2E）测试（虽有 `djIntroToSong.e2e.test.ts` 但未验证是否实际运行）
- `db/index.ts` 的测试未覆盖 JSON 解析失败场景
- `musicSource.ts` / `ttsEngine.ts` 的智能回落逻辑未充分测试
- `fetchWithTimeout` 的断路器状态转换（CLOSED→OPEN→HALF_OPEN→CLOSED）测试不足

### 7. 性能 — 7/10

**优点**:
- `better-sqlite3` 同步驱动，无连接池开销
- WAL 模式提升并发读写
- `express.compress()` 启用 gzip
- 天气/飞书 token 有内存缓存（5 分钟 TTL）
- `musicSource` / `ttsEngine` 就绪状态有 30 秒缓存，避免频繁检查

**问题**:
- `engine.ts` `loadNeteaseSongs` 每次调用替换整个 `songPool`，多用户并发创建会话时可能丢失曲库
- `db/index.ts:74-77` `getSongs()` 每次调用都 `JSON.parse` 全部歌曲数据，无缓存
- `qqSource.ts:137-167` QQ 播放 URL 通过浏览器轮询获取（500ms × 12 次），最长 6 秒阻塞
- `scheduler.ts:70-72` 硬编码天气 `晴 22/8℃` 和 `totalSongs: 3247`，不读真实数据
- 缺少数据库索引：`songs` 表只有主键索引，`sessions` 表有 `updated_at` 索引但无 `created_at` 索引

### 8. 依赖管理 — 8/10

**优点**:
- 依赖精简（后端 11 个 + 12 个 devDeps），无冗余
- `helmet` / `express-rate-limit` / `zod` 选型合理
- 类型声明包齐全（`@types/express` 等）
- PWA 支持（`@ducanh2912/next-pwa`）

**问题**:
- `express@4.19.2` 有已知安全漏洞（CVE-2024-29041），建议升级到 4.21+
- `node-ssdp@4.0.1` / `upnp-device-client@1.0.2` 较老，维护不活跃
- 前端 `eslint@^8` 应升级到与后端一致的 `eslint@^10`
- `@types/morgan@^1.9.9` 在 devDependencies 中但未使用 morgan（logger 是自研的）

### 9. API 设计 — 7/10

**优点**:
- RESTful 风格，版本化路径 `/api/v1/`
- Zod schema 强校验所有输入
- AI 端点独立限流（10 次/分钟）
- Session token 签名防篡改
- 健康检查端点 `/health`（含数据库状态 + 断路器状态）

**问题**:
- 响应格式不一致：
  - 成功：有的用 `{ success: true, ... }`，有的直接返回数据对象
  - 错误：有的用 `{ success: false, error: { message, code } }`，有的用 `{ error: '...' }`
- `POST /api/v1/music-source/switch` 和 `POST /api/v1/tts-engines/switch` 是全局操作，影响所有用户，缺乏用户隔离
- 缺少分页：`GET /api/radio/songs` 返回全部曲库，数据量大时影响性能
- `POST /api/v1/dj/tts` 中切换引擎是副作用（改变全局状态），应分离为独立端点

### 10. 前端质量 — 8/10

**优点**:
- Zustand slice 架构设计优秀（Player/Session/Chat/Status 四个 slice）
- `persist` middleware 只持久化 session 字段，播放状态不跨会话
- `useAudioPlayer` hook 封装完整（播放/暂停/DJ 解说期间自动暂停歌曲/QQ 延迟 URL 获取）
- `useSession` hook 逻辑清晰（创建会话 → DJ 开场白 → TTS 播放 → 自动续播）
- 键盘快捷键支持（空格播放/暂停，左右箭头快进快退）
- Skip-to-content 链接（无障碍）
- Loading skeleton 体验好
- 响应式设计（max-w-[440px] 竖屏卡片）

**问题**:
- `page.tsx:62-67` `useEffect([], [])` 自动创建会话，每次访问首页都会调后端 AI API，浪费资源
- `radioStore.ts:271-273` 暴露 store 到 `window.__RADIO_STORE__`（注释说"验收完成后删除"，但仍在代码中）
- PWA 配置在架构文档中提到但未验证 `next-pwa` 是否正确配置
- 部分组件（`QueueList`, `PlayerBar`, `ProfileCard`）无对应测试文件
- `useAudioPlayer` 依赖数组包含 `connectAnalyser`（useCallback），若引用变化可能导致不必要的 effect 重跑

---

## 问题清单

### Critical

| # | 问题 | 文件:行号 | 影响 | 修复建议 |
|---|------|-----------|------|----------|
| C1 | **.env 包含真实 API Key** | `backend/.env:3` | API Key 泄露，可能导致未授权调用 MiMo API | 1. 立即轮换 `tp-c2u4mc...` Key<br>2. 检查 Git 历史是否曾提交过此文件<br>3. 添加 pre-commit hook 检测 .env |

### High

| # | 问题 | 文件:行号 | 影响 | 修复建议 |
|---|------|-----------|------|----------|
| H1 | **全局状态竞态**：`currentSourceId` / `currentEngineId` 是进程级全局变量 | `musicSource.ts:23`, `ttsEngine.ts:15` | 多用户场景下，一个用户的切换操作会影响所有用户 | 改为 per-session 存储，或在 API 设计上注明为"管理员操作" |
| H2 | **songPool 全局替换**：`loadNeteaseSongs` 替换整个曲库 | `engine.ts:92` | 并发创建会话时曲库被覆盖 | 使用 immutable 更新 + 版本号，或为每个 session 独立维护曲库快照 |
| H3 | **Session Token URL 泄露** | `sessionAuth.ts:17` | Session token 出现在 URL query 参数中，会被浏览器历史/服务器日志记录 | 仅从 Header 或 Body 读取，移除 query param 支持 |
| H4 | **ReDoS 风险** | `netease.ts:154` | 恶意长输入可导致正则回溯爆炸 | 改用 `split('\n')` + `split(' - ')` 替代正则 |
| H5 | **进程启动无容错** | `index.ts:134-146` | `loadPersona()` / `registerMusicSource()` 异常会导致进程崩溃 | 包裹在 try-catch 中，失败时用默认值降级 |

### Medium

| # | 问题 | 文件:行号 | 影响 | 修复建议 |
|---|------|-----------|------|----------|
| M1 | `any` 类型使用过多 | `qqmusic.ts:88`, `qqSource.ts:39` | 类型安全降低，运行时可能类型错误 | 定义具体接口替代 `any` |
| M2 | 错误响应格式不一致 | 多个路由文件 | 前端需处理多种错误格式 | 统一为 `{ success: boolean, error?: { message, code }, data?: T }` |
| M3 | `getSongs()` 无 JSON 解析容错 | `db/index.ts:76` | 数据损坏时整个查询崩溃 | 包裹 JSON.parse 在 try-catch 中 |
| M4 | 未使用的 devDependency | `backend/package.json` | `@types/morgan` 未被使用 | 移除 |
| M5 | `scheduler.ts` 硬编码天气数据 | `scheduler.ts:73-74` | 每日计划不反映真实天气 | 接入 `weatherService.getCurrent()` |
| M6 | `ttsEngine.ts:38` 逻辑 bug | `ttsEngine.ts:38` | `preferred.id !== currentEngineId` 永远为 false | 移除该条件分支 |
| M7 | 前端 `window.__RADIO_STORE__` 暴露 | `radioStore.ts:271-273` | 生产环境暴露内部状态 | 删除或用 `NODE_ENV` 条件包裹 |
| M8 | UPnP `play()` 空实现 | `upnp.ts:42` | 路由已暴露但功能未实现 | 返回 501 Not Implemented 或添加 TODO 标注 |

### Low

| # | 问题 | 文件:行号 | 影响 | 修复建议 |
|---|------|-----------|------|----------|
| L1 | `COMMON_HEADERS` 重复定义 | `netease.ts:19-24`, `qqmusic.ts:23-27` | 维护成本 | 抽取到共享常量 |
| L2 | 缺少分页 | `radio.ts:470-472` | 曲库大时性能差 | 添加 limit/offset 参数 |
| L3 | `express` 版本过旧 | `backend/package.json` | 已知 CVE | 升级到 4.21+ |
| L4 | 部分前端组件无测试 | `QueueList`, `PlayerBar` 等 | 测试覆盖率不足 | 补充关键组件测试 |
| L5 | `eslint@^8` 前后端不一致 | `frontend/package.json` | 代码规范不统一 | 前端升级到 eslint@^10 |

---

## 亮点（做得好的地方）

1. **策略模式的 MusicSource/TtsEngine 设计** — 统一接口 + 注册机制 + 智能回落，扩展性极强
2. **Prompt 注入防御体系** — `promptGuard.ts` 三层防御（输入清洗 + 输出校验 + 分隔符隔离），测试覆盖全面
3. **断路器模式** — `fetchWithTimeout` 按 hostname 隔离，自动 CLOSED→OPEN→HALF_OPEN 状态转换
4. **Session 安全设计** — HMAC-SHA256 签名 + timing-safe 比较 + 生产环境强制密钥
5. **前端 Zustand slice 架构** — 四个 slice 职责清晰，persist 只存必要字段
6. **DJ 解说与歌曲播放的协调** — `isSpeaking` 状态驱动暂停/续播，TTS 结束自动恢复播放
7. **断路器状态暴露在 /health** — 可观测性好
8. **Zod 验证全覆盖** — 每个 POST/GET 端点都有 schema 校验

---

## 总结与优先修复建议

### 立即行动（P0）
1. **轮换泄露的 API Key** — 检查 Git 历史，确保旧 Key 已失效
2. **移除 `window.__RADIO_STORE__`** — 生产环境安全风险

### 本周修复（P1）
3. **统一错误响应格式** — 定义标准 `ApiResponse<T>` 类型
4. **进程启动容错** — `index.ts` 中的初始化调用包裹 try-catch
5. **移除 session token 的 query param 支持** — 仅从 Header/Body 读取
6. **修复 ReDoS 风险** — `netease.ts` 的 `parsePlaylist` 正则

### 下周修复（P2）
7. **消除 `any` 类型** — 为 QQ Music 响应定义接口
8. **升级 `express` 到 4.21+** — 修复已知 CVE
9. **全局状态隔离** — 设计 per-session 音源/引擎方案或明确标注为管理员操作
10. **补充关键路径测试** — DB JSON 解析失败、断路器状态转换、音源回落逻辑

---

*报告版本: v1.0 | 生成时间: 2026-06-24*
