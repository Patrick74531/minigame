/**
 * 地图/出生点配置
 */
export const MAP_CONFIG = {
    /** 基地出生点 (World XZ) */
    BASE_SPAWN: { x: -15, z: -15 },
    /** 英雄相对基地的偏移 */
    HERO_SPAWN_OFFSET: { x: 2, z: 2 },
    /** 可移动范围限制 */
    LIMITS: { x: 25, z: 25 },
} as const;
