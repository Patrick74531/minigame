import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { context, redis, reddit } from '@devvit/web/server';

const RANK_KEY = 'leaderboard:scores';
const META_KEY = 'leaderboard:meta';
const FOLLOW_KEY = 'leaderboard:followers';
const RATE_LIMIT_PREFIX = 'ratelimit:submit:';
const LEADERBOARD_SIZE = 10;

// ── Validation constants ─────────────────────────────────────────────────────
const MAX_SCORE = 999_999_999;
const MAX_WAVE = 9_999;
const RATE_LIMIT_WINDOW_SEC = 10;

interface LeaderboardEntry {
    rank: number;
    username: string;
    score: number;
    wave: number;
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    const members = await redis.zRange(RANK_KEY, 0, LEADERBOARD_SIZE - 1, {
        reverse: true,
        by: 'rank',
    });
    if (!members || members.length === 0) return [];

    const allMeta = (await redis.hGetAll(META_KEY)) ?? {};

    return members.map((entry, i) => {
        const { member: username, score } = entry as { member: string; score: number };
        let wave = 0;
        const metaStr = allMeta[username];
        if (metaStr) {
            try {
                const parsed = JSON.parse(metaStr) as { wave?: number };
                wave = parsed.wave ?? 0;
            } catch {
                wave = 0;
            }
        }
        return { rank: i + 1, username, score: Math.round(score), wave };
    });
}

export const api = new Hono();

function jsonNoCache(c: Context, payload: unknown, status: number = 200) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    return c.json(payload, status as ContentfulStatusCode);
}

function jsonError(c: Context, code: number, message: string) {
    return jsonNoCache(c, { status: 'error', code, message }, code);
}

function isValidInt(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

async function checkRateLimit(username: string): Promise<boolean> {
    const key = `${RATE_LIMIT_PREFIX}${username}`;
    try {
        const expiration = new Date(Date.now() + RATE_LIMIT_WINDOW_SEC * 1000);
        const result = await redis.set(key, '1', { nx: true, expiration });
        return result === 'OK';
    } catch {
        // Redis failure → allow the request (fail-open)
        return true;
    }
}

api.get('/init', async c => {
    try {
        const [username, leaderboard] = await Promise.all([
            reddit.getCurrentUsername(),
            fetchLeaderboard(),
        ]);

        const resolvedUsername = username ?? 'Anonymous';
        const isSubscribed =
            resolvedUsername !== 'Anonymous'
                ? (await redis.hGet(FOLLOW_KEY, resolvedUsername)) === '1'
                : false;

        return jsonNoCache(c, {
            username: resolvedUsername,
            isSubscribed,
            subredditName: context.subredditName ?? '',
            leaderboard,
        });
    } catch (error) {
        console.error('[api/init] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});

api.post('/submit-score', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        if (!username) {
            return jsonError(c, 401, 'Not logged in');
        }

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return jsonError(c, 400, 'Invalid JSON body');
        }

        const payload = body as { score?: unknown; wave?: unknown };
        const score = payload.score;
        const wave = payload.wave;

        // ── Input validation ─────────────────────────────────────────────
        if (!isValidInt(score) || score > MAX_SCORE) {
            return jsonError(c, 400, `Invalid score: must be integer 0–${MAX_SCORE}`);
        }
        if (!isValidInt(wave) || wave > MAX_WAVE) {
            return jsonError(c, 400, `Invalid wave: must be integer 0–${MAX_WAVE}`);
        }

        // ── Rate limiting ────────────────────────────────────────────────
        const allowed = await checkRateLimit(username);
        if (!allowed) {
            c.header('Retry-After', String(RATE_LIMIT_WINDOW_SEC));
            return jsonError(c, 429, 'Too many requests. Try again later.');
        }

        const existing = await redis.zScore(RANK_KEY, username);
        const isNewBest = existing == null || score > existing;

        if (isNewBest) {
            await redis.zAdd(RANK_KEY, { score, member: username });
            await redis.hSet(META_KEY, {
                [username]: JSON.stringify({ wave, updatedAt: Date.now() }),
            });
        }

        const leaderboard = await fetchLeaderboard();
        const rankIdx = leaderboard.findIndex(e => e.username === username);

        return jsonNoCache(c, {
            rank: rankIdx >= 0 ? rankIdx + 1 : LEADERBOARD_SIZE + 1,
            score,
            isNewBest,
            leaderboard,
        });
    } catch (error) {
        console.error('[api/submit-score] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});

api.get('/leaderboard', async c => {
    try {
        const leaderboard = await fetchLeaderboard();
        return jsonNoCache(c, { entries: leaderboard });
    } catch (error) {
        console.error('[api/leaderboard] error:', error);
        return jsonNoCache(c, { entries: [] });
    }
});

api.post('/subscribe', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        if (username) {
            const existing = await redis.hGet(FOLLOW_KEY, username);
            if (existing !== '1') {
                await redis.hSet(FOLLOW_KEY, { [username]: '1' });
            }
        }
        return jsonNoCache(c, { success: true });
    } catch (error) {
        console.error('[api/subscribe] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});
