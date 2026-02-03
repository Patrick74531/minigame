/**
 * 游戏事件名常量
 * 集中管理所有事件名称，避免硬编码字符串
 */
export const GameEvents = {
    // === 经济系统 ===
    /** 金币被收集 { amount: number, position: Vec3 } */
    COIN_COLLECTED: 'COIN_COLLECTED',
    /** 金币变化 { current: number, delta: number } */
    COIN_CHANGED: 'COIN_CHANGED',

    // === 建筑系统 ===
    /** 建筑放置 { buildingType: string, position: Vec2 } */
    BUILDING_PLACED: 'BUILDING_PLACED',
    /** 建筑升级 { buildingId: string, level: number } */
    BUILDING_UPGRADED: 'BUILDING_UPGRADED',
    /** 建筑销毁 { buildingId: string } */
    BUILDING_DESTROYED: 'BUILDING_DESTROYED',

    // === 单位系统 ===
    /** 单位生成 { unitType: string, node: Node } */
    UNIT_SPAWNED: 'UNIT_SPAWNED',
    /** 单位死亡 { unitType: string, node: Node, position: Vec3 } */
    UNIT_DIED: 'UNIT_DIED',
    /** 单位受伤 { node: Node, damage: number, currentHp: number } */
    UNIT_DAMAGED: 'UNIT_DAMAGED',
    /** 敌人被击杀 { enemy: Node, position: Vec3 } */
    ENEMY_KILLED: 'ENEMY_KILLED',
    /** 敌人到达基地 { enemy: Node, damage: number } */
    ENEMY_REACHED_BASE: 'ENEMY_REACHED_BASE',

    // === 波次系统 ===
    /** 波次开始 { waveIndex: number, enemyCount: number } */
    WAVE_START: 'WAVE_START',
    /** 波次完成 { waveIndex: number } */
    WAVE_COMPLETE: 'WAVE_COMPLETE',
    /** 所有波次完成 */
    ALL_WAVES_COMPLETE: 'ALL_WAVES_COMPLETE',

    // === 游戏状态 ===
    /** 游戏开始 */
    GAME_START: 'GAME_START',
    /** 游戏暂停 */
    GAME_PAUSE: 'GAME_PAUSE',
    /** 游戏恢复 */
    GAME_RESUME: 'GAME_RESUME',
    /** 游戏结束 { victory: boolean } */
    GAME_OVER: 'GAME_OVER',

    // === 英雄系统 ===
    /** 英雄攻击 { target: Node } */
    HERO_ATTACK: 'HERO_ATTACK',
    /** 英雄技能使用 { skillId: string } */
    HERO_SKILL_USED: 'HERO_SKILL_USED',

    // === 建造系统 ===
    /** 建筑建造完成 { padNode: Node, buildingTypeId: string, position: Vec3 } */
    BUILDING_CONSTRUCTED: 'BUILDING_CONSTRUCTED',
} as const;

/** 事件名称类型 */
export type GameEventName = (typeof GameEvents)[keyof typeof GameEvents];
