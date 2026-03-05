#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, 'dist', 'stats-dashboard');
const DEFAULT_TIKTOK_DIR = path.join(ROOT_DIR, 'tiktok-leaderboard');

function parseArgs(argv) {
  const out = {
    outDir: DEFAULT_OUT_DIR,
    tiktokDir: DEFAULT_TIKTOK_DIR,
    tiktokEnv: 'production',
    skipTiktok: false,
    redditLeaderboardUrl: '',
    redditStatsUrl: '',
    redditSnapshotPath: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const inlineValue = eq >= 0 ? arg.slice(eq + 1) : '';
    const nextValue =
      eq < 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[++i] : '';
    const value = inlineValue || nextValue;

    switch (key) {
      case 'out-dir':
        out.outDir = value ? path.resolve(value) : out.outDir;
        break;
      case 'tiktok-dir':
        out.tiktokDir = value ? path.resolve(value) : out.tiktokDir;
        break;
      case 'tiktok-env':
        out.tiktokEnv = value || out.tiktokEnv;
        break;
      case 'skip-tiktok':
        out.skipTiktok = true;
        break;
      case 'reddit-leaderboard-url':
        out.redditLeaderboardUrl = value || '';
        break;
      case 'reddit-stats-url':
        out.redditStatsUrl = value || '';
        break;
      case 'reddit-snapshot':
        out.redditSnapshotPath = value ? path.resolve(value) : '';
        break;
      case 'help':
        printHelpAndExit(0);
        break;
      default:
        throw new Error(`Unknown argument: --${key}`);
    }
  }

  return out;
}

function printHelpAndExit(code) {
  const help = `
Usage:
  node scripts/generate_stats_dashboard.mjs [options]

Options:
  --out-dir <dir>                Output directory (default: dist/stats-dashboard)
  --tiktok-dir <dir>             Path to tiktok-leaderboard project
  --tiktok-env <name>            Wrangler env name (default: production)
  --skip-tiktok                  Skip TikTok D1 queries
  --reddit-leaderboard-url <u>   Optional Reddit /api/leaderboard URL for top list snapshot
  --reddit-stats-url <u>         Optional Reddit /api/stats URL for metrics
  --reddit-snapshot <file>       Optional local JSON with additional Reddit metrics
  --help                         Show this help

Notes:
  - This script is for local ops use and does not modify game runtime/package.
  - TikTok stats are fetched from Cloudflare D1 via Wrangler.
  - Reddit metrics depend on currently available external data.
`;
  process.stdout.write(help);
  process.exit(code);
}

function runWranglerSqlJson(tiktokDir, envName, sql) {
  const args = [
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--env',
    envName,
    '--remote',
    '--command',
    sql,
    '--json',
  ];

  const stdout = execFileSync('npx', args, {
    cwd: tiktokDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Unexpected Wrangler JSON response');
  }
  if (!parsed[0].success) {
    throw new Error('Wrangler query marked as unsuccessful');
  }
  return parsed[0];
}

function asNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return 0;
}

function asString(v) {
  return typeof v === 'string' ? v : '';
}

function escapeHtml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(asNumber(n));
}

function nowTag(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

async function loadRedditSnapshot(snapshotPath) {
  if (!snapshotPath) return null;
  const text = await fs.promises.readFile(snapshotPath, 'utf8');
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function extractRedditTopEntries(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload;
  const direct = Array.isArray(p.entries) ? p.entries : [];
  if (direct.length > 0) return direct;
  const dataEntries = p.data && typeof p.data === 'object' && Array.isArray(p.data.entries)
    ? p.data.entries
    : [];
  if (dataEntries.length > 0) return dataEntries;
  return [];
}

async function fetchRedditLeaderboard(url) {
  if (!url) return { topEntries: [], warnings: [] };
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const topEntries = extractRedditTopEntries(payload);
  return { topEntries, warnings: [] };
}

function inferStatsUrlFromLeaderboardUrl(leaderboardUrl) {
  if (!leaderboardUrl) return '';
  const normalized = leaderboardUrl.trim();
  if (!normalized) return '';
  if (normalized.includes('/api/leaderboard')) {
    return normalized.replace('/api/leaderboard', '/api/stats');
  }
  return '';
}

async function fetchRedditStats(url) {
  if (!url) return null;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function renderMetricsTableRows(report) {
  const rows = [];
  const tiktok = report.sources.tiktok;
  const reddit = report.sources.reddit;

  if (tiktok.summary) {
    rows.push(
      ['TikTok', 'Active season', tiktok.summary.active_season_id || '-', 'exact'],
      ['TikTok', 'Unique players (>=1 run)', fmtInt(tiktok.summary.unique_players), 'exact'],
      ['TikTok', 'Repeat players (>1 runs)', fmtInt(tiktok.summary.repeat_players), 'exact'],
      ['TikTok', 'Single-run players', fmtInt(tiktok.summary.single_run_players), 'exact'],
      ['TikTok', 'Total runs', fmtInt(tiktok.summary.total_runs), 'exact'],
      ['TikTok', 'Ranked players', fmtInt(tiktok.summary.ranked_players), 'exact'],
    );
  } else {
    rows.push(['TikTok', 'Summary', 'N/A', 'unavailable']);
  }

  if (typeof reddit.uniquePlayers === 'number') {
    rows.push(['Reddit', 'Unique players (provided)', fmtInt(reddit.uniquePlayers), 'provided']);
  } else {
    rows.push(['Reddit', 'Unique players', 'N/A', 'not available']);
  }
  if (typeof reddit.repeatPlayers === 'number') {
    rows.push(['Reddit', 'Repeat players (provided)', fmtInt(reddit.repeatPlayers), 'provided']);
  } else {
    rows.push(['Reddit', 'Repeat players', 'N/A', 'not available']);
  }
  if (typeof reddit.totalRuns === 'number') {
    rows.push(['Reddit', 'Total runs (provided)', fmtInt(reddit.totalRuns), 'provided']);
  } else {
    rows.push(['Reddit', 'Total runs', 'N/A', 'not available']);
  }
  rows.push(['Reddit', 'Leaderboard entries in snapshot', fmtInt(reddit.topEntries.length), reddit.topEntries.length ? 'snapshot' : 'none']);

  return rows
    .map(
      cols => `<tr>${cols
        .map((c, idx) =>
          idx === 3
            ? `<td><span class="badge">${escapeHtml(c)}</span></td>`
            : `<td>${escapeHtml(c)}</td>`
        )
        .join('')}</tr>`
    )
    .join('\n');
}

function renderTikTokPlayerRows(players) {
  if (!players || players.length === 0) {
    return '<tr><td colspan="8">No rows</td></tr>';
  }
  return players
    .map((row, i) => {
      const rank = i + 1;
      return `<tr>
  <td>${rank}</td>
  <td>${escapeHtml(row.player_id)}</td>
  <td>${escapeHtml(row.display_name || '')}</td>
  <td>${fmtInt(row.play_count)}</td>
  <td>${fmtInt(row.best_score)}</td>
  <td>${fmtInt(row.best_wave)}</td>
  <td>${escapeHtml(row.first_play_at || '')}</td>
  <td>${escapeHtml(row.last_play_at || '')}</td>
</tr>`;
    })
    .join('\n');
}

function renderRedditTopRows(entries) {
  if (!entries || entries.length === 0) {
    return '<tr><td colspan="5">No rows</td></tr>';
  }
  return entries
    .map((entry, i) => {
      const e = entry && typeof entry === 'object' ? entry : {};
      const rank = asNumber(e.rank) || i + 1;
      return `<tr>
  <td>${rank}</td>
  <td>${escapeHtml(e.username || '')}</td>
  <td>${fmtInt(e.score)}</td>
  <td>${fmtInt(e.wave)}</td>
  <td>${escapeHtml(JSON.stringify(e))}</td>
</tr>`;
    })
    .join('\n');
}

function renderRedditPlayRows(entries) {
  if (!entries || entries.length === 0) {
    return '<tr><td colspan="3">No rows</td></tr>';
  }
  return entries
    .map((entry, i) => {
      const e = entry && typeof entry === 'object' ? entry : {};
      const rank = i + 1;
      return `<tr>
  <td>${rank}</td>
  <td>${escapeHtml(e.username || '')}</td>
  <td>${fmtInt(e.playCount)}</td>
</tr>`;
    })
    .join('\n');
}

function renderHtml(report) {
  const generatedAt = escapeHtml(report.generatedAt);
  const tiktokError = report.sources.tiktok.error
    ? `<p class="warn">TikTok query error: ${escapeHtml(report.sources.tiktok.error)}</p>`
    : '';
  const redditWarnings = report.sources.reddit.warnings
    .map(w => `<li>${escapeHtml(w)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Leaderboard Ops Dashboard</title>
  <style>
    :root {
      --bg: #f4f6ef;
      --panel: #ffffff;
      --ink: #19212e;
      --muted: #5f6f7f;
      --line: #d9dfd4;
      --accent: #0f766e;
      --warn: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 5% 10%, #deeedf 0%, transparent 38%),
        radial-gradient(circle at 95% 20%, #e6f2f2 0%, transparent 40%),
        var(--bg);
    }
    h1, h2 { margin: 0 0 12px; }
    p { margin: 0 0 10px; color: var(--muted); }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: 1fr;
      max-width: 1200px;
      margin: 0 auto;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 22px rgba(25, 33, 46, 0.06);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      padding: 8px 10px;
    }
    th { color: var(--muted); font-weight: 600; }
    .badge {
      display: inline-block;
      border: 1px solid #bdd5d2;
      border-radius: 999px;
      padding: 2px 8px;
      color: #0b5f58;
      background: #ecf8f6;
      font-size: 12px;
    }
    .warn { color: var(--warn); }
    .meta { font-size: 12px; }
    pre {
      margin: 0;
      max-height: 300px;
      overflow: auto;
      background: #f9fbf8;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
    }
    @media (max-width: 760px) {
      body { padding: 12px; }
      .panel { padding: 12px; }
      table { font-size: 12px; }
    }
  </style>
</head>
<body>
  <div class="grid">
    <section class="panel">
      <h1>Leaderboard Ops Dashboard</h1>
      <p class="meta">Generated at ${generatedAt}</p>
      <p class="meta">This report is for local ops usage and is outside game runtime package.</p>
    </section>

    <section class="panel">
      <h2>Metrics</h2>
      <table>
        <thead>
          <tr><th>Platform</th><th>Metric</th><th>Value</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${renderMetricsTableRows(report)}
        </tbody>
      </table>
      ${tiktokError}
      ${redditWarnings ? `<ul class="warn">${redditWarnings}</ul>` : ''}
    </section>

    <section class="panel">
      <h2>TikTok Players (Active Season)</h2>
      <table>
        <thead>
          <tr>
            <th>#</th><th>player_id</th><th>display_name</th><th>play_count</th>
            <th>best_score</th><th>best_wave</th><th>first_play_at</th><th>last_play_at</th>
          </tr>
        </thead>
        <tbody>
          ${renderTikTokPlayerRows(report.sources.tiktok.players)}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Reddit Leaderboard Snapshot</h2>
      <table>
        <thead>
          <tr><th>#</th><th>username</th><th>score</th><th>wave</th><th>raw</th></tr>
        </thead>
        <tbody>
          ${renderRedditTopRows(report.sources.reddit.topEntries)}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Reddit Play Counts Snapshot</h2>
      <table>
        <thead>
          <tr><th>#</th><th>username</th><th>play_count</th></tr>
        </thead>
        <tbody>
          ${renderRedditPlayRows(report.sources.reddit.playCounts)}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Raw JSON</h2>
      <details>
        <summary>Expand report JSON</summary>
        <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
      </details>
    </section>
  </div>
</body>
</html>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  const report = {
    generatedAt,
    sources: {
      tiktok: {
        enabled: !options.skipTiktok,
        env: options.tiktokEnv,
        summary: null,
        players: [],
        error: '',
      },
      reddit: {
        leaderboardUrl: options.redditLeaderboardUrl || '',
        statsUrl: options.redditStatsUrl || '',
        snapshotPath: options.redditSnapshotPath || '',
        topEntries: [],
        playCounts: [],
        uniquePlayers: null,
        repeatPlayers: null,
        totalRuns: null,
        warnings: [],
      },
    },
  };

  if (!options.skipTiktok) {
    const summarySql = `
WITH active AS (
  SELECT id FROM seasons WHERE status = 'active' LIMIT 1
)
SELECT
  COALESCE((SELECT id FROM active), '') AS active_season_id,
  COALESCE((SELECT COUNT(DISTINCT s.player_id) FROM scores s JOIN active a ON a.id = s.season_id), 0) AS unique_players,
  COALESCE((SELECT COUNT(*) FROM scores s JOIN active a ON a.id = s.season_id), 0) AS total_runs,
  COALESCE((SELECT COUNT(*) FROM (
    SELECT s.player_id, COUNT(*) AS c
    FROM scores s JOIN active a ON a.id = s.season_id
    GROUP BY s.player_id
    HAVING c > 1
  )), 0) AS repeat_players,
  COALESCE((SELECT COUNT(*) FROM (
    SELECT s.player_id, COUNT(*) AS c
    FROM scores s JOIN active a ON a.id = s.season_id
    GROUP BY s.player_id
    HAVING c = 1
  )), 0) AS single_run_players,
  COALESCE((SELECT COUNT(*) FROM leaderboard_best lb JOIN active a ON a.id = lb.season_id), 0) AS ranked_players;
`.trim();

    const playersSql = `
WITH active AS (
  SELECT id FROM seasons WHERE status = 'active' LIMIT 1
)
SELECT
  p.id AS player_id,
  p.display_name AS display_name,
  COALESCE(lb.best_score, 0) AS best_score,
  COALESCE(lb.best_wave, 0) AS best_wave,
  COUNT(s.id) AS play_count,
  MIN(s.created_at) AS first_play_at,
  MAX(s.created_at) AS last_play_at
FROM scores s
JOIN active a ON a.id = s.season_id
JOIN players p ON p.id = s.player_id
LEFT JOIN leaderboard_best lb
  ON lb.player_id = s.player_id AND lb.season_id = s.season_id
GROUP BY p.id, p.display_name, lb.best_score, lb.best_wave
ORDER BY play_count DESC, best_score DESC, p.id ASC;
`.trim();

    try {
      const summaryRes = runWranglerSqlJson(options.tiktokDir, options.tiktokEnv, summarySql);
      const playersRes = runWranglerSqlJson(options.tiktokDir, options.tiktokEnv, playersSql);
      const summaryRow = summaryRes.results && summaryRes.results[0] ? summaryRes.results[0] : {};
      report.sources.tiktok.summary = {
        active_season_id: asString(summaryRow.active_season_id),
        unique_players: asNumber(summaryRow.unique_players),
        total_runs: asNumber(summaryRow.total_runs),
        repeat_players: asNumber(summaryRow.repeat_players),
        single_run_players: asNumber(summaryRow.single_run_players),
        ranked_players: asNumber(summaryRow.ranked_players),
      };
      report.sources.tiktok.players = Array.isArray(playersRes.results)
        ? playersRes.results.map(row => ({
            player_id: asString(row.player_id),
            display_name: asString(row.display_name),
            best_score: asNumber(row.best_score),
            best_wave: asNumber(row.best_wave),
            play_count: asNumber(row.play_count),
            first_play_at: asString(row.first_play_at),
            last_play_at: asString(row.last_play_at),
          }))
        : [];
    } catch (err) {
      report.sources.tiktok.error = err instanceof Error ? err.message : String(err);
    }
  }

  if (options.redditSnapshotPath) {
    try {
      const snapshot = await loadRedditSnapshot(options.redditSnapshotPath);
      if (snapshot && typeof snapshot === 'object') {
        const maybeTop = extractRedditTopEntries(snapshot);
        if (maybeTop.length > 0) {
          report.sources.reddit.topEntries = maybeTop;
        }
        const metrics = snapshot.metrics && typeof snapshot.metrics === 'object'
          ? snapshot.metrics
          : null;
        if (metrics) {
          if (typeof metrics.uniquePlayers === 'number') {
            report.sources.reddit.uniquePlayers = metrics.uniquePlayers;
          }
          if (typeof metrics.repeatPlayers === 'number') {
            report.sources.reddit.repeatPlayers = metrics.repeatPlayers;
          }
          if (typeof metrics.totalRuns === 'number') {
            report.sources.reddit.totalRuns = metrics.totalRuns;
          }
        }
      }
    } catch (err) {
      report.sources.reddit.warnings.push(
        `Failed to read reddit snapshot JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (options.redditLeaderboardUrl) {
    try {
      const { topEntries } = await fetchRedditLeaderboard(options.redditLeaderboardUrl);
      if (topEntries.length > 0) {
        report.sources.reddit.topEntries = topEntries;
      } else {
        report.sources.reddit.warnings.push('Reddit leaderboard URL returned no entries');
      }
    } catch (err) {
      report.sources.reddit.warnings.push(
        `Failed to fetch reddit leaderboard URL: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    report.sources.reddit.warnings.push(
      'No --reddit-leaderboard-url provided, so only local reddit snapshot input is used.'
    );
  }

  const resolvedRedditStatsUrl =
    options.redditStatsUrl || inferStatsUrlFromLeaderboardUrl(options.redditLeaderboardUrl);
  if (resolvedRedditStatsUrl) {
    report.sources.reddit.statsUrl = resolvedRedditStatsUrl;
    try {
      const payload = await fetchRedditStats(resolvedRedditStatsUrl);
      const root = payload && typeof payload === 'object' ? payload : {};
      const metrics =
        root.metrics && typeof root.metrics === 'object'
          ? root.metrics
          : root.data && typeof root.data === 'object' && root.data.metrics && typeof root.data.metrics === 'object'
            ? root.data.metrics
            : null;
      if (metrics) {
        if (typeof metrics.uniquePlayers === 'number') {
          report.sources.reddit.uniquePlayers = metrics.uniquePlayers;
        }
        if (typeof metrics.repeatPlayers === 'number') {
          report.sources.reddit.repeatPlayers = metrics.repeatPlayers;
        }
        if (typeof metrics.totalRuns === 'number') {
          report.sources.reddit.totalRuns = metrics.totalRuns;
        }
      }

      const playCounts = Array.isArray(root.playCounts)
        ? root.playCounts
        : Array.isArray(root.data?.playCounts)
          ? root.data.playCounts
          : [];
      if (playCounts.length > 0) {
        report.sources.reddit.playCounts = playCounts;
      }

      const topEntriesFromStats = extractRedditTopEntries(root);
      if (topEntriesFromStats.length > 0 && report.sources.reddit.topEntries.length === 0) {
        report.sources.reddit.topEntries = topEntriesFromStats;
      }
    } catch (err) {
      report.sources.reddit.warnings.push(
        `Failed to fetch reddit stats URL: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    report.sources.reddit.warnings.push(
      'No --reddit-stats-url provided, and no inferred /api/stats URL available.'
    );
  }

  await fs.promises.mkdir(options.outDir, { recursive: true });
  const tag = nowTag();
  const jsonPath = path.join(options.outDir, `stats-dashboard-${tag}.json`);
  const htmlPath = path.join(options.outDir, `stats-dashboard-${tag}.html`);

  await fs.promises.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.promises.writeFile(htmlPath, renderHtml(report), 'utf8');

  process.stdout.write(`Wrote JSON: ${jsonPath}\n`);
  process.stdout.write(`Wrote HTML: ${htmlPath}\n`);
}

main().catch(err => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
