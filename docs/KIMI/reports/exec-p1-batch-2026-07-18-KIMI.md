---
author: KIMI
task: 批 2 执行报告——P1-1 fetchWithTimeout / P1-2a 监听泄漏 / P1-2b TTS 取消 / P1-2c PlayerBar / P1-3 UPnP 下线
created: 2026-07-18
status: DONE_WITH_CONCERNS（2 个高风险 E2E 项环境不具备，见 §四/§五）
---

# 执行报告：批 2（P1 正确性 + 资源泄漏）

## 一、执行摘要

| 项 | 内容 | 状态 |
|----|------|------|
| P1-1 | B2 fetchWithTimeout：5xx 计入熔断 + readBodySafely + req.destroy() | ✅ 单测 +5 |
| P1-2a | F2 useAudioPlayer QQ 监听泄漏（cleanupRef 模式） | ✅ 单测 +1；E2E 环境不具备（QQ 源）⚠️ |
| P1-2b | F3 useTTS AbortController（复用 chatAbortRef 模式） | ✅ 单测 +3；E2E 环境不具备（TTS key 无效）⚠️ |
| P1-2c | F5 PlayerBar 换歌重置 localTime | ✅ 单测 +3（新文件）+ **E2E 实测通过** |
| P1-3 | UPnP 下线（铁律 6） | ✅ 代码零残留 + 文档标注 |

基线变化：后端 286 → **288**，前端 182 → **189**，tsc 双零。

## 二、改动明细

### P1-1（B2 fetchWithTimeout）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `backend/src/utils/fetchWithTimeout.ts` | 熔断分支重写：`res.ok` 重置 / `status>=500` 计入失败达阈值 OPEN / 4xx 不动；新增 `readBodySafely(res, timeoutMs, reader?)` 导出（timer 分配/清理同一 try/finally，超时 cancel 底层流） | 120-138, 146-172 |
| `backend/src/services/mimoTts.ts` | 大 base64 body 读取改 `readBodySafely(res, TTS_TIMEOUT)`（评审点名的挂死场景） | 2, 92-95 |
| `backend/src/index.ts` | 全局 30s 超时回调加 `req.destroy()` | 140-149 |
| `backend/src/utils/fetchWithTimeout.test.ts` | +5 用例（5xx 达阈值 OPEN / 4xx 不计 / 2xx 重置 / readBodySafely 超时取消流 / 正常读取） | 57-107 |
| `backend/src/services/mimoTts.test.ts` | mock 补 `readBodySafely` 直通（修 mock 缺失导出） | 16-21 |

### P1-2a（F2 监听泄漏）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `frontend/src/hooks/useAudioPlayer.ts` | 新增 `cleanupRef`；playUrl 直给分支和 QQ async 分支统一 `cleanupRef.current = setupAudio(...)`，同步 cleanup 调 `cleanupRef.current?.()` 并置 null | 11-15, 56-98 |
| `frontend/src/hooks/useAudioPlayer.sideffects.test.ts` | +1 回归：QQ async 注册监听后换歌，ended/timeupdate/loadedmetadata 各保持 1 份不累积 | 137-168 |

### P1-2b（F3 TTS 取消）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `frontend/src/hooks/useTTS.ts` | 新增 `ttsAbortRef`；speak 内 abort 旧请求 + fetch 带 signal；catch AbortError 静默 return null（**不走 speechSynth 兜底**——否则照样双音轨）；stop() 同步 abort | 35-37, 55-60, 81-111 |
| `frontend/src/hooks/useTTS.test.ts` | +3 用例（fetch 带 signal / 新 speak 取消旧请求且旧请求 null+不兜底 / stop 取消在途） | 176-240 |

### P1-2c（F5 PlayerBar）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `frontend/src/components/PlayerBar.tsx` | 新增 effect 监听 `currentSong?.id` 重置 localTime | 20-24 |
| `frontend/src/components/PlayerBar.test.tsx` | 新建（3 用例：渲染 / tick / 换歌立即重置） | 全文 |

### P1-3（UPnP 下线，铁律 6）

| 操作 | 对象 |
|------|------|
| 删除文件 | `backend/src/routes/upnp.ts`、`backend/src/services/upnp.ts`、`backend/src/services/upnp.test.ts` |
| 摘除注册 | `backend/src/index.ts` import + `app.use('/api/v1/upnp')` |
| 依赖 | `backend/package.json` 删 `upnp-device-client`，npm install 清理 |
| 文档标注 | `HANDOVER.md`（2 处）、`COLLABORATION.md`（待办表 1 处）、`ARCHITECTURE.md`（加"已过时"头注含 UPnP 下线）、`D:\Coder\AGENTS.md`（特性列表标注 mimo-radio 已下线） |

历史报告/方案类文档（docs/**/reports、audits、KIMI 评审系列、claudio-rebuild-plan）保留原文——时点记录不改写。

## 三、验证结果

### 单测 / 类型

```
backend: 33 文件 288 passed（286 - upnp 删除 5 + fetchWithTimeout 新增 5 + 既有调整），tsc 零错误
frontend: 23 文件 189 passed（182 +1 audioPlayer +3 TTS +3 PlayerBar），tsc 零错误
```

### E2E（webbridge 真实浏览器，后端 8001 + 前端 3000 实起）

| 场景 | 结果 |
|------|------|
| 输入心情 → AI 推荐 → 播放（"Can't Get You Out of My Head" NetEase PLAYING） | ✅ |
| **P1-2c：换歌后 PlayerBar 时间**——1:16/3:05 时点 下一首，+1s 采样显示 **0:01/3:30**（新歌+立即重置，不滞留） | ✅ 实测通过 |
| 连续换歌 2 次（"玻璃"→"甲乙丙丁"→ 快速双击 →"100-TizzyT" PLAYING 0:24/3:45） | ✅ 无跳歌/卡死/状态错乱 |
| P1-2a：QQ 歌播放+换歌观察监听累积 | ⚠️ 环境不具备（QQ 源需 y.qq.com 登录态） |
| P1-2b：换歌观察旧串词复活双音轨 | ⚠️ 环境不具备（MiMo TTS 上游 401 Invalid API Key，/dj/tts 全部 500 走 fallback） |

## 四、与规格的偏差

1. **P1-2a / P1-2b 的 E2E 未做真机验证**（纪律 5 的 2 个高风险项）——环境不具备：QQ 源无登录态；MiMo TTS key 被上游拒绝（backend 日志实证 `MiMo TTS error (mimo-tts): 401 Invalid API Key`）。已用单测（P1-2a 监听计数断言、P1-2b AbortController 3 用例）+ 换歌稳定性 E2E 兜底。**已通过后台问题提请用户/ZCode 裁决证据级别**，待答复。除此外无规格偏差。
2. P1-1 熔断重写将 HALF_OPEN 遇 4xx 的行为从"直接 CLOSED"变为"不动"（规格原文"4xx：不动熔断"）——属规格明示，非偏差，在此声明备查。

## 五、自评

- **P1-1**：`readBodySafely` 只迁移了 mimoTts（评审点名的场景）。mimo/netease/qqmusic 等其他调方仍裸读 body——规格方案 A 的定位就是"调方显式选择"，未全量迁移属范围控制；建议 backlog 评估 mimoAsr（大 base64 响应）是否也需要。
- **P1-1**：5xx 计数后 HALF_OPEN 探测再遇 5xx 会重新 OPEN（failures 已≥阈值），行为正确；4xx 在 HALF_OPEN 下保持 HALF_OPEN（下次仍是探测），无副作用。
- **P1-2a**：cleanupRef 单槽——effect 重跑时旧 cleanup 先被调用再被覆盖，时序安全（React cleanup 先于新 effect）；async 竞态由 cancelled 标志守住。
- **P1-2b**：speak 开头 stop() 已 abort 旧 controller，随后 `if (ttsAbortRef.current) abort()` 是双保险（stop 已置 null），冗余但无害。
- **P1-3**：`backend/static/audio/*.mp3` 在批 1 commit 中被清掉一个（运行时产物），P2-1 会 gitignore 该目录根治。
- **环境噪音**：E2E 期间 backend 日志确认 TTS key 无效是既有环境问题，与本次改动无关（mimoTts 代码路径未变请求结构）。

## 六、铁律回顾

| 铁律 | 本批如何遵守 |
|------|-------------|
| 1 资源成对 try/finally | readBodySafely 的 setTimeout/clearTimeout 同一 try/finally；PlayerBar tick/sync clearInterval 成对（原有结构保留）；useAudioPlayer cleanupRef 在 cleanup 调用并置 null |
| 2 不用复制粘贴做重试 | 无重试逻辑 |
| 3 异步三问 | useAudioPlayer async：cancelled 取消 ✓ catch 错误处理 ✓ cleanupRef 释放 ✓；useTTS：AbortController 取消 ✓ AbortError 静默 ✓ stop 释放 ✓；readBodySafely：超时取消流 ✓ reject 错误 ✓ timer 清理 ✓ |
| 4 替换已验证方案前理解原方案 | P1-2a 保留 `cancelled` 标志（防 late resolve 后注册）再叠加 cleanupRef，不是替换是补足；P1-2b 直接复用 b32ad68 已验证的 chatAbortRef 模式未重造轮子 |
| 5 性能/E2E 证据 | P1-2c 换歌重置有真实浏览器实测数据（1:16→0:01）；P1-2a/b 真机 E2E 环境不具备已如实上报（不标"待实测"糊弄，标"环境不具备 + 替代证据 + 待裁决"） |
| 6 删除功能 grep 全项目 | UPnP：代码 grep 零残留（backend/src、frontend/src、package.json）；.md 逐文件处理——状态文档（HANDOVER/COLLABORATION/ARCHITECTURE/AGENTS.md）标注已下线，历史报告类保留时点原文 |

---

*报告由 KIMI 生成。*
