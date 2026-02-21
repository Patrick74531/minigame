import { BALANCE } from './balance';

/**
 * 无限波次模式参数
 * 设计原则：敌人成长略快于英雄，迫使玩家利用建筑和卡牌体系
 */
export const WAVE_INFINITE_CONFIG = {
    BASE_COUNT: BALANCE.waveInfinite.baseCount,
    COUNT_PER_WAVE: BALANCE.waveInfinite.countPerWave,
    COUNT_GROWTH_STEP_WAVES: BALANCE.waveInfinite.countGrowthStepWaves,
    COUNT_GROWTH_STEP_BONUS: BALANCE.waveInfinite.countGrowthStepBonus,
    BASE_HP_MULT: 1,
    HP_MULT_PER_WAVE: BALANCE.waveInfinite.hpMultPerWave,
    BASE_ATTACK_MULT: 1,
    ATTACK_MULT_PER_WAVE: BALANCE.waveInfinite.attackMultPerWave,
    BASE_SPEED_MULT: 1,
    SPEED_MULT_PER_WAVE: BALANCE.waveInfinite.speedMultPerWave,
    MAX_SPEED_MULT: BALANCE.waveInfinite.maxSpeedMult,
    BASE_SPAWN_INTERVAL: BALANCE.waveInfinite.baseSpawnInterval,
    SPAWN_INTERVAL_DECAY_PER_WAVE: BALANCE.waveInfinite.spawnIntervalDecayPerWave,
    MIN_SPAWN_INTERVAL: BALANCE.waveInfinite.minSpawnInterval,
    SPAWN_RANGE: BALANCE.waveInfinite.spawnRange,
    /**
     * 固定刷怪口设置
     * - 基于三条道路的末端锚点生成刷怪口
     * - 三个刷怪口按波次逐步解锁
     * - 通过边缘留白避免刷在地图最角落
     */
    SPAWN_PORTALS: {
        /** 第 2 个刷怪口解锁波次（含） */
        OPEN_WAVE_2: BALANCE.waveDirector.spawnPortals.openWave2,
        /** 第 3 个刷怪口解锁波次（含） */
        OPEN_WAVE_3: BALANCE.waveDirector.spawnPortals.openWave3,
        /** 刷怪口距离地图边缘的最小留白（世界坐标） */
        EDGE_MARGIN: BALANCE.waveDirector.spawnPortals.edgeMargin,
        /** 向道路末端推进比例（1 = 到道路末端锚点） */
        DISTANCE_FACTOR: BALANCE.waveDirector.spawnPortals.distanceFactor,
        /** 每个刷怪口的随机抖动半径 */
        JITTER_RADIUS: BALANCE.waveDirector.spawnPortals.jitterRadius,
    },
    ELITE: {
        START_WAVE: BALANCE.waveDirector.elite.startWave,
        INTERVAL: BALANCE.waveDirector.elite.interval,
        BASE_COUNT: BALANCE.waveDirector.elite.baseCount,
        COUNT_GROWTH_STEP_WAVES: BALANCE.waveDirector.elite.countGrowthStepWaves,
        MAX_COUNT: BALANCE.waveDirector.elite.maxCount,
        SPAWN_EVERY: BALANCE.waveDirector.elite.spawnEvery,
    },
    /**
     * 无限模式怪物抽样参数（带冷却的约束随机）
     */
    RANDOMIZER: {
        /** 每波抽取怪物类型数量 */
        PICK_TYPES_PER_WAVE: BALANCE.waveDirector.randomizer.pickTypesPerWave,
        /** 组合记忆窗口（最近 M 波禁止完全相同三类型组合） */
        COMBO_MEMORY_WAVES: BALANCE.waveDirector.randomizer.comboMemoryWaves,
        /** 最近几波出现过的类型施加惩罚 */
        RECENT_TYPE_PENALTY_WAVES: BALANCE.waveDirector.randomizer.recentTypePenaltyWaves,
        /** 最近类型惩罚系数 */
        RECENT_TYPE_PENALTY: BALANCE.waveDirector.randomizer.recentTypePenalty,
        /** 最近 K 波统计窗口（用于均衡惩罚） */
        RECENT_WINDOW_WAVES: BALANCE.waveDirector.randomizer.recentWindowWaves,
        /** tag 占比统计窗口 */
        TAG_DOMINANCE_WINDOW_WAVES: BALANCE.waveDirector.randomizer.tagDominanceWindowWaves,
        /** tag 连续占比阈值 */
        TAG_DOMINANCE_THRESHOLD: BALANCE.waveDirector.randomizer.tagDominanceThreshold,
        /** tag 超阈值降权系数 */
        TAG_DOMINANCE_PENALTY: BALANCE.waveDirector.randomizer.tagDominancePenalty,
        /** 最小权重下限（防止 0 权重死锁） */
        MIN_WEIGHT_FLOOR: BALANCE.waveDirector.randomizer.minWeightFloor,
    },
    /**
     * 怪物类型池（按类型而不是单个实体）
     * tags 建议使用：air/ground/rush/tank/ranged/melee/heavy
     */
    ENEMY_ARCHETYPES: [
        {
            id: 'boss_robot_flying',
            modelPath: 'boss/Robot_Flying',
            baseWeight: 1.05,
            power: 1.12,
            tags: ['ground', 'melee'],
            cooldownBase: 3,
            attackType: 'standard',
            visualScale: 4.5,
        },
        {
            id: 'boss_robot_large',
            modelPath: 'boss/Robot_Large',
            baseWeight: 0.92,
            power: 1.2,
            tags: ['ground', 'tank', 'heavy'],
            cooldownBase: 4,
            attackType: 'standard',
            visualScale: 4.5,
        },
        {
            id: 'boss_legs_gun',
            modelPath: 'boss/Robot_Legs_Gun',
            baseWeight: 0.9,
            power: 1.25,
            tags: ['ground', 'ranged', 'heavy'],
            cooldownBase: 4,
            attackType: 'ranged',
            visualScale: 4.5,
        },
        {
            id: 'boss_mech',
            modelPath: 'boss/Mech',
            baseWeight: 0.82,
            power: 1.35,
            tags: ['ground', 'tank', 'heavy'],
            cooldownBase: 4,
            attackType: 'standard',
            visualScale: 1.5,
        },
        {
            id: 'vehicle_tank',
            modelPath: 'vehicle/Tank',
            baseWeight: 1.0,
            power: 1.15,
            tags: ['ground', 'tank', 'rush'],
            cooldownBase: 3,
            attackType: 'ranged',
            visualScale: 0.9,
        },
        {
            id: 'vehicle_turret',
            modelPath: 'vehicle/Enemy_Turret',
            baseWeight: 0.95,
            power: 1.08,
            tags: ['ground', 'ranged'],
            cooldownBase: 3,
            attackType: 'ranged',
            visualScale: 0.9,
        },
        {
            id: 'vehicle_truck',
            modelPath: 'vehicle/Enemy_Truck',
            baseWeight: 1.02,
            power: 1.06,
            tags: ['ground', 'rush'],
            cooldownBase: 2,
            attackType: 'ram',
            visualScale: 0.9,
        },
        {
            id: 'vehicle_rover',
            modelPath: 'vehicle/Enemy_Rover',
            baseWeight: 1.08,
            power: 0.95,
            tags: ['ground', 'rush'],
            cooldownBase: 2,
            attackType: 'ram',
            visualScale: 0.45,
        },
        {
            id: 'vehicle_round_rover',
            modelPath: 'vehicle/Enemy_RoundRover',
            baseWeight: 1.1,
            power: 0.92,
            tags: ['ground', 'rush'],
            cooldownBase: 2,
            attackType: 'ram',
            visualScale: 0.45,
        },
        {
            id: 'flying_ship_1',
            modelPath: 'flying/Spaceship',
            baseWeight: 0.96,
            power: 1.0,
            tags: ['air', 'ranged'],
            cooldownBase: 3,
            attackType: 'ranged',
            visualScale: 0.45,
        },
        {
            id: 'flying_ship_2',
            modelPath: 'flying/Spaceship_02',
            baseWeight: 0.9,
            power: 1.04,
            tags: ['air', 'ranged'],
            cooldownBase: 3,
            attackType: 'ranged',
            visualScale: 0.45,
        },
        {
            id: 'flying_ship_3',
            modelPath: 'flying/Spaceship_03',
            baseWeight: 0.87,
            power: 1.08,
            tags: ['air', 'ranged', 'heavy'],
            cooldownBase: 3,
            attackType: 'ranged',
            visualScale: 0.45,
        },
    ],
    /** 三类型数量分配模板池（百分比） */
    COMPOSITION_TEMPLATES: [
        { id: 'ratio_55_30_15', shares: [55, 30, 15], cooldownWaves: 1 },
        { id: 'ratio_45_35_20', shares: [45, 35, 20], cooldownWaves: 1 },
        { id: 'ratio_50_25_25', shares: [50, 25, 25], cooldownWaves: 1 },
        { id: 'ratio_40_40_20', shares: [40, 40, 20], cooldownWaves: 1 },
        { id: 'ratio_60_25_15', shares: [60, 25, 15], cooldownWaves: 1 },
    ],
    /** 出怪节奏模板池 */
    RHYTHM_TEMPLATES: [
        { id: 'steady', pattern: 'steady', cooldownWaves: 1 },
        { id: 'frontload', pattern: 'frontload', cooldownWaves: 2 },
        { id: 'backload', pattern: 'backload', cooldownWaves: 2 },
        { id: 'pulse', pattern: 'pulse', cooldownWaves: 2 },
    ],
    /** Boss 事件规则（无限模式） */
    BOSS_EVENT: {
        ENABLED: true,
        /** 触发间隔（随机区间） */
        INTERVAL_MIN_WAVES: BALANCE.waveDirector.bossEvent.intervalMinWaves,
        INTERVAL_MAX_WAVES: BALANCE.waveDirector.bossEvent.intervalMaxWaves,
        /** Boss 自身冷却（波数） */
        BOSS_COOLDOWN_WAVES: BALANCE.waveDirector.bossEvent.bossCooldownWaves,
        /** Boss 波是否仅刷 Boss（不混入普通/精英） */
        BOSS_ONLY_WAVE: BALANCE.waveDirector.bossEvent.bossOnlyWave,
        /** 若关闭 BOSS_ONLY_WAVE，可额外增加小怪数量 */
        ADDITIONAL_ENEMY_COUNT: BALANCE.waveDirector.bossEvent.additionalEnemyCount,
        /** Boss 战斗强度（相对普通怪基础值） */
        BOSS_HP_MULTIPLIER: BALANCE.waveDirector.bossEvent.bossHpMultiplier,
        BOSS_ATTACK_MULTIPLIER: BALANCE.waveDirector.bossEvent.bossAttackMultiplier,
        BOSS_SPEED_MULTIPLIER: BALANCE.waveDirector.bossEvent.bossSpeedMultiplier,
        BOSS_SCALE_MULTIPLIER: BALANCE.waveDirector.bossEvent.bossScaleMultiplier,
        BOSS_COIN_MULTIPLIER: BALANCE.waveDirector.bossEvent.bossCoinMultiplier,
        /** Boss 进入小怪池后的体型比例（60%） */
        MINION_SCALE_RATIO: BALANCE.waveDirector.bossEvent.minionScaleRatio,
        /** Boss 出场后的“小怪回声权重” */
        ECHO: {
            /** +2 波后开始进入提升权重阶段 */
            START_DELAY_WAVES: BALANCE.waveDirector.bossEvent.echo.startDelayWaves,
            /** 提升权重区间（5%~10%） */
            BONUS_WEIGHT_MIN: BALANCE.waveDirector.bossEvent.echo.bonusWeightMin,
            BONUS_WEIGHT_MAX: BALANCE.waveDirector.bossEvent.echo.bonusWeightMax,
            /** 提升阶段持续波数（3~5） */
            BONUS_DURATION_MIN: BALANCE.waveDirector.bossEvent.echo.bonusDurationMin,
            BONUS_DURATION_MAX: BALANCE.waveDirector.bossEvent.echo.bonusDurationMax,
            /** 回落常驻权重区间（2%~4%） */
            BASE_WEIGHT_MIN: BALANCE.waveDirector.bossEvent.echo.baseWeightMin,
            BASE_WEIGHT_MAX: BALANCE.waveDirector.bossEvent.echo.baseWeightMax,
            /** 回落常驻持续波数 */
            BASE_DURATION_WAVES: BALANCE.waveDirector.bossEvent.echo.baseDurationWaves,
        },
        BOSS_ARCHETYPES: [
            {
                id: 'event_boss_mech',
                modelPath: 'boss/Mech',
                baseWeight: 1.0,
                power: 1.5,
                tags: ['ground', 'tank', 'heavy'],
                cooldownBase: 12,
                attackType: 'standard',
                visualScale: 1.5,
                echoTargetId: 'vehicle_tank',
            },
            {
                id: 'event_boss_large',
                modelPath: 'boss/Robot_Large',
                baseWeight: 1.0,
                power: 1.4,
                tags: ['ground', 'melee', 'heavy'],
                cooldownBase: 12,
                attackType: 'standard',
                visualScale: 4.5,
                echoTargetId: 'boss_robot_large',
            },
            {
                id: 'event_boss_flying',
                modelPath: 'boss/Robot_Flying',
                baseWeight: 1.0,
                power: 1.35,
                tags: ['air', 'ranged'],
                cooldownBase: 12,
                attackType: 'ranged',
                visualScale: 4.5,
                echoTargetId: 'flying_ship_1',
            },
        ],
    },
} as const;
