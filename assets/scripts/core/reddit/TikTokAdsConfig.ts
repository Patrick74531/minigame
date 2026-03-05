export type TikTokRewardAdSlot = 'weapon_draw' | 'hero_attr_card' | 'tower_attr_card' | 'item_card';

export interface TikTokRewardAdPlacementConfig {
    slot: TikTokRewardAdSlot;
    placementId: string;
}

export const TIKTOK_REWARDED_AD_PLACEMENTS: Record<TikTokRewardAdSlot, string> = {
    weapon_draw: 'ad7613034760638121996',
    hero_attr_card: 'ad7613040313108088843',
    tower_attr_card: 'ad7613186219463804984',
    item_card: 'ad7613084341946107916',
};

export function getTikTokRewardedAdPlacementId(slot: TikTokRewardAdSlot): string {
    return TIKTOK_REWARDED_AD_PLACEMENTS[slot];
}

export function getAllTikTokRewardedAdPlacements(): TikTokRewardAdPlacementConfig[] {
    return (Object.keys(TIKTOK_REWARDED_AD_PLACEMENTS) as TikTokRewardAdSlot[]).map(slot => ({
        slot,
        placementId: TIKTOK_REWARDED_AD_PLACEMENTS[slot],
    }));
}

export function injectTikTokRewardedAdPlacementsToGlobal(): void {
    const g = globalThis as unknown as {
        __GVR_TIKTOK_REWARDED_AD_PLACEMENTS__?: Record<TikTokRewardAdSlot, string>;
    };
    g.__GVR_TIKTOK_REWARDED_AD_PLACEMENTS__ = { ...TIKTOK_REWARDED_AD_PLACEMENTS };
}
