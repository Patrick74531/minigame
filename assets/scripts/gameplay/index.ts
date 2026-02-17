/**
 * 游戏玩法模块导出
 */

// 单位系统
export { Unit, UnitType, UnitState, Enemy, Soldier } from './units';
export type { UnitStats } from './units';

// 建筑系统
export { Building, BuildingType } from './buildings';
export type { BuildingConfig } from './buildings';

// 波次系统
export { WaveManager } from './wave';
export type { WaveConfig } from './wave';

// 经济系统
export { Coin } from './economy';

// 战斗系统
export { CombatSystem } from './combat/CombatSystem';

// 肉鸽卡牌系统
export { BuffCardService } from './roguelike/BuffCardService';
export type { BuffCardDef, BuffCardEffect, CardRarity } from './roguelike/BuffCardService';

// 武器系统
export { WeaponType, WeaponBehavior, WeaponBehaviorFactory, HeroWeaponManager } from './weapons';
export type { WeaponDef, WeaponInstance } from './weapons';

// 空投系统
export { AirdropService } from './airdrop/AirdropService';
