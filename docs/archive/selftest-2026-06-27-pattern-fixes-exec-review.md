# F1 打回补丁:收藏爱心 handleLike 漏改两处

> **评估对象**:执行者对 `docs/plans/2026-06-27-pattern-fixes-exec.md` F1 的实现
> **状态**:打回重做(2 行小补丁)
> **生成时间**:2026-06-27(规划者)

---

## 核实结论:5 项里 4 项完美,F1 没改干净

| 项 | 规格 | 实际 | 结论 |
|----|------|------|------|
| F2 主题闭包 | useRef | ✅ `prevThemeRef`(:36/42) | **完美** |
| F3 REPLAY 标记 | lastKimiMsgId + "(旧解说)" | ✅ useMemo(:16)+ 标记(:153) | **完美** |
| F5 AI 编造年份 | 去年份引导 + 换示例 | ✅ 第154行改 + 第158行示例换成"This one's for the quiet hour" | **完美**(连示例都换了) |
| F6 推荐数量 | prompt 加约束 | ✅ 第312行 | **完美** |
| **F1 收藏爱心** | 5 处全换 isSongLiked | ⚠️ 只换 UI(:327/330),**handleLike(:65)和依赖(:80)还是 isLiked** | **打回** |

测试全绿(前端127/后端234,tsc零错误),无回归。F2/F3/F5/F6 的细节执行力很好——尤其 F5 连规格里"换英文参考示例"都改了。

---

## 🔴 F1 的问题:改了一半

执行者加了 `likedSongIds` 订阅 + `isSongLiked` 函数(`KimiCard.tsx:54-55`),爱心 UI 也正确换成了 `isSongLiked`(`:327/330`)。**但两处遗漏**:

```
第 65 行:  const liked = isLiked(currentSong.id)      ← 还是旧的 isLiked
第 80 行:  }, [currentSong, isLiked, ...])            ← 依赖数组还是 isLiked
```

### 后果评估
- 爱心 UI 填充**会**即时更新(UI 用 isSongLiked,订阅了数组)→ 表面"功能正常"
- 但 handleLike 里 action 判断用 isLiked(store action,值正确)→ 功能勉强工作
- **真实问题**:留下死代码 + 不一致——同组件内 `isLiked`(:53订阅)和 `isSongLiked`(:55)两个函数并存,`isLiked` 订阅现在只服务 handleLike 一个调用点。违反规格"统一用 isSongLiked",留维护隐患。

### 为什么这算"必须打回"而不是"可用"
表面功能正常,但**规格明确要求"5 处全换"**,你只换了 3 处。规划者审查的标准是"是否完整按规格",不是"表面能不能跑"。残留的 isLiked 订阅以后会是 bug 源——有人删 isLiked 订阅(以为没用了),handleLike 就断了。

---

## 补丁(2 行 + 清理)

`frontend/src/components/KimiCard.tsx`:

**第 65 行**——handleLike 里换函数:
```tsx
// 改前
const liked = isLiked(currentSong.id) // toggleLike 已执行，isLiked 返回切换后的值

// 改后
const liked = isSongLiked(currentSong.id) // toggleLike 已执行，isSongLiked 返回切换后的值
```

**第 80 行**——useCallback 依赖数组换:
```tsx
// 改前
}, [currentSong, isLiked, toggleLike, sessionId, sessionToken])

// 改后
}, [currentSong, isSongLiked, toggleLike, sessionId, sessionToken])
```

**清理(关键)**——改完后 `grep -n isLiked KimiCard.tsx`,如果第 53 行的 `const isLiked = useRadioStore(...)` 在组件内**不再有任何使用点**,连同这行订阅一起删:
```tsx
// 删除(若 grep 确认无其他引用)
const isLiked = useRadioStore((state) => state.isLiked)
```
**注意**:store 里的 `isLiked` action 定义(`radioStore.ts:146`)**保留**,其他组件可能用,只删 KimiCard 内的订阅。

---

## 验证

```bash
cd D:/Coder/mimo-radio/frontend
# 1. grep 确认无残留(grep 应该返回空,或只有 store 路径)
grep -n "isLiked" src/components/KimiCard.tsx   # 期望:无输出(或只剩注释)
# 2. tsc + 测试
npx tsc --noEmit && npx vitest run   # ≥127
# 3. E2E:点收藏 → 爱心立即变红;再点 → 立即恢复;连点 → debounce 生效无 429
```

---

## 给执行者的教训(沉淀)

**改完一个修复点,全文 grep 旧标识符确认无残留。**

F1 是"加新函数 isSongLiked 替换旧函数 isLiked"的改法,最容易遗漏调用点。你改了 UI 的两处(:327/330),但忘了 handleLike(:65)和依赖数组(:80)也用 isLiked。

`grep -n isLiked KimiCard.tsx` 一跑就会看到还有 3 处没换——这一步你没做。

**铁律**:涉及"函数/变量重命名"或"用新函数替换旧函数"的改法,**改完后必须 grep 全文确认旧标识符零残留**(注释里的可保留,代码引用必须清零)。这是避免"改了一半"的标准动作。

下一次遇到同类改法(替换订阅源、替换工具函数),把这条作为自检的最后一步。

---

*补丁很小(2 行 + 可能的 1 行清理)。执行者补完后跑 grep 确认无残留 + tsc/测试,即可结案。F2/F3/F5/F6 已通过,无需再动。*
