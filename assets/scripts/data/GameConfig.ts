/**
 * 游戏配置常量
 * 集中管理所有可调参数，便于平衡和调试
 *
 * NOTE: 新增数值请优先放在这里，保持单一事实来源。
 */
export const GameConfig = {
    // === 游戏通用 ===
    GAME: {
        /** 目标帧率 */
        TARGET_FPS: 60,
        /** 游戏速度倍率 */
        TIME_SCALE: 1,
    },

    // === 关卡/生成点 ===
    MAP: {
        /** 基地出生点 (World XZ) */
        BASE_SPAWN: { x: -9, z: -9 },
        /** 英雄相对基地的偏移 */
        HERO_SPAWN_OFFSET: { x: 2, z: 2 },
        /** 可移动范围限制 */
        LIMITS: { x: 25, z: 25 },
    },

    // === 物理/高度 ===
    PHYSICS: {
        /** 敌人/士兵/英雄的默认高度（Y） */
        ENEMY_Y: 0.5,
        SOLDIER_Y: 1.0,
        HERO_Y: 1.0,
        /** 金币默认高度（Y） */
        COIN_Y: 0.5,
        /** 远程武器子弹出生高度偏移 */
        PROJECTILE_SPAWN_OFFSET_Y: 1.0,
        /** 单位刚体阻尼 */
        UNIT_LINEAR_DAMPING: 0.5,
    },

    // === 经济系统 ===
    ECONOMY: {
        /** 初始金币 */
        INITIAL_COINS: 100,
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
    BUILDING: {
        /** 兵营产兵间隔（秒） */
        SPAWN_INTERVAL: 3,
        /** 兵营最大产兵数 */
        MAX_SOLDIERS_PER_BARRACKS: 10,
        /** 建筑血量 */
        BASE_HP: 500,
        /** 基地初始血量（与建筑默认 HP 区分，避免误改） */
        BASE_START_HP: 100,
        /**
         * 初始建造点配置 (World XZ)
         * NOTE: 扩展新建造点请优先修改此处，避免在 GameController 中硬编码。
         */
        PADS: [
            { x: -13, z: -6, type: 'barracks' },
            { x: -5, z: -6, type: 'lightning_tower' },
            { x: -13, z: -12, type: 'frost_tower' },
            { x: -5, z: -12, type: 'tower' },
            { x: -9, z: -3, type: 'wall' },
            { x: -11, z: -3, type: 'wall' },
            { x: -7, z: -3, type: 'wall' },
        ],
    },

    // === 士兵系统 ===
    SOLDIER: {
        /** 基础移动速度 (units/second) - Was 100/60 ~ 1.6 */
        MOVE_SPEED: 3.5,
        /** 基础攻击力 */
        BASE_ATTACK: 10,
        /** 基础血量 */
        BASE_HP: 50,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 1,
        /** 攻击范围 (3D units) */
        ATTACK_RANGE: 1.5,
    },

    // === 敌人系统 ===
    ENEMY: {
        /** 基础移动速度 - Was 60/60 ~ 1 */
        MOVE_SPEED: 2.5,
        /** 基础攻击力 */
        BASE_ATTACK: 8,
        /** 基础血量 */
        BASE_HP: 30,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 1.2,
        /** 攻击范围 */
        ATTACK_RANGE: 1.2,
        /** 死亡掉落金币 */
        COIN_DROP: 5,
    },

    // === 英雄系统 ===
    HERO: {
        /** 基础血量 */
        BASE_HP: 200,
        /** 基础攻击力 */
        BASE_ATTACK: 25,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 0.8,
        /** 攻击范围 */
        ATTACK_RANGE: 2.5,
        /** 移动速度 - Was 120/60 ~ 2. Now using Physics Velocity directly */
        MOVE_SPEED: 6.0,
        /** 角色模型缩放 */
        MODEL_SCALE: 2.0,
        /** 角色模型高度偏移 */
        MODEL_OFFSET_Y: 0.0,
        /** 角色模型朝向偏移（Y轴角度，度） */
        MODEL_ROT_Y: 180,
        /** 金币堆叠容器高度 */
        STACK_OFFSET_Y: 2.2,
        /** 金币堆叠间距 */
        STACK_ITEM_HEIGHT: 0.15,
        /** 金币堆叠缩放 */
        STACK_ITEM_SCALE: 0.6,
    },

    // === 波次系统 ===
    WAVE: {
        /** 波次间隔（秒） */
        WAVE_INTERVAL: 5,
        /** 敌人生成间隔（秒） */
        SPAWN_INTERVAL: 0.5,
        /** 每波难度递增系数 */
        DIFFICULTY_MULTIPLIER: 1.1,
        /**
         * 无限波次模式参数
         * NOTE: 仅用于 gameplay/wave/WaveManager (Infinite Mode)。
         */
        INFINITE: {
            BASE_COUNT: 5,
            COUNT_PER_WAVE: 2,
            BASE_HP_MULT: 1,
            HP_MULT_PER_WAVE: 0.5,
            BASE_SPAWN_INTERVAL: 0.8,
            SPAWN_INTERVAL_DECAY_PER_WAVE: 0.05,
            MIN_SPAWN_INTERVAL: 0.2,
            BONUS_PER_WAVE: 25,
            SPAWN_RANGE: 6,
        },
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
        TARGET_CHECK_INTERVAL: 0.5,
    },
} as const;

/** 游戏配置类型 */
export type GameConfigType = typeof GameConfig;
