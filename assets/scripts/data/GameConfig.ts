import { WAVE_INFINITE_CONFIG } from './config/WaveInfiniteConfig';
import { GAME_CONFIG } from './config/game';
import { MAP_CONFIG } from './config/map';
import { BUILDING_CONFIG } from './config/building';
import { ENEMY_CONFIG } from './config/enemy';
import { HERO_CONFIG } from './config/hero';
import { ACTIVE_BALANCE_PRESET, BALANCE, BALANCE_SCHEMES } from './config/balance';

/**
 * 游戏配置常量
 * 集中管理所有可调参数，便于平衡和调试
 *
 * NOTE: 新增数值请优先放在这里，保持单一事实来源。
 */
export const GameConfig = {
    // === 游戏通用 ===
    GAME: GAME_CONFIG,

    // === 关卡/生成点 ===
    MAP: MAP_CONFIG,

    // === 物理/高度 ===
    PHYSICS: {
        /** 敌人/士兵/英雄的默认高度（Y） */
        ENEMY_Y: 0.5,
        SOLDIER_Y: 1.0,
        HERO_Y: 1.0,
        /** 金币默认高度（Y） */
        COIN_Y: 0.5,
        /** 远程武器子弹出生高度偏移（英雄锚点在y=1.0位置，下调到腰部/枪口大约-0.4） */
        PROJECTILE_SPAWN_OFFSET_Y: -0.4,
        /** 单位刚体阻尼 */
        UNIT_LINEAR_DAMPING: 0.5,
    },

    // === VFX 视觉参数 ===
    VFX: {
        CANNON_BEAM: {
            maxLevel: 5,
            beamColorStart: [255, 120, 40, 255],
            beamColorEnd: [255, 70, 30, 255],
            coreColorStart: [255, 245, 220, 255],
            coreColorEnd: [255, 255, 255, 255],
            width: { base: 0.22, perLevel: 0.05 },
            duration: { base: 0.1, perLevel: 0.015 },
            beamWidth: { base: 0.1, perLevel: 0.01 },
            glowWidth: { base: 0.55, perLevel: 0.05 },
            pulseSpeed: { base: 6.0, perLevel: 0.4 },
            pulseScale: { base: 0.18, perLevel: 0.03 },
            noiseScale: { base: 9.0, perLevel: 1.2 },
            noiseAmp: { base: 0.025, perLevel: 0.004 },
            intensity: { base: 2.2, perLevel: 0.5 },
            spawnForwardOffset: 0.85,
            spawnUpOffset: -0.4,
            spawnRightOffset: 0.35,
            fadeIn: 0.03,
            fadeOut: 0.05,
        },
    },

    // === 经济系统 ===
    ECONOMY: {
        /** 初始金币 */
        INITIAL_COINS: BALANCE.economy.initialCoins,
        /** 金币飞行到HUD的时间（秒） */
        COIN_FLY_DURATION: 0.5,
        /** 金币收集范围 (3D units) */
        COIN_COLLECT_RANGE: 2.5,
        /** 金币磁吸速度 */
        COIN_MAGNET_SPEED: 15.0,
        /** 金币自动回收时间（秒） */
        COIN_LIFETIME: 15,
        /** 金币浮动动画速度 */
        COIN_FLOAT_SPEED: 5,
        /** 金币浮动动画幅度 */
        COIN_FLOAT_AMPLITUDE: 0.1,
        /** 金币吸附时的高度偏移（更像吸到身体中心） */
        COIN_MAGNET_HEIGHT_OFFSET: 0.5,
    },

    // === 建筑系统 ===
    BUILDING: BUILDING_CONFIG,

    // === 士兵系统 ===
    SOLDIER: {
        /** 基础移动速度 (units/second) - Was 100/60 ~ 1.6 */
        MOVE_SPEED: BALANCE.soldier.moveSpeed,
        /** 基础攻击力 */
        BASE_ATTACK: BALANCE.soldier.baseAttack,
        /** 基础血量 */
        BASE_HP: BALANCE.soldier.baseHp,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: BALANCE.soldier.attackInterval,
        /** 攻击范围 (3D units) */
        ATTACK_RANGE: BALANCE.soldier.attackRange,
        /**
         * 兵营等级对新生成士兵的成长曲线（level 从 1 开始）
         * 公式示例：
         * - HP倍率 = 1 + HP_LINEAR*n + HP_QUADRATIC*n^2，n = level - 1
         * - 攻击倍率 = 1 + ATTACK_LINEAR*n + ATTACK_QUADRATIC*n^2
         * - 攻击间隔倍率 = max(ATTACK_INTERVAL_MIN_MULTIPLIER, 1 - ATTACK_INTERVAL_DECAY_PER_LEVEL*n)
         */
        BARRACKS_GROWTH: {
            HP_LINEAR: BALANCE.soldier.growth.hpLinear,
            HP_QUADRATIC: BALANCE.soldier.growth.hpQuadratic,
            ATTACK_LINEAR: BALANCE.soldier.growth.attackLinear,
            ATTACK_QUADRATIC: BALANCE.soldier.growth.attackQuadratic,
            ATTACK_INTERVAL_DECAY_PER_LEVEL: BALANCE.soldier.growth.attackIntervalDecayPerLevel,
            ATTACK_INTERVAL_MIN_MULTIPLIER: BALANCE.soldier.growth.attackIntervalMinMultiplier,
            ATTACK_RANGE_LINEAR: BALANCE.soldier.growth.attackRangeLinear,
            MOVE_SPEED_LINEAR: BALANCE.soldier.growth.moveSpeedLinear,
            SIZE_LINEAR: BALANCE.soldier.growth.sizeLinear,
            SIZE_QUADRATIC: BALANCE.soldier.growth.sizeQuadratic,
            SIZE_MAX_MULTIPLIER: BALANCE.soldier.growth.sizeMaxMultiplier,
        },
    },

    // === 敌人系统 ===
    ENEMY: ENEMY_CONFIG,

    // === 英雄系统 ===
    HERO: HERO_CONFIG,

    // === 英雄成长系统 ===
    HERO_LEVEL: {
        /** 最大等级 */
        MAX_LEVEL: 30,
        /** 升级所需经验基础值 */
        XP_BASE: BALANCE.heroLevel.xpBase,
        /** 每级经验增长倍率 */
        XP_GROWTH: BALANCE.heroLevel.xpGrowth,
        /** 击杀普通敌人获得的经验 */
        XP_PER_KILL: BALANCE.heroLevel.xpPerKill / 3,
        /** 击杀精英敌人获得的经验 */
        XP_PER_ELITE_KILL: BALANCE.heroLevel.xpPerEliteKill / 3,
        /**
         * 每级属性增长（复合倍率 / 加算）
         * multiply: 每级乘算倍率（如 1.08 = +8%/级）
         * add:      每级加算值
         * cap:      属性上限（可选）
         */
        GROWTH: {
            maxHp: { multiply: BALANCE.heroLevel.growth.maxHpMultiply },
            attack: { multiply: BALANCE.heroLevel.growth.attackMultiply },
            critRate: { add: BALANCE.heroLevel.growth.critRateAdd, cap: 0.5 },
            critDamage: { add: BALANCE.heroLevel.growth.critDamageAdd },
            moveSpeed: { multiply: BALANCE.heroLevel.growth.moveSpeedMultiply },
            attackRange: { multiply: BALANCE.heroLevel.growth.attackRangeMultiply },
            attackInterval: { multiply: BALANCE.heroLevel.growth.attackIntervalMultiply },
        } as Record<string, { multiply?: number; add?: number; cap?: number }>,
    },

    // === 波次系统 ===
    WAVE: {
        /** 首波刷新延迟（秒） */
        FIRST_WAVE_DELAY: 2,
        /** 每波清空后刷新下一波的等待时间（秒） */
        NEXT_WAVE_DELAY: 15,
        /** 兼容旧字段：等价于 NEXT_WAVE_DELAY */
        WAVE_INTERVAL: 15,
        /** 敌人生成间隔（秒） */
        SPAWN_INTERVAL: 0.5,
        /** 每波难度递增系数 */
        DIFFICULTY_MULTIPLIER: 1.1,
        /**
         * 无限波次模式参数
         * NOTE: 仅用于 gameplay/wave/WaveManager (Infinite Mode)。
         */
        INFINITE: WAVE_INFINITE_CONFIG,
    },

    // === 平衡方案元信息 ===
    BALANCE: {
        /** 当前生效的平衡方案 */
        ACTIVE_PRESET: ACTIVE_BALANCE_PRESET,
        /** 当前方案假设参数（便于调试显示） */
        ASSUMPTIONS: BALANCE.assumptions,
        /** 方案指标（便于在调试面板快速比较） */
        SCHEMES: BALANCE_SCHEMES.map(scheme => ({
            id: scheme.id,
            label: scheme.label,
            assumptions: scheme.assumptions,
            analytics: scheme.analytics,
        })),
        /** 英雄技能/武器倍率（用于运行时二次缩放） */
        HERO_SKILL: {
            WEAPON_DAMAGE_MULTIPLIER: BALANCE.heroSkill.weaponDamageMultiplier,
            WEAPON_ATTACK_INTERVAL_MULTIPLIER: BALANCE.heroSkill.weaponAttackIntervalMultiplier,
            WEAPON_RANGE_MULTIPLIER: BALANCE.heroSkill.weaponRangeMultiplier,
            WEAPON_TYPE_DAMAGE_SCALE: {
                MACHINE_GUN: BALANCE.heroSkill.weaponTypeDamageScale.machineGun,
                FLAMETHROWER: BALANCE.heroSkill.weaponTypeDamageScale.flamethrower,
                CANNON: BALANCE.heroSkill.weaponTypeDamageScale.cannon,
                GLITCH_WAVE: BALANCE.heroSkill.weaponTypeDamageScale.glitchWave,
            },
            BUFF_MULTIPLY_SCALE: BALANCE.heroSkill.buffMultiplyScale,
            BUFF_ADD_SCALE: BALANCE.heroSkill.buffAddScale,
            BUFF_RARITY_SCALE: {
                BLUE: BALANCE.heroSkill.buffRarityScale.blue,
                PURPLE: BALANCE.heroSkill.buffRarityScale.purple,
                GOLD: BALANCE.heroSkill.buffRarityScale.gold,
            },
        },
    },

    // === 肉鸽卡牌系统 ===
    // 稀有度: gold(金) = 高词条+高数值, purple(紫) = 中词条+中数值, blue(蓝) = 低词条+低数值
    BUFF_CARDS: {
        /** 每次升级展示的卡牌数量 */
        PICK_COUNT: 3,

        /** 稀有度颜色映射（边框 + 顶部色条） */
        RARITY_COLORS: {
            gold: '#FFD700',
            purple: '#B24BF3',
            blue: '#4A9FD9',
        } as Record<string, string>,

        /** 卡牌定义（id 全局唯一，rarity 决定颜色与强度） */
        POOL: [
            // ========== 蓝色卡牌 (Blue) — 1 词条，数值较低 ==========
            {
                id: 'blue_attack',
                nameKey: 'buff.card.blue_attack.name',
                rarity: 'blue',
                effects: { attack: { multiply: 1.08 } },
            },
            {
                id: 'blue_speed',
                nameKey: 'buff.card.blue_speed.name',
                rarity: 'blue',
                effects: { moveSpeed: { multiply: 1.06 } },
            },
            {
                id: 'blue_range',
                nameKey: 'buff.card.blue_range.name',
                rarity: 'blue',
                effects: { attackRange: { multiply: 1.06 } },
            },
            {
                id: 'blue_rapid',
                nameKey: 'buff.card.blue_rapid.name',
                rarity: 'blue',
                effects: { attackInterval: { multiply: 0.96 } },
            },
            {
                id: 'blue_crit_chance',
                nameKey: 'buff.card.blue_crit_chance.name',
                rarity: 'blue',
                effects: { critRate: { add: 0.04 } },
            },
            {
                id: 'blue_crit_power',
                nameKey: 'buff.card.blue_crit_power.name',
                rarity: 'blue',
                effects: { critDamage: { add: 0.15 } },
            },

            // ========== 紫色卡牌 (Purple) — 2~3 词条，数值适中 ==========
            {
                id: 'purple_warrior',
                nameKey: 'buff.card.purple_warrior.name',
                rarity: 'purple',
                effects: {
                    attack: { multiply: 1.1 },
                    critRate: { add: 0.04 },
                },
            },
            {
                id: 'purple_hunter',
                nameKey: 'buff.card.purple_hunter.name',
                rarity: 'purple',
                effects: {
                    moveSpeed: { multiply: 1.08 },
                    attackInterval: { multiply: 0.94 },
                },
            },
            {
                id: 'purple_assassin',
                nameKey: 'buff.card.purple_assassin.name',
                rarity: 'purple',
                effects: {
                    critRate: { add: 0.06 },
                    critDamage: { add: 0.2 },
                },
            },
            {
                id: 'purple_sniper',
                nameKey: 'buff.card.purple_sniper.name',
                rarity: 'purple',
                effects: {
                    attackRange: { multiply: 1.08 },
                    attack: { multiply: 1.08 },
                },
            },
            {
                id: 'purple_training',
                nameKey: 'buff.card.purple_training.name',
                rarity: 'purple',
                effects: {
                    attack: { multiply: 1.06 },
                    moveSpeed: { multiply: 1.04 },
                    critRate: { add: 0.03 },
                },
            },

            // ========== 金色卡牌 (Gold) — 3~5 词条，数值很高 ==========
            {
                id: 'gold_wargod',
                nameKey: 'buff.card.gold_wargod.name',
                rarity: 'gold',
                effects: {
                    attack: { multiply: 1.15 },
                    attackInterval: { multiply: 0.93 },
                    attackRange: { multiply: 1.06 },
                },
            },
            {
                id: 'gold_deathblow',
                nameKey: 'buff.card.gold_deathblow.name',
                rarity: 'gold',
                effects: {
                    critRate: { add: 0.08 },
                    critDamage: { add: 0.3 },
                    attack: { multiply: 1.08 },
                },
            },
            {
                id: 'gold_berserker',
                nameKey: 'buff.card.gold_berserker.name',
                rarity: 'gold',
                effects: {
                    attack: { multiply: 1.12 },
                    attackInterval: { multiply: 0.94 },
                    moveSpeed: { multiply: 1.06 },
                    critRate: { add: 0.04 },
                },
            },
            {
                id: 'gold_perfection',
                nameKey: 'buff.card.gold_perfection.name',
                rarity: 'gold',
                effects: {
                    attack: { multiply: 1.08 },
                    attackInterval: { multiply: 0.96 },
                    moveSpeed: { multiply: 1.04 },
                    attackRange: { multiply: 1.04 },
                    critRate: { add: 0.05 },
                    critDamage: { add: 0.15 },
                },
            },
        ],
    },

    // === 空投武器系统 ===
    WEAPON_SYSTEM: {
        /** 每次空投展示的武器数量 */
        PICK_COUNT: 3,
        /** 空投箱下落速度 */
        CRATE_FALL_SPEED: 8,
        /** 空投箱停留高度 (Y) */
        CRATE_LAND_Y: 0.5,
        /** 空投随机偏移范围 (相对于基地) */
        AIRDROP_RANGE: 5,
        /** 武器最大等级 */
        MAX_WEAPON_LEVEL: 5,

        /** 武器定义 */
        WEAPONS: {
            machine_gun: {
                id: 'machine_gun',
                nameKey: 'weapon.machine_gun.name',
                descriptionKey: 'weapon.machine_gun.description',
                iconColor: '#FF4500',
                iconPath: 'icon/gun',
                levels: [
                    { damage: 6, attackInterval: 0.12, range: 4.8, projectileSpeed: 28, spread: 4 },
                    {
                        damage: 8,
                        attackInterval: 0.1,
                        range: 5.0,
                        projectileSpeed: 30,
                        spread: 5,
                    },
                    {
                        damage: 11,
                        attackInterval: 0.08,
                        range: 5.2,
                        projectileSpeed: 32,
                        spread: 6,
                    },
                    {
                        damage: 14,
                        attackInterval: 0.06,
                        range: 5.4,
                        projectileSpeed: 34,
                        spread: 7,
                    },
                    {
                        damage: 17,
                        attackInterval: 0.04,
                        range: 5.6,
                        projectileSpeed: 36,
                        spread: 8,
                    },
                ],
            },
            flamethrower: {
                id: 'flamethrower',
                nameKey: 'weapon.flamethrower.name',
                descriptionKey: 'weapon.flamethrower.description',
                iconColor: '#8B0000',
                iconPath: 'icon/fire',
                levels: [
                    {
                        damage: 18,
                        attackInterval: 0.3,
                        range: 3.4,
                        projectileSpeed: 10,
                        gravity: 8,
                        burnDuration: 1.5,
                    },
                    {
                        damage: 27,
                        attackInterval: 0.27,
                        range: 3.8,
                        projectileSpeed: 11,
                        gravity: 8,
                        burnDuration: 2.0,
                    },
                    {
                        damage: 38,
                        attackInterval: 0.24,
                        range: 4.2,
                        projectileSpeed: 12,
                        gravity: 7,
                        burnDuration: 2.5,
                    },
                    {
                        damage: 50,
                        attackInterval: 0.21,
                        range: 4.7,
                        projectileSpeed: 13,
                        gravity: 7,
                        burnDuration: 3.0,
                    },
                    {
                        damage: 65,
                        attackInterval: 0.18,
                        range: 5.2,
                        projectileSpeed: 14,
                        gravity: 6,
                        burnDuration: 3.5,
                    },
                ],
            },
            cannon: {
                id: 'cannon',
                nameKey: 'weapon.cannon.name',
                descriptionKey: 'weapon.cannon.description',
                iconColor: '#708090',
                iconPath: 'icon/gannon',
                levels: [
                    {
                        damage: 60,
                        attackInterval: 1.2,
                        range: 6.9,
                        projectileSpeed: 18,
                        explosionRadius: 1.5,
                        spinSpeed: 15,
                    },
                    {
                        damage: 92,
                        attackInterval: 1.1,
                        range: 7.2,
                        projectileSpeed: 19,
                        explosionRadius: 1.8,
                        spinSpeed: 18,
                    },
                    {
                        damage: 130,
                        attackInterval: 1.0,
                        range: 7.5,
                        projectileSpeed: 20,
                        explosionRadius: 2.1,
                        spinSpeed: 20,
                    },
                    {
                        damage: 176,
                        attackInterval: 0.9,
                        range: 7.8,
                        projectileSpeed: 21,
                        explosionRadius: 2.5,
                        spinSpeed: 22,
                    },
                    {
                        damage: 240,
                        attackInterval: 0.8,
                        range: 8.1,
                        projectileSpeed: 22,
                        explosionRadius: 3.0,
                        spinSpeed: 25,
                    },
                ],
            },
            glitch_wave: {
                id: 'glitch_wave',
                nameKey: 'weapon.glitch_wave.name',
                descriptionKey: 'weapon.glitch_wave.description',
                iconColor: '#00FFFF',
                iconPath: 'icon/signal',
                levels: [
                    {
                        damage: 80,
                        attackInterval: 2.0,
                        range: 5.4,
                        waveSpeed: 8,
                        waveRadius: 4,
                        slowPercent: 0.28,
                        slowDuration: 1.6,
                    },
                    {
                        damage: 118,
                        attackInterval: 1.8,
                        range: 5.9,
                        waveSpeed: 9,
                        waveRadius: 4.5,
                        slowPercent: 0.34,
                        slowDuration: 1.9,
                    },
                    {
                        damage: 160,
                        attackInterval: 1.6,
                        range: 6.4,
                        waveSpeed: 10,
                        waveRadius: 5,
                        slowPercent: 0.4,
                        slowDuration: 2.2,
                    },
                    {
                        damage: 204,
                        attackInterval: 1.4,
                        range: 6.9,
                        waveSpeed: 11,
                        waveRadius: 5.5,
                        slowPercent: 0.46,
                        slowDuration: 2.5,
                    },
                    {
                        damage: 250,
                        attackInterval: 1.2,
                        range: 7.4,
                        waveSpeed: 12,
                        waveRadius: 6,
                        slowPercent: 0.52,
                        slowDuration: 2.8,
                    },
                ],
            },
        } as Record<string, any>,
    },

    // === 对象池 ===
    POOL: {
        /** 敌人预创建数量 */
        ENEMY_INITIAL_SIZE: 30,
        /** 士兵预创建数量 */
        SOLDIER_INITIAL_SIZE: 20,
        /** 金币预创建数量 */
        COIN_INITIAL_SIZE: 50,
        /** 特效预创建数量 */
        EFFECT_INITIAL_SIZE: 20,
    },

    // === 战斗系统 ===
    COMBAT: {
        /** 碰撞检测网格大小 */
        GRID_CELL_SIZE: 64,
        /** 伤害数字显示时间 */
        DAMAGE_NUMBER_DURATION: 0.8,
        /** 战斗系统的目标检测间隔 */
        TARGET_CHECK_INTERVAL: 0.2,
    },
} as const;

/** 游戏配置类型 */
export type GameConfigType = typeof GameConfig;
