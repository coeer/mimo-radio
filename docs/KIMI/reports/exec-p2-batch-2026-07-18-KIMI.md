---
author: KIMI
task: 批 4 执行报告——P2-1 构建配置+gitignore / P2-2 死代码+app 工厂 / P2-3 文档（含 13 项整体总结）
created: 2026-07-18
status: DONE
---

# 执行报告：批 4（P2 仓库卫生）+ 批量流整体总结

## 一、执行摘要

| 项 | 内容 | 状态 |
|----|------|------|
| P2-1 | tsconfig 排除测试编译 + .gitignore 补全 + git rm --cached 构建产物 | ✅ dist 0 个 *.test.js（实测） |
| P2-2 | 死配置/死代码清理 + WEBBRIDGE_URL 收 config + .env.example 补齐 + 聚合脚本 + **app 工厂 createApp()** | ✅ |
| P2-3 | README / HANDOVER / ARCHITECTURE 文档更新 | ✅ |

基线变化：后端 289 → **288**（删 getSongs/setSongs 的 1 个测试），前端 **189** 不变，tsc 双零。

## 二、改动明细

### P2-1（构建配置 + gitignore）

| 文件 | 改动 |
|------|------|
| `backend/tsconfig.json` | exclude 加 `src/**/*.test.ts` |
| `.gitignore` | 补 `*.tar.gz` / `*.pid` / `backend/static/audio/` / `frontend/public/sw.js` / `frontend/public/workbox-*.js` |
| git rm --cached | `HANDOVER.tar.gz`、`backup_src_20260625_113910.tar.gz`、`frontend/frontend.pid`、`frontend/public/sw.js`、`frontend/public/workbox-f1770938.js`（`backend/static/audio/` 下已无被跟踪文件；无 nul 文件被跟踪） |

### P2-2（死代码 + 配置 + app 工厂）

| 文件 | 改动 |
|------|------|
| `backend/src/config.ts` | 删 `neteaseCookie`（死配置，全代码零引用）；新增 `webbridgeUrl` |
| `backend/src/services/qqSource.ts` | `WEBBRIDGE_URL` 直读 process.env → `config.webbridgeUrl` |
| `backend/src/db/index.ts` | 删 `getSongs/setSongs`（仅测试在用的死代码）+ 清理 Song import |
| `backend/src/db/index.test.ts` | 同步删 songs describe + setSongs 调用 |
| `backend/.env.example` | 删 NETEASE_COOKIE；补 CORS_ORIGINS / API_BASE_URL / WEBBRIDGE_URL / LOG_LEVEL / LOG_RETENTION_DAYS |
| `backend/package.json` | 删 `@types/ws` 残留依赖（无 ws 代码）；补 `lint` 脚本 |
| 根 `package.json` | 补 `test` / `test:backend` / `test:frontend` / `lint` 聚合脚本 |
| **`backend/src/app.ts`** | **新建**：`createApp()` 工厂——中间件 + 路由全部移入，index.ts 只剩启动流程（鉴权校验/initDb/注册服务/listen） |
| `backend/src/index.ts` | 重写为纯启动层（227 → 102 行） |
| `backend/src/middleware/error.test.ts` | 「body 上限」describe 从镜像复刻改为 **supertest 真实 app**（createApp）——B5 类漂移根治；判定口径：放宽路径 400（zod，证明过了 body-parser）vs 普通路由 413 |

### P2-3（文档）

| 文件 | 改动 |
|------|------|
| `README.md` | 测试徽章 + 测试数 → 288/189（端口此前已是 3000/8001，无"5 个 tsc 错误"残留文字） |
| `HANDOVER.md` | 头部加 2026-07-18 更新块（本批次要点 + 报告索引）；§三 测试状态更新为 288/189 + Git 已接入；§五.11 标注已过时 |
| `ARCHITECTURE.md` | （批 2 已加"已过时"头注，含 UPnP 下线/端口/路由口径） |

## 三、验证结果

```
P2-1 专项：rm -rf backend/dist && npm run build && find dist -name "*.test.js" | wc -l → 0
backend: 32 文件 288 passed，tsc 零错误
frontend: 23 文件 189 passed，tsc 零错误
app 工厂冒烟：重启后端（tsx src/index.ts）→ /health 200 + /api/v1/radio/models 200（启动流程未被拆分破坏）
真实 app 测试：error.test.ts 经 createApp() 验证 2MB→/dj/asr 400 / 2MB→/dj/analyze-image 400 / 2MB→/radio/create 413
```

## 四、与规格的偏差

1. **真实 app 测试的判定口径从 200 改为 400**：createApp 挂的是真实路由（不是镜像 stub），2MB body 过 body-parser 后到路由层被 zod 拒（400）。400 同样证明"没被 413"，且比镜像的 200 更真实。这是工厂化带来的口径变化，非放松。
2. 根 `package.json` 的 `lint` 脚本依赖 backend 新补的 `lint`（`eslint src`）——规格只要求"补聚合脚本"，backend 原本没有 lint 脚本，一并补上。
3. 未做 git filter-repo 清历史体积（规格明示"暂缓"）。

## 五、自评

- **app 工厂的影响面**：index.ts 拆分为 app.ts + index.ts 是本批次最大结构性改动。保护措施：①启动冒烟实测（health + models 200）；②`import { config as ttsConfig }` 重复导入已合并为复用顶部 config；③启动期的动态 import（planner 预热）保持原样未动。
- **createApp 的副作用边界**：工厂不 initDb / 不 listen，但 import 链会加载 config（dotenv）和 db 模块（惰性连接）。测试里 stubEnv('API_KEY','') 防本地 .env 干扰（注释已写明）。
- **songs 表保留**：schema 里的 songs 表未删（getSongs/setSongs 是仅有的读写方，表本身不影响运行；删表属 schema 变更，超出本批范围，留 backlog）。
- **遗留 backlog**（不阻塞）：COLLABORATION §2.4 的测试基线（253/127 + "5 个 tsc 错误"注释）已过时——COLLABORATION 是 ZCode 维护文件，**建议 ZCode 更新为 288/189 双零**；error.ts 的 `/too-large` 直测与真实 app 测试有少量重叠（保留直测因为它不依赖完整 app 链）。

## 六、铁律回顾

| 铁律 | 本批如何遵守 |
|------|-------------|
| 1 资源成对 try/finally | 无新资源分配（error.test.ts 的 stubEnv/unstubAllEnvs + resetModules 在 beforeAll/afterAll 成对） |
| 2 不用复制粘贴做重试 | 无 |
| 3 异步三问 | app 工厂拆分未动启动期 setTimeout 预热逻辑（原样保留其 catch 与注释） |
| 4 替换已验证方案前理解原方案 | index.ts 拆分前完整 Read 227 行，启动顺序（assertSecret → P0b-2 检查 → initDb → 注册服务 → listen）逐行保留；镜像测试替换为真实 app 前先确认判定口径等价性（400 同样证明过 body-parser） |
| 5 性能/E2E 证据 | dist 0 test 文件、启动冒烟均有实测输出（§三） |
| 6 删除功能 grep 全项目 | neteaseCookie/getSongs/setSongs/@types/ws/NETEASE_COOKIE 均先 grep 全 src 确认零引用再删；构建产物 git ls-files 核实后 rm --cached |

---

# 批量流整体总结（13 项 + 批 0）

## 完成情况

| 批次 | 项 | commit | 状态 |
|------|-----|--------|------|
| 批 0 | P0b-1 R1 body 上限（含**纠正 ZCode 规格的挂载顺序错误**，走裁决流程） | `c3096b0` | ✅ A+（ZCode 已复核） |
| 批 1 | P0b-2 鉴权 fail-closed / P0b-3 收藏反向 / P0b-4 tasteCache | `af9e120` | ✅ 含 3 场景启动 E2E |
| 批 2 | P1-1 fetch / P1-2a 监听 / P1-2b TTS / P1-2c PlayerBar / P1-3 UPnP | `540a92d` | ✅ 2 项 E2E 环境不具备（用户已裁决接受替代证据） |
| 批 3 | P0a-1 helmet / P0a-2 端口 / P0a-3 seek / P0a-4 aiLimiter / P0a-5 死代码 | `fe0f166` | ✅ 含 seek/限流 E2E |
| 批 4 | P2-1 构建 / P2-2 死代码+app 工厂 / P2-3 文档 | 本 commit | ✅ |

## 测试基线变化

| 层 | 起始 | 最终 | 净变化 |
|----|------|------|--------|
| 后端 | 277（33 文件） | **288（32 文件）** | +15 新增 −3 删除（upnp 5/songs 1，tasteCache 改写）− 文件合并 1 |
| 前端 | 179（22 文件） | **189（23 文件）** | +10（KimiCard 3 / TTS 3 / PlayerBar 3 / audioPlayer 1） |
| tsc | 双零 | 双零 | 保持 |

## 给 ZCode 的复核建议（重点看）

1. **批 4 的 app 工厂拆分**（`backend/src/app.ts` + `index.ts` 重写）——本批量流最大结构性改动，建议重点核启动顺序与 import 完整性。
2. **批 3 的 aiLimiter `skip: NODE_ENV==='test'`**（规格外补充，报告 §四.1 有论证）——确认这个豁免语义可接受。
3. **批 2 的 2 个 E2E 环境不具备项**（P1-2a QQ / P1-2b TTS）——用户已裁决接受替代证据，复核时确认证据链（单测断言 + 换歌稳定性 E2E）是否足够。
4. **建议更新 COLLABORATION §2.4 测试基线**为 288/189 双零（ZCode 维护文件，KIMI 未擅动）。
5. 偏差汇总：批 1 两处说明（非偏差）、批 2 两处（E2E 环境 + HALF_OPEN 4xx 语义）、批 3 一处（skip）、批 4 两处（400 口径 + backend lint 脚本）——全部已在各报告 §四 声明。

---

*报告由 KIMI 生成。*
