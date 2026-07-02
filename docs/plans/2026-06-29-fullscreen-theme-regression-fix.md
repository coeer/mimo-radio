# FullscreenPlayer 主题回归修复补丁 + DSflash 前科提醒

> **触发**：DSflash 执行视觉质感轮（封面放大 + useTheme）时，把 F2 修好的主题闭包 bug 改回归了
> **生成时间**：2026-06-29（规划者）
> **执行者**：DSflash（继续由它修，让它面对自己的错误）
> **配套**：先读 `docs/plans/2026-06-29-visual-quality.md`（原规格）理解 useTheme 的设计意图

---

## ⚠️ 给 DSflash 的前科提醒（开工前必读，这是你这轮的两个错误）

**DSflash，这是你视觉质感轮犯的错。这次补丁就是修你自己引入的回归。先认清错在哪，再动手。**

### 错误 1（严重）：你把 F2 修好的 bug 改回归了

**F2（之前修好的）** 用 `useRef + getAttribute('data-theme')` **同步读 DOM** 拿到用户真实主题：
```ts
prevThemeRef.current = root.getAttribute('data-theme') || 'dark'  // 同步，拿真实值
```

**你改成的** 用 `useTheme().theme`（userTheme state）：
```ts
const { theme: userTheme, setTheme } = useTheme()
const prev = userTheme  // ← 这是 state，useState('dark') 初始值！
```

**为什么回归**：useTheme 的 `useState('dark')` 初始值是 'dark'，它的 init useEffect（读 localStorage 更新 state）是**异步**的。你的 `[]` 依赖 effect 在初次 render 后立即跑，捕获的 userTheme 永远是初始值 'dark'，**不是用户真实主题**。

**结果**：用户浅色主题 → 进全屏 → 退出 → `setTheme('dark')` → **强制变深色**。F2 刚修好的 bug，你改回来了。

### 你为什么犯错：没理解 F2 为什么用 ref

F2 用 ref 不是随意选择，是因为**"同步读 DOM"是必需的**：
- ref 的 `.current = getAttribute()` 是**同步**操作，立刻拿到真实值
- state 是**异步**更新的，在 `[]` 依赖的 effect 里捕获的是初始值

**你把"同步读 DOM"换成"读异步 state"，丢了"同步"这个关键属性。** 替换已验证的修复方案时，必须理解原方案**为什么这么写**，不能只看表面"换成 hook 更优雅"就改。

### 错误 2：E2E 全是"待实测"，等于没做

你报告第三节的 E2E 场景全是"待规划者视觉确认/待 webbridge 实测"。**自测规范（`docs/selftest-spec.md`）要求每步有可观测证据。**

如果你跑了 E2E（哪怕一次"浅色 → 进全屏 → 退出 → 看是否仍是浅色"），就能**立刻**发现 B3 的回归 bug——退出后变深色，一眼可见。这个 bug 藏在单元测试盲区（jsdom 测不出 useState init 和 effect 的时序），只有 E2E 实测能抓到。**而你没跑 E2E。**

**"待实测"不是验证，是拖延。** 下次报 E2E，要么跑出结果（带 DOM 检查证据），要么明确标"未测 + 原因"。

### 这次的评级和上次对比

| 维度 | 上次（DSpro DJ记忆） | 这次（DSflash 视觉质感） |
|------|---------------------|------------------------|
| 规格依从性 | ⭐⭐⭐⭐⭐（零违反） | ⭐⭐⭐⭐½（约束遵守，但偏离 F2 已验证方案） |
| 代码质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐（useTheme 好，但 B3 回归） |
| 回归控制 | ⭐⭐⭐⭐⭐ | ⭐⭐（**引入回归**） |
| 报告诚实度 | ⭐⭐⭐⭐½ | ⭐⭐⭐（E2E 全"待实测"） |

**DSflash 这次 C+，DSpro 上次 A。** 你的 useTheme 写得比 DSpro 的 djMemory 不差，但**回归 + E2E 缺失**两个问题把评级拉下来了。修复这个回归 + 补 E2E，才能证明你能到 A。

---

## 补丁任务：修复 FullscreenPlayer 主题回归

### 根因（精确）
`FullscreenPlayer.tsx:36-46` 用 `useTheme().theme`（userTheme state）记录 prev，但 useState 初始值 'dark' + `[]` 依赖 = 闭包永远捕获 'dark'，退出全屏时 setTheme('dark') 强制深色。

### 修复方案：ref 读 DOM（同步）+ setTheme 写入（统一）

保留 useTheme 的"统一写入"优势（setTheme 同步 DOM + localStorage + meta），但**读 prev 用 ref 直接读 DOM**（同步，拿真实值），不用 userTheme state。

**改文件**：`frontend/src/components/FullscreenPlayer.tsx`

```tsx
// 改前（DSflash 的回归版，:36-46）
const { theme: userTheme, setTheme } = useTheme()
useEffect(() => {
  const prev = userTheme              // ← state，初始值 'dark'，回归 bug
  setTheme('light')
  return () => {
    setTheme(prev)                    // ← 永远 setTheme('dark')
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

// 改后（ref 读 DOM + setTheme 写入）
import { useRef } from 'react'  // 确认 import（文件顶部）
// ...
const { setTheme } = useTheme()                    // 只要 setTheme，不要 theme state
const prevThemeRef = useRef<string>('dark')
useEffect(() => {
  // 同步读 DOM 拿真实主题（F2 的原理：getAttribute 是同步的，state 是异步的）
  prevThemeRef.current = document.documentElement.getAttribute('data-theme') || 'dark'
  setTheme('light')
  return () => {
    // 退出：用 setTheme 恢复（比 F2 的 setAttribute 更好——setTheme 会同步 localStorage）
    setTheme(prevThemeRef.current as 'dark' | 'light')
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

### 关键改进对照

| 维度 | F2（最早） | DSflash（回归版） | 本补丁（正解） |
|------|-----------|------------------|--------------|
| 读 prev | ref + getAttribute（同步）✅ | useTheme state（异步，初始值 'dark'）❌ | **ref + getAttribute（同步）✅** |
| 写入 | setAttribute（不写 localStorage）⚠️ | setTheme（写 localStorage）✅ | **setTheme（写 localStorage）✅** |
| 结果 | 主题对但刷新可能不同步 | 退出强制深色（回归）❌ | **主题对 + localStorage 同步 ✅** |

**本补丁 = F2 的"同步读" + useTheme 的"统一写"，两者优势合并。**

### 为什么不直接回退到 F2

F2 用 `setAttribute` 写入，**不写 localStorage**——这是 F2 遗留的"不同步"隐患（退出全屏后刷新，localStorage 可能还是旧值）。DSflash 引入的 useTheme `setTheme` 解决了写入不同步问题，但读 prev 用错了（state 代替 ref）。本补丁保留 useTheme 的 setTheme（写入统一），只把读 prev 改回 ref（同步读 DOM）——**鱼和熊掌兼得**。

### 验证（必须跑 E2E，这次不许"待实测"）

```bash
cd /d/Coder/mimo-radio/frontend && npx tsc --noEmit && npx vitest run   # ≥127

# E2E（必须实际跑，带 DOM 证据，不许写"待实测"）：
# 前置：unlockAudio + 用 SPA 跳转（不是 navigate）

# 场景 1：浅色进出全屏（核心——DSflash 回归的就是这个）
# /settings 切浅色 → 回首页 → evaluate 确认 data-theme=light
# 进全屏 → 退出 → evaluate 确认 data-theme 仍是 light（不是 dark！）
python -c "
import json
code = '(function(){return document.documentElement.getAttribute(\"data-theme\")})()'
json.dump({'code': code}, open('/tmp/theme.json','w',encoding='utf-8'), ensure_ascii=False)
"
python logs/wb.py evaluate /tmp/theme.json
# 期望：返回 "light"（如果返回 "dark" = 补丁失败）

# 场景 2：深色进出全屏
# /settings 切深色 → 进全屏 → 退出 → evaluate 确认 data-theme=dark

# 场景 3：全屏退出后刷新（验证 localStorage 同步）
# 浅色 → 进全屏 → 退出 → 刷新页面 → evaluate 确认 data-theme=light（不是 dark）
# 这验证 setTheme(prev) 写了 localStorage

# 场景 4：封面尺寸（Part A 验证）
# 播放歌曲 → evaluate 确认 KimiCard 封面 img 宽度 ≈72px；全屏封面 ≈120px
```

**判定标准**：
- 场景 1：退出全屏后 `data-theme` 仍是 **light**（不是 dark）→ 回归修复
- 场景 3：刷新后仍是用户主题（不是 light）→ localStorage 同步
- 如果场景 1 仍返回 dark → 补丁失败，重新分析

---

## 执行检查清单

- [ ] FullscreenPlayer 改用 ref 读 DOM（getAttribute）+ setTheme 写入
- [ ] 删除 `const { theme: userTheme } = useTheme()` 的 theme 解构（只要 setTheme）
- [ ] 加 useRef import（如未有）
- [ ] tsc 零错误 + vitest ≥127
- [ ] **E2E 场景 1 实际跑**（浅色进出全屏，evaluate 确认返回 light）—— 不许"待实测"
- [ ] **E2E 场景 3 实际跑**（退出后刷新，确认 localStorage 同步）
- [ ] 报告附 DOM 检查证据（evaluate 返回的 data-theme 值）

---

## 给 DSflash 的最后要求

1. **这次必须跑 E2E**。你上次全是"待实测"，导致回归 bug 没被发现。这次场景 1（浅色进出全屏）是**你自己引入的回归的验证场景**——如果退出后变深色，说明你还没修对。**跑出 evaluate 的返回值，贴在报告里。**

2. **理解为什么用 ref 不用 state**。修复前在心里走一遍：useState('dark') → init effect 异步 → 你的 `[]` effect 捕获 'dark' → 退出 setTheme('dark') → 回归。**ref 读 DOM 是同步的，绕过了 state 的异步性**——这就是 F2 的原理，也是本补丁的原理。

3. **不要又"优化"成别的方案**。本补丁给了精确改法（ref + setTheme），照着改。如果你觉得有更优雅的方案，**先验证它不会回归**（在 E2E 场景 1 跑通），再提。不要又一次"我觉得这样更好"然后引入新 bug。

---

*本补丁修复 DSflash 引入的 FullscreenPlayer 主题回归。核心：ref 读 DOM（同步）+ setTheme 写入（统一）。修复后 F2 的闭包 bug 和 localStorage 不同步问题都解决。*
