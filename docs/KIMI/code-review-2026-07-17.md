# mimo-radio 深度代码评审报告

> 评审日期：2026-07-17
> 评审方式：三路并行源码审查（后端 / 前端 / 构建配置与仓库卫生）+ 双端测试实证
> 说明：本报告以**当前源码**为准，仓库文档（ARCHITECTURE.md、HANDOVER.md 等）仅作对照，多处已过时。

## 实证基线

| 项目 | 结果 |
|------|------|
| 后端测试 | 277 用例 / 33 文件，全部通过（8.4s） |
| 前端测试 | 179 用例 / 22 文件，全部通过（9.0s） |
| 后端 `tsc --noEmit` | 0 错误 |
| 前端 `tsc --noEmit` | 0 错误 |
| ESLint（backend） | 0 errors / 57 warnings（多为 `no-explicit-any`） |

## 总体判断

工程质量在同类个人项目里属于上游：鉴权有 HMAC + `timingSafeEqual`、Prompt 注入双向防护、外部依赖全链路降级、参数化 SQL、分层 ErrorBoundary、防重入体系完整、456 个测试全绿。但存在 **2 个严重级问题**（两个功能实际不可用 + 鉴权 fail-open），以及一批"静默写错数据"和"文档/配置漂移"的中等问题。一句话：**骨架好，测试绿，但有几个"测试绿也照样错"的洞**。

---

## 🔴 严重问题（2 个）

### R1. ASR 语音点歌和图片分析两个功能实际不可用 — body 上限自相矛盾

- `backend/src/index.ts:88` 全局 `express.json({limit:'1mb'})`
- `backend/src/routes/dj.ts:57` asrSchema 允许 `audio` 最大 20,000,000 字符（~15MB 音频）
- `backend/src/routes/dj.ts:52` analyze-image 允许 10,000,000 字符

任何 >1MB 的合法请求在 body-parser 阶段被 413 拒绝，且 413 错误会被 `errorHandler` 包装成 500 "Internal server error"，客户端完全无法诊断。测试全绿是因为测试从不超过 1MB。

**为什么重要**：语音点歌（ASR）和图片分析两个已暴露的 API 对超过 1MB 的输入必然失败。

### R2. 鉴权 fail-open：忘配 NODE_ENV 或 API_KEY 时全站裸奔

- `backend/src/middleware/auth.ts:25-34`：`!config.apiKey` 且非 production → 直接 `next()` 放行
- `backend/src/config.ts:6`：NODE_ENV 默认 `development`
- `backend/src/utils/sessionToken.ts:20`：硬编码 `DEV_FALLBACK_SECRET` 兜底

生产部署只要忘配 `NODE_ENV` 或 `API_KEY` 任一环节，所有 `/api/*` 无鉴权，且 session 签名密钥公开。鉴权默认值应 fail-closed，当前是 fail-open。

---

## 🟡 中等问题

### 后端

**B1. aiLimiter 挂载层级错误，feedback 独立限流失效、轻量 GET 被误伤**
`backend/src/index.ts:148` `app.use('/api/v1/radio', aiLimiter, radioRoutes)`：GET `/radio/models`、`/radio/songs`、`/:id/queue` 全部消耗 10 次/分钟配额；`routes/radio.ts:26-31` 特意为 feedback 配的 30/分钟 limiter 永远到不了（请求先过 aiLimiter）。`/dj/tts-voices` 同理（`index.ts:149`）。

**B2. `fetchWithTimeout` 两个洞**
`backend/src/utils/fetchWithTimeout.ts:114-143`：
- 超时只覆盖到响应头，`fetch` resolve 后 `finally` 立即 `clearTimeout`，调用方读 body（`mimo.ts:50`、`mimoTts.ts:92` 等处 `res.json()/text()`）无任何超时保护，TTS 大 base64 慢流可挂死请求；
- HTTP 5xx 不计入熔断失败（只在 `res.ok` 时重置、网络异常才计数），上游持续 500 熔断器永不 OPEN。

**B3. 全局 30s 请求超时与 ASR 60s / TTS 30s 外部调用冲突**
`index.ts:136` `req.setTimeout(30000)` vs `services/mimoAsr.ts:72` 60s、`services/mimoTts.ts:35` 30s。超时回调只发 408 不中止 handler，之后 handler 写响应必抛 "headers already sent"，日志噪音且语义混乱。

**B4. UPnP 是死代码且自相矛盾**
- `services/upnp.ts:42-45` `play()` 是 TODO stub 恒返回 `{success:false}`，而 `routes/upnp.ts:47` 仍回 `{ok:true,...}` 谎报成功；
- 路由用 `isSafeUrl` 校验，但 UPnP 设备天然在内网（192.168.x.x），必被 `ssrfGuard.ts:7` 私网正则拦截——即使实现了 play 也调不通；
- `package.json` 里 `upnp-device-client` 依赖装了没用。

**B5. `security-headers.test.ts` 是自我复制快照，已与真实配置漂移**
测试文件内手写 `styleSrc: ["'self'","'unsafe-inline'"]`，而 `index.ts:49` 实际是 `["'self'"]`——测试测的是自己复制的副本，index.ts 改坏了也照绿。

**B6. tasteCache 未按参数做 key，limit 不同互相污染**
`utils/tasteCache.ts:35-56` 单槽缓存：radio `next` 用 `getLikedArtists(3)`（radio.ts:222），chat 用 `getLikedArtists(5)`（radio.ts:354），30s 内先到先得，limit 语义丢失。

**B7. 部署/配置漂移**
- `.env.example:2` `PORT=8000` vs `config.ts:5` 默认 `8001`（新人按 README 配完前端代理全 502）；
- `config.ts:15` CORS 默认白名单 `['http://localhost:3001','3002','3003','127.0.0.1:3001']`，独缺真实前端端口 3000；
- `qqSource.ts:20` 直读 `process.env.WEBBRIDGE_URL`，绕过 config.ts 集中管理；
- `.env.example` 缺 `CORS_ORIGINS`、`API_BASE_URL`、`WEBBRIDGE_URL`、`LOG_*`；
- `config.ts:37` `neteaseCookie` 定义了但全代码无引用（死配置）；`db/index.ts` 的 `getSongs/setSongs` 仅测试在用（死代码）；
- 未设 `app.set('trust proxy')`：反代后所有客户端共享一个 IP，限流变成全局限额；
- feedback 表无 TTL 清理任务（session 有，feedback 无限增长）。

**B8. 小正确性问题合集**
- 无 SIGTERM/SIGINT 优雅关闭；`db/index.ts:292`、`fileCleanup.ts:95` 的 `setInterval` 无 unref/停止入口；
- session token 无内嵌过期（`sessionToken.ts:26` 注释已承认），session 行若在 TTL 内被反复刷新，token 实际永久有效；
- 错误响应结构不一致：`qqmusic.ts:48` `{error:'string'}` vs `musicSource.ts:49` vs 标准 `{error:{message,code}}`；
- `djPersona.ts:29` POST /generate 的 body 无 zod 校验（项目内唯一）；
- `log.ts:36` 未过滤 msg 内换行，可伪造日志行；
- `radio.ts` session 消息 `timestamp: 0` 恒为 0（radio.ts:157 等多处），排序/展示语义丢失；
- `planner.ts:62` `generateDailyPlan` 无并发去重，缓存未命中时并发请求重复调 AI；
- `radio.ts` chat 中 `sanitizePromptInput(text)` 算了两次（280、399 行）。

### 前端

**F1. 收藏上报后端的 action 状态反了**
`components/KimiCard.tsx:130-148`：`handleLike` 里 `toggleLike()` 同步执行后，`isSongLiked()` 读的仍是本次渲染闭包里的旧 `likedSongIds`，debounce 上报的 `like/unlike` 恰好相反。feedback 是后端"品味闭环"的输入，长期静默写反数据。

**F2. QQ 音源 playUrl 异步分支事件监听泄漏**
`hooks/useAudioPlayer.ts:77-86`：无 playUrl 时在 async 里 `setupAudio(data.url)` 注册 `ended/timeupdate/loadedmetadata`，但 effect 的 cleanup 只是 `cancelled = true`，监听永不移除；且 `setCurrentSong` 触发 effect 重跑又注册一遍，每播一首 QQ 歌累积一份。靠 `isTransitioning` 防重入才没酿成跳歌事故。

**F3. TTS 停止信号无法取消在途合成，旧串词会"复活"**
`hooks/useTTS.ts:83-95` + `app/page.tsx:123-127`：`stop()` 只 pause 当前 audio，无法取消已发出的 `/dj/tts` fetch：换歌时旧 transition 的 fetch resolve 仍 `playAudio`，与新歌/新串词双音轨叠加。

**F4. 全屏播放器进度条点击不 seek 真实音频**
`components/FullscreenPlayer.tsx:27-32`：`FullscreenProgressBar` 的 onClick 只 `setCurrentTime(t)`（写 store），没有调 `handleSeek`；下一秒 `timeupdate` 把 store 值拉回，进度条"弹跳"。KimiCard 的 ProgressBar 是对的，全屏反而坏了。

**F5. PlayerBar 换歌后时间显示滞留最多 5 秒**
`components/PlayerBar.tsx:14-32`：`localTime` 只在 mount 和每 5s sync 时对齐 store，换歌（store `currentTime` 归零）后仍从旧歌时间继续 tick。

**F6. 其它合并项**
- `hooks/useAudioAnalyser.ts:92-97`：卸载只 disconnect，`AudioContext` 从不 `close()`；
- `hooks/useSession.ts:16-53`：`setHandlers` 在渲染期执行（副作用混入 render）；
- `app/settings/page.tsx:55-86`：`previewVoice` 无竞态防护，连点两个音色后返回慢的盖掉快的；试听即 `setTtsVoice`，试听失败也已改设置；
- `app/plan/page.tsx:99`：重试 `setTimeout` 卸载时不清理，离开页面后仍发请求并 setState；
- `components/ChatArea.tsx:87` + `TypewriterText`：`aria-live="polite"` 区域每 30ms 变更文本，屏幕阅读器被刷屏；
- `ElapsedTime`（KimiCard.tsx:14-38）换歌不重置；
- `app/page.tsx:41-57` 空格键无 currentSong 也 togglePlay；target 判断未排除 textarea/contenteditable；
- 死代码：`TtsEngineSwitcher.tsx`、`MarkdownText.tsx` 全工程无引用；
- `manifest.json` `theme_color: #000000` 与 layout 内联脚本 `#06060a` 不一致；
- `next.config.mjs:6` 用 `NEXT_PUBLIC_API_BASE`（客户端变量）当服务端 rewrite destination，语义混淆；
- `radioStore.ts:252-259` `prevSong` 无防重入、不触发 DJ 串词，与 `nextSong` 行为不对称；
- `NEXT_PUBLIC_API_KEY` 构建期内联进 bundle，"API Key 鉴权"对浏览器端形同虚设（生产应确保该变量为空 + 后端对 rewrite 来源限流）。

### 构建 / 测试 / 仓库卫生

**C1. 启动脚本端口口径错误**
`start.sh:74,94`、`start.bat:51,63`、`start.ps1:62,83` 全部打印前端 `localhost:3001`，实际 `frontend/package.json:6` `next dev` 无 `-p`，默认 3000。（AGENTS.md 中"mimo-radio 前端 3001"的说法也不成立。）

**C2. backend 构建把 29 个测试文件编译进 dist/**
`backend/tsconfig.json:18` `include: ["src/**/*"]` 未排除测试；`dist/services/` 下实测存在 29 个 `*.test.js`。生产产物混入测试代码，且测试文件的类型错误会阻塞正式构建。

**C3. 构建产物与运行时文件被 git 跟踪**
`git ls-files` 证实被跟踪：`HANDOVER.tar.gz`（386KB）、`backup_src_20260625_113910.tar.gz`（278KB）、`frontend/frontend.pid`、`backend/static/audio/*.mp3`（TTS 运行时产物）、`frontend/public/sw.js` + `workbox-*.js`（next-pwa 每次构建重新生成）。`.gitignore` 对这几类均无规则。

**C4. 关键测试缺口**
- `services/planner.ts`（188 行，`generateDailyPlan`，全站"今日计划"核心）零测试；
- 次要缺口：`musicSource.ts`/`neteaseSource.ts`/`qqSource.ts` 音源抽象层、`mimoAsr.ts`、`utils/fileCleanup.ts`；路由层 `dj.ts`、`schedule.ts`、`profile.ts`、`lyric.ts` 等无路由级测试；前端 `useLyric.ts`、`useTheme.ts`、`lib/logger.ts` 无测试。

**C5. 文档与代码矛盾点**
- ARCHITECTURE.md 全文过时：说 Claude/`services/claude.ts`（实际 MiMo/`mimo.ts`）、`PORT=8000`、路由无 `/v1` 前缀（实际全部 `/api/v1/*`，见 `index.ts:148-160`）、声称 WebSocket（代码无 ws 依赖，仅 devDependencies 残留 `@types/ws`）、`db/schema.sql` 不存在、`/api/profile/personality` 与实际 `/api/v1/profile/stats` 不符；
- README:11、50-51 称"251/127 tests"、HANDOVER.md:84,91 称"242/127"——实测 **277 / 179 全绿**；
- HANDOVER.md:92 声称 `useAudioPlayer.sideffects.test.ts` 有 5 个既有 tsc 错误——实测双端 `tsc --noEmit` 均 0 错误；
- README 快速开始写 3000 与 start 脚本 3001 自相矛盾。

**C6. 其它**
- 根 package.json 无 `test`/`lint` 脚本；backend 无 `lint` 脚本；
- `backend/nul`、`frontend/nul` 两个 Windows 误重定向垃圾文件；
- `logs/` 下 `_e2e_*.json`、`_sid.txt`、`__pycache__` 调试残留（未跟踪）。

---

## 🔵 建议

- `ssrfGuard.ts` 只做字符串匹配不做 DNS 解析，且 IPv6 带方括号形态（`[::1]`）绕过现有正则——目前 UPnP 是 stub 不可利用，实现 LAN 放行前应补齐：URL 解析后 `dns.lookup` 校验真实 IP、补 bracket 形态；
- `sessionAuth.ts:18` 接受 query 参数携带 token，容易进代理/浏览器历史日志，建议仅 header；
- generalLimiter 覆盖 `/static` 音频流（range 请求多）和 `/health`，建议排除；
- `index.ts` 中部散落运行时代理 import（170-188 行），建议集中到顶部；`error.ts:18` 直接用 `process.env.NODE_ENV` 而非 `config.nodeEnv`。

---

## 做得好的地方

- **鉴权设计扎实**：HMAC session token + `timingSafeEqual`，生产缺密钥 `assertSecretConfigured` fail-fast（方向对，只是覆盖面不够，见 R2）；
- **Prompt 注入双向防护**（`sanitizePromptInput` 输入 + `validatePromptOutput` 输出），mimo.ts 各 prompt 拼接点基本都过了 sanitize；
- **SSRF 架构思路正确**：fail-closed + host:port 双层白名单（127.0.0.1 只放行 10086），注释坦诚承认 DNS rebinding 局限；
- **外部依赖全有降级链**：天气失败→默认晴天，音源失败→多源 fallback→mock，AI 失败→兜底文案；`extractJsonObject` 有 ReDoS 截断；
- **DB 层**：参数化查询、WAL、updated_at 索引 + TTL 清理；logger 有背压队列，"写日志绝不拖垮服务"；
- **工程化完整**：requestId 贯穿日志、错误响应生产环境不泄漏内部细节、456 个测试全绿、magic number 集中在 constants.ts；
- **前端**：分层 ErrorBoundary（layout 全局 + 页面内层）、persist partialize 只持久化偏好（sessionToken/sessionId 不落盘）、防重入体系（`isTransitioning`、chat AbortController、按 pendingId 精确替换）、canvas 三件套统一 30fps 节流 + visibilitychange 暂停 + 成对 cleanup、PWA sw.js 正确排除 `/api/` 缓存、无障碍有 skip-link 和 slider 角色。
