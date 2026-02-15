/**
 * 无限波次模式参数
 * 设计原则：敌人成长略快于英雄，迫使玩家利用建筑和卡牌体系
 */
export const WAVE_INFINITE_CONFIG = {
    BASE_COUNT: 30,
    COUNT_PER_WAVE: 6,
    COUNT_GROWTH_STEP_WAVES: 3,
    COUNT_GROWTH_STEP_BONUS: 8,
    BASE_HP_MULT: 1,
    HP_MULT_PER_WAVE: 0.18,
    BASE_ATTACK_MULT: 1,
    ATTACK_MULT_PER_WAVE: 0.1,
    BASE_SPEED_MULT: 1,
    SPEED_MULT_PER_WAVE: 0.015,
    MAX_SPEED_MULT: 1.55,
    BASE_SPAWN_INTERVAL: 0.35,
    SPAWN_INTERVAL_DECAY_PER_WAVE: 0.02,
    MIN_SPAWN_INTERVAL: 0.12,
    BONUS_PER_WAVE: 20,
    BONUS_GROWTH_PER_WAVE: 4,
    SPAWN_RANGE: 8,
    /**
     * 固定刷怪口设置
     * - 基于“离基地最近角之外”的三个方向生成刷怪口
     * - 三个刷怪口与基地保持等距，并按波次逐步解锁
     * - 通过边缘留白避免刷在地图最角落
     */
    SPAWN_PORTALS: {
        /** 第 2 个刷怪口解锁波次（含） */
        OPEN_WAVE_2: 4,
        /** 第 3 个刷怪口解锁波次（含） */
        OPEN_WAVE_3: 8,
        /** 刷怪口距离地图边缘的最小留白（世界坐标） */
        EDGE_MARGIN: 4.0,
        /** 共享刷怪半径比例（1 = 顶到边缘留白线） */
        DISTANCE_FACTOR: 0.9,
        /** 每个刷怪口的随机抖动半径 */
        JITTER_RADIUS: 1.2,
    },
    ELITE: {
        START_WAVE: 3,
        INTERVAL: 2,
        BASE_COUNT: 1,
        COUNT_GROWTH_STEP_WAVES: 4,
        MAX_COUNT: 6,
        SPAWN_EVERY: 4,
    },
    /**
     * 无限模式怪物抽样参数（带冷却的约束随机）
     */
    RANDOMIZER: {
        /** 每波抽取怪物类型数量 */
        PICK_TYPES_PER_WAVE: 3,
        /** 组合记忆窗口（最近 M 波禁止完全相同三类型组合） */
        COMBO_MEMORY_WAVES: 4,
        /** 最近几波出现过的类型施加惩罚 */
        RECENT_TYPE_PENALTY_WAVES: 2,
        /** 最近类型惩罚系数 */
        RECENT_TYPE_PENALTY: 0.42,
        /** 最近 K 波统计窗口（用于均衡惩罚） */
        RECENT_WINDOW_WAVES: 8,
        /** tag 占比统计窗口 */
        TAG_DOMINANCE_WINDOW_WAVES: 3,
        /** tag 连续占比阈值 */
        TAG_DOMINANCE_THRESHOLD: 0.62,
        /** tag 超阈值降权系数 */
        TAG_DOMINANCE_PENALTY: 0.55,
        /** 最小权重下限（防止 0 权重死锁） */
        MIN_WEIGHT_FLOOR: 0.01,
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
            attackType: 'standard',
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
            attackType: 'ram',
            visualScale: 0.9,
        },
        {
            id: 'vehicle_turret',
            modelPath: 'vehicle/Enemy_Turret',
            baseWeight: 0.95,
            power: 1.08,
            tags: ['ground', 'ranged'],
            cooldownBase: 3,
            attackType: 'ram',
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
        INTERVAL_MIN_WAVES: 6,
        INTERVAL_MAX_WAVES: 8,
        /** Boss 自身冷却（波数） */
        BOSS_COOLDOWN_WAVES: 12,
        /** Boss 波是否仅刷 Boss（不混入普通/精英） */
        BOSS_ONLY_WAVE: true,
        /** 若关闭 BOSS_ONLY_WAVE，可额外增加小怪数量 */
        ADDITIONAL_ENEMY_COUNT: 0,
        /** Boss 战斗强度（相对普通怪基础值） */
        BOSS_HP_MULTIPLIER: 14,
        BOSS_ATTACK_MULTIPLIER: 3.2,
        BOSS_SPEED_MULTIPLIER: 1.0,
        BOSS_SCALE_MULTIPLIER: 1.75,
        BOSS_COIN_MULTIPLIER: 6.0,
        /** Boss 进入小怪池后的体型比例（60%） */
        MINION_SCALE_RATIO: 0.6,
        /** Boss 出场后的“小怪回声权重” */
        ECHO: {
            /** +2 波后开始进入提升权重阶段 */
            START_DELAY_WAVES: 2,
            /** 提升权重区间（5%~10%） */
            BONUS_WEIGHT_MIN: 0.05,
            BONUS_WEIGHT_MAX: 0.1,
            /** 提升阶段持续波数（3~5） */
            BONUS_DURATION_MIN: 3,
            BONUS_DURATION_MAX: 5,
            /** 回落常驻权重区间（2%~4%） */
            BASE_WEIGHT_MIN: 0.02,
            BASE_WEIGHT_MAX: 0.04,
            /** 回落常驻持续波数 */
            BASE_DURATION_WAVES: 12,
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
