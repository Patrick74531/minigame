# TikTok Leaderboard API

TikTok 小游戏专用排行榜后端，基于 **Cloudflare Workers + D1**。

## 目录结构

```
tiktok-leaderboard/
├── migrations/
│   └── 0001_init.sql          # D1 schema + indexes + seed data
├── src/
│   ├── config/
│   │   ├── constants.ts        # 业务常量（页大小、限流阈值等）
│   │   └── env.ts              # Env bindings 类型定义
│   ├── domain/
│   │   ├── errors.ts           # 统一业务异常
│   │   └── types.ts            # 领域类型 & API 响应格式
│   ├── middleware/
│   │   ├── cors.ts             # CORS 中间件
│   │   ├── errorHandler.ts     # 全局错误捕获 → { code, message, requestId }
│   │   ├── logger.ts           # 结构化日志
│   │   └── requestId.ts        # 请求追踪 ID
│   ├── platform/
│   │   ├── identity.ts         # PlatformIdentityProvider 接口
│   │   └── tiktok.ts           # TikTok 实现（X-TikTok-Token）
│   ├── repository/
│   │   ├── IdempotencyRepository.ts
│   │   ├── PlayerRepository.ts
│   │   ├── ScoreRepository.ts
│   │   ├── ScoreRepository.test.ts
│   │   └── SeasonRepository.ts
│   ├── router/
│   │   └── tiktok.ts           # /api/tiktok/* 路由
│   ├── service/
│   │   ├── LeaderboardService.ts
│   │   └── LeaderboardService.test.ts
│   └── index.ts                # Worker 入口
├── .eslintrc.js
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── wrangler.toml
```

## 架构分层

| 层          | 职责                                      |
|-------------|-------------------------------------------|
| **router**  | HTTP 路由、参数解析（zod）、调用 service   |
| **service** | 业务编排、验证、幂等、防刷                |
| **repository** | 统一 SQL 访问，禁止散落查询            |
| **domain**  | 类型定义、业务错误                        |
| **platform** | 平台身份抽象 `PlatformIdentityProvider`  |
| **middleware** | CORS / requestId / 日志 / 错误格式化    |
| **config**  | 环境变量类型、业务常量                    |

## 扩展新平台

1. 实现 `PlatformIdentityProvider` 接口（参考 `platform/tiktok.ts`）
2. 在 `router/` 下新建平台路由，注入对应 provider
3. 在 `index.ts` 中 `app.route('/api/<platform>', ...)` 挂载
4. **不需要修改** `LeaderboardService` 或 repository 层

## API 接口

### `GET /api/tiktok/init`
初始化玩家、返回赛季 + 排名。需 `X-TikTok-Token` header。

### `POST /api/tiktok/submit-score`
提交成绩。Body: `{ score, wave, runId }`。幂等（runId 去重）。

### `GET /api/tiktok/leaderboard?page=1`
获取当前赛季排行榜（分页，每页 50）。无需认证。

### `GET /api/tiktok/me/rank`
查询自己的排名。需 `X-TikTok-Token` header。

### `GET /health`
健康检查。

## 本地开发

```bash
cd tiktok-leaderboard
npm install
npm run migrate:local   # 创建本地 D1 表
npm run dev             # wrangler dev (localhost:8787)
```

## 测试

```bash
npm test
```

## 部署

```bash
# Staging
npm run migrate:staging
npm run deploy:staging

# Production
npm run migrate:prod
npm run deploy:prod
```

## curl 示例

```bash
# 生成测试 token (base64 JSON)
TOKEN=$(echo -n '{"userId":"test123","displayName":"TestPlayer"}' | base64)

# Init
curl http://localhost:8787/api/tiktok/init \
  -H "X-TikTok-Token: $TOKEN"

# Submit score
curl -X POST http://localhost:8787/api/tiktok/submit-score \
  -H "Content-Type: application/json" \
  -H "X-TikTok-Token: $TOKEN" \
  -d '{"score":1500,"wave":8,"runId":"run-001"}'

# Leaderboard
curl http://localhost:8787/api/tiktok/leaderboard?page=1

# My rank
curl http://localhost:8787/api/tiktok/me/rank \
  -H "X-TikTok-Token: $TOKEN"

# Health
curl http://localhost:8787/health
```

## 防刷分机制

- **幂等键 (runId)**：同一 runId 只入库一次，重复提交返回缓存结果
- **分数上限校验**：score ∈ [0, 999,999,999]，wave ∈ [0, 99,999]
- **Idempotency TTL**：1 小时自动过期

## 索引设计

| 索引                        | 用途                              |
|-----------------------------|-----------------------------------|
| `idx_players_platform_uid`  | 玩家登录 upsert O(1)             |
| `idx_scores_run_id`         | 幂等去重 O(1)                    |
| `idx_scores_season_score`   | 赛季排行榜 top N                 |
| `idx_scores_player_season`  | 玩家个人历史                      |
| `idx_lb_best_season_score`  | 物化最佳排行榜查询               |
| `idx_idem_expires`          | 过期幂等键清理                    |
