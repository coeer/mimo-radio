# AI Radio 改进行动计划

**目标**: 在 3 个月内将项目质量评分从 78 提升到 90  
**执行周期**: 2026-03-20 至 2026-06-20  
**负责人**: 开发团队

---

## 📅 第一周 (3/20 - 3/26): 基础加固

### 任务 1: 添加后端 ESLint 配置

**优先级**: 🔴 高  
**耗时**: 2 小时  
**负责人**: 后端开发

```bash
# 1. 安装依赖
cd backend
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# 2. 创建配置文件
cat > .eslintrc.json << 'EOF'
{
  "env": { "node": true, "es2022": true },
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "warn",
    "prefer-const": "error"
  },
  "ignorePatterns": ["dist/", "node_modules/"]
}
EOF

# 3. 添加脚本到 package.json
# "scripts": { "lint": "eslint src --ext .ts" }

# 4. 运行检查
npm run lint -- --fix
```

**验收标准**:
- [ ] ESLint 配置文件创建完成
- [ ] 运行 `npm run lint` 无错误
- [ ] 修复所有 `any` 类型警告

---

### 任务 2: 消除 @ts-ignore

**优先级**: 🔴 高  
**耗时**: 3 小时  
**负责人**: 后端开发

**文件 1**: `backend/src/services/upnp.ts`

```typescript
// ❌ 当前代码 (第 3 行)
// @ts-ignore
const UPnPClient = require('upnp-device-client');

// ✅ 修复方案
// 方案 A: 创建类型声明
// upnp.d.ts
declare module 'upnp-device-client' {
  interface Device {
    friendlyName: string;
    manufacturer: string;
    modelName: string;
  }
  
  export default class UPnPClient {
    constructor(device: Device);
    getVolume(): Promise<number>;
    setVolume(level: number): Promise<void>;
    play(url: string): Promise<void>;
    pause(): Promise<void>;
    stop(): Promise<void>;
  }
}

// 方案 B: 使用 unknown
const UPnPClient = require('upnp-device-client') as unknown as typeof import('upnp-device-client').default;
```

**文件 2**: `backend/src/services/qqmusic.ts`

```typescript
// ❌ 当前代码 (第 1-2 行)
// @ts-ignore
const request = require('request');

// ✅ 修复方案
import axios from 'axios';
// 或者
const request = require('request') as (options: any, callback: (error: any, response: any, body: any) => void) => void;
```

**验收标准**:
- [ ] 所有 @ts-ignore 已移除
- [ ] TypeScript 编译无错误
- [ ] 功能测试通过

---

### 任务 3: 统一错误处理

**优先级**: 🔴 高  
**耗时**: 4 小时  
**负责人**: 后端开发

**步骤 1**: 创建异步处理器

```typescript
// backend/src/utils/asyncHandler.ts
import { Request, Response, NextFunction } from 'express';

type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const asyncHandler = (fn: AsyncFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

**步骤 2**: 更新所有路由

```typescript
// backend/src/routes/radio.ts
import { asyncHandler } from '../utils/asyncHandler';

// ❌ 之前
router.post('/create', async (req, res) => {
  try {
    // 业务逻辑
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ 之后
router.post('/create', asyncHandler(async (req, res) => {
  // 业务逻辑，错误会自动传递给错误处理中间件
}));
```

**步骤 3**: 增强错误处理中间件

```typescript
// backend/src/middleware/error.ts
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // AppError 处理
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.errorCode
      }
    });
  }
  
  // 未知错误
  console.error('Unhandled error:', err);
  
  // 生产环境隐藏详细信息
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(500).json({
    success: false,
    error: {
      message,
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}
```

**验收标准**:
- [ ] 所有路由使用 asyncHandler
- [ ] 错误响应格式统一
- [ ] 生产环境不泄露堆栈信息

---

## 📅 第二周 (3/27 - 4/2): 测试补充

### 任务 4: 补充 middleware 测试

**优先级**: 🔴 高  
**耗时**: 6 小时  
**负责人**: QA/开发

**文件**: `backend/src/middleware/validate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateBody, validateParams, validateQuery } from './validate';
import { z } from 'zod';

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().positive()
  });

  it('should pass valid data', () => {
    const req = { body: { name: 'John', age: 25 } } as any;
    const res = {} as any;
    const next = vi.fn();
    
    validateBody(schema)(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'John', age: 25 });
  });

  it('should reject invalid data', () => {
    const req = { body: { name: '', age: -1 } } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();
    
    validateBody(schema)(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
```

**文件**: `backend/src/middleware/error.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { errorHandler, AppError } from './error';

describe('errorHandler', () => {
  it('should handle AppError', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();
    
    errorHandler(err, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Not found', code: 'NOT_FOUND' }
    });
  });

  it('should hide error details in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Database connection failed');
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();
    
    errorHandler(err, req, res, next);
    
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Internal server error'
        })
      })
    );
    
    process.env.NODE_ENV = 'development';
  });
});
```

**验收标准**:
- [ ] validate.test.ts 包含 8+ 测试用例
- [ ] error.test.ts 包含 5+ 测试用例
- [ ] 所有测试通过
- [ ] 覆盖率 > 80%

---

### 任务 5: 补充状态管理测试

**优先级**: 🔴 高  
**耗时**: 4 小时  
**负责人**: 前端开发

**文件**: `frontend/src/store/radioStore.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRadioStore } from './radioStore';

describe('radioStore', () => {
  beforeEach(() => {
    // 重置 store
    useRadioStore.setState({
      currentSong: null,
      queue: [],
      isPlaying: false,
      currentIndex: -1
    });
  });

  describe('setCurrentSong', () => {
    it('should set current song', () => {
      const { result } = renderHook(() => useRadioStore());
      const song = { id: '1', title: 'Test Song', artist: 'Test Artist' };
      
      act(() => {
        result.current.setCurrentSong(song);
      });
      
      expect(result.current.currentSong).toEqual(song);
    });
  });

  describe('addToQueue', () => {
    it('should add song to queue', () => {
      const { result } = renderHook(() => useRadioStore());
      const song = { id: '1', title: 'Song 1', artist: 'Artist 1' };
      
      act(() => {
        result.current.addToQueue(song);
      });
      
      expect(result.current.queue).toHaveLength(1);
      expect(result.current.queue[0]).toEqual(song);
    });

    it('should add multiple songs', () => {
      const { result } = renderHook(() => useRadioStore());
      
      act(() => {
        result.current.addToQueue({ id: '1', title: 'Song 1' });
        result.current.addToQueue({ id: '2', title: 'Song 2' });
      });
      
      expect(result.current.queue).toHaveLength(2);
    });
  });

  describe('nextSong', () => {
    it('should move to next song in queue', () => {
      const { result } = renderHook(() => useRadioStore());
      
      act(() => {
        result.current.setQueue([
          { id: '1', title: 'Song 1' },
          { id: '2', title: 'Song 2' }
        ]);
        result.current.setCurrentIndex(0);
      });
      
      act(() => {
        result.current.nextSong();
      });
      
      expect(result.current.currentIndex).toBe(1);
      expect(result.current.currentSong?.id).toBe('2');
    });

    it('should handle empty queue', () => {
      const { result } = renderHook(() => useRadioStore());
      
      act(() => {
        result.current.nextSong();
      });
      
      expect(result.current.currentSong).toBeNull();
    });
  });

  describe('togglePlay', () => {
    it('should toggle play state', () => {
      const { result } = renderHook(() => useRadioStore());
      
      expect(result.current.isPlaying).toBe(false);
      
      act(() => {
        result.current.togglePlay();
      });
      
      expect(result.current.isPlaying).toBe(true);
      
      act(() => {
        result.current.togglePlay();
      });
      
      expect(result.current.isPlaying).toBe(false);
    });
  });
});
```

**验收标准**:
- [ ] 测试文件包含 10+ 测试用例
- [ ] 覆盖所有核心方法
- [ ] 测试通过率 100%

---

## 📅 第三周 (4/3 - 4/9): 性能优化

### 任务 6: 优化数据库查询

**优先级**: 🟡 中  
**耗时**: 3 小时  
**负责人**: 后端开发

```sql
-- 1. 分析现有查询
EXPLAIN QUERY SELECT * FROM sessions WHERE id = ?;
EXPLAIN QUERY SELECT * FROM songs WHERE genre = ?;

-- 2. 添加索引
CREATE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
CREATE INDEX IF NOT EXISTS idx_songs_mood ON songs(mood_score);

-- 3. 优化查询语句
-- ❌ 之前
SELECT * FROM songs WHERE genre = 'pop';

-- ✅ 之后 (使用覆盖索引)
SELECT id, title, artist, duration FROM songs WHERE genre = 'pop' LIMIT 20;

-- 4. 清理过期数据
DELETE FROM sessions WHERE created_at < datetime('now', '-7 days');
VACUUM;
```

**验收标准**:
- [ ] 关键查询添加索引
- [ ] 查询时间减少 50%
- [ ] 定期清理脚本创建

---

### 任务 7: 实现缓存机制

**优先级**: 🟡 中  
**耗时**: 4 小时  
**负责人**: 后端开发

```typescript
// backend/src/utils/cache.ts
class MemoryCache {
  private cache = new Map<string, { data: any; expiry: number }>();
  
  set(key: string, data: any, ttlMs: number = 300000) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
  }
  
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  delete(key: string) {
    this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

export const cache = new MemoryCache();

// 使用示例
import { cache } from '../utils/cache';

export async function getWeather(city: string) {
  const cacheKey = `weather:${city}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }
  
  const weather = await fetchWeatherFromAPI(city);
  cache.set(cacheKey, weather, 300000); // 5 分钟
  
  return weather;
}
```

**验收标准**:
- [ ] 缓存管理器实现
- [ ] 天气服务使用缓存
- [ ] 音乐服务使用缓存
- [ ] 缓存命中率 > 60%

---

## 📅 第四周 (4/10 - 4/16): 可观测性

### 任务 8: 实现结构化日志

**优先级**: 🟡 中  
**耗时**: 4 小时  
**负责人**: 后端开发

```bash
npm install winston
```

```typescript
// backend/src/utils/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ai-radio' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export default logger;

// 使用示例
import logger from '../utils/logger';

logger.info('Server started', { port: 8000 });
logger.error('Database error', { error: err.message, query: 'SELECT * FROM songs' });
logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
```

**验收标准**:
- [ ] Winston 配置完成
- [ ] 关键位置添加日志
- [ ] 日志文件自动生成
- [ ] 日志格式结构化

---

### 任务 9: 添加健康检查

**优先级**: 🟡 中  
**耗时**: 2 小时  
**负责人**: 后端开发

```typescript
// backend/src/routes/health.ts
import { Router, Request, Response } from 'express';
import { db } from '../db';
import os from 'os';

const router = Router();

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: 'healthy' | 'unhealthy';
    memory: {
      total: number;
      free: number;
      used: number;
      percentUsed: number;
    };
    cpu: {
      loadAvg: number[];
    };
  };
}

router.get('/health', async (req: Request, res: Response) => {
  const healthCheck: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'unhealthy',
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        percentUsed: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
      },
      cpu: {
        loadAvg: os.loadavg()
      }
    }
  };

  // 检查数据库连接
  try {
    db.prepare('SELECT 1').get();
    healthCheck.services.database = 'healthy';
  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.services.database = 'unhealthy';
  }

  const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// 就绪检查 (用于 Kubernetes)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    db.prepare('SELECT 1').get();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: 'Database unavailable' });
  }
});

export default router;

// 在 index.ts 中添加
import healthRouter from './routes/health';
app.use('/api', healthRouter);
```

**验收标准**:
- [ ] /api/health 端点可用
- [ ] /api/ready 端点可用
- [ ] 返回数据库状态
- [ ] 返回系统资源信息

---

## 📅 第五周 (4/17 - 4/23): 弹性设计

### 任务 10: 实现断路器模式

**优先级**: 🟡 中  
**耗时**: 4 小时  
**负责人**: 后端开发

```typescript
// backend/src/utils/circuitBreaker.ts
type State = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: State = 'closed';
  private successCount: number = 0;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeout: number = 60000, // 1 分钟
    private readonly halfOpenSuccessThreshold: number = 3
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open. Service unavailable.');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): State {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
  }
}

// 使用示例
const weatherBreaker = new CircuitBreaker(3, 30000);
const musicBreaker = new CircuitBreaker(5, 60000);

export async function getWeather(city: string) {
  return weatherBreaker.execute(async () => {
    const response = await fetch(`https://api.weather.com/${city}`);
    if (!response.ok) throw new Error('Weather API failed');
    return response.json();
  });
}

export async function searchMusic(query: string) {
  return musicBreaker.execute(async () => {
    const response = await fetch(`https://api.music.com/search?q=${query}`);
    if (!response.ok) throw new Error('Music API failed');
    return response.json();
  });
}
```

**验收标准**:
- [ ] CircuitBreaker 类实现
- [ ] 天气服务集成断路器
- [ ] 音乐服务集成断路器
- [ ] 单元测试通过

---

## 📊 进度跟踪

### 每周检查点

| 周次 | 日期 | 关键任务 | 验收标准 | 状态 |
|------|------|----------|----------|------|
| 第 1 周 | 3/20-3/26 | ESLint, @ts-ignore, 错误处理 | 编译通过，无警告 | ⬜ |
| 第 2 周 | 3/27-4/2 | middleware 测试, store 测试 | 测试覆盖率 > 50% | ⬜ |
| 第 3 周 | 4/3-4/9 | 数据库优化, 缓存机制 | 查询时间 < 100ms | ⬜ |
| 第 4 周 | 4/10-4/16 | 日志系统, 健康检查 | 日志结构化，端点可用 | ⬜ |
| 第 5 周 | 4/17-4/23 | 断路器模式 | 外部服务故障隔离 | ⬜ |

### 质量指标

| 指标 | 当前值 | 第 1 周目标 | 第 5 周目标 |
|------|--------|-------------|-------------|
| 测试覆盖率 | 30% | 40% | 60% |
| ESLint 错误 | N/A | 0 | 0 |
| @ts-ignore | 4 | 0 | 0 |
| API 响应时间 | ? | < 500ms | < 200ms |

---

## 🚀 快速开始

### 第一天执行清单

```bash
# 1. 克隆项目 (如果还没有)
cd D:\Coder\ai-radio

# 2. 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 3. 添加 ESLint (任务 1)
cd ../backend
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# 4. 创建 ESLint 配置
cat > .eslintrc.json << 'EOF'
{
  "env": { "node": true, "es2022": true },
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "warn"
  }
}
EOF

# 5. 运行检查
npx eslint src --ext .ts

# 6. 开始修复 @ts-ignore (任务 2)
grep -r "@ts-ignore" src/
```

---

## 📚 参考资源

- [ESLint 配置指南](https://eslint.org/docs/latest/use/configure/)
- [Vitest 测试框架](https://vitest.dev/)
- [Winston 日志库](https://github.com/winstonjs/winston)
- [断路器模式](https://martinfowler.com/bliki/CircuitBreaker.html)

---

**文档版本**: v1.0  
**创建日期**: 2026-03-19  
**执行周期**: 5 周  
**更新频率**: 每周更新进度