---
author: KIMI
task: 批 1 执行报告——P0b-2 鉴权 fail-closed / P0b-3 收藏上报反向 / P0b-4 tasteCache 分 key
created: 2026-07-18
status: DONE
---

# 执行报告：批 1（P0b 安全 + 数据污染）

## 一、执行摘要

| 项 | 内容 | 状态 |
|----|------|------|
| P0b-2 | R2 鉴权 fail-closed（显式 production 才严格，没配警告但能跑） | ✅ 单测 +3，E2E 3 场景全过 |
| P0b-3 | F1 收藏上报 action 反向 + 改误导注释 | ✅ 单测 +3 |
| P0b-4 | B6 tasteCache 按 limit 分 key | ✅ 单测改写 +2（9 个全过） |

基线变化：后端 281 → **286**，前端 179 → **182**，tsc 双零。无规格偏差。

## 二、改动明细

### P0b-2（R2 鉴权）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `backend/src/utils/sessionToken.ts` | `SECRET` 改为 `getSecret()`：production 无 SESSION_SECRET/API_KEY → import 时抛错；非 production 可用 fallback | 20-38 |
| `backend/src/index.ts` | 启动校验：production 无 API_KEY → throw；非 production 无 API_KEY → warn 警告；无 secret → `[DEV] using fallback session secret` warn | 167-177 |
| `backend/src/utils/sessionToken.test.ts` | +3 用例（prod 无 secret 抛错 / prod 有 secret 正常 / dev 无 secret 放行），env 修改用 try/finally 成对恢复（铁律 1） | 97-141 |

`auth.ts` 按规格**未动**（`!apiKey && production` 请求级 500 逻辑保留，作为运行时兜底；启动 fail-fast 由 index.ts 新增检查承担）。

### P0b-3（F1 收藏反向）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `frontend/src/components/KimiCard.tsx` | `handleLike` 改用 `useRadioStore.getState().likedSongIds.includes(id)` 读切换后最新值；`useCallback` 依赖去掉 `isSongLiked`；121 行误导注释改为准确注释（说明闭包陈旧风险 + 正确读法） | 121-153 |
| `frontend/src/components/KimiCard.test.tsx` | +3 用例（like / unlike / debounce 连点最终态一致），mock fetch 捕获 body 断言 action | 86-136 |

### P0b-4（B6 tasteCache）

| 文件 | 改动 | 行号（改后） |
|------|------|-------------|
| `backend/src/utils/tasteCache.ts` | 单槽 → `Map<string, CacheEntry>`，key = `liked:${limit}` / `disliked:${limit}`；`invalidate()` 改 `cache.clear()` | 26-68 |
| `backend/src/utils/tasteCache.test.ts` | mock 按 limit 截断返回（使不同 limit 可区分）；改写 2 个断言旧 bug 行为的用例；新增「不同 limit 不互相污染」describe（3 用例） | 1-20, 30-48, 111-140 |

## 三、验证结果

### P0b-2（高风险项，E2E 实测，非"待实测"）

| 场景 | 命令 | 结果 |
|------|------|------|
| ① 无 NODE_ENV + 无 API_KEY | `PORT=8011 API_KEY= NODE_ENV= tsx src/index.ts` | ✅ 启动成功（health 200）+ 两条警告（`⚠️ API_KEY not set...` + `[DEV] using fallback session secret`） |
| ② `NODE_ENV=production` + 无 key | `PORT=8012 ... NODE_ENV=production` | ✅ **exit 1**，`FATAL: Production requires SESSION_SECRET or API_KEY...`（fail-closed） |
| ③ production + 有 API_KEY | `PORT=8013 API_KEY=prod-test-key...` | ✅ 启动成功；无 key 请求 → **401**，带 key → **200** |

单测：`sessionToken.test.ts` 15/15（12→15）。

### P0b-3

单测：`KimiCard.test.tsx` 12/12（9→12）。fetch mock 捕获 body：`action: 'like'`（收藏）/ `'unlike'`（取消）/ 连点 3 次只发 1 次且 action=like（与最终 store 状态一致）。

### P0b-4

单测：`tasteCache.test.ts` 9/9。关键用例：30s 内先 `getLikedArtists(3)` 后 `getLikedArtists(5)` → 长度 3 和 5、db 调用 2 次、参数分别为 3/5（规格验收点）。

### 批 1 全量

```
backend: 33 文件 286 passed（281+5），tsc 零错误
frontend: 22 文件 182 passed（179+3），tsc 零错误
```

## 四、与规格的偏差

**无偏差。** 三项均按 `fix-plan-integrated-2026-07-17.md` P0b-2/3/4 + `review-supplement-2026-07-17.md` 调整 1/3 执行。两处说明（非偏差，规格允许范围内的落点选择）：

1. P0b-2 场景 ② 的抛错来自 `sessionToken.ts` 的 `getSecret()`（import 时 fail-fast），先于 index.ts 的 API_KEY 检查触发——两条 fail-fast 路径都在，行为符合规格预期（启动抛错）。
2. P0b-4 改写了 2 个断言旧 bug 行为的测试用例（「limit=3/5 共享缓存」「不同 limit 返回同一份缓存值」）——这两个断言正是 B6 bug 本身，规格要求改变行为，测试必须同步改（COLLABORATION §一「不为过测试改断言，除非规格要求」——此处规格要求）。

## 五、自评

- **P0b-2**：`getSecret()` 与既有 `assertSecretConfigured()` 检查重复（都查 production 无 secret）。保留两者是有意的——getSecret 兜底"import 即安全"，assert 是给 index.ts 启动流程的显式校验点。代价是两条错误消息文案不同，可接受。
- **P0b-2**：index.ts 的 API_KEY 检查比 assertSecretConfigured 更严（要求 API_KEY 本身存在，SESSION_SECRET 不能替代）——这是规格原意（auth 中间件靠 API_KEY），但意味着 production 部署必须配 API_KEY，文档（.env.example）在 P2-2 补齐时会体现。
- **P0b-3**：`isSongLiked` 函数保留（UI 渲染爱心状态仍用它，闭包对渲染无影响——React 会因 likedSongIds 订阅触发 re-render）。只修上报路径，改动最小。
- **P0b-4**：Map 无大小上限——key 数量 = limit 取值种数 × 2，当前调用方只有 3/5 两种，无泄漏风险。单用户应用无需 LRU（COLLABORATION §六.陷阱 3）。
- **遗留**：P0b-3 的 E2E（真实浏览器点收藏看后端日志）未做——该改动逻辑已被 3 个单测覆盖（fetch body 断言），且不属于 playbook 纪律 5 列出的 4 个高风险 E2E 项。如 ZCode 要求补 E2E 可后补。

## 六、铁律回顾

| 铁律 | 本批如何遵守 |
|------|-------------|
| 1 资源成对 try/finally | sessionToken.test.ts 的 env 修改/恢复在同一 try/finally；KimiCard 的 debounce clearTimeout/setTimeout 成对（原有结构保留） |
| 2 不用复制粘贴做重试 | 无重试逻辑；tasteCache 两个 getter 是不同 key 前缀 + 不同 db 函数，非可循环抽象的重试（保持规格原样，不过度抽象） |
| 3 异步三问 | handleLike debounce：clearTimeout 成对 ✓；fetch 有 catch ✓；无累积资源（单 ref 槽）✓。getSecret 为同步 |
| 4 替换已验证方案前理解原方案 | P0b-3 原注释说"isSongLiked 返回切换后的值"——先确认 toggleLike 是同步 set（zustand 同步）但闭包数组是旧渲染快照，才定位到"闭包陈旧"根因，未破坏 re-render 订阅路径 |
| 5 性能改动附 Profiler | 无性能改动；P0b-2 为高风险项已做真实启动 E2E（3 场景日志/状态码附 §三） |
| 6 删除功能 grep 全项目 | 无删除；注释改动（KimiCard:121）已确认无其他文档引用该注释文本 |

---

*报告由 KIMI 生成。*
