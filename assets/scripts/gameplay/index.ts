/**
 * 游戏玩法模块导出
 */

// 单位系统
export { Unit, UnitType, UnitState, UnitStats, Enemy, Soldier } from './units';

// 建筑系统
export { Building, BuildingType, BuildingConfig } from './buildings';

// 波次系统
export { WaveManager, WaveConfig } from './wave';

// 经济系统
export { Coin } from './economy';

// 战斗系统
export { CombatSystem } from './combat/CombatSystem';

// 肉鸽卡牌系统
export {
    BuffCardService,
    BuffCardDef,
    BuffCardEffect,
    CardRarity,
} from './roguelike/BuffCardService';
