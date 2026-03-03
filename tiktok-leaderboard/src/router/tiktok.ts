import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../config/env';
import { ValidationError } from '../domain/errors';
import { TikTokIdentityProvider } from '../platform/tiktok';
import { DiamondRepository } from '../repository/DiamondRepository';
import { IdempotencyRepository } from '../repository/IdempotencyRepository';
import { PlayerRepository } from '../repository/PlayerRepository';
import { ScoreRepository } from '../repository/ScoreRepository';
import { SeasonRepository } from '../repository/SeasonRepository';
import { DiamondWalletService } from '../service/DiamondWalletService';
import { LeaderboardService } from '../service/LeaderboardService';
import { TikTokIdentityService } from '../service/TikTokIdentityService';

const submitScoreSchema = z.object({
    score: z.number().int().min(0),
    wave: z.number().int().min(0),
    runId: z.string().min(1).max(128),
});

const settleRunSchema = z.object({
    runId: z.string().min(1).max(128),
    wave: z.number().int().min(0),
});

const buyItemSchema = z.object({
    itemId: z.string().min(1).max(128),
});

const identityExchangeSchema = z.object({
    code: z.string().min(1).max(1024),
});

type HonoEnv = { Bindings: Env; Variables: { requestId: string } };

export function createTikTokRouter(): Hono<HonoEnv> {
    const router = new Hono<HonoEnv>();
    const identityProvider = new TikTokIdentityProvider();

    function getService(db: D1Database): LeaderboardService {
        const diamondRepo = new DiamondRepository(db);
        return new LeaderboardService(
            new PlayerRepository(db),
            new ScoreRepository(db),
            new SeasonRepository(db),
            new IdempotencyRepository(db),
            diamondRepo
        );
    }

    function getDiamondService(db: D1Database): DiamondWalletService {
        return new DiamondWalletService(new PlayerRepository(db), new DiamondRepository(db));
    }

    // GET /api/tiktok/init
    router.get('/init', async c => {
        const requestId = c.get('requestId');
        const identity = await identityProvider.resolveIdentity(c.req.raw.headers);
        const service = getService(c.env.DB);
        const result = await service.init(identityProvider.platform, identity, requestId);
        return c.json(result);
    });

    // POST /api/tiktok/identity/exchange
    router.post('/identity/exchange', async c => {
        const requestId = c.get('requestId');
        const body = await c.req.json();
        const parsed = identityExchangeSchema.safeParse(body);
        if (!parsed.success) {
            throw new ValidationError(
                parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
            );
        }

        const identityService = new TikTokIdentityService(c.env);
        const profile = await identityService.resolveProfileByCode(parsed.data.code);
        return c.json({
            ok: true as const,
            data: profile,
            requestId,
        });
    });

    // POST /api/tiktok/submit-score
    router.post('/submit-score', async c => {
        const requestId = c.get('requestId');
        const identity = await identityProvider.resolveIdentity(c.req.raw.headers);

        const body = await c.req.json();
        const parsed = submitScoreSchema.safeParse(body);
        if (!parsed.success) {
            throw new ValidationError(
                parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
            );
        }

        const service = getService(c.env.DB);
        const result = await service.submitScore(
            identityProvider.platform,
            identity,
            parsed.data,
            requestId
        );
        return c.json(result);
    });

    // GET /api/tiktok/leaderboard
    router.get('/leaderboard', async c => {
        const requestId = c.get('requestId');
        const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
        const service = getService(c.env.DB);
        const result = await service.getLeaderboard(page, requestId);
        return c.json(result);
    });

    // GET /api/tiktok/me/rank
    router.get('/me/rank', async c => {
        const requestId = c.get('requestId');
        const identity = await identityProvider.resolveIdentity(c.req.raw.headers);
        const service = getService(c.env.DB);
        const result = await service.getMyRank(identityProvider.platform, identity, requestId);
        return c.json(result);
    });

    // GET /api/tiktok/diamond/balance
    router.get('/diamond/balance', async c => {
        const requestId = c.get('requestId');
        const identity = await identityProvider.resolveIdentity(c.req.raw.headers);
        const service = getDiamondService(c.env.DB);
        const result = await service.getBalance(identityProvider.platform, identity, requestId);
        return c.json(result);
    });

    // POST /api/tiktok/diamond/settle-run
    router.post('/diamond/settle-run', async c => {
        const requestId = c.get('requestId');
        const identity = await identityProvider.resolveIdentity(c.req.raw.headers);
        const body = await c.req.json();
        const parsed = settleRunSchema.safeParse(body);
        if (!parsed.success) {
            throw new ValidationError(
                parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
            );
        }

        const service = getDiamondService(c.env.DB);
        const result = await service.settleRun(
            identityProvider.platform,
            identity,
            parsed.data,
            requestId
        );
        return c.json(result);
    });

    // POST /api/tiktok/diamond/buy-item
    router.post('/diamond/buy-item', async c => {
        const requestId = c.get('requestId');
        const identity = await identityProvider.resolveIdentity(c.req.raw.headers);
        const body = await c.req.json();
        const parsed = buyItemSchema.safeParse(body);
        if (!parsed.success) {
            throw new ValidationError(
                parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
            );
        }

        const service = getDiamondService(c.env.DB);
        const result = await service.buyItem(
            identityProvider.platform,
            identity,
            parsed.data,
            requestId
        );
        return c.json(result);
    });

    return router;
}
