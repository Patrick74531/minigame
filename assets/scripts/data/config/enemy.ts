import { BALANCE } from './balance';

/**
 * 敌人系统配置
 */
export const ENEMY_CONFIG = {
    /** 基础移动速度 - Was 60/60 ~ 1 */
    MOVE_SPEED: BALANCE.enemy.moveSpeed,
    /** 基础攻击力 */
    BASE_ATTACK: BALANCE.enemy.baseAttack,
    /** 基础血量 */
    BASE_HP: BALANCE.enemy.baseHp,
    /** 攻击间隔（秒） */
    ATTACK_INTERVAL: BALANCE.enemy.attackInterval,
    /** 攻击范围（近战默认：需要贴近目标） */
    ATTACK_RANGE: BALANCE.enemy.attackRange,
    /** 索敌范围（仅用于锁定目标，不代表可造成伤害） */
    AGGRO_RANGE: BALANCE.enemy.aggroRange,
    /** 抵达基地时造成伤害 */
    BASE_REACH_DAMAGE: BALANCE.enemy.baseReachDamage,
    /** 死亡掉落金币 */
    COIN_DROP: BALANCE.economy.enemyCoinDrop,
    /** 死亡掉落随机浮动 */
    COIN_DROP_VARIANCE: BALANCE.economy.enemyCoinDropVariance,
    /** 精英敌人数值倍率 */
    ELITE: {
        HP_MULTIPLIER: BALANCE.enemy.elite.hpMultiplier,
        ATTACK_MULTIPLIER: BALANCE.enemy.elite.attackMultiplier,
        SPEED_MULTIPLIER: BALANCE.enemy.elite.speedMultiplier,
        SCALE_MULTIPLIER: BALANCE.enemy.elite.scaleMultiplier,
        COIN_DROP_MULTIPLIER: BALANCE.enemy.elite.coinDropMultiplier,
    },
    /** 飞行敌人（assets/resources/enemies/flying）远程直线弹道参数 */
    FLYING_RANGED: {
        /** 远程攻击射程 */
        ATTACK_RANGE: BALANCE.enemy.flyingRanged.attackRange,
        /** 远程敌人的索敌范围 */
        AGGRO_RANGE: BALANCE.enemy.flyingRanged.aggroRange,
        /** 弹道速度（直线，不追踪） */
        PROJECTILE_SPEED: BALANCE.enemy.flyingRanged.projectileSpeed,
        /** 弹道存在时间（秒） */
        PROJECTILE_LIFETIME: BALANCE.enemy.flyingRanged.projectileLifetime,
        /** 命中半径（用于可躲避判定） */
        PROJECTILE_HIT_RADIUS: BALANCE.enemy.flyingRanged.projectileHitRadius,
        /** 子弹出生高度偏移 */
        PROJECTILE_SPAWN_OFFSET_Y: BALANCE.enemy.flyingRanged.projectileSpawnOffsetY,
    },
} as const;
