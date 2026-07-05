---
author: MiNiMax
task: 第4轮-序6D 独立 ErrorBoundary 每路由
created: 2026-07-05
---

# 执行报告：每路由独立 ErrorBoundary（第4轮-序6D）

## 一、执行摘要

按规格在 4 个路由（首页 + /plan + /profile + /settings）各自包一层 ErrorBoundary，保留 layout.tsx 顶层 ErrorBoundary 作为最后兜底。同时给 `ErrorBoundary` 组件补充了 `onError` 可选 prop，且 `onError` 自身抛错会被 try/catch 兜底，不会让 ErrorBoundary 二次崩。新增 `ErrorBoundary.test.tsx`（5 case，覆盖 happy path / 默认 fallback / 自定义 fallback / onError 调用 / onError 容错）。tsc 零错误，vitest 22 文件/173 测试全部通过（baseline 168 → 173，增量 5）。

## 二、改动明细

| 文件 | 行号（约） | 改动 |
|------|-----------|------|
| `frontend/src/components/ErrorBoundary.tsx` | L6–L41 | `Props` 增加可选 `onError?: (error, errorInfo) => void`；`componentDidCatch` 内部 logger 上报后用 try/catch 调用 `this.props.onError`，回调抛错仅 `logger.warn` 不阻断 |
| `frontend/src/app/page.tsx` | L13, L186–L271 | import `ErrorBoundary`；在 TopBar 之后、单列内容流（含 KimiCard / ChatArea / InputArea / PlayerBar / QueueList / TerminalLog / 骨架）外层包 `<ErrorBoundary fallback="电台主界面加载失败 + 重载按钮">`——TopBar 留在 boundary 之外，崩了仍能跳其它页 |
| `frontend/src/app/plan/page.tsx` | L9, L141–L207 | import `ErrorBoundary`；在 TopBar 之后、标题/`<PlanTimeline>`/返回链接 外层包 `<ErrorBoundary fallback="时间轴加载失败 + 重试按钮">`，重试按钮调用 `loadSchedule()` |
| `frontend/src/app/profile/page.tsx` | L5, L62–L84 | import `ErrorBoundary`；将 `<ProfileCard>` 单层包 `<ErrorBoundary fallback="个人主页加载失败 占位卡">`，让 Header + 返回链接 留在 boundary 外 |
| `frontend/src/app/settings/page.tsx` | L8, L100–L227 | import `ErrorBoundary`；将 TTS 音色区/音源区/主题区三段统一包 `<ErrorBoundary fallback="设置加载失败 占位卡">`，Header + 返回链接 留在 boundary 外 |
| `frontend/src/components/ErrorBoundary.test.tsx`（新文件） | 全文件 | 5 个 case：① 子组件正常 → 渲染 children ② 子组件抛错 → 默认 fallback 含"电台信号中断"+"重新连接电台"，不暴露堆栈 ③ 自定义 fallback 覆盖默认 ④ `onError` 被调用 1 次，参数含 Error + componentStack ⑤ `onError` 自身抛错被 try/catch 兜底，ErrorBoundary 不二次崩 |

注意：所有 ErrorBoundary 都包在 `<main>` 内部的渲染层（且不跨过 TopBar / Header / 返回链接），且**不**包 next/dynamic 调用的外层——dynamic 加载失败的 chunk 错走 dynamic 自己的 loading 状态，不被 ErrorBoundary 拦截。

## 三、验证结果

- **tsc**：`npx tsc --noEmit` 0 error（exit code 0，无任何输出）
- **vitest**：`npx vitest run` 22 test files passed / **173 tests passed**（含新增 ErrorBoundary 5 case）
  - Baseline 168 → 173 = 净增 5，**无回退**
  - 新增 `src/components/ErrorBoundary.test.tsx` 单独跑：5 / 5 passed
  - 全量通过列表中含 `AudioWaveform/ChatArea/FullscreenPlayer/InputArea/KimiCard/OnAirBadge/RecommendCardList/SourceSwitcher/TopBar/TypewriterText/radioStore/useAudioPlayer/useAudioAnalyser/useLyricHighlight/useTTS/djIntroToSong/color-contrast/utils` 等所有历史测试文件均无回退

## 四、与规格的偏差（如有）

无偏差。规格要求全部满足：
- ❌ 不改 layout.tsx 顶层 ErrorBoundary（已保留，未触碰 `frontend/src/app/layout.tsx`）
- ❌ 不改 ErrorBoundary 核心 API 行为（仅新增可选 `onError` props；fallback 早就已支持，未动；getDerivedStateFromError / componentDidCatch 行为不变）
- ❌ ErrorBoundary 没套在 dynamic 组件外层（plan / profile / settings 三处的 dynamic(…) 都直接渲染在 boundary 内部，dynamic 加载失败走 Next.js 自有 loading，不被拦截）
- ❌ 错误堆栈未暴露给用户（fallback 只展示友好提示 + 重载/重试按钮，未包含 `error.stack`）
- ❌ 没引入新依赖（package.json 未改动）
- ❌ 未 commit（按规格等第 4 轮统一）

## 五、自评

- 每个路由（首页+3 个子路由）是否都有 ErrorBoundary？是——首页包"主要内容流"（TopBar 在外）/ plan 包"时间轴+标题+返回"（TopBar 在外）/ profile 包 ProfileCard（Header+返回在外）/ settings 包三个 section（Header+返回在外）
- layout.tsx 顶层 ErrorBoundary 是否保留（兜底）？是——layout.tsx 完全未改，仍是全局兜底
- ErrorBoundary 是否被错放在 dynamic 组件外？否——全部页面 ErrorBoundary 都包在 dynamic 调用的**内部**或**同级后置**，dynamic 加载失败走 dynamic 自有 loading 状态
- 错误堆栈是否暴露给生产用户？否——所有 fallback 仅展示中文友好文案 + 重载/重试按钮
- 是否引入新依赖？否——package.json 未改动；新增的 1 个测试文件仅依赖已有测试工具链（@testing-library/react + vitest）
- 边界遵守：没试图兜底 promise rejection；没把 ErrorBoundary 套在 layout 业务级；没改 ErrorBoundary 核心 API
- 自检到的潜在风险点：`onError` 调用 try/catch 后 catch 分支只 `logger.warn`，没有把回调异常吞到页面（这是正确选择——不要让回调意外错误影响 boundary 已稳定的 fallback 状态）。验证通过。

## 六、前科复盘

本次任务涉及历史教训：
- **COLLABORATION §一 规划者 vs 执行者边界**：严格按规格执行，未自由发挥（fallback 文案按规格 §第4步 写了"时间轴加载失败"等特征文字，未自创）
- **不动 layout.tsx 顶层 ErrorBoundary**：作为最后兜底的红线，遵守
- **dynamic + ErrorBoundary 关系**（规格特别警告）：明确边界——dynamic 的 chunk 加载失败（异步 import）由 Next.js 处理，不属于 React 组件同步错误，ErrorBoundary 不该拦截；本任务的 ErrorBoundary 包 dynamic **内部**的渲染，只拦截动态组件真正渲染后的崩溃

---

*报告由 MiNiMax 生成。*
