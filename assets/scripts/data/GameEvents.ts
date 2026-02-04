import type { Node, Vec2, Vec3 } from 'cc';

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
    /** 波次开始 { wave?: number, waveIndex?: number, enemyCount?: number } */
    WAVE_START: 'WAVE_START',
    /** 波次完成 { wave?: number, waveIndex?: number, bonus?: number } */
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

    // === 技能/特效系统 ===
    /** 应用AOE效果 { center: Vec3, radius: number, damage: number, slowPercent: number, slowDuration: number } */
    APPLY_AOE_EFFECT: 'APPLY_AOE_EFFECT',
} as const;

/** 事件名称类型 */
export type GameEventName = (typeof GameEvents)[keyof typeof GameEvents];

/**
 * 事件负载类型映射
 * NOTE: 新增或变更事件时，请同时更新此处，保持事件负载一致性。
 * 这里允许字段为 optional，以兼容当前不同调用方的载荷结构。
 */
export type GameEventPayloads = {
    [GameEvents.COIN_COLLECTED]: { amount: number; position?: Vec3 };
    [GameEvents.COIN_CHANGED]: { current: number; delta: number };
    [GameEvents.BUILDING_PLACED]: { buildingType: string; position: Vec2 };
    [GameEvents.BUILDING_UPGRADED]: { buildingId: string; level: number };
    [GameEvents.BUILDING_DESTROYED]: { buildingId: string; building?: unknown };
    [GameEvents.UNIT_SPAWNED]: { unitType: string; node: Node };
    [GameEvents.UNIT_DIED]: { unitType: string; node: Node; position?: Vec3 };
    [GameEvents.UNIT_DAMAGED]: { node: Node; damage: number; currentHp: number };
    [GameEvents.ENEMY_KILLED]: { enemy: Node; position?: Vec3 };
    [GameEvents.ENEMY_REACHED_BASE]: { enemy: Node; damage: number };
    [GameEvents.WAVE_START]: { wave?: number; waveIndex?: number; enemyCount?: number };
    [GameEvents.WAVE_COMPLETE]: { wave?: number; waveIndex?: number; bonus?: number };
    [GameEvents.ALL_WAVES_COMPLETE]: void;
    [GameEvents.GAME_START]: void;
    [GameEvents.GAME_PAUSE]: void;
    [GameEvents.GAME_RESUME]: void;
    [GameEvents.GAME_OVER]: { victory: boolean };
    [GameEvents.HERO_ATTACK]: { target: Node };
    [GameEvents.HERO_SKILL_USED]: { skillId: string };
    [GameEvents.BUILDING_CONSTRUCTED]: {
        padNode: Node;
        buildingTypeId?: string;
        position?: Vec3;
    };
    [GameEvents.APPLY_AOE_EFFECT]: {
        center: Vec3;
        radius: number;
        damage: number;
        slowPercent: number;
        slowDuration: number;
    };
};
