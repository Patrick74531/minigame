# Reddit 小游戏构建脚本说明

本文档对应脚本：

- `/Users/patrickwang/kingshit/scripts/build_reddit_package.sh`

目标：

1. 构建 Cocos Web 包（可选，支持 headless）。
2. 压缩可压缩资源（默认会先备份 `assets/resources`）。
3. 生成 Reddit 发布用 `webroot` 目录。
4. 自动移除 `index.html` 中的 inline JS（转为外部 `boot.js`），并移除 inline 事件处理。
5. 检查 Reddit 常见合规项（inline script/style、inline 事件、直接表单提交）。
6. 检查单文件大小上限（默认 95 MB，留出 Reddit 100 MB 限制余量）。
7. 生成体积报告与合规报告。

官方参考：

- [Web Views（0.12，限制项：无 inline CSS/JS、无直接表单提交）](https://developers.reddit.com/docs/0.12/interactive_posts/webviews)
- [Devvit Web Overview（接口 payload/超时限制）](https://developers.reddit.com/docs/next/capabilities/devvit-web/devvit_web_overview)
- [Launch Guide](https://developers.reddit.com/docs/next/launch/launch-guide)

## 1. 前置要求

必需：

- Node.js（用于 `npx gltf-transform`）
- Cocos Creator 3.8.x（如果要脚本内自动构建）

可选但建议安装（用于进一步压缩）：

- `magick`（ImageMagick）
- `cwebp`

检查命令：

```bash
command -v npx
command -v magick
command -v cwebp
```

## 2. 常用用法

### 用法 A：脚本内自动执行 Cocos 构建（最简）

```bash
COCOS_CREATOR="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
bash scripts/build_reddit_package.sh
```

### 用法 B：推荐的一键完整构建（与你当前项目一致）

```bash
COCOS_CREATOR="/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
bash scripts/build_reddit_package.sh \
  --no-optimize-source-assets \
  --cocos-build-opts "stage=build;buildPath=project://build;outputName=reddit-web"
```

说明：`--no-optimize-source-assets` 仅跳过源资源层重压缩，不影响合规改写与合规扫描。

### 用法 C：使用你已经在编辑器里构建好的目录

```bash
bash scripts/build_reddit_package.sh \
  --skip-cocos-build \
  --source-build-dir build/reddit-web
```

### 用法 D：只做打包，不改 `assets/resources`（跳过源资源压缩）

```bash
bash scripts/build_reddit_package.sh \
  --skip-cocos-build \
  --source-build-dir build/reddit-web \
  --no-optimize-source-assets
```

## 3. 关键参数

- `--skip-cocos-build`：跳过 headless Cocos 构建。
- `--source-build-dir <dir>`：指定已构建好的 Web 输出目录（需包含 `index.html`）。
- `--output-webroot <dir>`：发布包输出目录，默认 `dist/reddit-package/webroot`。
- `--report-dir <dir>`：报告输出目录，默认 `dist/reddit-package`。
- `--max-file-mb <num>`：单文件上限，默认 `95`。
- `--cocos-creator <path>`：CocosCreator 可执行文件路径。
- `--platform <name>`：构建平台，默认 `web-mobile`。
- `--cocos-build-opts "<raw>"`：附加 Cocos `--build` 选项字符串。
- `--no-optimize-source-assets`：关闭源资源压缩。
- `--backup-dir <dir>`：自定义源资源备份目录。

## 4. 输出内容

默认输出：

- 发布目录：`/Users/patrickwang/kingshit/dist/reddit-package/webroot`
- 构建报告：`/Users/patrickwang/kingshit/dist/reddit-package/reddit_build_report_<timestamp>.txt`
- 合规报告：`/Users/patrickwang/kingshit/dist/reddit-package/reddit_compliance_<timestamp>.txt`
- 资源压缩报告：`/Users/patrickwang/kingshit/dist/reddit-package/reddit_asset_opt_<timestamp>.tsv`
- 源资源备份（若启用）：`/Users/patrickwang/kingshit/backups/resources_backup_<timestamp>`

报告会包含：

1. 总体积和最大单文件。
2. Top 大文件列表。
3. 各扩展名文件数量。
4. 源资源压缩前后差值。
5. HTML 合规扫描结果（PASS/FAIL）。

## 5. Reddit/Devvit 对接建议

把发布目录接入你的 Devvit 配置（示意）：

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "your-reddit-game",
  "post": {
    "dir": "dist/reddit-package/webroot",
    "entrypoints": {
      "default": {
        "entry": "index.html",
        "height": "tall"
      }
    }
  },
  "scripts": {
    "build": "bash scripts/build_reddit_package.sh"
  }
}
```

## 6. 注意事项

1. 脚本会对发布产物自动执行 Reddit 合规改写：把 `index.html` 的 inline 启动逻辑移到 `boot.js`。
2. 脚本默认会改写 `assets/resources` 中体积变小的文件，并先做备份。
3. 如果你只想测试构建流程，不想改源资源，请加 `--no-optimize-source-assets`。
4. 如果合规扫描失败或最大文件超限，脚本会返回非 0 退出码，便于接入 CI。
