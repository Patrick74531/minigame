import { GameConfig } from '../../data/GameConfig';

export interface SpawnPortalPoint {
    x: number;
    y: number;
}

export type SpawnLane = 'left' | 'center' | 'right';

export function getEdgePosition(): SpawnPortalPoint {
    const limits = GameConfig.MAP.LIMITS;
    return { x: limits.x, y: limits.z };
}

export function getSpawnPosition(
    waveNumber: number,
    portals: SpawnPortalPoint[],
    forcedPortalIndex?: number
): SpawnPortalPoint {
    if (portals.length === 0) {
        return getEdgePosition();
    }

    const activeCount = resolveActivePortalCount(waveNumber, portals.length);
    const portalIdx = resolvePortalIndex(activeCount, forcedPortalIndex);
    const portal = portals[portalIdx];
    const jitterRadius = GameConfig.WAVE.INFINITE.SPAWN_PORTALS?.JITTER_RADIUS ?? 0;
    if (jitterRadius <= 0) {
        return { x: portal.x, y: portal.y };
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * jitterRadius;
    const x = portal.x + Math.cos(angle) * radius;
    const y = portal.y + Math.sin(angle) * radius;
    const limits = GameConfig.MAP.LIMITS;
    return {
        x: Math.max(-limits.x, Math.min(limits.x, x)),
        y: Math.max(-limits.z, Math.min(limits.z, y)),
    };
}

export function resolveActivePortalCount(waveNumber: number, portalCount: number): number {
    const portalsCfg = GameConfig.WAVE.INFINITE.SPAWN_PORTALS;
    const openWave2 = portalsCfg?.OPEN_WAVE_2 ?? 4;
    const openWave3 = portalsCfg?.OPEN_WAVE_3 ?? 8;
    if (waveNumber >= openWave3) return Math.min(3, portalCount);
    if (waveNumber >= openWave2) return Math.min(2, portalCount);
    return Math.min(1, portalCount);
}

export function resolveLaneByPortalIndex(
    waveNumber: number,
    portals: SpawnPortalPoint[],
    portalIndex: number
): SpawnLane {
    if (portals.length <= 0) return 'center';

    const activeCount = resolveActivePortalCount(waveNumber, portals.length);
    if (activeCount <= 1) return 'center';

    const safePortalIndex = Math.max(0, Math.min(Math.floor(portalIndex), activeCount - 1));
    const ordered = portals
        .slice(0, activeCount)
        .map((portal, idx) => ({ idx, portal }))
        .sort((a, b) => {
            if (a.portal.x !== b.portal.x) return a.portal.x - b.portal.x;
            return a.portal.y - b.portal.y;
        });

    const rank = ordered.findIndex(item => item.idx === safePortalIndex);
    if (rank <= 0) return 'left';
    if (rank >= ordered.length - 1) return 'right';
    return 'center';
}

function resolvePortalIndex(activeCount: number, forcedPortalIndex?: number): number {
    if (activeCount <= 1) return 0;
    if (typeof forcedPortalIndex === 'number' && Number.isFinite(forcedPortalIndex)) {
        const safeForced = Math.floor(forcedPortalIndex);
        if (safeForced >= 0 && safeForced < activeCount) {
            return safeForced;
        }
    }
    return Math.floor(Math.random() * activeCount);
}

export function resolveSpawnPortals(baseX: number, baseY: number): SpawnPortalPoint[] {
    const limits = GameConfig.MAP.LIMITS;
    const portalsCfg = GameConfig.WAVE.INFINITE.SPAWN_PORTALS;
    const maxMargin = Math.max(0, Math.min(limits.x, limits.z) - 0.5);
    const edgeMargin = Math.min(maxMargin, Math.max(0, portalsCfg?.EDGE_MARGIN ?? 4));
    const distanceFactor = Math.max(0.3, Math.min(1, portalsCfg?.DISTANCE_FACTOR ?? 0.96));
    const minX = -limits.x + edgeMargin;
    const maxX = limits.x - edgeMargin;
    const minY = -limits.z + edgeMargin;
    const maxY = limits.z - edgeMargin;
    const safeMinX = minX < maxX ? minX : -limits.x;
    const safeMaxX = minX < maxX ? maxX : limits.x;
    const safeMinY = minY < maxY ? minY : -limits.z;
    const safeMaxY = minY < maxY ? maxY : limits.z;
    const laneEndAnchors = [
        laneNormalizedToWorld(0.95, 0.92, limits.x, limits.z),
        laneNormalizedToWorld(0.95, 0.05, limits.x, limits.z),
        laneNormalizedToWorld(0.08, 0.05, limits.x, limits.z),
    ];

    return laneEndAnchors.map(anchor => {
        const targetX = baseX + (anchor.x - baseX) * distanceFactor;
        const targetY = baseY + (anchor.y - baseY) * distanceFactor;
        return {
            x: Math.max(safeMinX, Math.min(safeMaxX, targetX)),
            y: Math.max(safeMinY, Math.min(safeMaxY, targetY)),
        };
    });
}

function laneNormalizedToWorld(
    nx: number,
    nz: number,
    halfW: number,
    halfH: number
): SpawnPortalPoint {
    return {
        x: nx * (halfW * 2) - halfW,
        y: (1 - nz) * (halfH * 2) - halfH,
    };
}
