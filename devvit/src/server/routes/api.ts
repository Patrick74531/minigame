import { Hono } from 'hono';
import type { Context } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';

const RANK_KEY = 'leaderboard:scores';
const META_KEY = 'leaderboard:meta';
const FOLLOW_KEY = 'leaderboard:followers';
const LEADERBOARD_SIZE = 10;

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
    return c.json(payload, status);
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
        return jsonNoCache(c, { status: 'error', message: String(error) }, 400);
    }
});

api.post('/submit-score', async c => {
    try {
        const username = await reddit.getCurrentUsername();
        if (!username) {
            return jsonNoCache(c, { status: 'error', message: 'Not logged in' }, 401);
        }

        const body = (await c.req.json()) as { score?: number; wave?: number };
        const score = Number(body.score ?? 0);
        const wave = Number(body.wave ?? 0);

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
        return jsonNoCache(c, { status: 'error', message: String(error) }, 400);
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
        return jsonNoCache(c, { success: false, message: String(error) }, 400);
    }
});
