---
author: 规划者
task: mimo-radio 修复整合方案（基于 Kimi 评审 + 规划者核实 + 4 点调整）
created: 2026-07-17
basis: docs/KIMI/code-review-2026-07-17.md + docs/KIMI/review-supplement-2026-07-17.md
status: 待执行
---

# mimo-radio 修复整合方案

> **来源**：Kimi 2026-07-17 深度评审 + 规划者源码核实（14 个发现全部属实）+ 4 点调整。
> **执行顺序**：P0a（规划者自做）→ P0b（DSpro）→ P1（DSpro）→ P2（任意）。
> **基线**：后端 277 / 前端 179，tsc 双零。
> **配套**：先读 `COLLABORATION.md`（铁律 1-6）+ `docs/KIMI/review-supplement-2026-07-17.md`（规划者核实结论 + 调整论证）。

---

## 执行路线总览

| 阶段 | 目标 | 执行者 | 成本 |
|------|------|--------|------|
| **P0a** | 机械清理（5 项，无架构决策）| 规划者 | 1 小时 |
| **P0b** | 安全 + 死功能 + 数据污染（4 项，需理解上下文）| DSpro | 0.5 天 |
| **P1** | 正确性 + 资源泄漏（4 项）| DSpro | 1-1.5 天 |
| **P2** | 仓库卫生 + 架构决断（3 项）| 任意 | 0.5 天 |

每阶段完成后跑全量验证：`backend: npm test && npx tsc --noEmit`，`frontend: npm test && npx tsc --noEmit`。

---

## P0a — 规划者直接做（5 项机械清理）

> 这 5 项定位明确、改动机械、无架构决策。规划者直接做，不占执行者一轮。

### P0a-1. helmet 测试同步（评审 B5，规划者的债）

**问题**：`index.ts:49` 已是 `styleSrc: ["'self'"]`，但 `security-headers.test.ts:19` 还是旧的 `["'self'","'unsafe-inline'"]`。测试测自己的副本，配置改坏也照绿。

**改法**：把 helmet/CSP 配置抽成单一来源，index.ts 和测试都引用。

新建 `backend/src/config/securityHeaders.ts`：
```ts
import type { ContentSecurityPolicyOptions } from 'helmet'

/** CSP 配置单一来源 —— index.ts 和 security-headers.test.ts 共享，杜绝快照漂移 */
export const CSP_DIRECTIVES: ContentSecurityPolicyOptions = {
  useDefaults: false,
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],            // 纯 JSON 后端，无 CSS 资源
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  // ... 其余 directive 从 index.ts:46-58 原样搬过来
}
```

`index.ts` 改为：
```ts
import { CSP_DIRECTIVES } from './config/securityHeaders'
// ...
app.use(helmet({ contentSecurityPolicy: CSP_DIRECTIVES }))
```

`security-headers.test.ts` 改为：
```ts
import { CSP_DIRECTIVES } from '../config/securityHeaders'
// 断言用 CSP_DIRECTIVES.styleSrc，不再手写字符串
```

### P0a-2. 端口口径统一（评审 B7 / C1）

| 文件 | 当前 | 改为 |
|------|------|------|
| `backend/.env.example:2` | `PORT=8000` | `PORT=8001` |
| `backend/src/config.ts:15` CORS 白名单 | `['localhost:3001','3002','3003','127.0.0.1:3001']` | 补 `'http://localhost:3000'`（真实前端默认端口）|
| `start.sh:74,94` | `localhost:3001` | `localhost:3000` |
| `start.bat:51,63` | `localhost:3001` | `localhost:3000` |
| `start.ps1:62,83` | `localhost:3001` | `localhost:3000` |

**注意**：CORS 白名单补 3000 的同时，保留 3001/3002/3003（兼容显式指定端口的场景）。

### P0a-3. F4 全屏进度条 seek（评审 F4，规划者提级到 P0）

**问题**：`FullscreenPlayer.tsx:31` onClick 只 `setCurrentTime(t)`，没调 `handleSeek`，进度条点击后"弹跳"。

**改法**（3 处）：

1. `FullscreenPlayer.tsx` 主组件加 `onSeek` prop：
```tsx
// line 131 改签名
function FullscreenPlayer({ onSeek }: { onSeek?: (time: number) => void }) {
```

2. `FullscreenProgressBar` 接收并使用：
```tsx
// line 16 改签名
const FullscreenProgressBar = memo(function FullscreenProgressBar({ onSeek }: { onSeek?: (time: number) => void }) {
  // ...
  // line 27-32 的 onClick 改为（照搬 KimiCard ProgressBar:55-56 的模式）
  onClick={(e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const t = p * duration
    setCurrentTime(t)
    onSeek?.(t)        // ← 新增：真正 seek audio
  }}
```

3. `page.tsx:171` 传 prop：
```tsx
{isFullscreenPlayer && <FullscreenPlayer onSeek={handleSeek} />}
```

**对照**：KimiCard 的 ProgressBar（`KimiCard.tsx:43-86`）已正确实现 `setCurrentTime + onSeek` 双调用，照搬即可。

### P0a-4. aiLimiter 拆挂载（评审 B1）

**问题**：`index.ts:148-149` 整个 router 挂 aiLimiter，GET `/radio/models`、`/radio/songs`、`/:id/queue` 都消耗 10 次/分钟配额；feedback 的 30/分钟 limiter 永远到不了。

**改法**：
- `index.ts:148-149` 移除 aiLimiter：
```ts
app.use('/api/v1/radio', radioRoutes)   // 去掉 aiLimiter
app.use('/api/v1/dj', djRoutes)          // 去掉 aiLimiter
```
- 在 `radio.ts` 和 `dj.ts` 内部，只在需要的 POST 路由挂 aiLimiter：
```ts
// radio.ts —— 只挂 create/next/chat
router.post('/create', aiLimiter, validateBody(...), ...)
router.post('/:id/next', aiLimiter, sessionAuth, ...)
router.post('/:id/chat', aiLimiter, sessionAuth, validateBody(...), ...)
// GET（models/songs/queue）不挂；feedback 保留自己的 feedbackLimiter

// dj.ts —— 只挂 tts/intro/asr/analyze-image/transition
router.post('/tts', aiLimiter, validateBody(...), ...)
router.post('/intro', aiLimiter, validateBody(...), ...)
router.post('/asr', aiLimiter, validateBody(...), ...)
router.post('/analyze-image', aiLimiter, validateBody(...), ...)
router.post('/transition', aiLimiter, validateBody(...), ...)
```
- `radio.ts` 和 `dj.ts` 顶部 import aiLimiter（从 `../middleware/...` 或定义处）。

**注意**：aiLimiter 当前定义在 `index.ts`，需要抽到共享模块（如 `middleware/aiLimiter.ts`）供两个路由文件 import。

### P0a-5. 死代码清理（评审 F6/C6 片段）

删除全工程无引用的文件：
- `frontend/src/components/TtsEngineSwitcher.tsx`（grep 确认无引用）
- `frontend/src/components/MarkdownText.tsx`（grep 确认无引用）

**铁律 6**：删之前 `grep -rn "TtsEngineSwitcher\|MarkdownText" src/ --include="*.ts" --include="*.tsx"` 确认零引用（含 import 和文档）。

---

## P0b — DSpro 做（安全 + 死功能 + 数据污染）

### P0b-1. 修复 body 上限矛盾（评审 R1）

**问题**：全局 `express.json({limit:'1mb'})`，但 ASR（`dj.ts:57`）允许 20MB、analyze-image（`dj.ts:52`）允许 10MB。>1MB 合法请求被 413 拦截，且被 error.ts 包装成 500。

**改法**（2 处）：

1. `index.ts` 在 dj 路由前挂路径级 body-parser（先于全局生效）：
```ts
// 在 app.use('/api/v1/dj', djRoutes) 之前
app.use('/api/v1/dj/asr', express.json({ limit: '25mb' }))
app.use('/api/v1/dj/analyze-image', express.json({ limit: '12mb' }))
app.use('/api/v1/dj', djRoutes)
```
**注意**：路径级 body-parser 必须在全局 `express.json({limit:'1mb'})` 之后、路由注册之前挂载，且路径精确匹配。全局保持 1mb 不变（其他路由的安全收紧不放松）。

2. `middleware/error.ts` 识别 413 错误（body-parser 抛 `type='entity.too.large'`）：
```ts
// errorHandler 函数开头，AppError 判断之前
if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
  logger.warn('Request body too large', { requestId: req.requestId, path: req.path, method: req.method })
  return res.status(413).json({
    success: false,
    error: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' },
  })
}
```

**验证**：
```bash
# 手动发 >1MB base64 到 /api/v1/dj/asr，确认不再 413/500
# 错误响应类型识别测试
```

**新增测试**：`error.test.ts` 加一个 `entity.too.large` 类型错误 → 返回 413 的用例。

### P0b-2. 鉴权 fail-closed（评审 R2，规划者调整方向）

> ⚠️ **方向调整**：不是 Kimi 说的"非 dev 拒绝启动"，而是"显式配 production 才严格，没配就警告但能跑"。理由见 `review-supplement-2026-07-17.md` 调整 1。

**改法**（3 处）：

1. `sessionToken.ts` 的 DEV_FALLBACK_SECRET 加 production 限定：
```ts
// line 4 保持
const DEV_FALLBACK_SECRET = 'dev-secret-change-in-production'

// line 20 改为
function getSecret(): string {
  if (config.nodeEnv === 'production') {
    if (!config.sessionSecret && !config.apiKey) {
      throw new Error(
        'FATAL: Production requires SESSION_SECRET or API_KEY (≥32 chars). ' +
        'Refusing to sign sessions with a public fallback secret.'
      )
    }
    return config.sessionSecret || config.apiKey!
  }
  // 非生产：可用 fallback，但启动时警告（警告在 index.ts 启动日志）
  return config.sessionSecret || config.apiKey || DEV_FALLBACK_SECRET
}

const SECRET = getSecret()
```

2. `auth.ts` 保持当前逻辑（`!apiKey && nodeEnv!=='production'` 放行），但**增加启动警告**。在 `index.ts` 启动时：
```ts
// 启动日志区域
if (!config.apiKey && config.nodeEnv !== 'production') {
  logger.warn('⚠️  API_KEY not set and NODE_ENV != production — authentication is DISABLED. Safe for local dev only.')
} else if (!config.apiKey && config.nodeEnv === 'production') {
  // 这个分支理论上 apiKeyAuth 会拦，但启动也该失败
  throw new Error('FATAL: NODE_ENV=production requires API_KEY to be set.')
}
```

3. `assertSecretConfigured()`（sessionToken.ts:10）已存在，确认 `index.ts` 启动时调用了它。如果没有，加上。

**验证**：
- 不设 NODE_ENV + 不设 API_KEY → 启动成功 + 打印警告（dev 放行）
- 设 `NODE_ENV=production` + 不设 API_KEY → **启动抛错**（fail-closed）
- 设 `NODE_ENV=production` + 设 API_KEY → 启动成功 + 鉴权生效

**新增测试**：`sessionToken.test.ts` 加 production 无 secret 抛错的用例（mock config.nodeEnv）。

### P0b-3. 修复收藏上报 action 反向（评审 F1，规划者补充注释）

**问题**：`KimiCard.tsx:130-148` `toggleLike()` 后 `isSongLiked()` 读闭包旧值，上报 action 反了。`KimiCard.tsx:121` 注释误导（说"F1 已修复"但只修了一半）。

**改法**（2 处）：

1. `handleLike` 用 `getState()` 读最新值绕过闭包：
```ts
const handleLike = useCallback(() => {
  if (!currentSong) return
  toggleLike(currentSong.id)
  // F1 真正修复：toggleLike 同步更新 store，但组件闭包里的 likedSongIds 还是旧值。
  // 用 getState() 读最新值，绕过闭包陈旧。
  const likedNow = useRadioStore.getState().likedSongIds.includes(currentSong.id)
  if (likeDebounceRef.current) clearTimeout(likeDebounceRef.current)
  likeDebounceRef.current = setTimeout(() => {
    if (sessionId) {
      fetch(`${API_BASE}/api/v1/radio/${sessionId}/feedback`, {
        method: 'POST',
        headers: { ...getApiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          action: likedNow ? 'like' : 'unlike',   // ← 用最新值
        }),
      }).catch(() => { /* 静默失败 */ })
    }
  }, 500)
}, [currentSong, toggleLike, sessionId, sessionToken])  // ← 去掉 isSongLiked 依赖（不再用闭包值）
```

2. **改掉误导性注释**（`KimiCard.tsx:121-123`）：
```ts
// 改前（误导）：
// F1 修复：订阅 likedSongIds 数组（触发 re-render）而非 isLiked 函数引用
const likedSongIds = useRadioStore((state) => state.likedSongIds)
const isSongLiked = (id: string) => likedSongIds.includes(id)

// 改后（准确）：
// 订阅 likedSongIds 触发 re-render（UI 即时更新爱心状态）。
// 注意：handleLike 上报时不能读本闭包的 likedSongIds（toggleLike 后闭包陈旧），
// 必须用 useRadioStore.getState() 读最新值。见 handleLike。
const likedSongIds = useRadioStore((state) => state.likedSongIds)
const isSongLiked = (id: string) => likedSongIds.includes(id)
```

**验证**：
- 点收藏 → 后端日志 `Feedback: like`（不是 unlike）
- 取消收藏 → 后端日志 `Feedback: unlike`
- 快速连点（debounce 内）→ 只发最后一次，action 与最终 UI 状态一致

**新增测试**：`KimiCard.test.tsx`（如不存在则加）断言 toggleLike 后上报的 action 与新状态一致（mock fetch 捕获 body）。

### P0b-4. tasteCache 按 limit 分 key（评审 B6）

**问题**：`tasteCache.ts:27` 单槽缓存，`getLikedArtists(3)`（next）和 `getLikedArtists(5)`（chat）共用，limit 参数失效。

**改法**：缓存 key 改为 `kind:limit`：
```ts
class TasteCache {
  // key = `liked:${limit}` 或 `disliked:${limit}`
  private cache = new Map<string, CacheEntry<ArtistTaste>>()

  private isExpired<T>(entry: CacheEntry<T> | null): boolean {
    return !entry || entry.expiresAt < Date.now()
  }

  async getLikedArtists(limit = 5): Promise<ArtistTaste> {
    const key = `liked:${limit}`
    const entry = this.cache.get(key)
    if (this.isExpired(entry ?? null)) {
      this.cache.set(key, {
        value: getLikedArtists(limit),
        expiresAt: Date.now() + TTL_MS,
      })
    }
    return this.cache.get(key)!.value
  }

  async getDislikedArtists(limit = 3): Promise<ArtistTaste> {
    const key = `disliked:${limit}`
    const entry = this.cache.get(key)
    if (this.isExpired(entry ?? null)) {
      this.cache.set(key, {
        value: getDislikedArtists(limit),
        expiresAt: Date.now() + TTL_MS,
      })
    }
    return this.cache.get(key)!.value
  }

  invalidate(): void {
    this.cache.clear()
  }
}
```

**验证**：
```bash
# 30s 内先调 getLikedArtists(3) 再调 getLikedArtists(5)，返回不同长度数组
```

**新增测试**：`tasteCache.test.ts` 加不同 limit 不互相污染的用例。

---

## P1 — DSpro 做（正确性 + 资源泄漏）

### P1-1. fetchWithTimeout 补 body 超时 + 5xx 计入熔断（评审 B2/B3）

**问题**：
- `fetchWithTimeout.ts:141` finally 立即 clearTimeout，resolve 后调方读 body 无超时保护（TTS 大 base64 慢流可挂死）
- `line 121` 只在 `res.ok` 时重置熔断，5xx 既不重置也不计数（catch 才计数），上游持续 500 熔断器永不 OPEN

**改法**：

1. body 超时（2 选 1，推荐方案 A）：
   - **方案 A（推荐）**：不在 fetchWithTimeout 内覆盖 body 读取。改为导出一个包装函数 `readBodySafely(res, timeoutMs)`，调方读 body 时用它。这样 fetchWithTimeout 职责清晰（只管响应头），body 读取由调方显式选择是否加超时。
   - 方案 B：把 clearTimeout 移到 finally 之外——但 fetch resolve 后 signal 仍生效，调方读 body 时超时能 abort。问题：body 读一半 abort 会让 res.json() 抛错，调方要处理。

2. 5xx 计入熔断失败：
```ts
// fetchWithTimeout.ts:120 改后
if (res.ok) {
  // 2xx/3xx：重置熔断
  if (circuit.failures > 0) {
    logger.info('Circuit breaker CLOSED', { host, previousFailures: circuit.failures })
  }
  circuit.state = 'CLOSED'
  circuit.failures = 0
} else if (res.status >= 500) {
  // 5xx：计入失败（上游异常）
  circuit.failures++
  circuit.lastFailureTime = Date.now()
  if (circuit.failures >= DEFAULT_CIRCUIT_CONFIG.failureThreshold) {
    circuit.state = 'OPEN'
    logger.warn('Circuit breaker OPENED (upstream 5xx)', { host, failures: circuit.failures, status: res.status })
  }
}
// 4xx：不动熔断（客户端错误，不算上游故障）
return res
```

3. `index.ts:136` 全局 30s 超时回调加 `req.destroy()`（或对 ASR 路由放宽到 70s）：
```ts
req.setTimeout(30000, () => {
  if (!res.headersSent) {
    res.status(408).json({ success: false, error: { message: 'Request timeout', code: 'REQUEST_TIMEOUT' } })
  }
  req.destroy()   // ← 新增：真正中止 handler，避免后续写响应抛 "headers already sent"
})
```

**新增测试**：
- 慢 body 流超时用例（mock res.json 慢读）
- 上游持续 500 → 熔断 OPEN 用例

### P1-2. 前端四处竞态/泄漏修复（评审 F2/F3/F5 + 规划者补充）

#### F2：useAudioPlayer QQ 监听泄漏（规划者补充的 ref 模式）

**问题**：`useAudioPlayer.ts:77-86` async 分支 `setupAudio` 注册监听，cleanup 只是 `cancelled=true`，没调清理函数。

**改法**（ref 存 cleanup）：
```ts
const cleanupRef = useRef<(() => void) | null>(null)

useEffect(() => {
  if (!currentSong) return
  let cancelled = false
  // ... setup

  if (currentSong.playUrl) {
    cleanupRef.current = setupAudio(currentSong.playUrl)
    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  } else {
    ;(async () => {
      // ... fetch playUrl
      if (!cancelled && data.url) {
        useRadioStore.getState().setCurrentSong({ ...currentSong, playUrl: data.url })
        cleanupRef.current = setupAudio(data.url)
      }
    })()
    return () => {
      cancelled = true
      cleanupRef.current?.()      // 关键：async 里存的 cleanup 也能被调到
      cleanupRef.current = null
    }
  }
}, [currentSong, nextSong, connectAnalyser])
```

#### F3：useTTS 加 AbortController（规划者补充，复用 chat 防重入模式）

**问题**：`useTTS.ts:84` fetch 无 AbortController，换歌时旧 transition 的 fetch resolve 后 playAudio，双音轨叠加。

**改法**（参考 `useSession.ts` 的 `chatAbortRef` 模式）：
```ts
// useTTS.ts 顶部新增
const ttsAbortRef = useRef<AbortController | null>(null)

// speak 内，stop() 之后、fetch 之前：
const speak = useCallback(async (text, options) => {
  if (!text?.trim()) return null
  stop()
  // 取消上一个在途的 tts fetch（防"旧串词复活"）
  if (ttsAbortRef.current) ttsAbortRef.current.abort()
  const controller = new AbortController()
  ttsAbortRef.current = controller

  try {
    const res = await fetch(`${API_BASE}/api/v1/dj/tts`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,   // ← 新增
    })
    if (res.ok) {
      const data = await res.json()
      if (data.audio_url) {
        const url = data.audio_url.startsWith('http') ? data.audio_url : `${API_BASE}${data.audio_url}`
        return playAudio(url)
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null  // 静默
    logger.warn('[TTS] /dj/tts failed, fallback to speechSynthesis', { error: err instanceof Error ? err.message : String(err) })
  }
  return playSpeechSynth(text, handlersRef.current)
}, [stop])

// stop() 里也 abort：
const stop = useCallback(() => {
  if (ttsAbortRef.current) {
    ttsAbortRef.current.abort()
    ttsAbortRef.current = null
  }
  // ... 原有 audio.pause / speechSynthesis.cancel
}, [])
```

#### F5：PlayerBar 换歌重置 localTime

**问题**：`PlayerBar.tsx:16-18` localTime 只 mount 时 init（依赖 `[]`），换歌不重置。

**改法**：监听 `currentSong?.id` 变化时重置：
```ts
const currentSong = useRadioStore((state) => state.currentSong)

useEffect(() => {
  // 换歌时从 store 重置 localTime（store currentTime 在换歌时归零）
  setLocalTime(useRadioStore.getState().currentTime)
}, [currentSong?.id])   // ← 换歌触发
```

**每处补回归测试**（参考现有 `useAudioPlayer.sideffects.test.ts` 模式）。

### P1-3. UPnP 下线决断（评审 B4，规划者要求连带清理）

> 决断：**下线**。理由：play() 是 stub 却返回 `{ok:true,...}` 谎报成功；且 SSRF 私网拦截与 UPnP 天然冲突，实现前必须先补 ssrfGuard 的 DNS 解析校验，成本不低。

**删除清单**（铁律 6：grep 全项目含 .md）：
- `backend/src/routes/upnp.ts`
- `backend/src/services/upnp.ts`
- `backend/src/index.ts:156` 的 `app.use('/api/v1/upnp', upnpRoutes)` + 顶部 import
- `backend/package.json` 的 `"upnp-device-client": "^1.0.2"` 依赖
- `npm install` 清理 node_modules

**grep 确认**：
```bash
grep -rn "upnp\|UPnP\|upnp-device-client" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx"
# 应只剩（删完后）零匹配
grep -rn "upnp\|UPnP" docs/ HANDOVER.md ARCHITECTURE.md AGENTS.md
# 文档里的引用标注"已下线（2026-07-17）"或删除
```

---

## P2 — 任意执行者（仓库卫生）

### P2-1. 构建配置 + gitignore（评审 C2/C3）

1. `backend/tsconfig.json` exclude 加 test：
```json
{
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```
验证：`rm -rf dist && npm run build`，确认 `dist/` 不再含 `*.test.js`。

2. `.gitignore` 补：
```
*.tar.gz
*.pid
backend/static/audio/
frontend/public/sw.js
frontend/public/workbox-*.js
backend/nul
frontend/nul
```

3. `git rm --cached` 清理已跟踪的构建产物：
```bash
git rm --cached HANDOVER.tar.gz backup_src_20260625_113910.tar.gz
git rm --cached frontend/frontend.pid
git rm --cached -r backend/static/audio/
git rm --cached frontend/public/sw.js frontend/public/workbox-*.js
git rm --cached backend/nul frontend/nul 2>/dev/null
```
**注意**：git 历史中的体积仍在，彻底清除要 filter-repo（暂缓，单用户项目不急）。

### P2-2. 死代码 + 配置清理（评审 B7/C6）

- 删 `backend/src/config.ts:37` 的 `neteaseCookie`（全代码无引用，死配置）
- 删 `db/index.ts` 的 `getSongs/setSongs`（仅测试在用，死代码；同步删对应测试）
- `qqSource.ts:20` 的 `WEBBRIDGE_URL` 收进 `config.ts`
- `.env.example` 补齐 `CORS_ORIGINS`、`API_BASE_URL`、`WEBBRIDGE_URL`、`LOG_LEVEL`、`LOG_RETENTION_DAYS`
- 删 `@types/ws` 残留依赖（无 ws 代码）
- 根 `package.json` 补 `test`、`lint` 聚合脚本

### P2-3. 文档更新（评审 C4/C5）

- `README.md`：测试数更新为 277（backend）/ 179（frontend）；删除"5 个既有 tsc 错误"等过时描述；端口口径统一 8001/3000
- `HANDOVER.md`：同步上述数字；标注本轮修复完成
- `ARCHITECTURE.md`：加"本文档已过时"头注（或重写——模型 MiMo 非 Claude、端口 8001/3000、路由全部 `/api/v1/*`、无 WebSocket）

---

## 顺带提醒（backlog，不阻塞）

以下项不纳入本轮，列入 backlog（Kimi 评审 🔵 建议部分）：

- `sessionAuth.ts` 改为仅 header 传 token（不接受 query）
- `generalLimiter` 排除 `/static` 和 `/health`
- 错误响应结构统一到 `{error:{message,code}}`（`qqmusic.ts:48`、`musicSource.ts:49`）
- `djPersona.ts:29` POST /generate 补 zod 校验
- `log.ts:36` 过滤 msg 内换行防日志伪造
- `radio.ts` session 消息 `timestamp` 填真实时间（当前恒 0）
- 补 SIGTERM/SIGINT 优雅关闭
- `manifest.json` theme_color 与 layout `#06060a` 对齐
- `useSession.ts` 的 `setHandlers` 挪进 useEffect
- settings 页试听加竞态防护
- 打字机文本对屏幕阅读器 `aria-hidden`
- `planner.ts` 补测试（并发去重 + 缓存）
- `radio.ts:280/399` sanitize 重复调用合并
- feedback 表 TTL 清理任务
- `app.set('trust proxy', 1)`（确认部署在反代之后再加）
- `ssrfGuard` 补 DNS 解析校验（`dns.lookup` 验真实 IP + IPv6 方括号形态）

---

## 验收标准

| 阶段 | 验收项 |
|------|--------|
| P0a | tsc 双零 / 测试 ≥277+179 / grep 无残留 / F4 全屏可 seek / aiLimiter 只挂 POST |
| P0b | R1 >1MB ASR 不被 413 / R2 production 无 key 启动抛错 / F1 上报 action 正确 / B6 不同 limit 不污染 |
| P1 | fetchWithTimeout body 超时 / 5xx 熔断 OPEN / F2 无监听泄漏 / F3 换歌无双音轨 / F5 换歌时间重置 |
| P2 | dist 无 *.test.js / .gitignore 完整 / git rm 构建产物 / UPnP 零残留 / 文档数字准确 |

---

## 前科提醒（DSpro 专属）

1. **F1 闭包陈旧是本轮最容易踩的坑** —— `toggleLike` 同步更新 store，但组件闭包读不到新值。必须用 `useRadioStore.getState()` 读最新值，不能用 hook 返回的 `isSongLiked`。参考 chat 防重入的 `pendingId` 模式（也是用 getState 绕闭包）。

2. **F3 复用 chat 防重入的 AbortController 模式** —— 你上次做的 `chatAbortRef`（提交 `b32ad68`）是同一种问题。F3 给 useTTS 加 `ttsAbortRef`，catch 里处理 AbortError 静默 return null。不要重新发明轮子。

3. **F2 的 ref 存 cleanup 是唯一正确模式** —— effect 的 cleanup 是同步的，不能等 async。必须用 `cleanupRef.current = setupAudio(...)` 存返回的清理函数，sync cleanup 里 `cleanupRef.current?.()`。`cancelled = true` 单独不够。

4. **R2 方向别搞反** —— 不是"非 dev 拒绝启动"，是"显式配 production 才严格，没配就警告但能跑"。单人开发项目，忘配环境变量起不来体验极差。

5. **铁律 6（删功能 grep 全项目含 .md）** —— UPnP 下线时，`index.ts` 的路由注册 + import + package.json 依赖 + 文档引用全要清。上次删 MediaSession 漏了 HANDOVER.md 5 处引用，这次别重蹈。

6. **B1 aiLimiter 抽共享模块** —— 当前 aiLimiter 定义在 `index.ts`，拆到路由级需要抽到 `middleware/aiLimiter.ts`（或类似），两个路由文件 import 同一个实例。别各自 new 一个（限流配额会翻倍）。

---

*本方案整合 Kimi 评审 + 规划者核实 + 4 点调整。P0a 规划者自做，P0b+P1 交 DSpro，P2 任意。做完项目进入"日常使用"阶段。*
