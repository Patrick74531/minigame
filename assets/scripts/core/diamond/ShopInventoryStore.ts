import type { ItemId } from '../../gameplay/items/ItemDefs';

/**
 * ShopInventoryStore
 * 持久化保存主菜单购买的道具，供下次开局时载入 ItemService。
 * 使用 localStorage key `gvr.shopbag`。
 */

const STORAGE_KEY = 'gvr.shopbag';

export interface ShopBagEntry {
    id: string;
    count: number;
}

export class ShopInventoryStore {
    /** 添加一件道具（数量+1）*/
    public static addItem(id: ItemId): void {
        const bag = this.load();
        const existing = bag.find(e => e.id === id);
        if (existing) {
            existing.count += 1;
        } else {
            bag.push({ id, count: 1 });
        }
        this.save(bag);
    }

    /** 读取当前背包并清空 localStorage（用于开局时一次性载入）*/
    public static drainItems(): ShopBagEntry[] {
        const bag = this.load();
        if (bag.length > 0) {
            localStorage.removeItem(STORAGE_KEY);
        }
        return bag;
    }

    /** 查看当前背包（不清空）*/
    public static peek(): ShopBagEntry[] {
        return this.load();
    }

    /** 当前背包总道具数 */
    public static totalCount(): number {
        return this.load().reduce((sum, e) => sum + e.count, 0);
    }

    private static load(): ShopBagEntry[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];
            return (parsed as ShopBagEntry[]).filter(
                e => typeof e.id === 'string' && typeof e.count === 'number' && e.count > 0
            );
        } catch {
            return [];
        }
    }

    private static save(bag: ShopBagEntry[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(bag));
        } catch {
            // localStorage full or unavailable — silently ignore
        }
    }
}
