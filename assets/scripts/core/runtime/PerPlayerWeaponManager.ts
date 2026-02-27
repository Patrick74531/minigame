import { WeaponType, WeaponInstance } from '../../gameplay/weapons/WeaponTypes';

/**
 * PerPlayerWeaponManager
 * 双人模式下每个玩家独立的武器背包。
 * 与 HeroWeaponManager 公共接口对齐，但不走单例——每个 PlayerContext 持有一个实例。
 */
export class PerPlayerWeaponManager {
    public readonly playerId: string;

    private _inventory: Map<WeaponType, WeaponInstance> = new Map();
    private _activeWeaponType: WeaponType | null = null;

    constructor(playerId: string) {
        this.playerId = playerId;
    }

    // === 访问器 ===

    get activeWeaponType(): WeaponType | null {
        return this._activeWeaponType;
    }

    get activeWeapon(): WeaponInstance | null {
        if (!this._activeWeaponType) return null;
        return this._inventory.get(this._activeWeaponType) ?? null;
    }

    get inventory(): ReadonlyMap<WeaponType, WeaponInstance> {
        return this._inventory;
    }

    get weaponCount(): number {
        return this._inventory.size;
    }

    // === 核心逻辑 ===

    addWeapon(type: WeaponType): number {
        const existing = this._inventory.get(type);
        if (existing) {
            existing.level++;
            return existing.level;
        }

        const instance: WeaponInstance = { type, level: 1 };
        this._inventory.set(type, instance);

        if (!this._activeWeaponType) {
            this._activeWeaponType = type;
        }
        return 1;
    }

    switchWeapon(type: WeaponType): boolean {
        if (!this._inventory.has(type)) return false;
        if (this._activeWeaponType === type) return false;
        this._activeWeaponType = type;
        return true;
    }

    cycleWeapon(direction: 1 | -1 = 1): WeaponType | null {
        if (this._inventory.size === 0) return null;
        const types = Array.from(this._inventory.keys());
        if (types.length <= 1) return this._activeWeaponType;

        const currentIdx = this._activeWeaponType ? types.indexOf(this._activeWeaponType) : 0;
        const nextIdx = (currentIdx + direction + types.length) % types.length;
        this._activeWeaponType = types[nextIdx];
        return this._activeWeaponType;
    }

    restoreInventory(weapons: { type: string; level: number }[], activeType: string | null): void {
        this._inventory.clear();
        this._activeWeaponType = null;
        for (const w of weapons) {
            const type = w.type as WeaponType;
            this._inventory.set(type, { type, level: Math.max(1, Math.floor(w.level)) });
            if (!this._activeWeaponType) this._activeWeaponType = type;
        }
        if (activeType && this._inventory.has(activeType as WeaponType)) {
            this._activeWeaponType = activeType as WeaponType;
        }
    }

    cleanup(): void {
        this._inventory.clear();
        this._activeWeaponType = null;
    }
}
