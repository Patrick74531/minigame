# Granny vs Robot — Reddit Mini Game

A tower-defense mini game built with Cocos Creator 3.8, deployed as a Reddit Devvit Web app.

## Overview

**Granny vs Robot** is a casual tower-defense game playable directly inside Reddit posts. Players control a hero character, build towers and walls, and defend their base against waves of enemies. The game features infinite-wave progression, boss encounters, weapon upgrades, and a global leaderboard.

## Key Features

- **Hero Control**: WASD / joystick movement with 4 switchable weapons (machine gun, flamethrower, cannon, glitch wave)
- **Tower Defense**: Build and upgrade towers, walls, barracks, and farms on predefined pads
- **Infinite Waves**: Procedurally generated enemy waves with boss events, lane progression, and difficulty scaling
- **Buff Cards**: Roguelike card selection between waves for permanent stat boosts
- **Leaderboard**: Per-post global leaderboard powered by Redis sorted sets
- **Save & Continue**: Auto-save progress with resume support across sessions
- **Bilingual UI**: Chinese and English with auto-detection

## Architecture

| Layer | Technology | Directory |
|-------|-----------|-----------|
| Game Client | Cocos Creator 3.8 (TypeScript) | `assets/` |
| Preview Screen | Vanilla HTML/CSS/TS | `devvit/src/client/` |
| Server API | Hono (Node.js) | `devvit/src/server/` |
| Hosting | Reddit Devvit Web Platform | `devvit/` |

### Build Pipeline

1. Cocos Creator builds the game to `build/web-mobile/`
2. `scripts/build_reddit_package.sh` copies output to `devvit/webroot/`
3. `devvit/scripts/patch-csp.cjs` patches the build for Devvit CSP compliance (removes `eval`/`new Function` calls)
4. `devvit upload` deploys to Reddit

## Permissions

| Permission | Purpose |
|-----------|---------|
| **Redis** | Stores leaderboard scores (`zSet`), player metadata (`hSet`), follow state, and rate-limit counters |
| **Reddit** | Reads current username (`reddit.getCurrentUsername`), creates custom posts (`reddit.submitCustomPost`) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/init` | Returns current user info, subscription state, and leaderboard |
| POST | `/api/submit-score` | Submits a score (keeps personal best only). Rate-limited. |
| GET | `/api/leaderboard` | Returns top 10 leaderboard entries |
| POST | `/api/subscribe` | Marks user as a follower |
| POST | `/internal/menu/create-post` | Creates a new game post (menu action) |

## Known Limitations

- **CSP Constraints**: Cocos Creator's JIT code generation is patched at build time. Some edge-case component scheduling patterns may fall back to slower interpreted paths.
- **Animation Workarounds**: Skeletal animation uses CPU mode (`useBakedAnimation=false`) due to CSP restrictions on GPU baked textures. Several post-build patches fix `ExoticTrackValues` typed-array handling for correct animation playback.
- **Mobile WebView**: Screen orientation is forced to landscape via meta tags and `screen.orientation.lock()`. Some older Android WebViews may not support this.
- **Single-Post Leaderboard**: Scores are stored per-app (not per-post). A future update could partition by post ID.
- **Rate Limiting**: Score submission is rate-limited to 1 request per 10 seconds per user to prevent abuse.

## Feedback & Support

- **Official Subreddit**: [r/GrannyvsRobot](https://www.reddit.com/r/GrannyvsRobot/)
- **Test Subreddit**: [r/granny_vs_robot_dev](https://www.reddit.com/r/granny_vs_robot_dev/)
- **Issues**: Report bugs or suggest features via the subreddit or by commenting on game posts

## Version

- **App Name**: `granny-vs-robot`
- **Devvit SDK**: 0.12.13
- **Cocos Creator**: 3.8.8
- **License**: BSD-3-Clause
