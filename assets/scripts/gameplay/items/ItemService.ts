import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';
import { GameManager } from '../../core/managers/GameManager';
import { ItemId, ItemDef, ITEM_DEFS, ALL_ITEM_IDS } from './ItemDefs';
import { ItemEffectExecutor } from './ItemEffectExecutor';

/**
 * ItemService
 * 管理道具背包、抽取和效果执行。
 * Boss击杀后掉落宝箱 → 拾取后3选1 → 存入背包 → 使用时执行效果。
 */
export class ItemService extends Singleton<ItemService>() {
    private _inventory: Map<ItemId, number> = new Map();

    public initialize(): void {
        ItemEffectExecutor.bootstrap();
        this.eventManager.on(GameEvents.BOSS_CHEST_PICKED, this.onChestPicked, this);
        this.eventManager.on(GameEvents.ITEM_CARD_PICKED, this.onItemPicked, this);
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.BOSS_CHEST_PICKED, this.onChestPicked, this);
        this.eventManager.off(GameEvents.ITEM_CARD_PICKED, this.onItemPicked, this);
        this._inventory.clear();
    }

    // === 背包 ===

    public get inventory(): ReadonlyMap<ItemId, number> {
        return this._inventory;
    }

    public getItemCount(id: ItemId): number {
        return this._inventory.get(id) ?? 0;
    }

    public addItem(id: ItemId, count: number = 1): void {
        const current = this._inventory.get(id) ?? 0;
        this._inventory.set(id, current + count);
        this.eventManager.emit(GameEvents.ITEM_INVENTORY_CHANGED, {
            itemId: id,
            count: current + count,
        });
    }

    public removeItem(id: ItemId, count: number = 1): boolean {
        const current = this._inventory.get(id) ?? 0;
        if (current < count) return false;
        const remaining = current - count;
        if (remaining <= 0) {
            this._inventory.delete(id);
        } else {
            this._inventory.set(id, remaining);
        }
        this.eventManager.emit(GameEvents.ITEM_INVENTORY_CHANGED, {
            itemId: id,
            count: remaining,
        });
        return true;
    }

    // === 道具定义 ===

    public getItemDef(id: ItemId): ItemDef | null {
        return ITEM_DEFS[id] ?? null;
    }

    // === 抽取 ===

    public drawItems(count: number = 3): ItemId[] {
        const shuffled = [...ALL_ITEM_IDS].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    // === 使用 ===

    public useItem(id: ItemId): boolean {
        if (!this.removeItem(id)) return false;

        const def = ITEM_DEFS[id];
        if (def) {
            ItemEffectExecutor.execute(def.effectType, def.effectParams);
        }
        this.eventManager.emit(GameEvents.ITEM_USED, { itemId: id });
        return true;
    }

    // === 存档 ===

    /** 获取当前背包快照（用于 GameSave） */
    public getSnapshot(): Array<{ id: string; count: number }> {
        const result: Array<{ id: string; count: number }> = [];
        this._inventory.forEach((count, id) => {
            if (count > 0) result.push({ id, count });
        });
        return result;
    }

    /** 从存档恢复背包 */
    public restoreFromSave(items: Array<{ id: string; count: number }>): void {
        this._inventory.clear();
        for (const entry of items) {
            const itemId = entry.id as ItemId;
            if (ITEM_DEFS[itemId] && entry.count > 0) {
                this._inventory.set(itemId, entry.count);
            }
        }
        this.eventManager.emit(GameEvents.ITEM_INVENTORY_CHANGED, {
            itemId: '',
            count: 0,
        });
    }

    // === 事件 ===

    private onChestPicked(): void {
        const items = this.drawItems(3);
        if (items.length === 0) return;

        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.pauseGame();

        this.eventManager.emit(GameEvents.ITEM_CARDS_OFFERED, {
            items: items as string[],
        });
    }

    private onItemPicked(data: { itemId: string }): void {
        const id = data.itemId as ItemId;
        if (!ITEM_DEFS[id]) return;
        this.addItem(id);

        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.resumeGame();
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
