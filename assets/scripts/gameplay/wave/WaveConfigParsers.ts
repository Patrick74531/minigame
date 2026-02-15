import { clamp, toFinite, toNonNegativeInt, toPositiveInt } from './WaveMath';
import type {
    BossArchetypeConfig,
    BossEchoConfig,
    BossEventConfig,
    CompositionTemplate,
    EnemyArchetypeConfig,
    RhythmTemplate,
} from './WaveTypes';

export function normalizeEnemyArchetypes(raw: unknown): EnemyArchetypeConfig[] {
    if (!Array.isArray(raw)) return [];
    const result: EnemyArchetypeConfig[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = typeof obj.id === 'string' ? obj.id.trim() : '';
        const modelPath = typeof obj.modelPath === 'string' ? obj.modelPath.trim() : '';
        if (!id || !modelPath) continue;

        const tagsRaw = Array.isArray(obj.tags) ? obj.tags : [];
        const tags = tagsRaw.filter(tag => typeof tag === 'string') as string[];
        const attackType =
            obj.attackType === 'standard' || obj.attackType === 'ram' || obj.attackType === 'ranged'
                ? obj.attackType
                : undefined;

        result.push({
            id,
            modelPath,
            baseWeight: clamp(toFinite(obj.baseWeight, 1), 0.01, 100),
            power: clamp(toFinite(obj.power, 1), 0.4, 4),
            tags,
            cooldownBase: toPositiveInt(obj.cooldownBase, 2),
            attackType,
            visualScale: Number.isFinite(obj.visualScale as number)
                ? clamp(obj.visualScale as number, 0.2, 8)
                : undefined,
        });
    }
    return result;
}

export function normalizeCompositionTemplates(raw: unknown): CompositionTemplate[] {
    if (!Array.isArray(raw)) return [];
    const result: CompositionTemplate[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = typeof obj.id === 'string' ? obj.id.trim() : '';
        if (!id) continue;
        const shares = Array.isArray(obj.shares)
            ? obj.shares.map(v => toFinite(v, 0)).filter(v => Number.isFinite(v) && v >= 0)
            : [];
        if (shares.length <= 0) continue;
        result.push({
            id,
            shares,
            cooldownWaves: toNonNegativeInt(obj.cooldownWaves, 1),
        });
    }
    return result;
}

export function normalizeRhythmTemplates(raw: unknown): RhythmTemplate[] {
    if (!Array.isArray(raw)) return [];
    const result: RhythmTemplate[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = typeof obj.id === 'string' ? obj.id.trim() : '';
        const pattern = obj.pattern;
        if (!id) continue;
        if (
            pattern !== 'steady' &&
            pattern !== 'frontload' &&
            pattern !== 'backload' &&
            pattern !== 'pulse'
        ) {
            continue;
        }
        result.push({
            id,
            pattern,
            cooldownWaves: toNonNegativeInt(obj.cooldownWaves, 1),
        });
    }
    return result;
}

export function normalizeBossEventConfig(raw: unknown): BossEventConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (!obj.ENABLED) return null;

    const archetypes = normalizeBossArchetypes(obj.BOSS_ARCHETYPES);
    if (archetypes.length === 0) return null;

    const echoRaw = (obj.ECHO ?? {}) as Record<string, unknown>;
    const echo: BossEchoConfig = {
        START_DELAY_WAVES: toNonNegativeInt(echoRaw.START_DELAY_WAVES, 2),
        BONUS_WEIGHT_MIN: clamp(toFinite(echoRaw.BONUS_WEIGHT_MIN, 0.05), 0, 1),
        BONUS_WEIGHT_MAX: clamp(toFinite(echoRaw.BONUS_WEIGHT_MAX, 0.1), 0, 1),
        BONUS_DURATION_MIN: Math.max(1, toPositiveInt(echoRaw.BONUS_DURATION_MIN, 3)),
        BONUS_DURATION_MAX: Math.max(1, toPositiveInt(echoRaw.BONUS_DURATION_MAX, 5)),
        BASE_WEIGHT_MIN: clamp(toFinite(echoRaw.BASE_WEIGHT_MIN, 0.02), 0, 1),
        BASE_WEIGHT_MAX: clamp(toFinite(echoRaw.BASE_WEIGHT_MAX, 0.04), 0, 1),
        BASE_DURATION_WAVES: Math.max(1, toPositiveInt(echoRaw.BASE_DURATION_WAVES, 12)),
    };

    if (echo.BONUS_WEIGHT_MAX < echo.BONUS_WEIGHT_MIN) {
        echo.BONUS_WEIGHT_MAX = echo.BONUS_WEIGHT_MIN;
    }
    if (echo.BASE_WEIGHT_MAX < echo.BASE_WEIGHT_MIN) {
        echo.BASE_WEIGHT_MAX = echo.BASE_WEIGHT_MIN;
    }
    if (echo.BONUS_DURATION_MAX < echo.BONUS_DURATION_MIN) {
        echo.BONUS_DURATION_MAX = echo.BONUS_DURATION_MIN;
    }

    return {
        ENABLED: true,
        INTERVAL_MIN_WAVES: Math.max(1, toPositiveInt(obj.INTERVAL_MIN_WAVES, 6)),
        INTERVAL_MAX_WAVES: Math.max(1, toPositiveInt(obj.INTERVAL_MAX_WAVES, 8)),
        BOSS_COOLDOWN_WAVES: Math.max(1, toPositiveInt(obj.BOSS_COOLDOWN_WAVES, 12)),
        BOSS_ONLY_WAVE: obj.BOSS_ONLY_WAVE !== false,
        ADDITIONAL_ENEMY_COUNT: toNonNegativeInt(obj.ADDITIONAL_ENEMY_COUNT, 0),
        COMBAT: {
            BOSS_HP_MULTIPLIER: clamp(toFinite(obj.BOSS_HP_MULTIPLIER, 14), 1, 40),
            BOSS_ATTACK_MULTIPLIER: clamp(toFinite(obj.BOSS_ATTACK_MULTIPLIER, 3.2), 1, 20),
            BOSS_SPEED_MULTIPLIER: clamp(toFinite(obj.BOSS_SPEED_MULTIPLIER, 1), 0.4, 3),
            BOSS_SCALE_MULTIPLIER: clamp(toFinite(obj.BOSS_SCALE_MULTIPLIER, 1.75), 1, 8),
            BOSS_COIN_MULTIPLIER: clamp(toFinite(obj.BOSS_COIN_MULTIPLIER, 6), 1, 30),
            MINION_SCALE_RATIO: clamp(toFinite(obj.MINION_SCALE_RATIO, 0.6), 0.2, 1),
        },
        ECHO: echo,
        BOSS_ARCHETYPES: archetypes,
    };
}

function normalizeBossArchetypes(raw: unknown): BossArchetypeConfig[] {
    const base = normalizeEnemyArchetypes(raw);
    if (base.length === 0) return [];

    const input = Array.isArray(raw) ? raw : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of input) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const id = typeof obj.id === 'string' ? obj.id.trim() : '';
        if (id) byId.set(id, obj);
    }

    return base.map(item => {
        const src = byId.get(item.id);
        const echoTargetId =
            src && typeof src.echoTargetId === 'string' ? src.echoTargetId.trim() : undefined;
        return {
            ...item,
            echoTargetId: echoTargetId || undefined,
        };
    });
}

export function getFallbackArchetypes(): EnemyArchetypeConfig[] {
    return [
        {
            id: 'fallback_ground',
            modelPath: 'vehicle/Enemy_Truck',
            baseWeight: 1,
            power: 1,
            tags: ['ground', 'rush'],
            cooldownBase: 2,
            attackType: 'ram',
            visualScale: 0.9,
        },
        {
            id: 'fallback_air',
            modelPath: 'flying/Spaceship',
            baseWeight: 1,
            power: 1,
            tags: ['air', 'ranged'],
            cooldownBase: 3,
            attackType: 'ranged',
            visualScale: 0.45,
        },
        {
            id: 'fallback_heavy',
            modelPath: 'boss/Robot_Large',
            baseWeight: 0.9,
            power: 1.2,
            tags: ['ground', 'heavy', 'tank'],
            cooldownBase: 3,
            attackType: 'standard',
            visualScale: 4.5,
        },
    ];
}
