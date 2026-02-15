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
    const corners = [
        { x: -limits.x, y: -limits.z },
        { x: limits.x, y: -limits.z },
        { x: -limits.x, y: limits.z },
        { x: limits.x, y: limits.z },
    ];

    const portalsCfg = GameConfig.WAVE.INFINITE.SPAWN_PORTALS;
    const maxMargin = Math.max(0, Math.min(limits.x, limits.z) - 0.5);
    const edgeMargin = Math.min(maxMargin, Math.max(0, portalsCfg?.EDGE_MARGIN ?? 4));
    const distanceFactor = Math.max(0.3, Math.min(1, portalsCfg?.DISTANCE_FACTOR ?? 0.9));

    let nearestIdx = 0;
    let nearestDistSq = Infinity;
    for (let i = 0; i < corners.length; i++) {
        const dx = corners[i].x - baseX;
        const dy = corners[i].y - baseY;
        const distSq = dx * dx + dy * dy;
        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestIdx = i;
        }
    }

    const candidates = corners
        .map((point, idx) => ({ idx, point }))
        .filter(item => item.idx !== nearestIdx)
        .map(item => {
            const dx = item.point.x - baseX;
            const dy = item.point.y - baseY;
            return {
                point: item.point,
                distSq: dx * dx + dy * dy,
            };
        })
        .sort((a, b) => b.distSq - a.distSq);
    const minX = -limits.x + edgeMargin;
    const maxX = limits.x - edgeMargin;
    const minY = -limits.z + edgeMargin;
    const maxY = limits.z - edgeMargin;
    const safeMinX = minX < maxX ? minX : -limits.x;
    const safeMaxX = minX < maxX ? maxX : limits.x;
    const safeMinY = minY < maxY ? minY : -limits.z;
    const safeMaxY = minY < maxY ? maxY : limits.z;

    const directionalPortals = candidates
        .map(item => {
            const dirX = item.point.x - baseX;
            const dirY = item.point.y - baseY;
            const len = Math.hypot(dirX, dirY);
            if (len <= 0.0001) return null;
            const nx = dirX / len;
            const ny = dirY / len;
            const maxDistance = resolveRayDistanceToBounds(
                baseX,
                baseY,
                nx,
                ny,
                safeMinX,
                safeMaxX,
                safeMinY,
                safeMaxY
            );
            if (!Number.isFinite(maxDistance) || maxDistance <= 0.01) return null;
            return {
                nx,
                ny,
                maxDistance,
            };
        })
        .filter(
            (
                item
            ): item is {
                nx: number;
                ny: number;
                maxDistance: number;
            } => !!item
        );

    if (directionalPortals.length === 0) {
        return candidates.map(item => item.point);
    }

    let sharedDistance = Infinity;
    for (const portal of directionalPortals) {
        sharedDistance = Math.min(sharedDistance, portal.maxDistance);
    }
    if (!Number.isFinite(sharedDistance) || sharedDistance <= 0.01) {
        return candidates.map(item => item.point);
    }

    const spawnDistance = sharedDistance * distanceFactor;
    return directionalPortals.map(portal => ({
        x: baseX + portal.nx * spawnDistance,
        y: baseY + portal.ny * spawnDistance,
    }));
}

function resolveRayDistanceToBounds(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
): number {
    let maxDistance = Infinity;

    if (Math.abs(dirX) > 0.0001) {
        const tx = dirX > 0 ? (maxX - originX) / dirX : (minX - originX) / dirX;
        if (tx > 0) {
            maxDistance = Math.min(maxDistance, tx);
        }
    }

    if (Math.abs(dirY) > 0.0001) {
        const ty = dirY > 0 ? (maxY - originY) / dirY : (minY - originY) / dirY;
        if (ty > 0) {
            maxDistance = Math.min(maxDistance, ty);
        }
    }

    return maxDistance;
}
