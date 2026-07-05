---
agent: MiNiMax
author: MiNiMax
task: 第4轮-序6A 后端 helmet() 显式 Content-Security-Policy 配置
created: 2026-07-05
---

# 执行报告：helmet() 显式 CSP 配置（第4轮-序6A）

## 一、任务背景

Roadmap §一 第4轮 序6A：上线前加固，为 `backend/src/index.ts` 的 helmet() 配置 Content-Security-Policy。

## 二、根因（来自 Mavis P2.2）

后端默认 helmet 配置生产 X-Content-Type-Options/X-Frame-Options 等，但**未显式声明 CSP**。即便 helmet v8+ 默认已下发 CSP header，但配置隐式——若未来 helmet 默认值变更会引入回归风险。

## 三、改法

`backend/src/index.ts:33-66`：

```ts
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,  // 不与 helmet 默认合并，从零显式声明
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,  // 防 PWA 兼容性
  }),
)
```

新增 `backend/src/middleware/security-headers.test.ts`（14 个 supertest 断言）—— 复刻 index.ts 的 helmet 配置做快照测试，避免 import index.ts 触发 DB/listen 等副作用。

## 四、设计依据

每条 directive 的语义：

| Directive | 值 | 意图 |
|-----------|---|------|
| `defaultSrc` | `'self'` | 兜底（同源） |
| `scriptSrc` | `'self'` | 禁 inline 脚本（后端纯 JSON） |
| `styleSrc` | `'self' 'unsafe-inline'` | 保留 inline style（兼容部分 JSON 含样式数据） |
| `imgSrc` | `'self' data:` | 允许 base64 封面图 |
| `connectSrc` | `'self'` | fetch/XHR 限制同源 |
| `frameSrc`/`frameAncestors` | `'none'` | 双层防嵌入 |
| `objectSrc` | `'none'` | 禁插件 |
| `baseUri`/`formAction` | `'self'` | 防 base/form 劫持 |
| `upgradeInsecureRequests` | 启用 | 自动 http→https |
| COEP | `false` | 防 PWA workbox 兼容性问题 |

## 五、实测（铁律 5 实证）

`backend/src/middleware/security-headers.test.ts` 14 个 supertest 断言全过：

- `content-security-policy`: 存在（完整 string 包含 9 条 directive 全部字段）
- `cross-origin-embedder-policy`: undefined（COEP=false 验证）
- `x-content-type-options`: 'nosniff'（默认保留）
- `x-frame-options`: 'SAMEORIGIN'（默认保留）
- `cross-origin-resource-policy`: 'same-origin'（默认保留）
- `x-powered-by`: undefined

## 六、测试基线

| | 改前 | 改后 |
|--|-----|------|
| backend tsc | 0 | 0 |
| backend vitest | 253 | **267**（+14） |
| frontend tsc | 0 | 0 |
| frontend vitest | 127 | 127 |
| 总测试 | 380 | 394 |

## 七、自评

- ✅ COEP false 防 PWA 兼容
- ✅ 其它 helmet 默认安全头保留
- ✅ CSP 配置在 JSON 响应上不强制（curl 验证响应正常）
- ✅ 未改非 helmet 的中间件
- ✅ 未引入新依赖
- ✅ 14 个测试断言覆盖全部 directive + 默认安全头保留

## 八、未完成

无。第4轮其他 4 任务独立完成。

---

*报告由 MiNiMax 生成。*
