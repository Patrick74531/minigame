import { randomInt, randomRange } from './WaveMath';
import { type RouteLane } from './WaveLaneRouting';
import type {
    BossArchetypeConfig,
    BossEchoRuntimeState,
    BossEventConfig,
    EnemyArchetypeConfig,
    TemplateRuntimeState,
} from './WaveTypes';

export function shouldTriggerBossWave(
    waveNumber: number,
    bossEventConfig: BossEventConfig | null,
    nextBossWave: number
): boolean {
    if (!bossEventConfig?.ENABLED) return false;
    return waveNumber >= nextBossWave;
}

export function selectBossArchetype(params: {
    bossEventConfig: BossEventConfig | null;
    bossState: Map<string, TemplateRuntimeState>;
}): BossArchetypeConfig | null {
    const bossCfg = params.bossEventConfig;
    if (!bossCfg || bossCfg.BOSS_ARCHETYPES.length === 0) return null;

    const unlocked = bossCfg.BOSS_ARCHETYPES.filter(item => {
        const state = params.bossState.get(item.id);
        return !state || state.cooldownRemain <= 0;
    });
    const pool = unlocked.length > 0 ? unlocked : bossCfg.BOSS_ARCHETYPES;
    if (pool.length === 0) return null;

    const idx = randomInt(0, Math.max(0, pool.length - 1));
    const picked = pool[idx] ?? pool[0];
    const bossState = params.bossState.get(picked.id);
    if (bossState) {
        bossState.cooldownRemain = Math.max(bossState.cooldownRemain, bossCfg.BOSS_COOLDOWN_WAVES);
    }
    return picked;
}

export function applyBossEchoForWave(params: {
    boss: BossArchetypeConfig;
    waveNumber: number;
    bossEventConfig: BossEventConfig | null;
    archetypeById: Map<string, EnemyArchetypeConfig>;
    bossEchoes: BossEchoRuntimeState[];
}): void {
    const cfg = params.bossEventConfig;
    if (!cfg) return;
    const targetId = params.boss.echoTargetId;
    if (!targetId || !params.archetypeById.has(targetId)) return;

    const echoCfg = cfg.ECHO;
    const bonusDuration = randomInt(
        echoCfg.BONUS_DURATION_MIN,
        Math.max(echoCfg.BONUS_DURATION_MIN, echoCfg.BONUS_DURATION_MAX)
    );
    const bonusStart = params.waveNumber + Math.max(0, echoCfg.START_DELAY_WAVES);
    const bonusEnd = bonusStart + Math.max(0, bonusDuration - 1);
    const baseStart = bonusEnd + 1;
    const baseEnd = baseStart + Math.max(0, echoCfg.BASE_DURATION_WAVES - 1);

    params.bossEchoes.push({
        targetId,
        bonusStartWave: bonusStart,
        bonusEndWave: bonusEnd,
        bonusWeight: randomRange(echoCfg.BONUS_WEIGHT_MIN, echoCfg.BONUS_WEIGHT_MAX),
        baseStartWave: baseStart,
        baseEndWave: baseEnd,
        baseWeight: randomRange(echoCfg.BASE_WEIGHT_MIN, echoCfg.BASE_WEIGHT_MAX),
    });
}

export function resolveBossEchoWeight(
    archetypeId: string,
    waveNumber: number,
    bossEchoes: ReadonlyArray<BossEchoRuntimeState>
): number {
    let bonus = 0;
    for (const echo of bossEchoes) {
        if (echo.targetId !== archetypeId) continue;
        if (waveNumber >= echo.bonusStartWave && waveNumber <= echo.bonusEndWave) {
            bonus += echo.bonusWeight;
            continue;
        }
        if (waveNumber >= echo.baseStartWave && waveNumber <= echo.baseEndWave) {
            bonus += echo.baseWeight;
        }
    }
    return bonus;
}

export function pruneBossEchoes(
    bossEchoes: BossEchoRuntimeState[],
    waveNumber: number
): BossEchoRuntimeState[] {
    return bossEchoes.filter(echo => waveNumber <= echo.baseEndWave);
}

export function rollNextBossWave(
    fromWave: number,
    bossEventConfig: BossEventConfig | null
): number {
    if (!bossEventConfig) return Number.MAX_SAFE_INTEGER;
    const min = Math.max(1, bossEventConfig.INTERVAL_MIN_WAVES);
    const max = Math.max(min, bossEventConfig.INTERVAL_MAX_WAVES);
    return fromWave + randomInt(min, max);
}

export function advanceBossLaneState(params: {
    nextUnlockLaneCursor: number;
    nextBossLaneCursor: number;
    routeLaneSequence: readonly RouteLane[];
}): {
    laneToUnlock: RouteLane | null;
    nextUnlockLaneCursor: number;
    nextBossLaneCursor: number;
} {
    if (params.nextUnlockLaneCursor < params.routeLaneSequence.length) {
        const laneToUnlock = params.routeLaneSequence[params.nextUnlockLaneCursor] ?? null;
        if (!laneToUnlock) {
            return {
                laneToUnlock: null,
                nextUnlockLaneCursor: params.nextUnlockLaneCursor,
                nextBossLaneCursor: params.nextBossLaneCursor,
            };
        }
        return {
            laneToUnlock,
            nextUnlockLaneCursor: params.nextUnlockLaneCursor + 1,
            nextBossLaneCursor: params.nextUnlockLaneCursor,
        };
    }

    return {
        laneToUnlock: null,
        nextUnlockLaneCursor: params.nextUnlockLaneCursor,
        nextBossLaneCursor:
            (params.nextBossLaneCursor + 1) % Math.max(1, params.routeLaneSequence.length),
    };
}
