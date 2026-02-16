/**
 * 敌人系统配置
 */
export const ENEMY_CONFIG = {
    /** 基础移动速度 - Was 60/60 ~ 1 */
    MOVE_SPEED: 2.5,
    /** 基础攻击力 */
    BASE_ATTACK: 8,
    /** 基础血量 */
    BASE_HP: 30,
    /** 攻击间隔（秒） */
    ATTACK_INTERVAL: 1.2,
    /** 攻击范围（近战默认：需要贴近目标） */
    ATTACK_RANGE: 0.85,
    /** 索敌范围（仅用于锁定目标，不代表可造成伤害） */
    AGGRO_RANGE: 3.0,
    /** 死亡掉落金币 */
    COIN_DROP: 5,
    /** 死亡掉落随机浮动 */
    COIN_DROP_VARIANCE: 3,
    /** 精英敌人数值倍率 */
    ELITE: {
        HP_MULTIPLIER: 3.2,
        ATTACK_MULTIPLIER: 1.4,
        SPEED_MULTIPLIER: 1.1,
        SCALE_MULTIPLIER: 1.35,
        COIN_DROP_MULTIPLIER: 3.0,
    },
    /** 飞行敌人（assets/resources/enemies/flying）远程直线弹道参数 */
    FLYING_RANGED: {
        /** 远程攻击射程 */
        ATTACK_RANGE: 5.8,
        /** 远程敌人的索敌范围 */
        AGGRO_RANGE: 8.0,
        /** 弹道速度（直线，不追踪） */
        PROJECTILE_SPEED: 11,
        /** 弹道存在时间（秒） */
        PROJECTILE_LIFETIME: 2.2,
        /** 命中半径（用于可躲避判定） */
        PROJECTILE_HIT_RADIUS: 0.42,
        /** 子弹出生高度偏移 */
        PROJECTILE_SPAWN_OFFSET_Y: 0.9,
    },
} as const;
