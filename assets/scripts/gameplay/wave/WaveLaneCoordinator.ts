import { Node, Vec3 } from 'cc';
import { clamp } from './WaveMath';
import { type LaneDirection2D, type RouteLane } from './WaveLaneRouting';
import { getEdgePosition, type SpawnPortalPoint } from './WaveSpawnPortals';

type LanePadConfig = {
    type: string;
    x: number;
    z: number;
};

function getLanePolylinesWorld(limits: {
    x: number;
    z: number;
}): Record<RouteLane, Array<{ x: number; z: number }>> {
    const halfW = Math.max(1, limits.x);
    const halfH = Math.max(1, limits.z);
    const laneNormalizedToWorld = (nx: number, nz: number): { x: number; z: number } => ({
        x: nx * (halfW * 2) - halfW,
        z: (1 - nz) * (halfH * 2) - halfH,
    });

    return {
        top: [
            laneNormalizedToWorld(0.05, 0.95),
            laneNormalizedToWorld(0.06, 0.92),
            laneNormalizedToWorld(0.95, 0.92),
        ],
        mid: [
            laneNormalizedToWorld(0.05, 0.95),
            laneNormalizedToWorld(0.35, 0.65),
            laneNormalizedToWorld(0.5, 0.5),
            laneNormalizedToWorld(0.65, 0.35),
            laneNormalizedToWorld(0.95, 0.05),
        ],
        bottom: [
            laneNormalizedToWorld(0.05, 0.95),
            laneNormalizedToWorld(0.08, 0.94),
            laneNormalizedToWorld(0.08, 0.05),
        ],
    };
}

function resolveLaneByNearestPath(
    x: number,
    z: number,
    polylines: Record<RouteLane, Array<{ x: number; z: number }>>
): RouteLane {
    let bestLane: RouteLane = 'mid';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const lane of ['mid', 'top', 'bottom'] as const) {
        const distance = pointToPolylineDistance(x, z, polylines[lane]);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestLane = lane;
        }
    }
    return bestLane;
}

function pointToPolylineDistance(
    x: number,
    z: number,
    polyline: Array<{ x: number; z: number }>
): number {
    if (polyline.length <= 0) return Number.POSITIVE_INFINITY;
    if (polyline.length === 1) {
        return Math.hypot(x - polyline[0].x, z - polyline[0].z);
    }

    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polyline.length - 1; i++) {
        const distance = pointToSegmentDistance(x, z, polyline[i], polyline[i + 1]);
        if (distance < best) {
            best = distance;
        }
    }
    return best;
}

function pointToSegmentDistance(
    px: number,
    pz: number,
    a: { x: number; z: number },
    b: { x: number; z: number }
): number {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const abLenSq = abx * abx + abz * abz;
    if (abLenSq <= 0.0001) {
        return Math.hypot(px - a.x, pz - a.z);
    }

    const apx = px - a.x;
    const apz = pz - a.z;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLenSq));
    const cx = a.x + abx * t;
    const cz = a.z + abz * t;
    return Math.hypot(px - cx, pz - cz);
}

function samplePortalPosition(
    portal: SpawnPortalPoint,
    jitterRadius: number,
    limits: { x: number; z: number },
    baseNode: Node | null
): SpawnPortalPoint {
    if (jitterRadius <= 0) {
        return { x: portal.x, y: portal.y };
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * jitterRadius;
    let x = portal.x + Math.cos(angle) * radius;
    let y = portal.y + Math.sin(angle) * radius;

    const base = baseNode;
    if (base && base.isValid) {
        const baseX = base.position.x;
        const baseY = base.position.z;
        const portalDx = portal.x - baseX;
        const portalDy = portal.y - baseY;
        const portalDist = Math.hypot(portalDx, portalDy);
        if (portalDist > 0.0001) {
            const nx = portalDx / portalDist;
            const ny = portalDy / portalDist;
            const candidateDx = x - baseX;
            const candidateDy = y - baseY;
            const candidateDist = Math.hypot(candidateDx, candidateDy);
            const minDist = Math.max(0, portalDist - jitterRadius * 0.2);
            if (candidateDist < minDist) {
                x = baseX + nx * minDist;
                y = baseY + ny * minDist;
            }
        }
    }

    return {
        x: Math.max(-limits.x, Math.min(limits.x, x)),
        y: Math.max(-limits.z, Math.min(limits.z, y)),
    };
}

export function resolveSpawnPositionByLane(params: {
    lane: RouteLane;
    portalIndexByLane: Record<RouteLane, number>;
    spawnPortals: SpawnPortalPoint[];
    jitterRadius: number;
    limits: { x: number; z: number };
    baseNode: Node | null;
}): SpawnPortalPoint {
    const portalIndex = params.portalIndexByLane[params.lane];
    const portal = params.spawnPortals[portalIndex] ?? getEdgePosition();
    return samplePortalPosition(portal, params.jitterRadius, params.limits, params.baseNode);
}

export function resolveLaneUnlockFocusPosition(params: {
    lane: RouteLane;
    portalIndexByLane: Record<RouteLane, number>;
    spawnPortals: SpawnPortalPoint[];
    laneDirectionByLane: Record<RouteLane, LaneDirection2D>;
    limits: { x: number; z: number };
    inward: number;
    heroY: number;
}): Vec3 {
    const portalIndex = params.portalIndexByLane[params.lane];
    const portal = params.spawnPortals[portalIndex] ?? getEdgePosition();
    const direction = params.laneDirectionByLane[params.lane] ?? params.laneDirectionByLane.mid;
    const x = clamp(portal.x - direction.x * params.inward, -params.limits.x, params.limits.x);
    const z = clamp(portal.y - direction.y * params.inward, -params.limits.z, params.limits.z);
    return new Vec3(x, Math.max(1.2, params.heroY), z);
}

export function resolveLaneUnlockPadFocusPosition(params: {
    lane: RouteLane;
    pads: ReadonlyArray<LanePadConfig>;
    lockedLanePadTypes: ReadonlySet<string>;
    limits: { x: number; z: number };
    basePosition: { x: number; z: number };
    heroY: number;
}): Vec3 | undefined {
    if (params.pads.length <= 0) return undefined;

    const polylines = getLanePolylinesWorld(params.limits);
    let bestPad: { x: number; z: number } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const pad of params.pads) {
        if (!params.lockedLanePadTypes.has(pad.type)) continue;
        const padLane = resolveLaneByNearestPath(pad.x, pad.z, polylines);
        if (padLane !== params.lane) continue;

        const distToBase = Math.hypot(pad.x - params.basePosition.x, pad.z - params.basePosition.z);
        if (distToBase < bestDist) {
            bestDist = distToBase;
            bestPad = { x: pad.x, z: pad.z };
        }
    }

    if (!bestPad) return undefined;
    return new Vec3(bestPad.x, Math.max(1.2, params.heroY), bestPad.z);
}
