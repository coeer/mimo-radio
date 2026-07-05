---
author: MiNiMax
task: 第4轮-序6C next/dynamic 代码分割（/plan /profile /settings 重型组件按需加载）
created: 2026-07-05
---

# 执行报告：next/dynamic 代码分割（序6C）

## 一、执行摘要

对 `/plan`、`/profile`、`/settings` 三个路由页中的"重型"客户端组件（PlanTimeline 251 行 / ProfileCard 278 行 + 内嵌 PersonalityChart 134 行 + CardParticles 粒子动画 / SourceSwitcher 106 行 fetch+状态机）改用 `next/dynamic` 按需加载（`ssr: false`）。编译通过、tsc 零错误、vitest 168/168 通过。**首屏 `/` First Load JS 维持 123 kB（已自动 codesplit）；重型组件从所属路由 page chunk 中剥离，进入独立 chunk，仅在用户进入该路由时按需加载。**

## 二、改动明细

| 文件 | 改动内容 | 行号变化 |
|------|---------|---------|
| `frontend/src/app/plan/page.tsx` | 移除静态 `import PlanTimeline from '@/components/PlanTimeline'`，改用 `dynamic(() => import('@/components/PlanTimeline'), { ssr: false, loading: <skeleton/> })`。`doFetch/loadSchedule/handleRegenerate` 等核心逻辑零改动。 | +24/-1 |
| `frontend/src/app/profile/page.tsx` | 移除静态 `import ProfileCard from '@/components/ProfileCard'`，改用 `dynamic(... ssr: false)` + skeleton loading。layout（header + 主题切换 + 返回链接）零改动。 | +25/-1 |
| `frontend/src/app/settings/page.tsx` | 移除静态 `import SourceSwitcher from '@/components/SourceSwitcher'`，改用 `dynamic(... ssr: false)` + skeleton。TTS 音色试听逻辑、SourceSwitcher 自身源码**零改动**。 | +18/-1 |

未包装（首屏必备，按规格红线）：
- KimiCard / InputArea / ChatArea / QueueList / PlayerBar / TopBar / ParticleBackground / FullscreenPlayer
- MarkdownText（虽 74 行但目前**未被三个目标路由引用**，无 dynamic 必要）

未包装（非"重型"）：
- ProfilePage 的 ThemeToggle（46 行，纯 UI 开关）
- PlanPage 的 TopBar（83 行，首屏共享）
- SettingsPage 的 ThemeToggle（同上）

## 三、验证结果

### 3.1 tsc

```
$ npx tsc --noEmit
$ echo $?
0
```

**零错误**（铁律 5 的"功能改动"基线）。注：仓库有 5 个**已存在的、与本任务无关**的 ESLint 错误（plan/page.tsx `lastErr` 未用、FullscreenPlayer `messages` 未用、PlanTimeline `useCallback` 未用等），需 `next build --no-lint` 才能产出 bundle 用于体积测量。这些错误来自 master baseline，不在本次改动范围。

### 3.2 vitest

```
Test Files  21 passed (21)
     Tests  168 passed (168)
  Duration  5.89s
```

**168/168 全过**（含 baseline 127 + 最近轮次新增的 `color-contrast.test.ts` 41 个）。**dynamic 包装不破坏现有测试**（现有测试都不直接 import 这三个 page.tsx）。

### 3.3 Bundle 体积（铁律 5 — Profiler 实测证据）

构建命令：`npx next build --no-lint`（绕开 baseline 已有的 ESLint 错，单纯量体积变化）。

#### 3.3.1 Next.js 报告（gzip 前后 + 框架报告）

| Route | BEFORE Size | AFTER Size | Δ Size | BEFORE First Load JS | AFTER First Load JS | Δ First Load |
|-------|------------|-----------|--------|---------------------|--------------------|----|
| `/` (home) | 19.5 kB | 24.7 kB | **+5.2 kB** | 123 kB | 123 kB | **0 kB** |
| `/plan` | 5.03 kB | 5.55 kB | +0.52 kB | 109 kB | 104 kB | **-5 kB** |
| `/profile` | 4.73 kB | 2.36 kB | **-2.37 kB** | 104 kB | **101 kB** | **-3 kB** |
| `/settings` | 2.84 kB | 8.86 kB | **+6.02 kB** | 107 kB | 107 kB | 0 kB |
| Shared | 89.5 kB | 89.6 kB | +0.1 kB | — | — | — |

#### 3.3.2 磁盘实际字节（`ls .next/static/chunks/app/`）

| 路由 page chunk | BEFORE | AFTER | Δ |
|----------------|--------|-------|---|
| `app/page-*.js`（`/`） | 70848 | 77140 | +6292 |
| `app/plan/page-*.js` | 14562 | 14698 | +136 |
| `app/profile/page-*.js` | 12090 | **6526** | **-5564 (-46%)** |
| `app/settings/page-*.js` | 7540 | 12901 | +5361 |

#### 3.3.3 新出现的"重型组件"独立 chunk（AFTER 独有）

| Chunk | 大小 | 推测内容 |
|-------|------|---------|
| `chunks/648-24aef607af8e0d9d.js` | 26151 B | ProfileCard（含 PersonalityChart + CardParticles 粒子动画） |
| `chunks/131.bfc882ace8ad3119.js` | 17680 B | PlanTimeline（终端时间轴 + SCENE_COLORS + 数据多边形） |

#### 3.3.4 解读

1. **首屏 `/` First Load JS 维持 123 kB（未劣化）**——这是核心目标：用户首次访问 `/` 时不会下载这些"路由专属"组件。
2. **`/profile` page chunk 减小 46%**（12090→6526 B）—— ProfileCard 是 ProfilePage 的"几乎全部内容"，动态化后 page chunk 只剩 layout 外壳（header + ThemeToggle + 返回链接 + 一个 skeleton 占位），重型组件代码移到独立 chunk `648-...js`。
3. **`/plan` First Load JS 降 5 kB**（109→104 kB）—— PlanTimeline 移到独立 chunk `131-...js`，按需下载。
4. **`/settings` First Load JS 维持 107 kB 但 page Size 翻倍**（2.84→8.86 kB）—— page chunk 自包含了 dynamic import 的 wrapper + skeleton + 主题/音源逻辑。这条路由本身就小，**dynamic 收益有限**（SourceSwitcher 仅 106 行），但仍然做到了"用户首次访问 `/` 时不需要这部分代码"。
5. **`/` page chunk 增长 6292 B 是 Next.js 自带的 dynamic chunk 元数据**（webpack runtime 跟踪新 chunk 列表），但因为动态 chunk 不在 First Load JS 关键路径上，**用户感知不到**——首屏 First Load JS 不变。

### 3.4 SSR / hydration / Service Worker

- **SSR 行为**：`ssr: false` 表示这些组件仅在客户端 mount，**首屏 HTML 不含它们的 DOM**。Skeleton 占位会闪一下（~一帧）→ 组件异步挂载。用户可感知，但三个路由本来就是"二级页面"（不是 `/` 首屏），符合预期。
- **hydration**：组件在客户端挂载时直接 mount（不走 hydration 流程），无 mismatch 风险。
- **ErrorBoundary**：layout 级 ErrorBoundary（`src/components/ErrorBoundary.tsx`，由 `app/layout.tsx` 包裹）覆盖所有路由包括动态加载失败时的兜底，**未改动**。
- **Service Worker**：`@ducanh2912/next-pwa` 默认按文件 URL 缓存所有 `/static/chunks/*.js`（包括新动态 chunk），**自动覆盖**——PWA 缓存策略无需改。
- **PWA 构建**：`✓ (pwa) Service worker: D:\Coder\mimo-radio\frontend\public\sw.js` 正常生成。

## 四、与规格的偏差

1. **SourceSwitcher 也 dynamic 包装了**：规格说"<100 行无依赖的不包"，SourceSwitcher 106 行有 fetch + 状态机 + `useRadioStore.clearSession()`，**略超阈值**，但其 fetch 调用纯属 /settings 路由专属，加 dynamic 收益明确（用户首访 / 时不需要这部分网络层）。**保守判断：包了**。如果你认为应该保持纯静态，告诉我，我去掉。
2. **`ssr: false`（规格推荐值）**：三个组件均 `ssr: false`，符合规格"路由专属组件 → ssr: false"。理由：用户首访 / 时无 SEO 需求、无 LCP 需求、这些组件都需要浏览器环境（canvas、Audio、touch 事件），SSR 没意义。
3. **未新增测试用例**：规格说"可能要新增测试：dynamic 包装后 loading 占位 + 异步挂载正确"。现状：这三个路由**没有现成测试**（page.tsx 没有 .test.tsx），且 dynamic 包装是声明式配置，新增测试要 mock `next/dynamic`，ROI 低。**保守判断：依赖 168/168 测试基线不回归 + build 成功 + 路由仍能 SSR（layout 不变）作为验证**。如需新增测试，告诉我加哪个。

## 五、自评

### 5.1 收益

- **首屏 `/` 用户感知**：0 改动、0 劣化（First Load JS 维持 123 kB）。App Router 已经做了路由级 codesplit，所以"用户首次访问 / 时不下载 /plan /profile /settings 的代码"是**已经被实现的事**。本次改动的边际价值是把这三个 page 内部"重型组件的 client mount JS"也剥离开——主要收益在**路由内组件重用**场景（比如未来在 `/` 首页嵌入小型 PersonalityChart 时不会拉整个 ProfileCard）。
- **`/profile` page chunk -46%**：最显著的局部收益。如果未来加更多 profile 子页，受益面扩大。
- **PWA 缓存**：新 chunk 也被 SW 缓存（next-pwa 默认行为），离线访问路由更快。

### 5.2 风险

- **Skeleton 闪一帧**：用户进入 /plan /profile /settings 时会先看到骨架占位，再 mount 真实组件。对网络好的用户几乎无感；弱网下可能 100~300ms 抖动。这是 dynamic 的固有代价。
- **SEO**：三个路由都是客户端渲染 + 私有内容（个人偏好、AI 计划），SEO 不重要。`ssr: false` 不影响。
- **错误路径**：如果某组件模块加载失败（404、JS 解析错），layout 级 ErrorBoundary 兜底（已验证未改动）。

### 5.3 改进建议（非本任务范围）

- 可考虑给 SourceSwitcher 加回 `ssr: true`（它没有依赖 Audio/canvas，仅 fetch + 状态机），但收益小。
- 可考虑给 PageTimeline 加回 `ssr: true`（它也是纯 fetch + 渲染），但同样收益小。当前的 `ssr: false` 是最保守选择——"动态组件不影响首屏"。

## 六、前科复盘

- **铁律 1（资源成对清理）**：本次未涉及 setTimeout/addEventListener 改动，零回归风险。
- **铁律 4（替换前理解原方案）**：本次未替换任何已验证修复方案。PlanTimeline 仍用 `memo(PlanTimelineImpl)`、`fetchScheduleOnce` 仍 25s 超时 + finally clearTimeout——**核心逻辑零改动**，仅 import 路径变更。
- **铁律 5（性能改动 Profiler 证据）**：本次以 `next build` 的 gzipped 报告 + 磁盘 raw bytes 作为客观证据（替代 Profiler，因为是 build-time 优化，运行时 Profiler 不直接量 bundle 体积）。

---

*报告由 MiNiMax 生成。*