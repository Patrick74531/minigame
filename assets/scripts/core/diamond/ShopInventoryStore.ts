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
    public static readonly MAX_PRE_GAME_ITEMS = 3;

    /** 添加一件道具（数量+1）*/
    public static addItem(id: ItemId): boolean {
        const bag = this.load();
        if (this.getTotalCountFromBag(bag) >= this.MAX_PRE_GAME_ITEMS) {
            return false;
        }

        const existing = bag.find(e => e.id === id);
        if (existing) {
            existing.count += 1;
        } else {
            bag.push({ id, count: 1 });
        }
        this.save(bag);
        return true;
    }

    /** 读取当前背包并清空 localStorage（用于开局时一次性载入）*/
    public static drainItems(): ShopBagEntry[] {
        const bag = this.clampBagToLimit(this.load(), this.MAX_PRE_GAME_ITEMS);
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
        return this.getTotalCountFromBag(this.load());
    }

    /** 是否还能继续预购指定数量道具 */
    public static canAddItems(count: number = 1): boolean {
        const safeCount = Math.max(1, Math.floor(count));
        return this.totalCount() + safeCount <= this.MAX_PRE_GAME_ITEMS;
    }

    /** 当前剩余可预购数量 */
    public static remainingSlots(): number {
        return Math.max(0, this.MAX_PRE_GAME_ITEMS - this.totalCount());
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

    private static getTotalCountFromBag(bag: ShopBagEntry[]): number {
        return bag.reduce((sum, e) => sum + e.count, 0);
    }

    private static clampBagToLimit(bag: ShopBagEntry[], limit: number): ShopBagEntry[] {
        const safeLimit = Math.max(0, Math.floor(limit));
        if (safeLimit === 0 || bag.length === 0) return [];

        const out: ShopBagEntry[] = [];
        let remaining = safeLimit;
        for (const entry of bag) {
            if (remaining <= 0) break;
            const count = Math.max(0, Math.floor(entry.count));
            if (count <= 0) continue;
            const take = Math.min(count, remaining);
            out.push({ id: entry.id, count: take });
            remaining -= take;
        }
        return out;
    }
}
