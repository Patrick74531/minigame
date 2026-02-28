import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { context, redis, reddit } from '@devvit/web/server';

const RANK_KEY = 'leaderboard:scores';
const META_KEY = 'leaderboard:meta';
const FOLLOW_KEY = 'leaderboard:followers';
const RATE_LIMIT_PREFIX = 'ratelimit:submit:';
const LEADERBOARD_SIZE = 10;

// ── Diamond system keys ────────────────────────────────────────────────────────
const DIAMOND_BALANCE_PREFIX = 'diamond:balance:';
const DIAMOND_RUN_PREFIX = 'diamond:run:';
const DIAMOND_INITIAL_GRANT = 0;
const SUBSCRIBE_DIAMOND_REWARD = 500;
const DIAMOND_PER_WAVE = 10;
const DIAMOND_ITEM_PRICE = 100;
const DIAMOND_DAILY_CAP = 5000;
const DIAMOND_DAILY_PREFIX = 'diamond:daily:';

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

        const diamonds =
            resolvedUsername !== 'Anonymous' ? await ensureDiamondBalance(resolvedUsername) : 0;

        return jsonNoCache(c, {
            username: resolvedUsername,
            isSubscribed,
            subredditName: context.subredditName ?? '',
            leaderboard,
            diamonds,
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

// ── Diamond System ──────────────────────────────────────────────────────────────

async function ensureDiamondBalance(username: string): Promise<number> {
    const key = `${DIAMOND_BALANCE_PREFIX}${username}`;
    const existing = await redis.get(key);
    if (existing != null) {
        return parseInt(existing, 10) || 0;
    }
    // First-time user: grant initial diamonds
    await redis.set(key, String(DIAMOND_INITIAL_GRANT));
    return DIAMOND_INITIAL_GRANT;
}

function todayKey(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
        d.getUTCDate()
    ).padStart(2, '0')}`;
}

api.get('/diamond/balance', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        if (!username) return jsonError(c, 401, 'Not logged in');
        const balance = await ensureDiamondBalance(username);
        return jsonNoCache(c, { balance });
    } catch (error) {
        console.error('[api/diamond/balance] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});

api.post('/diamond/settle-run', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        if (!username) return jsonError(c, 401, 'Not logged in');

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return jsonError(c, 400, 'Invalid JSON');
        }

        const payload = body as { runId?: string; wave?: unknown };
        const runId = payload.runId;
        const wave = payload.wave;

        if (!runId || typeof runId !== 'string' || runId.length < 8 || runId.length > 64) {
            return jsonError(c, 400, 'Invalid runId');
        }
        if (!isValidInt(wave) || (wave as number) > MAX_WAVE) {
            return jsonError(c, 400, 'Invalid wave');
        }

        // Idempotency: check if this runId was already settled
        const runKey = `${DIAMOND_RUN_PREFIX}${username}:${runId}`;
        const alreadySettled = await redis.get(runKey);
        if (alreadySettled) {
            const prev = JSON.parse(alreadySettled) as { earned: number; balance: number };
            return jsonNoCache(c, { earned: prev.earned, balance: prev.balance, duplicate: true });
        }

        const earned = Math.max(0, (wave as number) * DIAMOND_PER_WAVE);

        // Daily cap check
        const dailyKey = `${DIAMOND_DAILY_PREFIX}${username}:${todayKey()}`;
        const dailyUsedStr = await redis.get(dailyKey);
        const dailyUsed = dailyUsedStr ? parseInt(dailyUsedStr, 10) || 0 : 0;
        const actualEarned = Math.min(earned, Math.max(0, DIAMOND_DAILY_CAP - dailyUsed));

        // Credit diamonds
        const balanceKey = `${DIAMOND_BALANCE_PREFIX}${username}`;
        const currentBalance = await ensureDiamondBalance(username);
        const newBalance = currentBalance + actualEarned;
        await redis.set(balanceKey, String(newBalance));

        // Update daily counter (expire after 48h for safety)
        await redis.set(dailyKey, String(dailyUsed + actualEarned), {
            expiration: new Date(Date.now() + 48 * 3600 * 1000),
        });

        // Mark run as settled (expire after 7 days)
        await redis.set(runKey, JSON.stringify({ earned: actualEarned, balance: newBalance }), {
            expiration: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        });

        return jsonNoCache(c, { earned: actualEarned, balance: newBalance, duplicate: false });
    } catch (error) {
        console.error('[api/diamond/settle-run] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});

api.post('/diamond/buy-item', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        if (!username) return jsonError(c, 401, 'Not logged in');

        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return jsonError(c, 400, 'Invalid JSON');
        }

        const payload = body as { itemId?: string };
        const itemId = payload.itemId;
        if (!itemId || typeof itemId !== 'string') {
            return jsonError(c, 400, 'Invalid itemId');
        }

        const price = DIAMOND_ITEM_PRICE;
        const balanceKey = `${DIAMOND_BALANCE_PREFIX}${username}`;
        const currentBalance = await ensureDiamondBalance(username);

        if (currentBalance < price) {
            return jsonError(c, 400, 'Insufficient diamonds');
        }

        const newBalance = currentBalance - price;
        await redis.set(balanceKey, String(newBalance));

        return jsonNoCache(c, { success: true, itemId, price, balance: newBalance });
    } catch (error) {
        console.error('[api/diamond/buy-item] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});

api.post('/subscribe', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        let alreadySubscribed = false;
        let diamondsGranted = 0;
        let newBalance = 0;
        if (username) {
            const existing = await redis.hGet(FOLLOW_KEY, username);
            alreadySubscribed = existing === '1';
            if (!alreadySubscribed) {
                await redis.hSet(FOLLOW_KEY, { [username]: '1' });
                // Grant subscribe reward diamonds
                const balanceKey = `${DIAMOND_BALANCE_PREFIX}${username}`;
                const currentBalance = await ensureDiamondBalance(username);
                newBalance = currentBalance + SUBSCRIBE_DIAMOND_REWARD;
                await redis.set(balanceKey, String(newBalance));
                diamondsGranted = SUBSCRIBE_DIAMOND_REWARD;
            } else {
                newBalance = await ensureDiamondBalance(username);
            }
        }
        return jsonNoCache(c, { success: true, alreadySubscribed, diamondsGranted, newBalance });
    } catch (error) {
        console.error('[api/subscribe] error:', error);
        return jsonError(c, 500, 'Internal server error');
    }
});
