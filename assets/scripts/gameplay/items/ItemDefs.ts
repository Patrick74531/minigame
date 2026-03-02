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

export type ItemId =
    | 'restore_buildings'
    | 'kill_all_enemies'
    | 'hero_level_up'
    | 'freeze_enemies'
    | 'upgrade_buildings'
    | 'hero_invincible';

/** 效果类型枚举 — 新增效果时在此扩展 */
export type ItemEffectType =
    | 'restore_buildings'
    | 'kill_all_enemies'
    | 'hero_level_up'
    | 'freeze_enemies'
    | 'upgrade_buildings'
    | 'hero_invincible';

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
        iconSymbol: 'W',
        effectType: 'restore_buildings',
        effectParams: {},
    },
    kill_all_enemies: {
        id: 'kill_all_enemies',
        nameKey: 'item.kill_all_enemies.name',
        descriptionKey: 'item.kill_all_enemies.description',
        shortKey: 'item.kill_all_enemies.short',
        iconColor: '#F87171',
        iconSymbol: '!',
        effectType: 'kill_all_enemies',
        effectParams: {},
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
    freeze_enemies: {
        id: 'freeze_enemies',
        nameKey: 'item.freeze_enemies.name',
        descriptionKey: 'item.freeze_enemies.description',
        shortKey: 'item.freeze_enemies.short',
        iconColor: '#38BDF8',
        iconSymbol: 'F',
        effectType: 'freeze_enemies',
        effectParams: { duration: 10 },
    },
    upgrade_buildings: {
        id: 'upgrade_buildings',
        nameKey: 'item.upgrade_buildings.name',
        descriptionKey: 'item.upgrade_buildings.description',
        shortKey: 'item.upgrade_buildings.short',
        iconColor: '#A78BFA',
        iconSymbol: 'U',
        effectType: 'upgrade_buildings',
        effectParams: { towersOnly: 1 },
    },
    hero_invincible: {
        id: 'hero_invincible',
        nameKey: 'item.hero_invincible.name',
        descriptionKey: 'item.hero_invincible.description',
        shortKey: 'item.hero_invincible.short',
        iconColor: '#FFD700',
        iconSymbol: 'S',
        effectType: 'hero_invincible',
        effectParams: { duration: 30 },
    },
};

export const ALL_ITEM_IDS: ItemId[] = Object.keys(ITEM_DEFS) as ItemId[];
