/**
 * 游戏配置常量
 * 集中管理所有可调参数，便于平衡和调试
 */
export const GameConfig = {
    // === 游戏通用 ===
    GAME: {
        /** 目标帧率 */
        TARGET_FPS: 60,
        /** 游戏速度倍率 */
        TIME_SCALE: 1,
    },

    // === 经济系统 ===
    ECONOMY: {
        /** 初始金币 */
        INITIAL_COINS: 100,
        /** 金币飞行到HUD的时间（秒） */
        COIN_FLY_DURATION: 0.5,
        /** 金币收集范围 */
        COIN_COLLECT_RANGE: 50,
    },

    // === 建筑系统 ===
    BUILDING: {
        /** 兵营产兵间隔（秒） */
        SPAWN_INTERVAL: 3,
        /** 兵营最大产兵数 */
        MAX_SOLDIERS_PER_BARRACKS: 10,
        /** 建筑血量 */
        BASE_HP: 500,
    },

    // === 士兵系统 ===
    SOLDIER: {
        /** 基础移动速度 */
        MOVE_SPEED: 100,
        /** 基础攻击力 */
        BASE_ATTACK: 10,
        /** 基础血量 */
        BASE_HP: 50,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 1,
        /** 攻击范围 */
        ATTACK_RANGE: 30,
    },

    // === 敌人系统 ===
    ENEMY: {
        /** 基础移动速度 */
        MOVE_SPEED: 60,
        /** 基础攻击力 */
        BASE_ATTACK: 8,
        /** 基础血量 */
        BASE_HP: 30,
        /** 攻击间隔（秒） */
        ATTACK_INTERVAL: 1.2,
        /** 攻击范围 */
        ATTACK_RANGE: 25,
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
        ATTACK_RANGE: 60,
        /** 移动速度 */
        MOVE_SPEED: 120,
    },

    // === 波次系统 ===
    WAVE: {
        /** 波次间隔（秒） */
        WAVE_INTERVAL: 5,
        /** 敌人生成间隔（秒） */
        SPAWN_INTERVAL: 0.5,
        /** 每波难度递增系数 */
        DIFFICULTY_MULTIPLIER: 1.1,
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
    },
} as const;

/** 游戏配置类型 */
export type GameConfigType = typeof GameConfig;
