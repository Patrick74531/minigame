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
    iconPath: string;
    levels: WeaponLevelStats[];
}

/** 武器运行时实例（玩家持有的武器） */
export interface WeaponInstance {
    type: WeaponType;
    level: number;
}

/** 获取武器当前等级的属性 */
export function getWeaponLevelStats(def: WeaponDef, level: number): WeaponLevelStats {
    const safeLevel = Math.max(1, Math.floor(level));
    const levels = def.levels;
    if (levels.length <= 0) {
        return {
            damage: 0,
            attackInterval: 1,
            range: 0,
            projectileSpeed: 0,
        };
    }

    if (safeLevel <= levels.length) {
        return levels[safeLevel - 1];
    }

    const lastIndex = levels.length - 1;
    const last = levels[lastIndex];
    const prev = levels[Math.max(0, lastIndex - 1)];
    const extraLevels = safeLevel - levels.length;
    const extrapolated: WeaponLevelStats = { ...last };

    const keys = new Set<string>([...Object.keys(prev), ...Object.keys(last)]);
    for (const key of keys) {
        const lastValue = (last as Record<string, number>)[key];
        if (typeof lastValue !== 'number') continue;

        const prevValue = (prev as Record<string, number>)[key];
        const step = typeof prevValue === 'number' ? lastValue - prevValue : 0;
        let value = lastValue + step * extraLevels;

        if (key === 'attackInterval') {
            value = Math.max(0.02, value);
        } else {
            value = Math.max(0, value);
        }

        extrapolated[key] = value;
    }

    return extrapolated;
}
