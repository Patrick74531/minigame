import { BALANCE } from './balance';

/**
 * 建筑系统配置
 */
export const BUILDING_CONFIG = {
    /** 兵营产兵间隔（秒）（legacy fallback） */
    SPAWN_INTERVAL: BALANCE.building.barracks.spawnInterval,
    /** 兵营最大产兵数（legacy fallback） */
    MAX_SOLDIERS_PER_BARRACKS: BALANCE.building.barracks.maxUnits,
    /** 建筑血量（legacy fallback） */
    BASE_HP: 500,
    /** 基地初始血量（与建筑默认 HP 区分，避免误改） */
    BASE_START_HP: 100,
    /** 全局默认升级上限 */
    DEFAULT_MAX_LEVEL: 5,
    /** 全局默认升级成本倍率 */
    DEFAULT_COST_MULTIPLIER: BALANCE.building.defaultCostMultiplier,
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
        START_COST: BALANCE.building.baseUpgrade.startCost,
        /** 基地升级花费倍率 */
        COST_MULTIPLIER: BALANCE.building.baseUpgrade.costMultiplier,
        /** 基地最大等级 */
        MAX_LEVEL: 5,
        /** 每次升级基地血量倍率 */
        HP_MULTIPLIER: BALANCE.building.baseUpgrade.hpMultiplier,
        /** 基地自动收集金币半径 */
        COLLECT_RADIUS: BALANCE.building.baseUpgrade.collectRadius,
        /** 每次收集金币数量 */
        COLLECT_RATE: BALANCE.building.baseUpgrade.collectRate,
        /** 收集间隔（秒） */
        COLLECT_INTERVAL: BALANCE.building.baseUpgrade.collectInterval,
        /** 兵营单批次产兵基础数量 */
        SOLDIER_BATCH_BASE: BALANCE.building.baseUpgrade.soldierBatchBase,
        /** 基地每升 1 级，兵营单批次额外产兵数量 */
        SOLDIER_BATCH_BONUS_PER_LEVEL: BALANCE.building.baseUpgrade.soldierBatchBonusPerLevel,
        /** 兵营单批次产兵上限（防止峰值过高） */
        SOLDIER_BATCH_MAX: BALANCE.building.baseUpgrade.soldierBatchMax,
        /** 基地每次升级对英雄的增益 */
        HERO_BUFF: {
            HP_MULTIPLIER: BALANCE.building.baseUpgrade.heroBuff.hpMultiplier,
            ATTACK_MULTIPLIER: BALANCE.building.baseUpgrade.heroBuff.attackMultiplier,
            ATTACK_INTERVAL_MULTIPLIER:
                BALANCE.building.baseUpgrade.heroBuff.attackIntervalMultiplier,
            MOVE_SPEED_MULTIPLIER: BALANCE.building.baseUpgrade.heroBuff.moveSpeedMultiplier,
            ATTACK_RANGE_BONUS: BALANCE.building.baseUpgrade.heroBuff.attackRangeBonus,
            HEAL_PERCENT: BALANCE.building.baseUpgrade.heroBuff.healPercent,
        },
    },
    /** 机枪塔弹道参数（避免散落在 Tower.ts 中硬编码） */
    TOWER_MACHINE_GUN: {
        BULLET_SPAWN_Y: BALANCE.building.tower.machineGun.bulletSpawnY,
        BULLET_WIDTH_BASE: BALANCE.building.tower.machineGun.bulletWidthBase,
        BULLET_LENGTH_BASE: BALANCE.building.tower.machineGun.bulletLengthBase,
        BULLET_WIDTH_PER_LEVEL: BALANCE.building.tower.machineGun.bulletWidthPerLevel,
        BULLET_LENGTH_PER_LEVEL: BALANCE.building.tower.machineGun.bulletLengthPerLevel,
        BULLET_SPREAD_DEG: BALANCE.building.tower.machineGun.bulletSpreadDeg,
        BULLET_MAX_LIFETIME: BALANCE.building.tower.machineGun.bulletMaxLifetime,
        BURST_BASE: BALANCE.building.tower.machineGun.burstBase,
        BURST_ANGLE_STEP_DEG: BALANCE.building.tower.machineGun.burstAngleStepDeg,
        MODEL_NODE_NAME: BALANCE.building.tower.machineGun.modelNodeName,
        MUZZLE_FALLBACK_Y: BALANCE.building.tower.machineGun.muzzleFallbackY,
        MUZZLE_TOP_INSET: BALANCE.building.tower.machineGun.muzzleTopInset,
    },
    /** 农场金币堆叠参数 */
    FARM_STACK: {
        BASE_POS: [
            { x: 2.65, z: -0.48 },
            { x: 3.55, z: -0.48 },
            { x: 2.65, z: 0.48 },
            { x: 3.55, z: 0.48 },
        ],
        BASE_Y: BALANCE.building.farm.stack.baseY,
        MAX_HEIGHT: BALANCE.building.farm.stack.maxHeight,
        COIN_VALUE: BALANCE.building.farm.stack.coinValue,
    },
    /**
     * 建筑类型配置
     * NOTE: 建筑战斗/成长数值统一维护在这里，避免分散硬编码。
     */
    TYPES: {
        barracks: {
            nameKey: 'building.barracks.name',
            cost: BALANCE.building.costs.barracks,
            buildTime: 0,
            descriptionKey: 'building.barracks.description',
            role: 'barracks',
            visual: {
                colorHex: '#64B464',
                scale: { x: 0.54, y: 0.54, z: 0.54 },
            },
            stats: {
                hp: BALANCE.building.barracks.hp,
            },
            features: {
                spawnInterval: BALANCE.building.barracks.spawnInterval,
                maxUnits: BALANCE.building.barracks.maxUnits,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: BALANCE.building.upgradeCostMultiplier.barracks,
                statMultiplier: BALANCE.building.barracks.statMultiplier,
                spawnIntervalMultiplier: BALANCE.building.barracks.spawnIntervalMultiplier,
                maxUnitsPerLevel: BALANCE.building.barracks.maxUnitsPerLevel,
                spawnBatchPerLevel: BALANCE.building.barracks.spawnBatchPerLevel,
            },
        },
        base: {
            nameKey: 'building.base.name',
            cost: BALANCE.building.costs.base,
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
            cost: BALANCE.building.costs.tower,
            buildTime: 0,
            descriptionKey: 'building.tower.description',
            role: 'tower',
            visual: {
                colorHex: '#DCDC3C',
                scale: { x: 0.72, y: 1.44, z: 0.72 },
            },
            stats: {
                hp: BALANCE.building.tower.hp,
                attackRange: BALANCE.building.tower.attackRange,
                attackDamage: BALANCE.building.tower.attackDamage,
                attackInterval: BALANCE.building.tower.attackInterval,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: BALANCE.building.upgradeCostMultiplier.tower,
                statMultiplier: BALANCE.building.tower.statMultiplier,
                attackMultiplier: BALANCE.building.tower.attackMultiplier,
                rangeMultiplier: BALANCE.building.tower.rangeMultiplier,
                intervalMultiplier: BALANCE.building.tower.intervalMultiplier,
            },
        },
        frost_tower: {
            nameKey: 'building.frost_tower.name',
            cost: BALANCE.building.costs.frostTower,
            buildTime: 0,
            descriptionKey: 'building.frost_tower.description',
            role: 'tower',
            visual: {
                colorHex: '#3C64DC',
                scale: { x: 0.52, y: 1.02, z: 0.52 },
            },
            stats: {
                hp: BALANCE.building.frostTower.hp,
                attackRange: BALANCE.building.frostTower.attackRange,
                attackDamage: BALANCE.building.frostTower.attackDamage,
                attackInterval: BALANCE.building.frostTower.attackInterval,
            },
            features: {
                bulletColorHex: '#0096FF',
                bulletExplosionRadius: BALANCE.building.frostTower.bulletExplosionRadius,
                bulletSlowPercent: BALANCE.building.frostTower.bulletSlowPercent,
                bulletSlowDuration: BALANCE.building.frostTower.bulletSlowDuration,
                directRainCast: true,
                rainRadiusPerLevel: 0.22,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: BALANCE.building.upgradeCostMultiplier.frostTower,
                statMultiplier: BALANCE.building.frostTower.statMultiplier,
                attackMultiplier: BALANCE.building.frostTower.attackMultiplier,
                rangeMultiplier: BALANCE.building.frostTower.rangeMultiplier,
                intervalMultiplier: BALANCE.building.frostTower.intervalMultiplier,
            },
        },
        lightning_tower: {
            nameKey: 'building.lightning_tower.name',
            cost: BALANCE.building.costs.lightningTower,
            buildTime: 0,
            descriptionKey: 'building.lightning_tower.description',
            role: 'tower',
            visual: {
                colorHex: '#800080',
                scale: { x: 0.4, y: 0.8, z: 0.4 },
            },
            stats: {
                hp: BALANCE.building.lightningTower.hp,
                attackRange: BALANCE.building.lightningTower.attackRange,
                attackDamage: BALANCE.building.lightningTower.attackDamage,
                attackInterval: BALANCE.building.lightningTower.attackInterval,
            },
            features: {
                chainCount: BALANCE.building.lightningTower.chainCount,
                chainCountPerLevel: 1,
                chainRange: BALANCE.building.lightningTower.chainRange,
                bulletColorHex: '#A020F0',
                useLaserVisual: true,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: BALANCE.building.upgradeCostMultiplier.lightningTower,
                statMultiplier: BALANCE.building.lightningTower.statMultiplier,
                attackMultiplier: BALANCE.building.lightningTower.attackMultiplier,
                rangeMultiplier: BALANCE.building.lightningTower.rangeMultiplier,
                intervalMultiplier: BALANCE.building.lightningTower.intervalMultiplier,
                chainRangePerLevel: BALANCE.building.lightningTower.chainRangePerLevel,
            },
        },
        farm: {
            nameKey: 'building.farm.name',
            cost: BALANCE.building.costs.farm,
            buildTime: 0,
            descriptionKey: 'building.farm.description',
            role: 'building',
            visual: {
                colorHex: '#8B4513',
                scale: { x: 1.2, y: 0.6, z: 1.2 },
            },
            stats: {
                hp: BALANCE.building.farm.hp,
            },
            features: {
                incomePerTick: BALANCE.building.farm.incomePerTick,
                incomeInterval: BALANCE.building.farm.incomeInterval,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: BALANCE.building.upgradeCostMultiplier.farm,
                statMultiplier: BALANCE.building.farm.statMultiplier,
                incomeMultiplier: BALANCE.building.farm.incomeMultiplier,
            },
        },
        wall: {
            nameKey: 'building.wall.name',
            cost: BALANCE.building.costs.wall,
            buildTime: 0,
            descriptionKey: 'building.wall.description',
            role: 'building',
            visual: {
                colorHex: '#808080',
                scale: { x: 0.8, y: 0.8, z: 0.8 },
            },
            stats: {
                hp: BALANCE.building.wall.hp,
                tauntRange: BALANCE.building.wall.tauntRange,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: BALANCE.building.upgradeCostMultiplier.wall,
                statMultiplier: BALANCE.building.wall.statMultiplier,
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
                scale: { x: 7.2, y: 7.2, z: 7.2 },
            },
            stats: {
                hp: BALANCE.building.spa.hp,
            },
            features: {
                healPercentPerSecond: BALANCE.building.spa.healPercentPerSecond,
                healInterval: BALANCE.building.spa.healInterval,
                healRadius: BALANCE.building.spa.healRadius,
            },
            upgrades: {
                maxLevel: 5,
                costMultiplier: 0,
                statMultiplier: BALANCE.building.spa.statMultiplier,
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
        { x: -7.1, z: -21.3, type: 'tower', angle: 0, overrideCost: 40 },
        { x: -3.5, z: -21.3, type: 'tower', angle: 0 },
        { x: 0.1, z: -21.3, type: 'tower', angle: 0 },
        { x: 3.7, z: -21.3, type: 'tower', angle: 0 },
        // Bottom lane inner side
        { x: -21.3, z: -10.7, type: 'tower', angle: 90, overrideCost: 40 },
        { x: -21.3, z: -7.1, type: 'tower', angle: 90 },
        { x: -21.3, z: -3.5, type: 'tower', angle: 90 },
        { x: -21.3, z: 0.1, type: 'tower', angle: 90 },
        // Mid lane roadside towers
        { x: -10.5, z: -6, type: 'tower', angle: -45 },
        { x: -6, z: -10.5, type: 'tower', angle: 135 },
        { x: -7.9, z: -3.4, type: 'tower', angle: -45, overrideCost: 10 },
        // Mid lane missing tower restored: between #16 and #19
        { x: -5.4, z: -0.9, type: 'tower', angle: -45, overrideCost: 40 },
        { x: -0.9, z: -5.4, type: 'tower', angle: 135 },
        { x: -2.9, z: 1.7, type: 'tower', angle: -45, overrideCost: 10 },
        { x: 1.7, z: -2.9, type: 'tower', angle: 135 },
        // Mid lane extra tower restored: between #15 and #18
        { x: -3.4, z: -7.9, type: 'tower', angle: 135 },
    ],
} as const;
