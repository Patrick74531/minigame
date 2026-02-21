import type { EnemyAttackType } from '../units/EnemyVisualTypes';

/**
 * 波次配置
 */
export interface WaveConfig {
    waveNumber: number;
    regularCount: number;
    eliteCount: number;
    bossCount: number;
    enemyCount: number;
    spawnInterval: number;
    hpMultiplier: number;
    speedMultiplier: number;
    attackMultiplier: number;
}

export type SpawnType = 'regular' | 'elite' | 'boss';

export interface EnemyArchetypeConfig {
    id: string;
    modelPath: string;
    baseWeight: number;
    power: number;
    tags: string[];
    cooldownBase: number;
    attackType?: EnemyAttackType;
    visualScale?: number;
}

export interface InfiniteRandomizerConfig {
    PICK_TYPES_PER_WAVE: number;
    COMBO_MEMORY_WAVES: number;
    RECENT_TYPE_PENALTY_WAVES: number;
    RECENT_TYPE_PENALTY: number;
    RECENT_WINDOW_WAVES: number;
    TAG_DOMINANCE_WINDOW_WAVES: number;
    TAG_DOMINANCE_THRESHOLD: number;
    TAG_DOMINANCE_PENALTY: number;
    MIN_WEIGHT_FLOOR: number;
}

export interface CompositionTemplate {
    id: string;
    shares: number[];
    cooldownWaves: number;
}

export type RhythmPattern = 'steady' | 'frontload' | 'backload' | 'pulse';

export interface RhythmTemplate {
    id: string;
    pattern: RhythmPattern;
    cooldownWaves: number;
}

export interface BossEchoConfig {
    START_DELAY_WAVES: number;
    BONUS_WEIGHT_MIN: number;
    BONUS_WEIGHT_MAX: number;
    BONUS_DURATION_MIN: number;
    BONUS_DURATION_MAX: number;
    BASE_WEIGHT_MIN: number;
    BASE_WEIGHT_MAX: number;
    BASE_DURATION_WAVES: number;
}

export interface BossArchetypeConfig extends EnemyArchetypeConfig {
    echoTargetId?: string;
}

export interface BossCombatConfig {
    BOSS_HP_MULTIPLIER: number;
    BOSS_ATTACK_MULTIPLIER: number;
    BOSS_SPEED_MULTIPLIER: number;
    BOSS_SCALE_MULTIPLIER: number;
    BOSS_COIN_MULTIPLIER: number;
    MINION_SCALE_RATIO: number;
}

export interface BossEventConfig {
    ENABLED: boolean;
    INTERVAL_MIN_WAVES: number;
    INTERVAL_MAX_WAVES: number;
    BOSS_COOLDOWN_WAVES: number;
    BOSS_ONLY_WAVE: boolean;
    ADDITIONAL_ENEMY_COUNT: number;
    COMBAT: BossCombatConfig;
    ECHO: BossEchoConfig;
    BOSS_ARCHETYPES: BossArchetypeConfig[];
}

export interface ArchetypeRuntimeState {
    cooldownRemain: number;
    lastSeenWave: number;
}

export interface TemplateRuntimeState {
    cooldownRemain: number;
}

export interface BossEchoRuntimeState {
    targetId: string;
    bonusStartWave: number;
    bonusEndWave: number;
    bonusWeight: number;
    baseStartWave: number;
    baseEndWave: number;
    baseWeight: number;
}

export interface PlannedSpawnEntry {
    archetypeId: string;
    spawnType: SpawnType;
    intervalMultiplier: number;
}

export interface WaveSpawnPlan {
    entries: PlannedSpawnEntry[];
    selectedArchetypeIds: string[];
    compositionTemplateId: string;
    rhythmTemplateId: string;
    comboKey: string;
}

export interface SpawnCombatProfile {
    hpMultiplier: number;
    attackMultiplier: number;
    speedMultiplier: number;
    scaleMultiplier: number;
    isElite: boolean;
}
