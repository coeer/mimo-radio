# 收尾三件事执行规格：技术债沉淀 + 文档清理 + 全屏歌词沉浸

> **目标**：把项目从"半完成态"收尾到"干净稳定"。三件低成本的事，一轮做完。
> **生成时间**：2026-06-27（规划者）
> **配套**：先读 `COLLABORATION.md`。本规格三件事相互独立，可任意顺序执行。

---

## 〇、为什么先做这三件（不是新功能）

当前项目状态：Bug 1/Bug 2/F1-F6 全部闭环，测试 242/127 全过，tsc 零错误。但有三处"半完成态"：
1. **HANDOVER.md 第五节"待办"整段过时**（createSession 防重入已不是问题、/plan 页面已存在）——下次接手会被误导
2. **F4 isPlaying 架构债没记录**——执行者正确判断"暂缓"，但没落档，下次重启就忘
3. **docs 目录 14 份文件堆积**——历史自测报告和活动方案混在一起，执行者下次开工要花时间分辨

**这三件不修就是隐性成本**： HANDOVER 错信息导致误判、F4 遗忘导致重复踩坑、docs 混乱浪费上下文。先把它们收尾，再开新功能。

---

## S1：重写 HANDOVER.md（技术债沉淀 + 待办更新）

**改文件**：`D:\Coder\mimo-radio\HANDOVER.md`

### S1a：重写第五节"未完成/待办"

**现有问题**（:136-149）：整段过时。
- "createSession 防重入"——已不是问题（实测正常）
- "/plan 页面不存在"——**已存在且完整**（场景 6 验证通过）
- 没提 F4 isPlaying 架构债
- 没提 Bug 2 方案 B 已修

**改法**：整段替换第五节为下面内容（保留章节标题"## 五、未完成 / 待办"）：

```markdown
## 五、未完成 / 待办（按优先级）

> 更新于 2026-06-27。已完成项见第四节"关键技术决策"和本轮 plans。

### 🟡 中优先级（已知技术债，暂缓但有记录）
1. **isPlaying 状态 24+ 写点（F4 架构债）**：8 个文件 24+ 处直接调 `setIsPlaying`，缺仲裁层。当前靠 React 批处理 + Zustand 异步更新兜底，未报告可复现竞态。**触发条件**：出现 TTS resume vs MediaSession 切歌的竞态 bug 时再做架构改造（引入中心化 play/pause action）。
2. **WebSocket 未实现**（视频 WS /stream，当前 HTTP）。
3. **用户品味长期记忆**：feedback 已落库（like/skip/complete），但推荐算法不读 feedback。需把收藏的歌手/风格作为搜索加权。
4. **P2 审查问题**：helmet CSP、颜色对比度（WCAG AA）、next/dynamic 代码分割、独立 ErrorBoundary。

### 🟢 低优先级
5. `useAudioPlayer.sideffects.test.ts` 的 5 个既有 tsc 错误（Song 缺 emotionTags，运行时测试通过）。
6. UPnP / 歌单导入 / 每日规划的端到端测试（依赖外部环境）。
7. ASR / MediaSession 锁屏控制需真实移动设备验证（webbridge 无法模拟）。
8. QQ 音源完整链路需 webbridge 开 y.qq.com tab（未覆盖自测）。
```

**关键改动**：
- 删除"createSession 防重入"（已不是问题）
- 删除"/plan 页面不存在"（已存在）
- **新增 F4 isPlaying 架构债**（最重要——这是本轮发现但暂缓的，必须落档）
- 新增 ASR/QQ 音源盲区（自测发现的覆盖缺口）

### S1b：更新第二节"本轮会话做了什么"为最新状态

HANDORDER 第二节（:22 起）记录的是很早的会话。在末尾追加一段"最新状态（2026-06-27）"：

```markdown
### 阶段 G：体验修复 + 模式扫描（2026-06-27）
- Bug 1 全屏主题闭包修复（FullscreenPlayer useRef）
- Bug 2 点歌一致性架构修复（搜索前置：意图识别→先搜索→真实结果喂AI→newSong=搜索结果[0]）
- F1 收藏爱心即时更新（订阅 likedSongIds 数组）
- F3 REPLAY 错位标记（"(旧解说)"）
- F5 AI 不编造年份（prompt 去年份引导）
- F6 推荐数量不编造（prompt 约束）
- SSRF 端口级白名单（127.0.0.1:10086）
- 测试基线：后端 242 / 前端 127
```

### 验证
- 读 HANDOVER.md，确认第五节不再有过时的"createSession 防重入"/"/plan 不存在"
- grep 确认 "F4" / "isPlaying 24" 出现在第五节（技术债已落档）
- 不需要跑测试（纯文档）

---

## S2：docs 目录清理（归档历史，保留活动）

**当前问题**：`docs/` 下 14 份 .md 混在一起，执行者下次开工要分辨哪些是活动文档、哪些是历史记录。

### S2a：创建归档目录

```bash
mkdir -p /d/Coder/mimo-radio/docs/archive
```

### S2b：移动历史自测报告和评估文档到 archive

以下 10 份是**已完成的历史记录**（自测报告、评估文档），移到 `docs/archive/`：

```bash
cd /d/Coder/mimo-radio/docs
# 历史自测报告（已完成的自测记录）
mv deep-selftest-2026-06-27.md archive/
mv post-uxfix-selftest-2026-06-27.md archive/
mv selftest-report-2026-06-27.md archive/
mv selftest-2026-06-27-real-user-journey.md archive/
mv selftest-2026-06-27-real-user-journey-review.md archive/
mv selftest-2026-06-27-pattern-fixes-review.md archive/
mv selftest-2026-06-27-pattern-fixes-exec-review.md archive/
mv selftest-report-2026-06-27-review.md archive/
# 早期方案（已被后续替代）
mv claudio-rebuild-plan.md archive/
mv claudio-rebuild-plan-v2.1.md archive/
```

### S2c：保留在 docs/ 根的活动文档（不移动）

以下 4 份是**常驻活动文档**，保留在 `docs/` 根：

| 文档 | 为什么保留 |
|------|-----------|
| `claudio-rebuild-plan-v2.2.md` | 视频规格权威文档（对标基准，执行者要查） |
| `selftest-comprehensive.md` | 自测方法论（常驻契约） |
| `selftest-spec.md` | 自测报告规范（常驻契约） |
| `selftest-real-user-journey.md` | 真实用户场景框架（执行者自测时用） |
| `selftest-pattern-scanning.md` | 缺陷模式扫描法（进阶自测方法） |
| `selftest-methodology.md` | 自测方法论早期版（与 comprehensive 重叠，但作为历史方法保留） |

> 注：`selftest-methodology.md` 和 `selftest-comprehensive.md` 内容重叠。**规划者建议**：保留 comprehensive（更新更全），把 methodology 也移到 archive。执行者定，但不建议两份重叠文档都留活动位。

### S2d：plans 目录清理

`docs/plans/` 下 4 份方案：
| 文档 | 状态 | 处理 |
|------|------|------|
| `2026-06-27-bug2-search-first.md` | 已执行完 | 移 archive |
| `2026-06-27-frontend-bugfix-and-ux-roadmap.md` | Part A 已执行，Part B 是路线图 | **保留**（Part B 路线图还有用） |
| `2026-06-27-next-priorities.md` | 已执行（优先级梳理完成） | 移 archive |
| `2026-06-27-pattern-fixes-exec.md` | 已执行完 | 移 archive |

```bash
cd /d/Coder/mimo-radio/docs/plans
mv 2026-06-27-bug2-search-first.md ../archive/
mv 2026-06-27-next-priorities.md ../archive/
mv 2026-06-27-pattern-fixes-exec.md ../archive/
# 保留 frontend-bugfix-and-ux-roadmap.md（Part B 路线图）
```

### 验证
- `ls docs/*.md` 应只剩 5-6 份活动文档
- `ls docs/archive/*.md` 应有 ~13 份历史文档
- `ls docs/plans/*.md` 应只剩 frontend-bugfix-and-ux-roadmap.md
- 不需要跑测试（纯文件移动）

---

## S3：全屏歌词沉浸（无 LRC 不塞 DJ 解说）

**改文件**：`frontend/src/components/FullscreenPlayer.tsx`

### 现状
`FullscreenPlayer.tsx:232-277` 的歌词区三态：
1. 有 LRC → 真实歌词逐句高亮
2. LRC 加载中 → "歌词加载中..."
3. **无 LRC → 降级显示 DJ 解说**（:259-276）
4. 都没有 → "这首歌还没有 DJ 解说"

**问题**：第 3 态把 DJ 解说（换歌时的串词）当歌词塞进歌词区，体验割裂——用户想看歌词，看到的是 DJ 的"过渡解说"，不是歌词。

### 改法
`FullscreenPlayer.tsx:259-276`，把"无 LRC 降级 DJ 解说"分支改成"专注听音乐"的沉浸态：

```tsx
// 改前（:259-276 附近）
) : lines.length > 0 ? (
  // LRC 确认无歌词，降级 DJ 解说
  lines.map((line, i) => (...))
) : (
  <div className="text-center text-[#999] text-[13px] py-10">
    这首歌还没有 DJ 解说
  </div>
)

// 改后：无 LRC 时显示沉浸态（大封面提示 + 专注听音乐），不塞 DJ 解说
) : (
  // LRC 确认无歌词：不塞 DJ 解说当歌词（体验割裂），显示沉浸态
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <svg className="w-12 h-12 mb-4 text-[#ccc]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h10v9a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h2v6z" />
    </svg>
    <p className="text-[14px] text-[#666] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
      这首歌暂无歌词
    </p>
    <p className="text-[11px] text-[#999]">
      闭上眼，专注听音乐吧
    </p>
  </div>
)
```

**关键变化**：
- 删除 `lines.length > 0 ? (DJ 解说)` 这个中间分支
- 无 LRC → 直接显示"暂无歌词，专注听音乐"的沉浸态（带音符图标）
- DJ 解说不再被当歌词塞进歌词区

**注意**：
- `lines` 变量（来自 `useLyricHighlight`）在这个分支不再被使用，确认没有"已声明未使用"的 tsc 报错。如果 tsc 报 `lines` unused，把 useLyricHighlight 的调用也一起删（它只为这个分支服务）。
- 检查 `currentIndex`/`renderLine`/`speaker` 是否还有其他使用点，如果只有这个分支用，一并清理。

### 验证
```bash
cd /d/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127
# E2E：播放一首纯音乐（无 LRC）→ 进全屏 → 歌词区显示"暂无歌词，专注听音乐"+音符图标，不显示 DJ 解说
```

---

## 验证清单（三件事都做完）

```bash
# S1 HANDOVER
grep -E "F4|isPlaying 24" HANDOVER.md   # 应命中（技术债已落档）
grep -E "createSession 防重入|/plan.*不存在" HANDOVER.md   # 应无命中（过时项已删）

# S2 文档清理
ls docs/*.md | wc -l          # 应 ≤6（活动文档）
ls docs/archive/*.md | wc -l  # 应 ~13（历史归档）
ls docs/plans/*.md            # 应只剩 frontend-bugfix-and-ux-roadmap.md

# S3 全屏歌词
cd frontend && npx tsc --noEmit && npx vitest run   # ≥127，零错误
```

---

## 执行检查清单

- [ ] S1a：HANDORDER 第五节重写（删过时项 + 加 F4 技术债 + 加盲区）
- [ ] S1b：HANDORDER 第二节追加"阶段 G 最新状态"
- [ ] S2a：创建 docs/archive 目录
- [ ] S2b：移动 10 份历史自测/评估文档到 archive
- [ ] S2c：确认 docs/ 根只剩 5-6 份活动文档
- [ ] S2d：移动 3 份已执行方案到 archive，保留 roadmap
- [ ] S3：FullscreenPlayer 无 LRC 分支改为沉浸态（删 DJ 解说降级）
- [ ] S3 验证：tsc 零错误 + 前端测试 ≥127
- [ ] 全局：HANDORDER grep 确认 F4 落档 + 过时项删除

---

## 给执行者的提醒

1. **S1 是最重要的**。HANDORDER 是下次接手的第一份文档，过时信息会直接误导。**重写第五节时，对照本规格给的最新内容，逐字核对**——别保留任何过时的"createSession 防重入""/plan 不存在"。

2. **S2 移动文件用 `mv` 不是 `cp`**。移动后 `docs/` 根应该"清爽"——一眼能看出哪些是活动文档。**不要删任何文件**（历史归档保留，移走即可）。

3. **S3 删 DJ 解说降级分支后，检查 tsc 是否报 `lines` unused**。如果 useLyricHighlight 只为这个分支服务，连 hook 调用一起删。**不要留死代码**。

4. **三件事做完后，docs 目录应该是这个结构**：
   ```
   docs/
   ├── claudio-rebuild-plan-v2.2.md     # 视频规格（常驻）
   ├── selftest-comprehensive.md        # 方法论（常驻）
   ├── selftest-spec.md                 # 报告规范（常驻）
   ├── selftest-real-user-journey.md    # 场景框架（常驻）
   ├── selftest-pattern-scanning.md     # 模式扫描（常驻）
   ├── plans/
   │   └── 2026-06-27-frontend-bugfix-and-ux-roadmap.md  # Part B 路线图
   └── archive/                          # 历史归档（~13 份）
   ```

5. **S1 的 F4 描述要精确**："24+ 写点 + 缺仲裁层 + 当前靠批处理兜底 + 触发条件是竞态 bug"——这四要素缺一不可，否则下次接手不知道为什么暂缓、什么时候该修。

---

*本规格是收尾任务。做完后项目进入"干净稳定"状态：HANDORDER 准确、docs 清爽、全屏歌词沉浸。之后再开新功能（DJ 人格/主题统一/品味记忆）就有了干净的地基。*
