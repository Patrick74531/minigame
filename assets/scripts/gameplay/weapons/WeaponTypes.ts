/**
 * 武器系统类型定义
 * 集中管理武器相关的接口和枚举
 */

/** 武器类型枚举 */
export enum WeaponType {
    MACHINE_GUN = 'machine_gun',
    FLAMETHROWER = 'flamethrower',
    CANNON = 'cannon',
    GLITCH_WAVE = 'glitch_wave',
}

/** 武器等级属性（基础属性，所有武器共有） */
export interface WeaponLevelStats {
    damage: number;
    attackInterval: number;
    range: number;
    projectileSpeed: number;
    /** 武器特有参数，按类型不同而不同 */
    [key: string]: number;
}

/** 武器静态定义（对应 GameConfig.WEAPON_SYSTEM.WEAPONS 条目） */
export interface WeaponDef {
    id: string;
    nameKey: string;
    descriptionKey: string;
    iconColor: string;
    levels: WeaponLevelStats[];
}

/** 武器运行时实例（玩家持有的武器） */
export interface WeaponInstance {
    type: WeaponType;
    level: number;
}

/** 获取武器当前等级的属性 */
export function getWeaponLevelStats(def: WeaponDef, level: number): WeaponLevelStats {
    const idx = Math.max(0, Math.min(level - 1, def.levels.length - 1));
    return def.levels[idx];
}
