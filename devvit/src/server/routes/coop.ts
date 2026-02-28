import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { JsonValue } from '@devvit/shared';
import { context, redis, realtime } from '@devvit/web/server';

// ─── Redis key helpers ─────────────────────────────────────────────────────────
const MATCH_KEY = (matchId: string) => `coop:match:${matchId}`;
const MATCH_ACTIONS_KEY = (matchId: string) => `coop:match:${matchId}:actions`;
const MATCH_TTL_SEC = 60 * 60 * 3; // 3 hours

// ─── Channel name ──────────────────────────────────────────────────────────────
export const coopChannel = (matchId: string) => `match-${matchId}`;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HeroState {
    position: { x: number; z: number };
    hp: number;
    maxHp: number;
    level: number;
}

interface WeaponSaveState {
    type: string;
    level: number;
}

interface PlayerSlot {
    playerId: string;
    slot: 0 | 1;
    connected: boolean;
    lastHeartbeat: number;
    heroState: HeroState;
    weapons: WeaponSaveState[];
    activeWeaponType: string | null;
}

interface BuildingDecision {
    padId: string;
    decisionOwnerId: string;
    resolvedAt: number;
    seq: number;
}

interface BuildStatePadSnapshot {
    padId: string;
    buildingTypeId: string;
    level: number;
    hpRatio: number;
    nextUpgradeCost: number;
    collectedCoins: number;
    state: 'waiting' | 'building' | 'upgrading' | 'selecting' | 'complete';
}

interface BuildStateSnapshot {
    version: number;
    sharedCoins: number;
    pads: BuildStatePadSnapshot[];
}

interface MatchState {
    matchId: string;
    postId: string;
    status: 'waiting' | 'playing' | 'finished';
    createdAt: number;
    players: PlayerSlot[];
    teamXp: number;
    teamLevel: number;
    sharedCoins: number;
    waveNumber: number;
    waveStartAt: number | null;
    buildingDecisions: BuildingDecision[];
    seq: number;
    buildState?: BuildStateSnapshot;
}

type ServerMessage =
    | { type: 'MATCH_STATE'; state: MatchState }
    | { type: 'PLAYER_INPUT'; playerId: string; dx: number; dz: number; t: number }
    | {
          type: 'COIN_DEPOSITED';
          padId: string;
          playerId: string;
          amount: number;
          remaining: number;
          seq: number;
      }
    | {
          type: 'DECISION_OWNER';
          padId: string;
          playerId: string;
          eventType: 'tower_select' | 'buff_card';
          seq: number;
      }
    | {
          type: 'TOWER_DECIDED';
          padId: string;
          playerId: string;
          buildingTypeId: string;
          seq: number;
      }
    | {
          type: 'COIN_PICKED';
          playerId: string;
          x: number;
          z: number;
          seq: number;
      }
    | { type: 'WEAPON_ASSIGNED'; playerId: string; weaponId: string; seq: number }
    | { type: 'LEVEL_UP'; teamLevel: number; seq: number }
    | { type: 'PLAYER_DISCONNECTED'; playerId: string }
    | { type: 'PLAYER_RECONNECTED'; playerId: string; state: PlayerSlot }
    | { type: 'GAME_PAUSE'; seq: number }
    | { type: 'GAME_RESUME'; seq: number }
    | { type: 'MATCH_OVER'; victory: boolean; seq: number }
    | { type: 'BUILD_STATE_SNAPSHOT'; snapshot: BuildStateSnapshot; seq: number }
    | { type: 'CLOCK_SYNC'; serverTime: number; clientTime: number; seq: number }
    | { type: 'WAVE_STARTED'; waveIndex: number; startAt: number; seq: number }
    | { type: 'PHASE_CHANGE'; phase: string; serverTime: number; seq: number };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function jsonNoCache(c: Context, payload: unknown, status: number = 200) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    c.header('Pragma', 'no-cache');
    return c.json(payload, status as ContentfulStatusCode);
}

async function loadMatch(matchId: string): Promise<MatchState | null> {
    const raw = await redis.get(MATCH_KEY(matchId));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as MatchState;
    } catch {
        return null;
    }
}

async function saveMatch(state: MatchState): Promise<void> {
    const expiration = new Date(Date.now() + MATCH_TTL_SEC * 1000);
    await redis.set(MATCH_KEY(state.matchId), JSON.stringify(state), { expiration });
}

async function broadcast(matchId: string, msg: ServerMessage): Promise<void> {
    await realtime.send(coopChannel(matchId), msg as unknown as JsonValue);
}

function makeDefaultHeroState(): HeroState {
    return { position: { x: 0, z: 0 }, hp: 100, maxHp: 100, level: 1 };
}

/**
 * Parse replay members returned by redis.zRange into typed ServerMessage[].
 * Devvit redis clients may return either string members or {member,score} records.
 */
function parseReplayMembers(rawActions: unknown[]): ServerMessage[] {
    const messages: ServerMessage[] = [];
    for (const entry of rawActions) {
        let raw: string | null = null;
        if (typeof entry === 'string') {
            raw = entry;
        } else if (entry && typeof entry === 'object' && 'member' in entry) {
            const member = (entry as { member?: unknown }).member;
            if (typeof member === 'string') {
                raw = member;
            }
        }
        if (!raw) continue;
        try {
            messages.push(JSON.parse(raw) as ServerMessage);
        } catch {
            // ignore malformed replay entry
        }
    }
    return messages;
}

/** Returns the host (slot 0) playerId from a match state. */
function getHostPlayerId(state: MatchState): string | null {
    const host = state.players.find(p => p.slot === 0);
    return host?.playerId ?? null;
}

/** Checks if the given playerId is the host of the match. */
function isHostPlayer(state: MatchState, playerId: string): boolean {
    return getHostPlayerId(state) === playerId;
}

function resolvePlayerId(c: Context): string {
    const headerPlayerId = c.req.header('x-coop-player-id')?.trim();
    const userId = context.userId?.trim() ?? '';
    if (userId) {
        // Keep player identity stable per Reddit account, while allowing
        // multiple independent coop sessions from the same account/device context.
        if (headerPlayerId) return `${userId}:${headerPlayerId}`;
        return userId;
    }
    if (headerPlayerId) return headerPlayerId;
    return `anonymous:${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export const coop = new Hono();

/**
 * POST /api/coop/create-match
 * Body: { postId?: string }
 * Creates a new match room. Caller is assigned slot 0.
 */
coop.post('/create-match', async c => {
    try {
        const playerId = resolvePlayerId(c);
        const postId = context.postId ?? '';

        const matchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

        const state: MatchState = {
            matchId,
            postId,
            status: 'waiting',
            createdAt: Date.now(),
            players: [
                {
                    playerId,
                    slot: 0,
                    connected: true,
                    lastHeartbeat: Date.now(),
                    heroState: makeDefaultHeroState(),
                    weapons: [],
                    activeWeaponType: null,
                },
            ],
            teamXp: 0,
            teamLevel: 1,
            sharedCoins: 0,
            waveNumber: 1,
            waveStartAt: null,
            buildingDecisions: [],
            seq: 0,
        };

        await saveMatch(state);
        return jsonNoCache(c, {
            matchId,
            channel: coopChannel(matchId),
            selfPlayerId: playerId,
            state,
        });
    } catch (err) {
        console.error('[coop/create-match]', err);
        return jsonNoCache(c, { error: 'internal_error' }, 500);
    }
});

/**
 * POST /api/coop/join-match
 * Body: { matchId: string }
 * Second player joins slot 1. Broadcasts MATCH_STATE to both players.
 */
coop.post('/join-match', async c => {
    try {
        const playerId = resolvePlayerId(c);
        const body = await c.req.json<{ matchId: string }>();
        const { matchId } = body;

        const state = await loadMatch(matchId);
        if (!state) return jsonNoCache(c, { error: 'match_not_found' }, 404);
        if (state.status !== 'waiting') return jsonNoCache(c, { error: 'match_not_waiting' }, 409);
        if (state.players.length >= 2) return jsonNoCache(c, { error: 'match_full' }, 409);
        if (state.players.some(p => p.playerId === playerId)) {
            return jsonNoCache(c, { error: 'already_joined' }, 409);
        }

        state.players.push({
            playerId,
            slot: 1,
            connected: true,
            lastHeartbeat: Date.now(),
            heroState: makeDefaultHeroState(),
            weapons: [],
            activeWeaponType: null,
        });
        state.status = 'playing';
        state.seq += 1;

        await saveMatch(state);
        await broadcast(matchId, { type: 'MATCH_STATE', state });

        return jsonNoCache(c, {
            matchId,
            channel: coopChannel(matchId),
            selfPlayerId: playerId,
            state,
        });
    } catch (err) {
        console.error('[coop/join-match]', err);
        return jsonNoCache(c, { error: 'internal_error' }, 500);
    }
});

/**
 * GET /api/coop/match-state?matchId=xxx
 * Returns current match state. Used for reconnection.
 */
coop.get('/match-state', async c => {
    try {
        const matchId = c.req.query('matchId') ?? '';
        if (!matchId) return jsonNoCache(c, { error: 'missing_match_id' }, 400);

        const state = await loadMatch(matchId);
        if (!state) return jsonNoCache(c, { error: 'match_not_found' }, 404);

        return jsonNoCache(c, { state });
    } catch (err) {
        console.error('[coop/match-state]', err);
        return jsonNoCache(c, { error: 'internal_error' }, 500);
    }
});

/**
 * POST /api/coop/rejoin
 * Body: { matchId: string; lastSeq: number }
 * Called after reconnection. Returns full state + missed actions.
 */
coop.post('/rejoin', async c => {
    try {
        const playerId = resolvePlayerId(c);
        const body = await c.req.json<{ matchId: string; lastSeq: number }>();
        const { matchId, lastSeq } = body;

        const state = await loadMatch(matchId);
        if (!state) return jsonNoCache(c, { error: 'match_not_found' }, 404);

        const player = state.players.find(p => p.playerId === playerId);
        if (!player) return jsonNoCache(c, { error: 'player_not_in_match' }, 403);

        player.connected = true;
        player.lastHeartbeat = Date.now();
        await saveMatch(state);

        // Retrieve missed actions from sorted set (seq > lastSeq)
        const rawActions = await redis.zRange(MATCH_ACTIONS_KEY(matchId), lastSeq + 1, '+inf', {
            by: 'score',
        });
        const missedActions = parseReplayMembers(rawActions);

        await broadcast(matchId, { type: 'PLAYER_RECONNECTED', playerId, state: player });

        return jsonNoCache(c, { state, missedActions, selfPlayerId: playerId });
    } catch (err) {
        console.error('[coop/rejoin]', err);
        return jsonNoCache(c, { error: 'internal_error' }, 500);
    }
});

/**
 * POST /api/coop/sync
 * Body: { matchId: string; lastSeq: number }
 * Side-effect free state + replay pull, for clients without realtime connection.
 */
coop.post('/sync', async c => {
    try {
        const playerId = resolvePlayerId(c);
        const body = await c.req.json<{ matchId: string; lastSeq: number }>();
        const { matchId, lastSeq } = body;
        if (!matchId) return jsonNoCache(c, { error: 'missing_match_id' }, 400);

        const state = await loadMatch(matchId);
        if (!state) return jsonNoCache(c, { error: 'match_not_found' }, 404);
        if (!state.players.some(p => p.playerId === playerId)) {
            return jsonNoCache(c, { error: 'player_not_in_match' }, 403);
        }

        const rawActions = await redis.zRange(MATCH_ACTIONS_KEY(matchId), lastSeq + 1, '+inf', {
            by: 'score',
        });
        const missedActions = parseReplayMembers(rawActions);
        return jsonNoCache(c, { state, missedActions, selfPlayerId: playerId });
    } catch (err) {
        console.error('[coop/sync]', err);
        return jsonNoCache(c, { error: 'internal_error' }, 500);
    }
});

/**
 * POST /api/coop/action
 * Body: { matchId, type, ...payload }
 * Handles all client → server actions: INPUT, COIN_DEPOSIT, WEAPON_PICK, HEARTBEAT, PAUSE_REQUEST, etc.
 */
coop.post('/action', async c => {
    try {
        const playerId = resolvePlayerId(c);
        const body = await c.req.json<{ matchId: string; type: string; [key: string]: unknown }>();
        const { matchId, type: actionType, ...payload } = body;

        const state = await loadMatch(matchId);
        if (!state) return jsonNoCache(c, { error: 'match_not_found' }, 404);
        if (state.status === 'finished') return jsonNoCache(c, { error: 'match_finished' }, 409);

        const player = state.players.find(p => p.playerId === playerId);
        if (!player) return jsonNoCache(c, { error: 'player_not_in_match' }, 403);

        const replayMessages: ServerMessage[] = [];
        const emitWithSeq = async (
            factory: (seq: number) => ServerMessage
        ): Promise<ServerMessage> => {
            state.seq += 1;
            const msg = factory(state.seq);
            await broadcast(matchId, msg);
            replayMessages.push(msg);
            return msg;
        };
        const emitNoSeq = async (msg: ServerMessage): Promise<void> => {
            await broadcast(matchId, msg);
        };

        switch (actionType) {
            case 'INPUT': {
                const { dx, dz, t } = payload as { dx: number; dz: number; t: number };
                if (
                    !Number.isFinite(dx) ||
                    !Number.isFinite(dz) ||
                    !Number.isFinite(t) ||
                    Math.abs(dx) > 1000 ||
                    Math.abs(dz) > 1000
                ) {
                    return jsonNoCache(c, { error: 'invalid_input_params' }, 400);
                }
                player.heroState.position = { x: dx, z: dz };
                await emitNoSeq({ type: 'PLAYER_INPUT', playerId, dx, dz, t });
                break;
            }

            case 'COIN_DEPOSIT': {
                // Host-only: only the host can deposit coins for building
                if (!isHostPlayer(state, playerId)) {
                    console.warn(`[coop/action] COIN_DEPOSIT rejected: ${playerId} is not host`);
                    return jsonNoCache(c, { error: 'host_only_action' }, 403);
                }
                const { padId, amount } = payload as { padId: string; amount: number };
                // Validation: reject invalid params
                if (
                    typeof padId !== 'string' ||
                    !padId ||
                    typeof amount !== 'number' ||
                    !Number.isFinite(amount) ||
                    amount <= 0 ||
                    amount > 9999
                ) {
                    return jsonNoCache(c, { error: 'invalid_coin_deposit_params' }, 400);
                }
                const clientSeqRaw = payload.clientSeq;
                const clientSeq =
                    typeof clientSeqRaw === 'number' &&
                    Number.isInteger(clientSeqRaw) &&
                    clientSeqRaw > 0
                        ? clientSeqRaw
                        : null;
                const idempotencyKey = `coop:idem:deposit:${matchId}:${padId}:${
                    clientSeq ?? `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                }`;
                const alreadyProcessed = await redis.get(idempotencyKey);
                if (!alreadyProcessed) {
                    state.sharedCoins = Math.max(0, state.sharedCoins - amount);
                    await redis.set(idempotencyKey, '1', {
                        expiration: new Date(Date.now() + 300_000),
                    });
                }
                const remaining = state.sharedCoins;

                const padFilled = (payload.padFilled as boolean) ?? false;
                if (padFilled) {
                    const decisionKey = `coop:decision:${matchId}:${padId}`;
                    const existingDecision = await redis.get(decisionKey);
                    if (!existingDecision) {
                        await redis.set(decisionKey, playerId, {
                            expiration: new Date(Date.now() + 300_000),
                        });
                        const eventType =
                            (payload.eventType as 'tower_select' | 'buff_card') ?? 'tower_select';
                        await emitWithSeq(seq => ({
                            type: 'DECISION_OWNER',
                            padId,
                            playerId,
                            eventType,
                            seq,
                        }));
                    }
                }

                await emitWithSeq(seq => ({
                    type: 'COIN_DEPOSITED',
                    padId,
                    playerId,
                    amount,
                    remaining,
                    seq,
                }));
                break;
            }

            case 'TOWER_DECISION': {
                // Host-only: only the host can decide tower type
                if (!isHostPlayer(state, playerId)) {
                    console.warn(`[coop/action] TOWER_DECISION rejected: ${playerId} is not host`);
                    return jsonNoCache(c, { error: 'host_only_action' }, 403);
                }
                const { padId, buildingTypeId } = payload as {
                    padId: string;
                    buildingTypeId: string;
                };
                if (
                    typeof padId !== 'string' ||
                    !padId ||
                    typeof buildingTypeId !== 'string' ||
                    !buildingTypeId
                ) {
                    return jsonNoCache(c, { error: 'invalid_tower_decision_params' }, 400);
                }

                const decisionKey = `coop:decision:${matchId}:${padId}`;
                const decisionOwner = await redis.get(decisionKey);
                if (decisionOwner && decisionOwner !== playerId) {
                    return jsonNoCache(c, { error: 'not_decision_owner' }, 403);
                }

                await emitWithSeq(seq => ({
                    type: 'TOWER_DECIDED',
                    padId,
                    playerId,
                    buildingTypeId,
                    seq,
                }));
                break;
            }

            case 'COIN_PICKUP': {
                // Host-only: only the host can pick up coins
                if (!isHostPlayer(state, playerId)) {
                    console.warn(`[coop/action] COIN_PICKUP rejected: ${playerId} is not host`);
                    return jsonNoCache(c, { error: 'host_only_action' }, 403);
                }
                const { x, z } = payload as { x: number; z: number };
                if (
                    !Number.isFinite(x) ||
                    !Number.isFinite(z) ||
                    Math.abs(x) > 1000 ||
                    Math.abs(z) > 1000
                ) {
                    return jsonNoCache(c, { error: 'invalid_coin_pickup_params' }, 400);
                }

                await emitWithSeq(seq => ({
                    type: 'COIN_PICKED',
                    playerId,
                    x,
                    z,
                    seq,
                }));
                break;
            }

            case 'WEAPON_PICK': {
                const { weaponId } = payload as { weaponId: string };
                if (typeof weaponId !== 'string' || !weaponId) {
                    return jsonNoCache(c, { error: 'invalid_weapon_pick_params' }, 400);
                }
                const existing = player.weapons.find(w => w.type === weaponId);
                if (existing) {
                    existing.level += 1;
                } else {
                    player.weapons.push({ type: weaponId, level: 1 });
                }
                player.activeWeaponType = weaponId;
                await emitWithSeq(seq => ({ type: 'WEAPON_ASSIGNED', playerId, weaponId, seq }));
                break;
            }

            case 'HEARTBEAT': {
                player.lastHeartbeat = Date.now();
                break;
            }

            case 'CLOCK_SYNC_REQUEST': {
                const clientTime = payload.clientTime as number;
                if (!Number.isFinite(clientTime)) {
                    return jsonNoCache(c, { error: 'invalid_clock_sync_params' }, 400);
                }
                await emitWithSeq(seq => ({
                    type: 'CLOCK_SYNC' as const,
                    serverTime: Date.now(),
                    clientTime,
                    seq,
                }));
                break;
            }

            case 'WAVE_ADVANCE': {
                // Host-only: server records authoritative wave start time
                if (!isHostPlayer(state, playerId)) {
                    return jsonNoCache(c, { error: 'host_only_action' }, 403);
                }
                const waveIdx = payload.waveIndex as number;
                if (!Number.isFinite(waveIdx) || waveIdx < 1 || !Number.isInteger(waveIdx)) {
                    return jsonNoCache(c, { error: 'invalid_wave_advance_params' }, 400);
                }
                const startAt = Date.now();
                state.waveNumber = waveIdx;
                state.waveStartAt = startAt;
                await emitWithSeq(seq => ({
                    type: 'WAVE_STARTED' as const,
                    waveIndex: waveIdx,
                    startAt,
                    seq,
                }));
                break;
            }

            case 'DISCONNECT': {
                player.connected = false;
                await emitNoSeq({ type: 'PLAYER_DISCONNECTED', playerId });
                break;
            }

            case 'PAUSE_REQUEST': {
                await emitWithSeq(seq => ({ type: 'GAME_PAUSE', seq }));
                break;
            }

            case 'RESUME_REQUEST': {
                await emitWithSeq(seq => ({ type: 'GAME_RESUME', seq }));
                break;
            }

            case 'MATCH_OVER': {
                state.status = 'finished';
                const victory = (payload.victory as boolean) ?? false;
                await emitWithSeq(seq => ({ type: 'MATCH_OVER', victory, seq }));
                break;
            }

            case 'BUILD_STATE_SYNC': {
                // Host-only: only the host can push authoritative build state
                if (!isHostPlayer(state, playerId)) {
                    console.warn(
                        `[coop/action] BUILD_STATE_SYNC rejected: ${playerId} is not host`
                    );
                    return jsonNoCache(c, { error: 'host_only_action' }, 403);
                }
                const snapshot = payload.snapshot as BuildStateSnapshot | undefined;
                if (!snapshot || typeof snapshot.version !== 'number') {
                    return jsonNoCache(c, { error: 'invalid_build_state_sync' }, 400);
                }
                // Store authoritative build state
                state.buildState = snapshot;
                state.sharedCoins = snapshot.sharedCoins;
                await emitWithSeq(seq => ({
                    type: 'BUILD_STATE_SNAPSHOT',
                    snapshot,
                    seq,
                }));
                break;
            }

            default:
                return jsonNoCache(c, { error: 'unknown_action_type' }, 400);
        }

        // Persist only seq-bearing broadcast messages for rejoin replay.
        for (const msg of replayMessages) {
            const msgSeq = (msg as { seq?: number }).seq;
            if (typeof msgSeq !== 'number') continue;
            await redis.zAdd(MATCH_ACTIONS_KEY(matchId), {
                score: msgSeq,
                member: JSON.stringify(msg),
            });
        }
        if (replayMessages.length > 0) {
            await redis.expire(MATCH_ACTIONS_KEY(matchId), MATCH_TTL_SEC);
        }

        await saveMatch(state);
        const lastReplayMsg = replayMessages[replayMessages.length - 1] as
            | { seq?: number }
            | undefined;
        return jsonNoCache(c, { ok: true, seq: lastReplayMsg?.seq ?? state.seq });
    } catch (err) {
        console.error('[coop/action]', err);
        return jsonNoCache(c, { error: 'internal_error' }, 500);
    }
});
