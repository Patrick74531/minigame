# Reddit / TikTok 双平台发布说明

## 1. 代码结构与运行时分流

- 游戏运行时统一通过 `getSocialBridge()` 访问排行榜、分数上报、关注逻辑。
- `Reddit` 平台使用 `RedditBridge`（走 `/api/*` + Devvit 上下文）。
- `TikTok` 平台使用 `TikTokBridge`（优先走 `/api/tiktok/*`，失败时本地 fallback）。
- 非 Reddit 平台会自动隐藏首页“关注领钻石”按钮。

## 2. 构建命令

- Reddit 构建：`npm run build:reddit`
- TikTok 构建：`npm run build:tiktok`

说明：

- `build:reddit` 会开启 `GVR_ENABLE_REDDIT_CSP_PATCH=1`，执行 Reddit/Devvit CSP 相关补丁。
- `build:tiktok` 会关闭该补丁，并自动注入 `platform-config.js`（设置 `window.__GVR_PLATFORM__='tiktok'`）。

## 3. 以后发布 Reddit 的步骤

1. 执行 `npm run build:reddit`
2. 执行 `cd devvit && npx devvit upload`
3. （需要安装到测试版块时）执行 `npx devvit install granny_vs_robot_dev`

产物目录：

- `devvit/webroot`

## 4. 以后发布 TikTok 的步骤

1. 执行 `npm run build:tiktok`
2. 使用构建产物目录 `dist/tiktok-package/webroot` 作为 TikTok Mini Game 上传包
3. 在 TikTok 平台后台配置你的后端域名白名单（用于 `/api/tiktok/*`）

产物目录：

- `dist/tiktok-package/webroot`

## 5. TikTok 后端对接约定

默认接口前缀：`/api/tiktok`

建议实现：

- `GET /api/tiktok/init`
- `GET /api/tiktok/leaderboard`
- `POST /api/tiktok/submit-score`

可选：

- 通过全局变量覆盖接口前缀：`window.__GVR_TIKTOK_API_BASE__ = 'https://your-domain/api/tiktok'`
