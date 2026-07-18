---
author: 规划者（ZCode）
task: 给 KIMI 批量执行后续 13 项的提示词（用户中转粘贴用）
created: 2026-07-18
---

# 给 KIMI 的批量执行提示词

> **使用说明**（给用户）：
> 1. 把下面代码块整段复制，粘贴给 KIMI 作为本轮的启动指令
> 2. KIMI 会按"批 0（提交 P0b-1）→ 批 1（P0b-2~4）→ 批 2（P1）→ 批 3（P0a）→ 批 4（P2）"顺序做
> 3. 每批做完 KIMI 会 commit + push + 写报告，到时你告诉 ZCode "检查 docs/KIMI/reports/exec-xxx-batch-...-KIMI.md"
> 4. 如果 KIMI 中途卡住（测试失败/规格不清），它会停下来问你，你再转给 ZCode

---

## 提示词（复制以下整块粘贴给 KIMI）

```
用户决定批量流：你一次性做完全部剩余 13 项（P0b-2~4 + P1 全部 5 项 + P0a 全部 5 项 + P2 全部 3 项），最后统一交付。

## 必读文档（动手前先读，严格按顺序）

1. D:\Coder\mimo-radio\docs\KIMI\batch-execution-playbook-2026-07-18.md —— 批量流执行手册（必读，含 5 条强制纪律 + 13 项清单 + 验收标准）
2. D:\Coder\mimo-radio\docs\KIMI\fix-plan-integrated-2026-07-17.md —— 整合方案（每项的详细规格）
3. D:\Coder\mimo-radio\docs\KIMI\review-supplement-2026-07-17.md —— 规划者核实 + 4 点调整（冲突以此为准）
4. D:\Coder\mimo-radio\docs\KIMI\review-p0b-1-exec-2026-07-18.md —— P0b-1 复核结论（你的标杆，参考这个质量做后续）
5. D:\Coder\mimo-radio\COLLABORATION.md §10.3 六铁律 + §10.6 案例索引（12 个前人踩的坑）

## 批量流的 5 条强制纪律（违反任一 = 返工）

1. **分批 commit，不累积**：批 0（P0b-1 提交）/ 批 1（P0b-2~4）/ 批 2（P1）/ 批 3（P0a）/ 批 4（P2），5 个独立 commit，不是一个
2. **每项做完立即跑验收命令**：不能"全部做完再统一验证"，失败就停下修复
3. **遇到规格模糊/矛盾，停下问**：不闷头做、不自作主张改规格。通过用户转给 ZCode
4. **每批一份报告**（不是每项一份，也不是全部一份）：4 批 = 4 份报告，放 docs/KIMI/reports/exec-{p0b|p1|p0a|p2}-batch-2026-07-18-KIMI.md
5. **高风险项必须 E2E 验证**（铁律 5，不接受"待实测"）：P1-2a（监听泄漏）/ P1-2b（TTS）/ P0a-3（全屏 seek）/ P0b-2（鉴权 3 场景启动）

## 执行顺序（严格按此）

### 批 0：提交 P0b-1（已做完未提交）
当前工作区有 P0b-1 改动 + 4 份 docs/KIMI 文档 + COLLABORATION §10.6 案例。立即 commit + push。
提交信息：
```
fix(backend): P0b-1 dj 路由路径级 body-parser + 413 识别（R1）

- index.ts: /api/v1/dj/asr 25mb + /api/v1/dj/analyze-image 12mb（全局 1mb 之前）
- error.ts: 识别 entity.too.large → 413 PAYLOAD_TOO_LARGE
- error.test.ts: +4 用例

基线 277→281，tsc 零错误。详见 docs/KIMI/reports/exec-p0b-2026-07-18-KIMI.md
```
文档变更（COLLABORATION 案例 + 4 份 docs/KIMI 评审/复核/裁决文档 + 批量手册）一并入库，可以同 commit 或拆 docs commit。

### 批 1：P0b 安全 + 数据污染（3 项，commit 1 个）
- **P0b-2 R2 鉴权 fail-closed**（规格 line 194-241）
  - 方向调整（review-supplement 调整 1）：显式配 NODE_ENV=production 才严格，没配就警告但能跑
  - 3 场景必测：dev 放行+警告 / prod 无 key 抛错 / prod 有 key 正常
  - 新增 sessionToken.test.ts production 无 secret 抛错用例
- **P0b-3 F1 收藏反向 + 改误导注释**（规格 line 243-293）
  - handleLike 用 useRadioStore.getState().likedSongIds.includes(id) 读最新值
  - 改掉 KimiCard.tsx:121 误导注释
  - 参考模式：chat 防重入 pendingId（提交 b32ad68）
  - 新增 KimiCard.test.tsx
- **P0b-4 B6 tasteCache 分 key**（规格 line 295-348）
  - key 改 liked:${limit} / disliked:${limit}，用 Map 替代单槽
  - 新增 tasteCache.test.ts
批 1 验证：cd backend && npm test && npx tsc --noEmit + cd frontend 同（基线 ≥281/179+新增）
批 1 报告：docs/KIMI/reports/exec-p0b-batch-2026-07-18-KIMI.md

### 批 2：P1 正确性 + 资源泄漏（5 项，commit 1 个）
- **P1-1 B2 fetchWithTimeout**（line 350-398）：readBodySafely 包装 + 5xx 计入熔断 + req.destroy()
- **P1-2a F2 useAudioPlayer 监听泄漏**（line 399-450）：cleanupRef 模式（cancelled=true 不够）
- **P1-2b F3 useTTS AbortController**（line 450-480）：复用 chatAbortRef 模式（提交 b32ad68）
- **P1-2c F5 PlayerBar 换歌重置**（line 480-500）：监听 currentSong?.id 重置 localTime
- **P1-3 UPnP 下线**（line 503-525，铁律 6）：删 routes/services/index.ts 注册/package.json 依赖 + grep .md
批 2 验证：后端+前端 npm test + tsc + E2E（播放+换歌+TTS）
批 2 报告：docs/KIMI/reports/exec-p1-batch-2026-07-18-KIMI.md

### 批 3：P0a 机械清理（5 项，commit 1 个）
- **P0a-1 B5 helmet 测试同步**（line 35-68）：抽 config/securityHeaders.ts 单一来源
- **P0a-2 B7 端口口径**（line 70-80）：.env.example PORT=8001 + CORS 补 3000 + start 脚本 + AGENTS.md
- **P0a-3 F4 全屏 seek**（line 82-114，P0 提级）：FullscreenPlayer 加 onSeek prop + page.tsx 传 handleSeek
- **P0a-4 B1 aiLimiter 拆挂载**（line 116-143）：抽 middleware/aiLimiter.ts，只挂 POST 路由
- **P0a-5 死代码清理**（line 145-155）：TtsEngineSwitcher + MarkdownText（grep 确认无引用）
批 3 验证：后端+前端 npm test + tsc + E2E（全屏 seek）
批 3 报告：docs/KIMI/reports/exec-p0a-batch-2026-07-18-KIMI.md

### 批 4：P2 仓库卫生（3 项，commit 1 个）
- **P2-1 构建配置 + gitignore**（line 526-556）：tsconfig exclude test + gitignore 补 + git rm --cached 构建产物
- **P2-2 死配置 + app 工厂函数**（line 558-566）：删 neteaseCookie/getSongs/setSongs + WEBBRIDGE_URL 收 config + .env.example 补齐 + app 工厂函数抽取（B5 根治）
- **P2-3 文档更新**（line 567-580）：README/HANDOVER/ARCHITECTURE
批 4 验证：find backend/dist -name "*.test.js" | wc -l → 应为 0
批 4 报告：docs/KIMI/reports/exec-p2-batch-2026-07-18-KIMI.md（追加整体总结 + 测试基线变化 + 给 ZCode 的复核建议）

## 关键纪律（再次强调）

1. **行号漂移**：每次改之前 Read 确认当前行号，绝不凭规格行号改。index.ts 会被改 4 次（P0b-1/P0b-2/P1-1/P0a-4），每次基于最新状态
2. **冲突仲裁**：fix-plan-integrated-2026-07-17 vs review-supplement 冲突时以 review-supplement 为准（4 点调整：R2 方向反转 / F4 提级 / F1 改注释 / UPnP 连带清理）
3. **停下问的触发条件**（playbook §四）：规格跟代码对不上 / 矛盾 / 边界不清 / 想偏离规格 / 测试失败 30 分钟定位不出 / E2E 环境不具备。立即停下问，不闷头做
4. **逃生通道**（playbook §六）：做到一半卡住，提交已验证通过的批次 + 写阶段性报告。半成品比全烂强
5. **高风险项 E2E**（铁律 5）：P1-2a/b、P0a-3、P0b-2 必须真实跑，不接受"待实测"
6. **不重新发明轮子**：F3 复用 chat 防重入的 chatAbortRef 模式（提交 b32ad68），F1 复用 pendingId getState 模式

## 报告规范

每批报告 6 节（COLLABORATION §四）：摘要 / 改动明细（文件:实际行号）/ 验证（命令+输出）/ 偏差 / 自评 / 铁律回顾。
署名三要素：文件名 -KIMI 结尾 + 头部 author: KIMI + 尾部 *报告由 KIMI 生成。*

## 完成后

告诉用户"全部做完了，让 ZCode 复核 docs/KIMI/reports/exec-{p0b|p1|p0a|p2}-batch-2026-07-18-KIMI.md"。ZCode 会按 playbook §七 的策略逐项核实 + 打分到项。

## 当前基线（不可降级）

- 后端：281 passed（P0b-1 已合入未提交，批 0 提交后正式生效）
- 前端：179 passed
- tsc 双零
- Git：master 分支，trunk-based

## 现在开始

按批 0 → 1 → 2 → 3 → 4 顺序。先 commit 批 0（P0b-1 + 文档），然后开始批 1。动手前如果对任何一项的规格理解不确定，先问。
```

---

## 后续协作话术（给用户用）

### 话术 1：派活（粘贴上面的提示词后，等 KIMI 读完汇报）

KIMI 读完会汇报"我理解批量流 5 纪律，先 commit 批 0..."。这时你只需说：
```
开始吧。按批 0 → 1 → 2 → 3 → 4 顺序。卡住就停下来问我。
```

### 话术 2：KIMI 做完一批后让 ZCode 复核

每批做完 KIMI 会报告"批 X 做完了"。你贴给 ZCode：
```
KIMI 批 X 做完了，检查 docs/KIMI/reports/exec-{批次}-batch-2026-07-18-KIMI.md + git diff。
```
ZCode 按 playbook §七 逐项核实 + 打分到项 + 写前科提醒。

### 话术 3：KIMI 中途卡住转给 ZCode

如果 KIMI 说"批 X 的某项规格不清/测试失败定位不出"，你转给 ZCode：
```
KIMI 在批 X 的 [某项] 卡住了，说 [问题描述]。你怎么看？
```
ZCode 给出裁决或方案调整，你再转回 KIMI。

---

## 提示词设计说明（给用户参考，不用贴给 KIMI）

1. **批量流必须分批 commit**——这是对"一次性做完"最重要的约束。13 项一个 commit 是不可接受的（无法追溯、回滚难）。5 个 commit 既保留了批量流的效率，又有回滚粒度。
2. **5 条纪律前置**——避免 KIMI 重蹈 DSflash 视觉轮的覆辙（多任务单轮漏闭包回归）。
3. **每项给了规格行号**——但不让它凭行号改（强调 Read 确认当前行号）。
4. **E2E 项明确列出**——避免"待实测"（铁律 5）。
5. **逃生通道**——半成品比全烂强。如果 KIMI 做到批 2 卡住，提交批 0+1+已完成的部分批 2，报告卡点。

---

*本提示词由 ZCode 规划者设计，基于 batch-execution-playbook-2026-07-18.md。用户复制代码块粘贴给 KIMI 即可。*
