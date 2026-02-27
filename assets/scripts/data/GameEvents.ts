import type { Node, Vec2, Vec3 } from 'cc';

/**
 * 事件上下文（双人模式扩展）
 * 所有字段为 optional，单人模式下不传，现有处理器无需修改。
 */
export interface EventContext {
    matchId?: string;
    playerId?: string;
    source?: 'local' | 'remote' | 'server';
    timestamp?: number;
    seq?: number;
}

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
    /** 单位死亡 { unitType: string, node: Node, position: Vec3, enemySpawnType?: 'regular'|'elite'|'boss', enemyIsElite?: boolean } */
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
    /** 波前预告 { wave?: number, archetypeId?: string, lane?: 'left'|'center'|'right', spawnType?: 'regular'|'elite'|'boss' } */
    WAVE_FORECAST: 'WAVE_FORECAST',
    /** 波次完成 { wave?: number, waveIndex?: number, bonus?: number } */
    WAVE_COMPLETE: 'WAVE_COMPLETE',
    /** 波次倒计时 { seconds: number } */
    WAVE_COUNTDOWN: 'WAVE_COUNTDOWN',
    /** Boss 出场演出 { bossNode: Node, archetypeId?: string, modelPath?: string, lane?: 'top'|'mid'|'bottom' } */
    BOSS_INTRO: 'BOSS_INTRO',
    /** 道路即将解锁 { lane: 'top'|'mid'|'bottom', focusPosition?: Vec3, padFocusPosition?: Vec3, remainSeconds?: number } */
    LANE_UNLOCK_IMMINENT: 'LANE_UNLOCK_IMMINENT',
    /** 道路解锁 { lane: 'top'|'mid'|'bottom' } */
    LANE_UNLOCKED: 'LANE_UNLOCKED',
    /** 中路支援建筑演出请求 { focusPosition: Vec3, holdSeconds?: number } */
    MID_SUPPORT_REVEAL_CINEMATIC: 'MID_SUPPORT_REVEAL_CINEMATIC',
    /** 中路支援建筑演出镜头已到达焦点 */
    MID_SUPPORT_REVEAL_CINEMATIC_FOCUS_REACHED: 'MID_SUPPORT_REVEAL_CINEMATIC_FOCUS_REACHED',
    /** 中路支援建筑演出结束 */
    MID_SUPPORT_REVEAL_CINEMATIC_FINISHED: 'MID_SUPPORT_REVEAL_CINEMATIC_FINISHED',
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
    /** 英雄获得经验 { xp: number, currentXp: number, maxXp: number, level: number } */
    HERO_XP_GAINED: 'HERO_XP_GAINED',
    /** 英雄升级 { level: number, heroNode: Node } */
    HERO_LEVEL_UP: 'HERO_LEVEL_UP',

    // === 建造系统 ===
    /** 建筑建造完成 { padNode: Node, buildingTypeId: string, position: Vec3 } */
    BUILDING_CONSTRUCTED: 'BUILDING_CONSTRUCTED',

    // === 肉鸽卡牌系统 ===
    /** 基地升级完成，请求展示卡牌选择 { baseLevel: number, suppressCardDraw?: boolean } */
    BASE_UPGRADE_READY: 'BASE_UPGRADE_READY',
    /** 卡牌已抽取完毕，可展示选择界面 { count: number } */
    BUFF_CARDS_DRAWN: 'BUFF_CARDS_DRAWN',
    /** 玩家选择了一张增益卡牌 { cardId: string } */
    BUFF_CARD_PICKED: 'BUFF_CARD_PICKED',

    // === 空投武器系统 ===
    /** 空投生成 { wave: number, position: Vec3 } */
    AIRDROP_SPAWNED: 'AIRDROP_SPAWNED',
    /** 空投宝箱被打开 */
    AIRDROP_OPENED: 'AIRDROP_OPENED',
    /** 武器选择已抽取完毕，可展示选择界面 { weapons: string[] } */
    WEAPONS_OFFERED: 'WEAPONS_OFFERED',
    /** 玩家选择了一把武器 { weaponId: string } */
    WEAPON_PICKED: 'WEAPON_PICKED',
    /** 武器切换 { weaponId: string } */
    WEAPON_SWITCHED: 'WEAPON_SWITCHED',
    /** 武器背包变更（新增/升级后触发） { weaponId: string, level: number, isNew: boolean } */
    WEAPON_INVENTORY_CHANGED: 'WEAPON_INVENTORY_CHANGED',

    // === 技能/特效系统 ===
    /** 应用AOE效果 { center: Vec3, radius: number, damage: number, slowPercent: number, slowDuration: number, effectType?: string } */
    APPLY_AOE_EFFECT: 'APPLY_AOE_EFFECT',

    // === 建筑选择系统 ===
    /** 请求展示塔防选择界面 { padNode: Node } */
    REQUEST_TOWER_SELECTION: 'REQUEST_TOWER_SELECTION',
    /** 玩家选择了塔防类型 { padNode: Node, buildingTypeId: string } */
    TOWER_SELECTED: 'TOWER_SELECTED',
    /** 双人模式：本地投币到建造点 { padNode: Node, padId: string, amount: number, remaining: number, padFilled: boolean, eventType?: 'tower_select' } */
    COOP_PAD_COIN_DEPOSITED: 'COOP_PAD_COIN_DEPOSITED',
    /** 双人模式：本地拾取金币 { x: number, z: number } */
    COOP_COIN_PICKED: 'COOP_COIN_PICKED',

    /** 语言变更 { lang: string } */
    LANGUAGE_CHANGED: 'LANGUAGE_CHANGED',

    // === Boss 宝箱道具系统 ===
    /** Boss被击杀，请求生成宝箱 { position: Vec3 } */
    BOSS_CHEST_DROP: 'BOSS_CHEST_DROP',
    /** 宝箱被拾取，请求展示道具选择 */
    BOSS_CHEST_PICKED: 'BOSS_CHEST_PICKED',
    /** 道具卡片已准备好展示 { items: string[] } */
    ITEM_CARDS_OFFERED: 'ITEM_CARDS_OFFERED',
    /** 玩家选择了一个道具 { itemId: string } */
    ITEM_CARD_PICKED: 'ITEM_CARD_PICKED',
    /** 道具背包变更 { itemId: string, count: number } */
    ITEM_INVENTORY_CHANGED: 'ITEM_INVENTORY_CHANGED',
    /** 玩家使用了一个道具 { itemId: string } */
    ITEM_USED: 'ITEM_USED',
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
    [GameEvents.UNIT_DIED]: {
        unitType: string;
        node: Node;
        position?: Vec3;
        enemySpawnType?: 'regular' | 'elite' | 'boss';
        enemyIsElite?: boolean;
    };
    [GameEvents.UNIT_DAMAGED]: { node: Node; damage: number; currentHp: number };
    [GameEvents.ENEMY_KILLED]: { enemy: Node; position?: Vec3 };
    [GameEvents.ENEMY_REACHED_BASE]: { enemy: Node; damage: number };
    [GameEvents.WAVE_START]: { wave?: number; waveIndex?: number; enemyCount?: number };
    [GameEvents.WAVE_FORECAST]: {
        wave?: number;
        archetypeId?: string;
        lane?: 'left' | 'center' | 'right';
        spawnType?: 'regular' | 'elite' | 'boss';
    };
    [GameEvents.WAVE_COMPLETE]: { wave?: number; waveIndex?: number; bonus?: number };
    [GameEvents.WAVE_COUNTDOWN]: { seconds: number };
    [GameEvents.BOSS_INTRO]: {
        bossNode: Node;
        archetypeId?: string;
        modelPath?: string;
        lane?: 'top' | 'mid' | 'bottom';
    };
    [GameEvents.LANE_UNLOCK_IMMINENT]: {
        lane: 'top' | 'mid' | 'bottom';
        focusPosition?: Vec3;
        padFocusPosition?: Vec3;
        remainSeconds?: number;
    };
    [GameEvents.LANE_UNLOCKED]: { lane: 'top' | 'mid' | 'bottom' };
    [GameEvents.MID_SUPPORT_REVEAL_CINEMATIC]: { focusPosition: Vec3; holdSeconds?: number };
    [GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FOCUS_REACHED]: void;
    [GameEvents.MID_SUPPORT_REVEAL_CINEMATIC_FINISHED]: void;
    [GameEvents.ALL_WAVES_COMPLETE]: void;
    [GameEvents.GAME_START]: void;
    [GameEvents.GAME_PAUSE]: void;
    [GameEvents.GAME_RESUME]: void;
    [GameEvents.GAME_OVER]: { victory: boolean };
    [GameEvents.HERO_ATTACK]: { target: Node };
    [GameEvents.HERO_SKILL_USED]: { skillId: string };
    [GameEvents.HERO_XP_GAINED]: { xp: number; currentXp: number; maxXp: number; level: number };
    [GameEvents.HERO_LEVEL_UP]: { level: number; heroNode: Node; quiet?: boolean };
    [GameEvents.BUILDING_CONSTRUCTED]: {
        padNode: Node;
        buildingTypeId?: string;
        position?: Vec3;
    };
    [GameEvents.BASE_UPGRADE_READY]: { baseLevel: number; suppressCardDraw?: boolean };
    [GameEvents.BUFF_CARDS_DRAWN]: { count: number };
    [GameEvents.BUFF_CARD_PICKED]: { cardId: string };
    [GameEvents.AIRDROP_SPAWNED]: { wave: number; position: Vec3 };
    [GameEvents.AIRDROP_OPENED]: void;
    [GameEvents.WEAPONS_OFFERED]: { weapons: string[] };
    [GameEvents.WEAPON_PICKED]: { weaponId: string };
    [GameEvents.WEAPON_SWITCHED]: { weaponId: string };
    [GameEvents.WEAPON_INVENTORY_CHANGED]: { weaponId: string; level: number; isNew: boolean };
    [GameEvents.APPLY_AOE_EFFECT]: {
        center: Vec3;
        radius: number;
        damage: number;
        slowPercent: number;
        slowDuration: number;
        effectType?: 'frost_rain' | 'glitch_interference' | 'generic';
        laneFilter?: 'top' | 'mid' | 'bottom';
    };

    // === 建筑选择系统 ===
    /** 请求展示塔防选择界面 { padNode: Node } */
    [GameEvents.REQUEST_TOWER_SELECTION]: { padNode: Node };
    /** 玩家选择了塔防类型 { padNode: Node, buildingTypeId: string, source?: 'local' | 'remote' } */
    [GameEvents.TOWER_SELECTED]: {
        padNode: Node;
        buildingTypeId: string;
        source?: 'local' | 'remote';
    };
    [GameEvents.COOP_PAD_COIN_DEPOSITED]: {
        padNode: Node;
        padId: string;
        amount: number;
        remaining: number;
        padFilled: boolean;
        eventType?: 'tower_select';
    };
    [GameEvents.COOP_COIN_PICKED]: { x: number; z: number };
    [GameEvents.LANGUAGE_CHANGED]: { lang: string };

    // === Boss 宝箱道具系统 ===
    [GameEvents.BOSS_CHEST_DROP]: { position: Vec3 };
    [GameEvents.BOSS_CHEST_PICKED]: void;
    [GameEvents.ITEM_CARDS_OFFERED]: { items: string[] };
    [GameEvents.ITEM_CARD_PICKED]: { itemId: string };
    [GameEvents.ITEM_INVENTORY_CHANGED]: { itemId: string; count: number };
    [GameEvents.ITEM_USED]: { itemId: string };
};
