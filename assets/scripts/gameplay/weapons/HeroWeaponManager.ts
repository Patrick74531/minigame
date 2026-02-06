import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameConfig } from '../../data/GameConfig';
import { GameEvents } from '../../data/GameEvents';
import { WeaponType, WeaponDef, WeaponInstance, getWeaponLevelStats } from './WeaponTypes';

/**
 * HeroWeaponManager
 * 管理英雄的武器背包、切换和升级逻辑。
 * UI 层通过事件驱动，不直接引用此服务。
 *
 * NOTE: 扩展新武器只需在 GameConfig.WEAPON_SYSTEM.WEAPONS 中添加条目，
 *       并实现对应的 WeaponBehavior。
 */
export class HeroWeaponManager extends Singleton<HeroWeaponManager>() {
    /** 已拥有的武器（type → instance） */
    private _inventory: Map<WeaponType, WeaponInstance> = new Map();

    /** 当前激活的武器类型 */
    private _activeWeaponType: WeaponType | null = null;

    // === 公共访问器 ===

    public get activeWeaponType(): WeaponType | null {
        return this._activeWeaponType;
    }

    public get activeWeapon(): WeaponInstance | null {
        if (!this._activeWeaponType) return null;
        return this._inventory.get(this._activeWeaponType) ?? null;
    }

    public get inventory(): ReadonlyMap<WeaponType, WeaponInstance> {
        return this._inventory;
    }

    public get weaponCount(): number {
        return this._inventory.size;
    }

    // === 生命周期 ===

    public initialize(): void {
        this.eventManager.on(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        console.log('[HeroWeaponManager] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        this._inventory.clear();
        this._activeWeaponType = null;
    }

    // === 核心逻辑 ===

    /**
     * 添加或升级武器
     * @returns 升级后的等级（-1 表示已满级无法升级）
     */
    public addWeapon(type: WeaponType): number {
        const maxLevel = GameConfig.WEAPON_SYSTEM.MAX_WEAPON_LEVEL;
        const existing = this._inventory.get(type);

        if (existing) {
            // 已有此武器 → 升级
            if (existing.level >= maxLevel) {
                console.log(`[HeroWeaponManager] ${type} 已满级 (Lv.${maxLevel})`);
                return -1;
            }
            existing.level++;
            console.log(`[HeroWeaponManager] ${type} 升级到 Lv.${existing.level}`);
            return existing.level;
        }

        // 新武器
        const instance: WeaponInstance = { type, level: 1 };
        this._inventory.set(type, instance);

        // 第一把武器自动激活
        if (!this._activeWeaponType) {
            this._activeWeaponType = type;
        }

        console.log(`[HeroWeaponManager] 获得新武器: ${type} Lv.1`);
        return 1;
    }

    /** 切换当前武器 */
    public switchWeapon(type: WeaponType): boolean {
        if (!this._inventory.has(type)) return false;
        if (this._activeWeaponType === type) return false;

        this._activeWeaponType = type;
        this.eventManager.emit(GameEvents.WEAPON_SWITCHED, { weaponId: type });
        console.log(`[HeroWeaponManager] 切换武器: ${type}`);
        return true;
    }

    /** 获取武器定义 */
    public getWeaponDef(type: WeaponType): WeaponDef | null {
        const raw = GameConfig.WEAPON_SYSTEM.WEAPONS[type];
        if (!raw) return null;
        return raw as WeaponDef;
    }

    /** 获取当前激活武器的等级属性 */
    public getActiveStats(): any | null {
        const weapon = this.activeWeapon;
        if (!weapon) return null;
        const def = this.getWeaponDef(weapon.type);
        if (!def) return null;
        return getWeaponLevelStats(def, weapon.level);
    }

    // === 事件处理 ===

    private onWeaponPicked(data: { weaponId: string }): void {
        const type = data.weaponId as WeaponType;
        this.addWeapon(type);
    }

    // === 工具 ===

    /** 获取所有武器 ID 列表（用于随机抽取） */
    public getAllWeaponIds(): WeaponType[] {
        return Object.keys(GameConfig.WEAPON_SYSTEM.WEAPONS) as WeaponType[];
    }

    /** 随机抽取 N 把不重复武器 */
    public drawWeapons(count: number): WeaponType[] {
        const allIds = this.getAllWeaponIds();
        const shuffled = allIds.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
