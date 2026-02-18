---
description: Build Cocos Creator game and deploy to Reddit (patch CSP + upload)
---

## Full Build → Patch → Deploy Workflow

### Step 1: Build in Cocos Creator (manual, GUI required)
Open Cocos Creator, go to **Project → Build**, select the **Web Mobile** template and set:
- Output path: `<project_root>/devvit/webroot`
- MD5 Cache: OFF (keeps filenames stable)
- Source Maps: OFF

Click **Build**, then **Make** (or Build+Make together). Wait for it to complete.

### Step 2: Apply CSP patches + deploy
After the Cocos Creator build finishes, run this single command from the project root:

// turbo
```bash
cd /Users/patrickwang/kingshit && npm run deploy
```

That command patches all CSP violations and uploads to Reddit in one step.
