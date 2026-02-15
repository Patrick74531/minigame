import type { SpawnLane, SpawnPortalPoint } from './WaveSpawnPortals';

export type RouteLane = 'top' | 'mid' | 'bottom';

export type LaneDirection2D = {
    x: number;
    y: number;
};

export interface LanePortalRouting {
    portalIndexByLane: Record<RouteLane, number>;
    directionByLane: Record<RouteLane, LaneDirection2D>;
}

export const ROUTE_LANE_SEQUENCE: ReadonlyArray<RouteLane> = ['mid', 'top', 'bottom'];
const LANE_ASSIGN_ORDER: ReadonlyArray<RouteLane> = ['mid', 'top', 'bottom'];

const DEFAULT_DIRECTION_BY_LANE: Record<RouteLane, LaneDirection2D> = {
    top: { x: 1, y: 0 },
    mid: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    bottom: { x: 0, y: 1 },
};

const EPSILON = 0.0001;

export function resolveLanePortalRouting(
    baseX: number,
    baseY: number,
    portals: SpawnPortalPoint[]
): LanePortalRouting {
    const candidates = portals.map((portal, index) => {
        const dx = portal.x - baseX;
        const dy = portal.y - baseY;
        const len = Math.hypot(dx, dy);
        return {
            index,
            distance: len,
            direction:
                len > EPSILON
                    ? {
                          x: dx / len,
                          y: dy / len,
                      }
                    : {
                          x: DEFAULT_DIRECTION_BY_LANE.mid.x,
                          y: DEFAULT_DIRECTION_BY_LANE.mid.y,
                      },
        };
    });

    const availableIndices = new Set<number>(candidates.map(item => item.index));
    const topPortalIndex = pickPortalByDirection(
        candidates,
        DEFAULT_DIRECTION_BY_LANE.top,
        availableIndices,
        portals
    );
    availableIndices.delete(topPortalIndex);
    const midPortalIndex = pickPortalByDirection(
        candidates,
        DEFAULT_DIRECTION_BY_LANE.mid,
        availableIndices,
        portals
    );
    availableIndices.delete(midPortalIndex);
    const bottomPortalIndex = pickPortalByDirection(
        candidates,
        DEFAULT_DIRECTION_BY_LANE.bottom,
        availableIndices,
        portals
    );

    const assignedByLane: Record<RouteLane, number> = {
        top: topPortalIndex,
        mid: midPortalIndex,
        bottom: bottomPortalIndex,
    };
    const remainingIndices = new Set<number>(candidates.map(item => item.index));
    for (const lane of LANE_ASSIGN_ORDER) {
        const idx = pickPortalByDirection(
            candidates,
            DEFAULT_DIRECTION_BY_LANE[lane],
            remainingIndices,
            portals
        );
        assignedByLane[lane] = idx;
        remainingIndices.delete(idx);
    }

    const finalPortalIndexByLane: Record<RouteLane, number> = {
        top: assignedByLane.top,
        mid: assignedByLane.mid,
        bottom: assignedByLane.bottom,
    };

    return {
        portalIndexByLane: finalPortalIndexByLane,
        directionByLane: {
            top: resolveLaneDirection(
                baseX,
                baseY,
                portals[finalPortalIndexByLane.top],
                DEFAULT_DIRECTION_BY_LANE.top
            ),
            mid: resolveLaneDirection(
                baseX,
                baseY,
                portals[finalPortalIndexByLane.mid],
                DEFAULT_DIRECTION_BY_LANE.mid
            ),
            bottom: resolveLaneDirection(
                baseX,
                baseY,
                portals[finalPortalIndexByLane.bottom],
                DEFAULT_DIRECTION_BY_LANE.bottom
            ),
        },
    };
}

export function laneToForecastLane(lane: RouteLane): SpawnLane {
    if (lane === 'top') return 'left';
    if (lane === 'bottom') return 'right';
    return 'center';
}

function pickPortalByDirection(
    candidates: Array<{ index: number; distance: number; direction: LaneDirection2D }>,
    target: LaneDirection2D,
    availableIndices: Set<number>,
    portals: SpawnPortalPoint[]
): number {
    if (candidates.length <= 0) return 0;

    let pool = candidates.filter(item => availableIndices.has(item.index));
    if (pool.length <= 0) {
        pool = candidates.slice();
    }

    let bestIndex = pool[0].index;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const item of pool) {
        const dot = item.direction.x * target.x + item.direction.y * target.y;
        const score = dot + item.distance * 0.0001;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = item.index;
        }
    }

    if (bestIndex >= 0 && bestIndex < portals.length) {
        return bestIndex;
    }
    return pool[0]?.index ?? 0;
}

function resolveLaneDirection(
    baseX: number,
    baseY: number,
    portal: SpawnPortalPoint | undefined,
    fallback: LaneDirection2D
): LaneDirection2D {
    if (!portal) {
        return { x: fallback.x, y: fallback.y };
    }

    const dx = portal.x - baseX;
    const dy = portal.y - baseY;
    const len = Math.hypot(dx, dy);
    if (len <= EPSILON) {
        return { x: fallback.x, y: fallback.y };
    }

    return {
        x: dx / len,
        y: dy / len,
    };
}
