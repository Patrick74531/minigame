---
description: Build Cocos Creator game and deploy to Reddit (patch CSP + upload)
---

## Full Build → Patch → Deploy Workflow

This project uses **Devvit Web** (`devvit.json`) with:

- `devvit/webroot/preview.html` — inline launch screen (auto-injected by patch-csp.cjs)
- `devvit/webroot/index.html` — full Cocos game (expanded mode via `requestExpandedMode`)
- `devvit/dist/server/index.cjs` — Hono API server (auto-bundled by patch-csp.cjs)

### Step 1: Build in Cocos Creator (manual, GUI required)

Open Cocos Creator, go to **Project → Build**, select the **Web Mobile** template and set:

- Output path: `<project_root>/build/reddit-web`
- MD5 Cache: OFF (keeps filenames stable)
- Source Maps: OFF

Click **Build**, then **Make** (or Build+Make together). Wait for it to complete.

### Step 2: Deploy (copies build, patches CSP, injects preview, uploads)

After the Cocos Creator build finishes, run this single command from the project root:

// turbo

```bash
cd /Users/patrickwang/kingshit && npm run deploy
```

This command:

1. Copies `build/reddit-web/` → `devvit/webroot/` and applies all Cocos patches
2. Installs devvit npm packages (if needed)
3. Runs `patch-csp.cjs` — patches CSP violations AND bundles `preview.js` + `server/index.cjs`
4. Uploads to Reddit and installs on dev subreddit
