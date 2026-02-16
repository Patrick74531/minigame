/**
 * 建筑系统配置
 */
export const BUILDING_CONFIG = {
    /** 兵营产兵间隔（秒）（legacy fallback） */
    SPAWN_INTERVAL: 4.5,
    /** 兵营最大产兵数（legacy fallback） */
    MAX_SOLDIERS_PER_BARRACKS: 3,
    /** 建筑血量（legacy fallback） */
    BASE_HP: 500,
    /** 基地初始血量（与建筑默认 HP 区分，避免误改） */
    BASE_START_HP: 100,
    /** 全局默认升级上限 */
    DEFAULT_MAX_LEVEL: 5,
    /** 全局默认升级成本倍率 */
    DEFAULT_COST_MULTIPLIER: 1.45,
    /** 升级投放区（建造后）参数 */
    UPGRADE_PAD: {
        /** 投放区半径（视觉与触发区共用） */
        RADIUS: 0.6,
        /** 建筑“前方”方向（世界坐标） */
        FORWARD_DIR: { x: 0, z: 1 },
        /** 与建筑前缘的额外间距 */
        GAP: 0.8,
    },
    /** 基地升级系统 */
    BASE_UPGRADE: {
        /** 基地升级起始花费（英雄携带金币） */
        START_COST: 20,
        /** 基地升级花费倍率 */
        COST_MULTIPLIER: 1.6,
        /** 基地最大等级 */
        MAX_LEVEL: 5,
        /** 每次升级基地血量倍率 */
        HP_MULTIPLIER: 1.45,
        /** 基地自动收集金币半径 */
        COLLECT_RADIUS: 3.0,
        /** 每次收集金币数量 */
        COLLECT_RATE: 2,
        /** 收集间隔（秒） */
        COLLECT_INTERVAL: 0.1,
        /** 兵营单批次产兵基础数量 */
        SOLDIER_BATCH_BASE: 1,
        /** 基地每升 1 级，兵营单批次额外产兵数量 */
        SOLDIER_BATCH_BONUS_PER_LEVEL: 1,
        /** 兵营单批次产兵上限（防止峰值过高） */
        SOLDIER_BATCH_MAX: 5,
        /** 基地每次升级对英雄的增益 */
        HERO_BUFF: {
            HP_MULTIPLIER: 1.12,
            ATTACK_MULTIPLIER: 1.12,
            ATTACK_INTERVAL_MULTIPLIER: 0.97,
            MOVE_SPEED_MULTIPLIER: 1.03,
            ATTACK_RANGE_BONUS: 0.1,
            HEAL_PERCENT: 0.35,
        },
    },
    /**
     * 建筑类型配置
     * NOTE: 建筑战斗/成长数值统一维护在这里，避免分散硬编码。
     */
    TYPES: {
        barracks: {
            nameKey: 'building.barracks.name',
            cost: 6,
            buildTime: 0,
            descriptionKey: 'building.barracks.description',
            role: 'barracks',
            visual: {
                colorHex: '#64B464',
                scale: { x: 0.54, y: 0.54, z: 0.54 },
            },
            stats: {
                hp: 180,
            },
            features: {
                spawnInterval: 4.5,
                maxUnits: 3,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 1.4,
                statMultiplier: 1.18,
                spawnIntervalMultiplier: 0.92,
                maxUnitsPerLevel: 1,
                spawnBatchPerLevel: 1,
            },
        },
        base: {
            nameKey: 'building.base.name',
            cost: 20,
            buildTime: 0,
            descriptionKey: 'building.base.description',
            role: 'building',
            visual: {
                colorHex: '#FFFFFF',
                scale: { x: 4, y: 4, z: 4 },
            },
        },
        tower: {
            nameKey: 'building.tower.name',
            cost: 12,
            buildTime: 0,
            descriptionKey: 'building.tower.description',
            role: 'tower',
            visual: {
                colorHex: '#DCDC3C',
                scale: { x: 0.72, y: 1.44, z: 0.72 },
            },
            stats: {
                hp: 300,
                attackRange: 18,
                attackDamage: 26,
                attackInterval: 0.45,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 1.5,
                statMultiplier: 1.2,
                attackMultiplier: 1.22,
                rangeMultiplier: 1.03,
                intervalMultiplier: 0.95,
            },
        },
        frost_tower: {
            nameKey: 'building.frost_tower.name',
            cost: 12,
            buildTime: 0,
            descriptionKey: 'building.frost_tower.description',
            role: 'tower',
            visual: {
                colorHex: '#3C64DC',
                scale: { x: 0.52, y: 1.02, z: 0.52 },
            },
            stats: {
                hp: 280,
                attackRange: 16,
                attackDamage: 12,
                attackInterval: 0.8,
            },
            features: {
                bulletColorHex: '#0096FF',
                bulletExplosionRadius: 2.8,
                bulletSlowPercent: 0.45,
                bulletSlowDuration: 2.2,
                directRainCast: true,
                rainRadiusPerLevel: 0.22,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 1.5,
                statMultiplier: 1.18,
                attackMultiplier: 1.15,
                rangeMultiplier: 1.03,
                intervalMultiplier: 0.96,
            },
        },
        lightning_tower: {
            nameKey: 'building.lightning_tower.name',
            cost: 12,
            buildTime: 0,
            descriptionKey: 'building.lightning_tower.description',
            role: 'tower',
            visual: {
                colorHex: '#800080',
                scale: { x: 0.4, y: 0.8, z: 0.4 },
            },
            stats: {
                hp: 260,
                attackRange: 17,
                attackDamage: 12,
                attackInterval: 0.95,
            },
            features: {
                chainCount: 3,
                chainCountPerLevel: 1,
                chainRange: 6,
                bulletColorHex: '#A020F0',
                useLaserVisual: true,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 1.5,
                statMultiplier: 1.2,
                attackMultiplier: 1.2,
                rangeMultiplier: 1.03,
                intervalMultiplier: 0.95,
                chainRangePerLevel: 0.5,
            },
        },
        farm: {
            nameKey: 'building.farm.name',
            cost: 18,
            buildTime: 0,
            descriptionKey: 'building.farm.description',
            role: 'building',
            visual: {
                colorHex: '#8B4513',
                scale: { x: 1.2, y: 0.6, z: 1.2 },
            },
            stats: {
                hp: 150,
            },
            features: {
                incomePerTick: 1,
                incomeInterval: 6,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 1.42,
                statMultiplier: 1.18,
                incomeMultiplier: 1.25,
            },
        },
        wall: {
            nameKey: 'building.wall.name',
            cost: 6,
            buildTime: 0,
            descriptionKey: 'building.wall.description',
            role: 'building',
            visual: {
                colorHex: '#808080',
                scale: { x: 0.8, y: 0.8, z: 0.8 },
            },
            stats: {
                hp: 1100,
                tauntRange: 15,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 1.35,
                statMultiplier: 1.25,
            },
        },
        spa: {
            nameKey: 'building.spa.name',
            cost: 0,
            buildTime: 0,
            descriptionKey: 'building.spa.description',
            role: 'building',
            visual: {
                colorHex: '#FFC0CB',
                scale: { x: 9, y: 9, z: 9 },
            },
            stats: {
                hp: 800,
            },
            features: {
                healRate: 5,
                healInterval: 1,
                healRadius: 5,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 0,
                statMultiplier: 1.2,
            },
        },
    },
    /**
     * 初始建造点配置 (World XZ)
     * NOTE: 扩展新建造点请优先修改此处，避免在 GameController 中硬编码。
     */
    PADS: [
        { x: -23, z: -15, type: 'barracks' },
        { x: -2, z: -2, type: 'wall', angle: 45 },
        { x: -24, z: -2, type: 'wall' },
        { x: 0, z: -24, type: 'wall', angle: 90 },
        { x: -22, z: -22, type: 'spa' },
        { x: -12, z: -25, type: 'farm' },
        // Top lane inner side (tower #1 removed, one added to the right of tower #4)
        { x: -7.1, z: -21.3, type: 'tower', angle: 0 },
        { x: -3.5, z: -21.3, type: 'tower', angle: 0 },
        { x: 0.1, z: -21.3, type: 'tower', angle: 0 },
        { x: 3.7, z: -21.3, type: 'tower', angle: 0 },
        // Bottom lane inner side
        { x: -21.3, z: -10.7, type: 'tower', angle: 90 },
        { x: -21.3, z: -7.1, type: 'tower', angle: 90 },
        { x: -21.3, z: -3.5, type: 'tower', angle: 90 },
        { x: -21.3, z: 0.1, type: 'tower', angle: 90 },
        // Mid lane roadside towers
        { x: -10.5, z: -6, type: 'tower', angle: -45 },
        { x: -6, z: -10.5, type: 'tower', angle: 135 },
        { x: -7.9, z: -3.4, type: 'tower', angle: -45 },
        { x: -3.4, z: -7.9, type: 'tower', angle: 135 },
        { x: -5.4, z: -0.9, type: 'tower', angle: -45 },
        { x: -0.9, z: -5.4, type: 'tower', angle: 135 },
        { x: -2.9, z: 1.7, type: 'tower', angle: -45 },
        { x: 1.7, z: -2.9, type: 'tower', angle: 135 },
    ],
} as const;
