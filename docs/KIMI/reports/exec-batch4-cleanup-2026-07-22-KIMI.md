---
author: KIMI
task: 深度 review 批次 4（🟡/🔵 扫尾自选）
created: 2026-07-22
status: DONE
commits: e155bf5（正确性+安全）、d0ae86e（测试补强）
---

# 批次 4 执行报告：🟡/🔵 扫尾

## 一、执行摘要

按总规格 §三，从 15 个候选项中自选 9 项高 ROI 执行：6 项机械小改（B-1/B-3/B-5/B-6/N-4/F-5，一个 commit）+ 3 项测试补强（T-2/T-1/N-5，一个 commit）。全量验证：后端 305→**313 passed**、前端 210→**211 passed**、tsc 双零、后端 lint **0 errors**（19 warnings 为存量，可保留）。跳过 6 项（B-2/B-4/F-2/F-6/T-3/L-*），理由见 §四。

## 二、改动明细

### commit e155bf5（正确性 + 安全）

| 编号 | 文件 | 改动 | 行号 |
|---|---|---|---|
| B-1 | backend/src/services/musicSource.ts | 新增 `qqReadyInflight` 模块级标记；isReady 异步刷新加 in-flight 去重；`qqReadyCache !== true`（含 null 冷启动）时本轮回落网易云 | :29, :48-66 |
| B-3 | backend/src/services/mimo.ts | analyzePersonality 改用 `extractJsonObject` + null 检查 + 类型守卫（对齐 getRecommendationStrategy :136），兜底文案不变 | :222-235 |
| N-4 | backend/src/services/mimo.ts | analyzePersonality prompt 里 `emotionTags` 逐项 `sanitizePromptInput`（原歌名/歌手消毒但标签漏了） | :213 |
| B-5 | backend/src/middleware/aiLimiter.ts | skip 改 `NODE_ENV !== 'production'`（dev 联调不再被 10/min 误限，生产才启用） | :19 |
| B-6 | backend/src/utils/fetchWithTimeout.ts | 默认端口判定 `url.startsWith('https')` → `new URL(url).protocol === 'https:'` | :91-94 |
| F-5 | frontend/src/components/KimiCard.tsx | likeDebounceRef 加 unmount cleanup（useEffect 返回 clearTimeout） | :133-137 |

### commit d0ae86e（测试补强）

| 编号 | 文件 | 改动 | 用例数 |
|---|---|---|---|
| T-2 | backend/src/utils/fetchWithTimeout.test.ts | HALF_OPEN 两用例：OPEN→30s 后探测成功→CLOSED 恢复放行；探测失败→回 OPEN 续拒（含 29s 边界仍拒） | +2 |
| T-1 | backend/src/services/planner.test.ts（新建） | planner 首批测试：AI 成功映射 / tracksLoaded 成功路径 / tracksLoaded 失败路径（S1）/ 缓存命中 aiChat 仅一次 / AI 抛错兜底 / AI 非 JSON 兜底 | +6 |
| N-5 | frontend/src/store/radioStore.playRequest.test.ts | 场景 3b：isTransitioning+isSpeaking 同置 + auto play → R2 丢弃（pendingResume=false），锁死 R2 先于 R3 的规则顺序 | +1 |

## 三、验证结果

- 后端 `npx tsc --noEmit`：零错误
- 前端 `npx tsc --noEmit`：零错误
- 后端 `npx vitest run`：**313 passed（32→33 文件）**，含新增 planner.test.ts 6 用例、fetchWithTimeout.test.ts 12 用例（+2）
- 前端 `npx vitest run`：**211 passed（25 文件）**，playRequest.test.ts 19 用例（+1）
- 后端 `npm run lint`：**0 errors**，19 warnings（存量，含 fetchWithTimeout.ts:37 `getHost` 未使用——为既有代码，非本次引入，未顺手清理以免扩大 diff）

## 四、与规格的偏差

1. **commit message 未逐字用规格原文**：规格未给批次 4 固定 commit 文案（"可拆多个 commit"），自拟两条，语义覆盖全部改动。
2. **T-1 未覆盖"并发去重"**：planner 本身无 in-flight 去重实现（并发空缓存调用会各调一次 aiChat），测试只能锁定已实现行为，不为不存在的功能写断言。此点作为 🔵 级观察遗留（并发双调 MiMo 浪费 token，但结果一致，无正确性问题）。
3. **跳过 6 项的裁决理由**：
   - B-2（req.setTimeout）：行为敏感，影响所有长连接端点，需单独评估，不适合扫尾批次夹带。
   - B-4（API envelope 统一）：涉及面太大（所有路由响应格式），应单独立项。
   - F-2（KimiCard Effect 2 依赖改 id）：有破坏 QQ 播放链路风险，改动收益不确定。
   - F-6（视觉小瑕疵）：ROI 低。
   - T-3（coverage 阈值）：可能卡 CI 构建，需先测全量覆盖率再定阈值。
   - L-*（日志类）：全部标记可选，本批略过。

## 五、自评

- 6 项机械小改全部先 Read 确认行号再 Edit，无一处凭记忆改。
- B-1 是最有风险的一项（改了 getMusicSource 回落语义），验证依赖全量测试 + tsc；QQ 实际未就绪场景无法在本环境端到端复现，依赖逻辑推演：null→回落网易云 + 后台刷新缓存，下一轮按真实状态分发。此为本批**最希望 ZCode 复核的点**。
- N-5 用例先 grep 确认 playRequest 源码 R2(:298) 先于 R3(:306) 再写断言，没有按记忆写测试。

## 六、前科复盘

- **铁律 1（资源成对）**：F-5 正是补"setTimeout 无 cleanup"的漏点；B-1 的 in-flight 标记在 then/catch/finally 里复位，finally 兜底成对。
- **铁律 4（理解原方案）**：B-3 保留了原兜底文案与 catch 结构，只换 JSON 提取方式；B-5 保留原注释脉络并补充 dev 豁免理由；B-6 保留端口白名单语义，只修 scheme 判定。
- **铁律 6（删功能 grep）**：本批无删除行为；B-5 改动前确认 aiLimiter 只在 radio/dj 两路由引用（批次 1 已摸清）。
- **未重蹈的坑**：musicSource.ts 编辑中曾先引用 `qqReadyInflight` 后补声明，当场用 tsc 验证发现即补，没有带伤提交（上轮"编译不过就继续"的教训）。

## 七、状态

DONE。两个 commit 已落 master，验证全绿。

## 八、落款

*报告由 KIMI 生成。*
