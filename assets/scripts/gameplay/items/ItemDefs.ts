/**
 * 道具定义
 * 定义所有可用道具的类型、元数据和效果配置
 *
 * 扩展新道具只需：
 * 1. 在 ItemId 联合类型中增加 id
 * 2. 在 ITEM_DEFS 中添加条目（含 effectType + effectParams）
 * 3. 如 effectType 为新类型，在 ItemEffectExecutor 中注册对应处理器
 * 4. 在 messages.ts 中添加对应 i18n key
 */

export type ItemId = 'restore_buildings' | 'kill_all_enemies' | 'hero_level_up';

/** 效果类型枚举 — 新增效果时在此扩展 */
export type ItemEffectType = 'restore_buildings' | 'kill_all_enemies' | 'hero_level_up';

export interface ItemDef {
    id: ItemId;
    nameKey: string;
    descriptionKey: string;
    shortKey: string;
    iconColor: string;
    iconSymbol: string;
    /** 效果类型 */
    effectType: ItemEffectType;
    /** 效果参数（各效果自行解读） */
    effectParams: Record<string, number>;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
    restore_buildings: {
        id: 'restore_buildings',
        nameKey: 'item.restore_buildings.name',
        descriptionKey: 'item.restore_buildings.description',
        shortKey: 'item.restore_buildings.short',
        iconColor: '#4ADE80',
        iconSymbol: '✚',
        effectType: 'restore_buildings',
        effectParams: {},
    },
    kill_all_enemies: {
        id: 'kill_all_enemies',
        nameKey: 'item.kill_all_enemies.name',
        descriptionKey: 'item.kill_all_enemies.description',
        shortKey: 'item.kill_all_enemies.short',
        iconColor: '#F87171',
        iconSymbol: '⚡',
        effectType: 'kill_all_enemies',
        effectParams: { damage: 999999 },
    },
    hero_level_up: {
        id: 'hero_level_up',
        nameKey: 'item.hero_level_up.name',
        descriptionKey: 'item.hero_level_up.description',
        shortKey: 'item.hero_level_up.short',
        iconColor: '#FACC15',
        iconSymbol: '★',
        effectType: 'hero_level_up',
        effectParams: { levels: 5 },
    },
};

export const ALL_ITEM_IDS: ItemId[] = Object.keys(ITEM_DEFS) as ItemId[];
