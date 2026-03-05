# Ops Stats Dashboard

This dashboard is for local operations use and does not change game runtime packaging.

## Command

```bash
npm run stats:dashboard
```

It writes:

- `dist/stats-dashboard/stats-dashboard-<timestamp>.json`
- `dist/stats-dashboard/stats-dashboard-<timestamp>.html`

## Data Sources

- TikTok: Cloudflare D1 (remote query via Wrangler)
- Reddit: optional external snapshot input

By default, Reddit data is not queried automatically unless you provide one of:

- `--reddit-leaderboard-url <url>`
- `--reddit-stats-url <url>`
- `--reddit-snapshot <json-file>`

## Example Usage

```bash
# TikTok only
npm run stats:dashboard

# TikTok + Reddit leaderboard URL snapshot
npm run stats:dashboard -- \
  --reddit-leaderboard-url "https://<your-reddit-app-host>/api/leaderboard?limit=500"

# TikTok + Reddit stats URL snapshot
npm run stats:dashboard -- \
  --reddit-stats-url "https://<your-reddit-app-host>/api/stats?leaderboardLimit=500&playCountLimit=5000"

# TikTok + local reddit snapshot JSON
npm run stats:dashboard -- \
  --reddit-snapshot "./temp/reddit-stats-snapshot.json"
```

## Optional Reddit Snapshot Format

```json
{
  "metrics": {
    "uniquePlayers": 123,
    "repeatPlayers": 45
  },
  "entries": [
    { "rank": 1, "username": "u1", "score": 9999, "wave": 20 }
  ]
}
```

If `--reddit-leaderboard-url` is provided and it contains `/api/leaderboard`, the script will
automatically try `/api/stats` as the Reddit stats endpoint unless `--reddit-stats-url` is set.

## Reddit API Query Params

- `/api/leaderboard?limit=<n>`: default `10`, max `5000`
- `/api/stats?leaderboardLimit=<n>&playCountLimit=<n>`: defaults `200/200`, max `5000`
