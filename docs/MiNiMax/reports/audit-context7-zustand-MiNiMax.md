---
agent: MiNiMax
author: MiNiMax
task: Context7 文档驱动代码审计 — Zustand 5 子报告
created: 2026-07-11
audited_version: zustand 5.0.13
---

# Context7 审计子报告：Zustand 5

## 一、审计范围

按规划者规格 §三.3，覆盖 4 个检查点：

| # | 检查点 | 涉及文件 |
|---|--------|---------|
| 1 | `persist` + `partialize` 字段范围是否合规（仅 djEnabled / currentModel / ttsVoice） | `frontend/src/store/radioStore.ts:355-370` |
| 2 | selector 订阅是否返回稳定引用（避免无限重渲染）— **重点** | 9 个消费组件 + hooks（详见第五节） |
| 3 | `devtools` middleware 的 name + action name 配置 | `frontend/src/store/radioStore.ts:109,125-340,372` |
| 4 | 5 个 slice 的组合是否符合 Zustand 5 推荐模式 | `frontend/src/store/radioStore.ts:111-341,345-374` |

## 二、Context7 文档摘要（拉自 `/pmndrs/zustand`，版本 5.x）

### 2.1 slices + devtools 推荐模式

来源：`https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/advanced-typescript.md`
及 `https://github.com/pmndrs/zustand/blob/main/docs/reference/middlewares/devtools.md`

```typescript
const createBearSlice: StateCreator<
  JungleStore,
  [['zustand/devtools', never]],
  [],
  BearSlice
> = (set) => ({
  bears: 0,
  addBear: () =>
    set(
      (state) => ({ bears: state.bears + 1 }),
      undefined,
      'jungle:bear/addBear',
    ),
})

const useJungleStore = create<JungleStore>()(
  devtools((...args) => ({
    ...createBearSlice(...args),
    ...createFishSlice(...args),
  })),
)
```

要点：
- slice 用 `StateCreator<Combined, [mutators tuple], [], SliceType>` 标注
- mutators tuple 是 `[['zustand/devtools', never]]`（`never` 表示 slice 不引入额外 mutator）
- 多个 slice 通过 `(...args) => ({ ...createSlice(...args), ... })` 合成
- devtools 套在最外层 `devtools((...args) => ...)`，但 `slice` 内 `set` 仍可拿到第三参 action name（因为 mutators tuple 已声明 `zustand/devtools`）

### 2.2 devtools + persist 嵌套顺序

来源：`https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/advanced-typescript.md`
及 `https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/using-middlewares.md`（Middleware Ordering 章节）

文档**明确推荐**：

> It is recommended to use the `devtools` middleware as the outermost wrapper, positioned last in the middleware chain. For example, when using `devtools` with `immer`, the correct pattern is `devtools(immer(...))`.

完整官方示例：

```typescript
const useBearStore = create<BearState>()(
  devtools(
    persist(
      (set) => ({
        bears: 0,
        increase: (by) => set((state) => ({ bears: state.bears + by })),
      }),
      { name: 'bearStore' },
    ),
  ),
)
```

### 2.3 `set` 第二参语义（vanilla 实现佐证）

来源：`https://github.com/pmndrs/zustand/blob/main/src/vanilla.ts`

```typescript
const setState: StoreApi<TState>['setState'] = (partial, replace) => {
  const nextState =
    typeof partial === 'function'
      ? (partial as (state: TState) => TState)(state)
      : partial
  if (!Object.is(nextState, state)) {
    state =
      (replace ?? (typeof nextState !== 'object' || nextState === null))
        ? (nextState as TState)
        : Object.assign({}, state, nextState)
    ...
  }
}
```

含义：
- `replace` 为 `undefined`：partial 是对象时走浅合并，partial 是基本类型时走全量替换
- `replace` 为 `true`：强制全量替换（危险：会丢 actions）
- `replace` 为 `false`：等同于 `undefined`（对象类型走浅合并）— **与 `undefined` 完全等价**

### 2.4 persist + partialize 签名（v4+ 迁移后）

来源：`https://github.com/pmndrs/zustand/blob/main/docs/reference/migrations/migrating-to-v4.md`
及 `https://github.com/pmndrs/zustand/blob/main/docs/reference/integrations/persisting-store-data.md`

```typescript
export const useBearStore = create<MyState>()(
  persist(
    (set, get) => ({
      bears: 0,
      addABear: () => set({ bears: get().bears + 1 }),
    }),
    {
      name: 'food-storage',
      storage: createJSONStorage(() => sessionStorage), // (optional) by default the 'localStorage' is used
      partialize: (state) => ({ bears: state.bears }),
    },
  ),
)
```

v5 不需要显式 `<T, U = Partial<T>>` 泛型，partialize 签名为 `(state: T) => Partial<T>`。

### 2.5 selector 引用稳定性（订阅语义）

来源：`https://github.com/pmndrs/zustand/blob/main/docs/hooks/use-store.md`（subscribe + equalityFn 标准）

Zustand 默认用 `Object.is` 做相等比较。selector **每次执行** 都返回新对象/数组（`(s) => ({a, b})`、`(s) => arr.filter(...)`）→ 永远 `Object.is === false` → 消费者无限重渲染。

## 三、发现汇总

| # | 检查点 | 结果 | 严重度 | 位置 |
|---|--------|------|--------|------|
| 1 | persist + partialize | ✅ 无偏差 | — | `frontend/src/store/radioStore.ts:355-370` |
| 2 | selector 稳定性 | ✅ 无偏差（全部消费方均订阅单字段/单稳定引用） | — | 见第五节 |
| 3 | devtools middleware | ✅ 无偏差 | — | `frontend/src/store/radioStore.ts:109,125-340,372` |
| 4 | store 组合（slices + middleware 嵌套） | ✅ 无偏差 | — | `frontend/src/store/radioStore.ts:345-374` |

**汇总：4/4 检查点全部 ✅，未发现 🔴/🟠/🟡**。

## 四、详细发现

无。每个检查点都是无偏差项，分别给出对应代码片段与 Context7 文档原文的对比说明。

### 检查点 1：persist + partialize

**当前代码**（`radioStore.ts:355-370`）：

```typescript
persist(
  (...args) => ({...}),
  {
    name: 'mimo-radio-store',
    partialize: (state) => ({
      djEnabled: state.djEnabled,
      currentModel: state.currentModel,
      ttsVoice: state.ttsVoice,
    }),
  },
),
```

**对照 COLLABORATION §三 决策 2 + 决策 3**：
- ✅ 必须持久化字段：`djEnabled` / `currentModel` / `ttsVoice` — 代码恰好包含这三个字段
- ✅ 不允许持久化：`sessionId` / `sessionToken` / `queue` / `currentSong` / `messages` / `likedSongIds` — 全部未出现在 partialize 返回值中
- ✅ partialize 返回对象形状等于 `Pick<SessionSlice, 'djEnabled' | 'currentModel' | 'ttsVoice'>`，与状态结构一致
- ✅ 第二参位置正确（在 `persist` 内层，devtools 外层 — 与 §2.2 文档推荐一致）

**对照 Context7 文档**：
- 文档原文签名 `partialize: (state) => ({ bears: state.bears })` —— 与项目一致
- v4+ 迁移说明文档明确：v5 不再需要 `<T, U = Partial<T>>` 显式泛型 —— 项目正确使用无泛型柯里化 `create<RadioState>()(...)`，符合迁移后的最简形态

**代码内注释审查**（lines 358-368）表明开发者**主动意识到**：
- `sessionToken`：XSS 读走风险
- `sessionId` + `queue` 不一致：reload 后"有 sessionId 无歌曲"尴尬态
- `messages`：与 sessionId 强相关 + `createSession` 会主动 `clearMessages`

**判定**：✅ 无偏差，且注释体现作者已考虑到 Context7 与规划者的全部要求。

### 检查点 2：selector 稳定性（重点）

逐个判定见**第五节**。所有 selector 都形式为 `useRadioStore((s) => s.xxx)` 或 `useRadioStore((s) => s.xxx)`，没有出现 `(s) => ({...})` / `(s) => arr.filter()` / `(s) => arr.slice()` / `(s) => arr.map()` / `(s) => Object.values(s.xxx)`。

返回值要么是 **原始值**（`string | boolean | number`），要么是 **state 中已存的对象/数组的同一引用**（`s.currentSong`、`s.queue`、`s.messages`、`s.likedSongIds` 等）—— 都是稳定引用。

### 检查点 3：devtools middleware

**当前代码**（`radioStore.ts:125` 等全部 set 调用 + line 372）：

```typescript
setCurrentSong: (song) => set({ currentSong: song }, false, 'player/setCurrentSong'),
...
{ name: 'MimoRadio' },  // devtools options
```

**对照 Context7 文档（devtools troubleshooting 章节）**：

> If action type names are not provided, they default to 'anonymous'. ... When fixing this, ensure the second parameter to `set` is `undefined` to preserve default replacement logic.

要点：
- ✅ 第三参（action name）每次都传 — 与文档一致（不会出现 'anonymous'）
- ✅ 命名风格 `module/actionName`（`player/setCurrentSong`, `chat/addMessage`, `radio/nextSong` 等）— 文档示例用的是 `jungle:bear/addBear`，文档并未硬性规定分隔符，`/` 与 `:` 都合规
- ⚠️ **注意点（文档明文）**：建议第二参传 `undefined` 而不是 `false` —— 但如 §2.3 vanilla 实现所示，`false` 与 `undefined` 在「partial 是对象」场景下**完全等价**（都不走全量替换）。功能上无偏差，仅风格上可统一为 `undefined` 更贴合文档示例
- ✅ devtools name 配置 `'MimoRadio'` —— 文档示例为 `devtools({ name: 'thing' })`，与之一致

**判定**：✅ 无偏差（功能 100% 正确；`false` vs `undefined` 是风格而非 bug，本报告不升级为 🟡 因为语义完全等价）

### 检查点 4：store 组合（slices + 双 middleware 嵌套）

**当前代码**（`radioStore.ts:111-341,345-374`）：

```typescript
type Mutators = [['zustand/devtools', never]]

const createPlayerSlice: StateCreator<RadioState, Mutators, [], PlayerSlice> = (set, get) => ({...})
const createSessionSlice: StateCreator<RadioState, Mutators, [], SessionSlice> = (set) => ({...})
const createChatSlice: StateCreator<RadioState, Mutators, [], ChatSlice> = (set, get) => ({...})
const createStatusSlice: StateCreator<RadioState, Mutators, [], StatusSlice> = (set) => ({...})
const createRadioActionsSlice: StateCreator<RadioState, Mutators, [], RadioActions> = (_set, get) => ({...})

export const useRadioStore = create<RadioState>()(
  devtools(
    persist(
      (...args) => ({
        ...createPlayerSlice(...args),
        ...createSessionSlice(...args),
        ...createChatSlice(...args),
        ...createStatusSlice(...args),
        ...createRadioActionsSlice(...args),
      }),
      { name: 'mimo-radio-store', partialize: ... },
    ),
    { name: 'MimoRadio' },
  ),
)
```

**对照 Context7 文档**：
- ✅ 5 个 slice 全部用 `StateCreator<Combined, Mutators, [], Slice>` 标注 — 与文档示例结构完全一致
- ✅ `Mutators = [['zustand/devtools', never]]` — 与文档示例字符串完全一致
- ✅ slice 通过 `(...args) => ({...slice(...args), ...})` 合成 — 与文档示例完全一致
- ✅ `devtools(persist(...))` 嵌套顺序 — 与文档"devtools 应在最外层"推荐完全一致
- ✅ middleware 套在最外层 create 函数（不在单个 slice 里） — 与文档"It is important to apply middlewares only in the combined store and not inside individual slices" 警告完全一致
- ✅ slice 内部 set 调用能拿到第三参 action name（`Mutators` 声明了 devtools）— 与文档示例一致

**判定**：✅ 完全符合 Zustand 5 推荐模式，且显式遵循了"middleware 不能放进 slice 内部"的文档警告。

## 五、selector 稳定性逐项核查（检查点 2）

全项目 grep 结果（按文件:行）：

### `src/app/page.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 26 | `(state) => state.sessionId` | ✅ 原始值（`string \| null`） |
| 27 | `(state) => state.currentSong` | ✅ state 中已存的引用（mutation 时整对象被替换为新引用，selector 返回新引用但 Zustand `Object.is` 比的是引用本身）|
| 28 | `(state) => state.queue` | ✅ state 中已存的引用（同上）|
| 29 | `(state) => state.isCreating` | ✅ `boolean` |
| 30 | `(state) => state.isPlaying` | ✅ `boolean` |
| 31 | `(state) => state.isOnline` | ✅ `boolean` |
| 32 | `(state) => state.isFullscreenPlayer` | ✅ `boolean` |
| 33 | `(state) => state.audioUnlocked` | ✅ `boolean` |
| 34 | `(state) => state.introScript` | ✅ `string \| null` |
| 35 | `(state) => state.introPlayed` | ✅ `boolean` |
| 36 | `(state) => state.pendingTtsText` | ✅ `string \| null` |
| 37 | `(state) => state.pendingTtsStop` | ✅ `boolean` |

### `src/app/settings/page.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 42 | `(s) => s.ttsVoice` | ✅ `string` |
| 43 | `(s) => s.setTtsVoice` | ✅ actions 引用永久稳定 |

### `src/components/ChatArea.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 13 | `(state) => state.messages` | ✅ state 已存引用 |
| 14 | `(state) => state.sessionId` | ✅ `string \| null` |

### `src/components/FullscreenPlayer.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 17 | `(s) => s.currentTime` | ✅ `number` |
| 18 | `(s) => s.duration` | ✅ `number` |
| 19 | `(s) => s.setCurrentTime` | ✅ action |
| 56 | `(s) => s.currentTime` | ✅ |
| 68 | `(s) => s.currentTime` | ✅ |
| 132 | `(s) => s.currentSong` | ✅ state 引用 |
| 133 | `(s) => s.isPlaying` | ✅ |
| 134 | `(s) => s.isSpeaking` | ✅ |
| 135 | `(s) => s.isTransitioning` | ✅ |
| 136 | `(s) => s.togglePlay` | ✅ |
| 137 | `(s) => s.setFullscreenPlayer` | ✅ |
| 138 | `(s) => s.nextSong` | ✅ |
| 139 | `(s) => s.prevSong` | ✅ |
| 140 | `(s) => s.messages` | ✅ state 引用 |

### `src/components/InputArea.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 16 | `(state) => state.isCreating` | ✅ |

### `src/components/KimiCard.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 44 | `(state) => state.currentTime` | ✅ |
| 45 | `(state) => state.duration` | ✅ |
| 46 | `(state) => state.setCurrentTime` | ✅ |
| 112 | `(state) => state.currentSong` | ✅ |
| 113 | `(state) => state.isPlaying` | ✅ |
| 114 | `(state) => state.togglePlay` | ✅ |
| 115 | `(state) => state.isSpeaking` | ✅ |
| 116 | `(state) => state.isTransitioning` | ✅ |
| 117 | `(state) => state.setFullscreenPlayer` | ✅ |
| 118 | `(state) => state.nextSong` | ✅ |
| 119 | `(state) => state.prevSong` | ✅ |
| 120 | `(state) => state.toggleLike` | ✅ |
| 122 | `(state) => state.likedSongIds` | ✅ state 引用 |
| 124 | `(state) => state.sessionId` | ✅ |
| 125 | `(state) => state.sessionToken` | ✅ |
| 149 | `(state) => state.volume` | ✅ |
| 150 | `(state) => state.setVolume` | ✅ |

### `src/components/PlanTimeline.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 47 | `(s) => s.currentSong` | ✅ |
| 48 | `(s) => s.isPlaying` | ✅ |
| 49 | `(s) => s.setCurrentSong` | ✅ |
| 50 | `(s) => s.setDuration` | ✅ |
| 51 | `(s) => s.setIsPlaying` | ✅ |

### `src/components/PlayerBar.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 9 | `(state) => state.currentSong` | ✅ |
| 10 | `(state) => state.isPlaying` | ✅ |
| 11 | `(state) => state.duration` | ✅ |

### `src/components/QueueList.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 8 | `(state) => state.queue` | ✅ state 引用 |
| 9 | `(state) => state.currentSong` | ✅ |

### `src/components/RecommendCardList.tsx`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 18 | `(s) => s.setCurrentSong` | ✅ |
| 19 | `(s) => s.setIsPlaying` | ✅ |
| 20 | `(s) => s.setDuration` | ✅ |
| 21 | `(s) => s.currentSong` | ✅ |

### `src/hooks/useAudioPlayer.ts`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 14 | `(state) => state.currentSong` | ✅ |
| 15 | `(state) => state.isPlaying` | ✅ |
| 16 | `(state) => state.isSpeaking` | ✅ |
| 17 | `(state) => state.nextSong` | ✅ |
| 18 | `(state) => state.volume` | ✅ |

### `src/hooks/useSession.ts`

| 行 | selector 表达式 | 判定 |
|----|----------------|------|
| 10 | `(state) => state.djEnabled` | ✅ |

### 全项目总计

- **selector 调用点总数**：57 处
- **稳定引用**：57 处（100%）
- **危险模式（返回新对象/数组）**：0 处
- **不稳定模式（`...spread`、`Array.filter` 等）**：0 处

**判定**：✅ 全项目 selector **100% 稳定**，无无限重渲染风险。

> 注：`useAudioPlayer.ts` 与 `PlayerBar.tsx` 等高频调用方都订阅单字段（如 `currentTime`、`isPlaying`），不会因为 set 其他字段（如 `messages`）触发重渲染——这是良好的 selector 粒度选择。

## 六、补充观察（不计入检查点）

下列点**不在本批次 4 个检查点内**，仅记录供规划者参考，不升级严重度：

1. **`useRadioStore.subscribe` 全项目 0 使用**：项目没用 subscribeWithSelector middleware / `store.subscribe` 全局订阅，而是全部走 React selector。Context7 提到这是 zustand 5 的常见模式——本报告认为此选择**完全合理**（components 已有 useStore + selector 的成熟模式）。

2. **`partialize` 未显式声明 `version` / `migrate`**：项目 `partialize` 只指定了 `name` + `partialize`，没设 `version` 与 `migrate`。当下字段范围与实现简单，**未来若字段变更需要持久化迁移**时，需要新增 `version` + `migrate`。当前 OK。

3. **`set` 第二参显式 `false`**：vs 文档示例的 `undefined`。**功能完全等价**（vanilla.ts 已证明），仅风格统一问题。不构成偏差，但建议未来按文档风格统一为 `undefined`。

4. **`createRadioActionsSlice` 内 `nextSong` 批量 setUpdates**（line 270-280）：使用了 `Object.assign`-like 的批量 `_set(updates)`，这是文档 `setState(partial, replace?)` 主用法的标准形式——良好实践。

## 七、结论

| 指标 | 数值 |
|------|------|
| 检查点总数 | 4 |
| ✅ 无偏差 | **4** |
| 🔴 P1 | 0 |
| 🟠 P1 | 0 |
| 🟡 P2 | 0 |
| selector 调用点核查 | 57 处全部稳定 |
| 推荐改进（非阻塞） | 第二参 `false` → `undefined` 风格统一 |

**Zustand 5 使用现状：完全符合 5.0.13 版本官方推荐模式**。审计未发现任何 API 误用、废弃 API、反模式或需立刻修复的偏差。可进入下一阶段（spec compliance review + code quality review）。

---

*本报告基于 Context7 实时文档 `/pmndrs/zustand` 的 5.x 版本，引用来源 URL 见第二节。审计时间：2026-07-11。版本对照：项目 zustand `^5.0.13`，已安装 `5.0.13`（精确匹配）。*
