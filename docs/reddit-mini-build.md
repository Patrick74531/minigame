# Reddit 小游戏构建脚本说明

本文档对应脚本：

- `/Users/patrickwang/kingshit/scripts/build_reddit_package.sh`

目标：

1. 构建 Cocos Web 包（可选，支持 headless）。
2. 压缩可压缩资源（默认会先备份 `assets/resources`）。
3. 生成 Reddit 发布用 `webroot` 目录。
4. 检查单文件大小上限（默认 95 MB，留出 Reddit 100 MB 限制余量）。
5. 生成体积报告。

官方参考：

- [Devvit Web Configuration](https://developers.reddit.com/docs/next/capabilities/devvit-web/configuration)
- [Devvit Unity Quickstart（含 100MB/30s 限制说明）](https://developers.reddit.com/docs/quickstart/quickstart-unity)
- [Launch Guide](https://developers.reddit.com/docs/launch-guide)

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

### 用法 A：脚本内自动执行 Cocos 构建（推荐）

```bash
COCOS_CREATOR="/Applications/CocosCreator/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
bash scripts/build_reddit_package.sh
```

### 用法 B：使用你已经在编辑器里构建好的目录

```bash
bash scripts/build_reddit_package.sh \
  --skip-cocos-build \
  --source-build-dir build/web-mobile
```

### 用法 C：只做打包，不改 `assets/resources`（跳过源资源压缩）

```bash
bash scripts/build_reddit_package.sh \
  --skip-cocos-build \
  --source-build-dir build/web-mobile \
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
- 资源压缩报告：`/Users/patrickwang/kingshit/dist/reddit-package/reddit_asset_opt_<timestamp>.tsv`
- 源资源备份（若启用）：`/Users/patrickwang/kingshit/backups/resources_backup_<timestamp>`

报告会包含：

1. 总体积和最大单文件。
2. Top 大文件列表。
3. 各扩展名文件数量。
4. 源资源压缩前后差值。

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

1. 脚本默认会改写 `assets/resources` 中体积变小的文件，并先做备份。
2. 如果你只想测试构建流程，不想改源资源，请加 `--no-optimize-source-assets`。
3. 如果报告提示“最大文件超限”，脚本会返回非 0 退出码，便于接入 CI。
