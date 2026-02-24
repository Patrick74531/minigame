import { Node } from 'cc';
import { BuildingFactory } from './BuildingFactory';
import { Building } from './Building';
import { BuildingPad } from './BuildingPad';
import { BuildingManager } from './BuildingManager';
import { BuildingRegistry } from './BuildingRegistry';
import { GameConfig } from '../../data/GameConfig';
import { GameEvents } from '../../data/GameEvents';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import type { RouteLane } from '../wave/WaveLaneRouting';

type PadPlacement = {
    type: string;
    x: number;
    z: number;
    angle?: number;
    prebuild?: boolean;
    overrideCost?: number;
};

/**
 * BuildingPadSpawner
 * 负责根据配置生成建造点，减少 GameController 胶水逻辑
 */
export class BuildingPadSpawner {
    private static readonly PREBUILT_LEVEL1_TYPES = new Set(['barracks', 'farm']);
    private static readonly INITIAL_PREBUILT_PAD_INDEX_HINT = 20;
    private static readonly INITIAL_PREBUILT_REBUILD_COST = 10;
    private static readonly INITIAL_BUILD_COST_PAD_INDEX = 19;
    private static readonly INITIAL_BUILD_COST = 10;
    private static readonly PAD20_UNLOCK_TARGET_INDEXES = new Set([1, 17, 18]);
    private static readonly PAD20_UNLOCK_TARGET_COST = 20;
    private static readonly STAGE2_UNLOCK_TARGET_INDEXES = new Set([14, 15, 16, 21]);
    private static readonly STAGE2_UNLOCK_TARGET_COST = 40;
    private static readonly LOCKED_LANE_PAD_TYPES = new Set([
        'tower',
        'frost_tower',
        'lightning_tower',
        'wall',
    ]);
    private static readonly TOWER_PAD_TYPES = new Set(['tower', 'frost_tower', 'lightning_tower']);
    private static readonly WALL_FRONT_DISTANCE_FROM_TOWER = 5.6;
    private static readonly WALL_MIN_PAD_CLEARANCE = 1.6;
    private static readonly WALL_FORWARD_STEP = 1.25;
    private static readonly WALL_MAX_OVERLAP_FORWARD_STEPS = 10;
    private static readonly WALL_POSITION_CLAMP_MARGIN = 0.6;
    private static _hiddenPadNodesByLane: Record<RouteLane, Node[]> = {
        top: [],
        mid: [],
        bottom: [],
    };
    private static _midSectionBarricadePadNodes: Node[] = [];
    private static _laneUnlockListening: boolean = false;
    private static _lanePolylines: Record<RouteLane, Array<{ x: number; z: number }>> | null = null;
    private static readonly MID_SECTION_BARRICADE_PAD_INDEX_BY_LANE: Record<RouteLane, number> = {
        top: 9000,
        mid: 9001,
        bottom: 9002,
    };

    public static spawnPads(buildingContainer: Node, buildingManager: BuildingManager): void {
        this._hiddenPadNodesByLane = {
            top: [],
            mid: [],
            bottom: [],
        };
        this._midSectionBarricadePadNodes = [];

        const rawPadPositions = (GameConfig.BUILDING.PADS as ReadonlyArray<PadPlacement>) ?? [];
        const padPositions = this.resolveWallPadPlacements(rawPadPositions);
        const fallbackPrebuildTowerIndex = this.resolveFallbackPrebuildTowerIndex(padPositions);
        const initialPrebuiltPadIndex = this.resolveInitialPrebuiltPadIndex(
            padPositions,
            fallbackPrebuildTowerIndex
        );
        const initialVisiblePadIndexes =
            this.resolveInitialVisiblePadIndexes(initialPrebuiltPadIndex);
        if (fallbackPrebuildTowerIndex >= 0) {
            const fallback = padPositions[fallbackPrebuildTowerIndex];
            console.debug(
                `[BuildingPadSpawner] Fallback prebuild tower selected at (${fallback.x}, 0, ${fallback.z})`
            );
        }
        if (initialPrebuiltPadIndex >= 0) {
            const initial = padPositions[initialPrebuiltPadIndex];
            console.debug(
                `[BuildingPadSpawner] Initial prebuilt tower index=${initialPrebuiltPadIndex}, pos=(${initial.x}, 0, ${initial.z})`
            );
        } else {
            console.warn('[BuildingPadSpawner] No valid initial prebuilt tower index resolved.');
        }

        for (let index = 0; index < padPositions.length; index++) {
            const pos = padPositions[index];
            const angle = typeof pos.angle === 'number' ? pos.angle : 0;

            // Special handling for Spa: Pre-spawned, invalid interaction (no pad/upgrade)
            if (pos.type === 'spa') {
                BuildingFactory.createBuilding(
                    buildingContainer,
                    pos.x,
                    pos.z,
                    pos.type,
                    undefined,
                    angle
                );
                console.debug(
                    `[BuildingPadSpawner] Pre-spawned Static Spa at (${pos.x}, 0, ${pos.z}), angle=${angle}`
                );
                // No pad, no upgrade zone.
                continue;
            }

            const padNode = new Node(`BuildingPad_${pos.type}`);
            buildingContainer.addChild(padNode);
            padNode.setPosition(pos.x, 0, pos.z);
            if (Math.abs(angle) > 0.001) {
                padNode.setRotationFromEuler(0, angle, 0);
            }

            console.debug(
                `[BuildingPadSpawner] 创建建造点: type=${pos.type}, pos=(${pos.x}, 0, ${pos.z})`
            );

            const pad = padNode.addComponent(BuildingPad);
            pad.buildingTypeId = pos.type;
            if (typeof pos.overrideCost === 'number') {
                pad.overrideCost = pos.overrideCost;
            }
            if (this.PAD20_UNLOCK_TARGET_INDEXES.has(index)) {
                pad.overrideCost = this.PAD20_UNLOCK_TARGET_COST;
            }
            if (this.STAGE2_UNLOCK_TARGET_INDEXES.has(index)) {
                pad.overrideCost = this.STAGE2_UNLOCK_TARGET_COST;
            }
            if (index === initialPrebuiltPadIndex) {
                pad.overrideCost = this.INITIAL_PREBUILT_REBUILD_COST;
            }
            if (index === this.INITIAL_BUILD_COST_PAD_INDEX) {
                pad.overrideCost = this.INITIAL_BUILD_COST;
            }

            buildingManager.registerPad(pad, index);
            this.applyLockedLanePadVisibility(padNode, pos.type, pos.x, pos.z);

            // 初始阶段仅开放 20/21 号板子，其它全部隐藏等待后续解锁。
            const isInitiallyVisiblePad = initialVisiblePadIndexes.has(index);
            if (!isInitiallyVisiblePad) {
                padNode.active = false;
            }

            const shouldForceBuildable = this.isForceBuildablePadIndex(index);
            const shouldForcePrebuild = index === initialPrebuiltPadIndex;
            const shouldPrebuild =
                shouldForcePrebuild ||
                (!shouldForceBuildable &&
                    (pos.prebuild === true ||
                        this.PREBUILT_LEVEL1_TYPES.has(pos.type) ||
                        index === fallbackPrebuildTowerIndex));
            if (!shouldPrebuild) {
                continue;
            }

            const buildingNode = BuildingFactory.createBuilding(
                buildingContainer,
                pos.x,
                pos.z,
                pos.type,
                buildingManager.unitContainer ?? undefined,
                angle
            );

            if (!buildingNode) {
                console.warn(
                    `[BuildingPadSpawner] Failed to prebuild ${pos.type} at (${pos.x}, 0, ${pos.z})`
                );
                continue;
            }
            if (index !== initialPrebuiltPadIndex && pos.type !== 'spa') {
                buildingNode.active = false;
            }

            const building = buildingNode.getComponent(Building);
            if (!building) {
                console.warn(
                    `[BuildingPadSpawner] Missing Building component on prebuilt ${pos.type} node.`
                );
                continue;
            }

            const nextUpgradeCost = this.resolveInitialUpgradeCost();
            pad.initForExistingBuilding(building, nextUpgradeCost);
            // Keep new-game prebuilt layout consistent with continue-game restore:
            // all existing buildings should place their upgrade pad in front.
            pad.placeUpgradeZoneInFront(buildingNode, true);

            // Globally hide all upgrade pads initially for prebuilt buildings
            padNode.active = false;

            console.debug(
                `[BuildingPadSpawner] Prebuilt level-1 ${pos.type} at (${pos.x}, 0, ${pos.z}), next upgrade cost=${nextUpgradeCost}`
            );
        }

        console.debug(
            `[BuildingPadSpawner] 创建了 ${padPositions.length} 个建造点, 父节点: ${buildingContainer.name}`
        );

        // Mid-section barricades now use build pads and are revealed together
        // only after bottom lane unlocks.
        this.spawnMidSectionBarricadePads(buildingContainer, buildingManager, padPositions);

        buildingManager.refreshUpgradePadVisibilityGate();
        this.ensureLaneUnlockListener();
    }

    private static spawnMidSectionBarricadePads(
        buildingContainer: Node,
        buildingManager: BuildingManager,
        pads: ReadonlyArray<PadPlacement>
    ): void {
        for (const lane of ['top', 'mid', 'bottom'] as const) {
            const placement = this.resolveMidSectionBarricadePlacement(pads, lane);
            if (!placement) continue;

            const padNode = new Node(`BuildingPad_wall_mid_section_${lane}`);
            buildingContainer.addChild(padNode);
            padNode.setPosition(placement.x, 0, placement.z);
            if (Math.abs(placement.angle) > 0.001) {
                padNode.setRotationFromEuler(0, placement.angle, 0);
            }

            const pad = padNode.addComponent(BuildingPad);
            pad.buildingTypeId = 'wall';
            const runtimeIndex = this.MID_SECTION_BARRICADE_PAD_INDEX_BY_LANE[lane];
            buildingManager.registerPad(pad, runtimeIndex);

            // Reveal all three pads together only when bottom lane unlocks.
            padNode.active = false;
            this._midSectionBarricadePadNodes.push(padNode);

            console.debug(
                `[BuildingPadSpawner] ${lane.toUpperCase()} MID-SECTION BARRICADE PAD prepared at ` +
                    `(${placement.x}, 0, ${placement.z}), angle=${placement.angle}, runtimeIndex=${runtimeIndex}`
            );
        }
    }

    private static resolveMidSectionBarricadePlacement(
        pads: ReadonlyArray<PadPlacement>,
        lane: RouteLane
    ): { x: number; z: number; angle: number } | null {
        let anchorX = 0;
        let anchorZ = 0;
        let row2CenterX = 0;
        let row2CenterZ = 0;
        let row3CenterX = 0;
        let row3CenterZ = 0;

        if (lane === 'mid') {
            // Collect mid-lane towers split by side (upper = angle ≈ -45, lower = angle ≈ 135).
            const upperTowers: Array<{ x: number; z: number }> = [];
            const lowerTowers: Array<{ x: number; z: number }> = [];
            for (const pad of pads) {
                if (!this.TOWER_PAD_TYPES.has(pad.type)) continue;
                if (this.resolveLaneByNearestPath(pad.x, pad.z) !== 'mid') continue;

                const angle = pad.angle ?? 0;
                if (Math.abs(angle - -45) < 1) {
                    upperTowers.push({ x: pad.x, z: pad.z });
                } else if (Math.abs(angle - 135) < 1) {
                    lowerTowers.push({ x: pad.x, z: pad.z });
                }
            }

            // Sort by lane progress (x+z ascending = closer to base on the 45° diagonal).
            const byLaneProgress = (a: { x: number; z: number }, b: { x: number; z: number }) =>
                a.x + a.z - (b.x + b.z);
            upperTowers.sort(byLaneProgress);
            lowerTowers.sort(byLaneProgress);

            if (upperTowers.length < 3 || lowerTowers.length < 3) {
                console.warn(
                    '[BuildingPadSpawner] Not enough mid-lane towers for mid-section barricade pad'
                );
                return null;
            }

            // Row 2/3 center = midpoint of upper/lower towers on the same row.
            row2CenterX = (upperTowers[1].x + lowerTowers[1].x) / 2;
            row2CenterZ = (upperTowers[1].z + lowerTowers[1].z) / 2;
            row3CenterX = (upperTowers[2].x + lowerTowers[2].x) / 2;
            row3CenterZ = (upperTowers[2].z + lowerTowers[2].z) / 2;
            anchorX = this.round2((row2CenterX + row3CenterX) / 2);
            anchorZ = this.round2((row2CenterZ + row3CenterZ) / 2);
        } else {
            // Top/Bottom lane: use row-2 & row-3 tower midpoint directly.
            const laneTowers: Array<{ x: number; z: number }> = [];
            for (const pad of pads) {
                if (!this.TOWER_PAD_TYPES.has(pad.type)) continue;
                if (this.resolveLaneByNearestPath(pad.x, pad.z) !== lane) continue;
                laneTowers.push({ x: pad.x, z: pad.z });
            }

            // Keep the same progression rule as mid-lane (x+z ascending = closer to base).
            laneTowers.sort((a, b) => a.x + a.z - (b.x + b.z));
            if (laneTowers.length < 3) {
                console.warn(
                    `[BuildingPadSpawner] Not enough ${lane}-lane towers for mid-section barricade pad`
                );
                return null;
            }

            row2CenterX = laneTowers[1].x;
            row2CenterZ = laneTowers[1].z;
            row3CenterX = laneTowers[2].x;
            row3CenterZ = laneTowers[2].z;
            anchorX = this.round2((row2CenterX + row3CenterX) / 2);
            anchorZ = this.round2((row2CenterZ + row3CenterZ) / 2);
        }

        const laneFrontWall = pads.find(
            p => p.type === 'wall' && this.resolveLaneByNearestPath(p.x, p.z) === lane
        );
        // Top/Bottom lanes should share the same boundary alignment as the original front wall.
        // Keep progress-center anchor, only snap the boundary-facing axis to the lane front wall.
        if (laneFrontWall) {
            if (lane === 'top') {
                anchorZ = this.round2(laneFrontWall.z);
            } else if (lane === 'bottom') {
                anchorX = this.round2(laneFrontWall.x);
            }
        }
        const fallbackAngleByLane: Record<RouteLane, number> = {
            top: 90,
            mid: 45,
            bottom: 0,
        };
        const angle =
            typeof laneFrontWall?.angle === 'number'
                ? laneFrontWall.angle
                : fallbackAngleByLane[lane];
        console.debug(
            `[BuildingPadSpawner] ${lane.toUpperCase()} MID-SECTION BARRICADE anchor resolved: ` +
                `(${anchorX}, 0, ${anchorZ}), angle=${angle}` +
                ` | row2Center=(${this.round2(row2CenterX)}, ${this.round2(row2CenterZ)})` +
                ` | row3Center=(${this.round2(row3CenterX)}, ${this.round2(row3CenterZ)})`
        );
        return { x: anchorX, z: anchorZ, angle };
    }

    private static resolveWallPadPlacements(
        pads: ReadonlyArray<PadPlacement>
    ): Array<PadPlacement> {
        const resolved = pads.map(pad => ({ ...pad }));
        const halfW =
            Math.max(1, GameConfig.MAP.LIMITS.x) - BuildingPadSpawner.WALL_POSITION_CLAMP_MARGIN;
        const halfH =
            Math.max(1, GameConfig.MAP.LIMITS.z) - BuildingPadSpawner.WALL_POSITION_CLAMP_MARGIN;

        for (let index = 0; index < resolved.length; index++) {
            const wallPad = resolved[index];
            if (wallPad.type !== 'wall') continue;

            const lane = this.resolveLaneByNearestPath(wallPad.x, wallPad.z);
            const nearestTower = this.findNearestTowerPadOnLane(
                resolved,
                lane,
                wallPad.x,
                wallPad.z
            );
            if (!nearestTower) continue;

            const forward = this.resolveLaneForwardDirection(lane, wallPad.x, wallPad.z);
            if (!forward) continue;

            const toWallX = wallPad.x - nearestTower.x;
            const toWallZ = wallPad.z - nearestTower.z;
            const aheadDistance = toWallX * forward.x + toWallZ * forward.z;
            const shiftDistance = Math.max(0, this.WALL_FRONT_DISTANCE_FROM_TOWER - aheadDistance);

            let targetX = wallPad.x + forward.x * shiftDistance;
            let targetZ = wallPad.z + forward.z * shiftDistance;

            let guard = 0;
            while (
                guard < this.WALL_MAX_OVERLAP_FORWARD_STEPS &&
                this.hasPadOverlap(resolved, index, targetX, targetZ, this.WALL_MIN_PAD_CLEARANCE)
            ) {
                targetX += forward.x * this.WALL_FORWARD_STEP;
                targetZ += forward.z * this.WALL_FORWARD_STEP;
                guard += 1;
            }

            targetX = Math.max(-halfW, Math.min(halfW, targetX));
            targetZ = Math.max(-halfH, Math.min(halfH, targetZ));

            const movedDistance = Math.hypot(targetX - wallPad.x, targetZ - wallPad.z);
            if (movedDistance <= 0.01) continue;

            const source = pads[index];
            wallPad.x = this.round2(targetX);
            wallPad.z = this.round2(targetZ);

            console.debug(
                `[BuildingPadSpawner] Shifted wall pad index=${index}, lane=${lane}, ` +
                    `from=(${source?.x ?? wallPad.x}, ${source?.z ?? wallPad.z}), ` +
                    `to=(${wallPad.x}, ${wallPad.z})`
            );
        }

        return resolved;
    }

    private static findNearestTowerPadOnLane(
        pads: ReadonlyArray<PadPlacement>,
        lane: RouteLane,
        x: number,
        z: number
    ): { x: number; z: number } | null {
        let nearest: { x: number; z: number } | null = null;
        let nearestDistSq = Number.POSITIVE_INFINITY;

        for (const pad of pads) {
            if (!this.TOWER_PAD_TYPES.has(pad.type)) continue;
            if (this.resolveLaneByNearestPath(pad.x, pad.z) !== lane) continue;

            const dx = pad.x - x;
            const dz = pad.z - z;
            const distSq = dx * dx + dz * dz;
            if (distSq >= nearestDistSq) continue;

            nearestDistSq = distSq;
            nearest = { x: pad.x, z: pad.z };
        }

        return nearest;
    }

    private static resolveLaneForwardDirection(
        lane: RouteLane,
        x: number,
        z: number
    ): { x: number; z: number } | null {
        const polyline = this.getLanePolylinesWorld()[lane];
        if (!polyline || polyline.length < 2) return null;

        let bestDirection: { x: number; z: number } | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < polyline.length - 1; i++) {
            const a = polyline[i];
            const b = polyline[i + 1];
            const segmentDx = b.x - a.x;
            const segmentDz = b.z - a.z;
            const segmentLen = Math.hypot(segmentDx, segmentDz);
            if (segmentLen <= 0.0001) continue;

            const distance = this.pointToSegmentDistance(x, z, a, b);
            if (distance >= bestDistance) continue;

            bestDistance = distance;
            bestDirection = {
                x: segmentDx / segmentLen,
                z: segmentDz / segmentLen,
            };
        }

        if (bestDirection) {
            return bestDirection;
        }

        const start = polyline[0];
        const end = polyline[polyline.length - 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const len = Math.hypot(dx, dz);
        if (len <= 0.0001) return null;

        return {
            x: dx / len,
            z: dz / len,
        };
    }

    private static hasPadOverlap(
        pads: ReadonlyArray<PadPlacement>,
        ignoreIndex: number,
        x: number,
        z: number,
        minDistance: number
    ): boolean {
        const minDistSq = minDistance * minDistance;
        for (let i = 0; i < pads.length; i++) {
            if (i === ignoreIndex) continue;
            const dx = pads[i].x - x;
            const dz = pads[i].z - z;
            if (dx * dx + dz * dz < minDistSq) {
                return true;
            }
        }
        return false;
    }

    private static round2(value: number): number {
        return Math.round(value * 100) / 100;
    }

    private static get buildingRegistry(): BuildingRegistry {
        return BuildingRegistry.instance;
    }

    private static applyLockedLanePadVisibility(
        padNode: Node,
        type: string,
        x: number,
        z: number
    ): void {
        if (!this.LOCKED_LANE_PAD_TYPES.has(type)) return;

        const lane = this.resolveLaneByNearestPath(x, z);
        if (lane === 'mid') return;

        padNode.active = false;
        this._hiddenPadNodesByLane[lane].push(padNode);
    }

    private static ensureLaneUnlockListener(): void {
        if (this._laneUnlockListening) return;
        this.eventManager.on(GameEvents.LANE_UNLOCKED, this.onLaneUnlocked, this);
        this._laneUnlockListening = true;
    }

    private static onLaneUnlocked(data: { lane: 'top' | 'mid' | 'bottom' }): void {
        const nodes = this._hiddenPadNodesByLane[data.lane];
        if (nodes && nodes.length > 0) {
            for (const node of nodes) {
                if (!node || !node.isValid) continue;
                node.active = true;
            }
            this._hiddenPadNodesByLane[data.lane] = [];
        }

        // Bottom lane unlock is the reveal timing for all 3 mid-section barricade pads.
        if (data.lane === 'bottom' && this._midSectionBarricadePadNodes.length > 0) {
            for (const padNode of this._midSectionBarricadePadNodes) {
                if (!padNode || !padNode.isValid) continue;
                padNode.active = true;
            }
            this._midSectionBarricadePadNodes = [];
        }

        BuildingManager.instance.refreshUpgradePadVisibilityGate();
    }

    private static resolveLaneByNearestPath(x: number, z: number): RouteLane {
        const polylines = this.getLanePolylinesWorld();
        let bestLane: RouteLane = 'mid';
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const lane of ['mid', 'top', 'bottom'] as const) {
            const distance = this.pointToPolylineDistance(x, z, polylines[lane]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestLane = lane;
            }
        }

        return bestLane;
    }

    private static resolveFallbackPrebuildTowerIndex(pads: ReadonlyArray<PadPlacement>): number {
        const hasExplicitTowerPrebuild = pads.some(
            pad => pad.type === 'tower' && pad.prebuild === true
        );
        if (hasExplicitTowerPrebuild) {
            return -1;
        }

        const polylines = this.getLanePolylinesWorld();
        const baseX = GameConfig.MAP.BASE_SPAWN.x;
        const baseZ = GameConfig.MAP.BASE_SPAWN.z;

        const candidates: Array<{ index: number; distanceToBase: number }> = [];

        for (let index = 0; index < pads.length; index++) {
            const pad = pads[index];
            if (pad.type !== 'tower') continue;

            const lane = this.resolveLaneByNearestPath(pad.x, pad.z);
            if (lane !== 'mid') continue;

            // "靠近上路侧"：到上路中心线距离更近。
            const topDistance = this.pointToPolylineDistance(pad.x, pad.z, polylines.top);
            const bottomDistance = this.pointToPolylineDistance(pad.x, pad.z, polylines.bottom);
            if (topDistance >= bottomDistance) continue;

            // 先收集该侧中路机枪塔，再按离基地距离排序选第 3 个。
            const distanceToBase = Math.hypot(pad.x - baseX, pad.z - baseZ);
            candidates.push({ index, distanceToBase });
        }

        if (candidates.length <= 0) {
            return -1;
        }

        candidates.sort((a, b) => a.distanceToBase - b.distanceToBase);
        // Fallback default: mid-lane upper-side third tower (index 2 after sorting from base).
        const targetSlot = Math.min(2, candidates.length - 1);
        return candidates[targetSlot].index;
    }

    private static resolveInitialVisiblePadIndexes(initialPrebuiltPadIndex: number): Set<number> {
        const indexes = new Set<number>([this.INITIAL_BUILD_COST_PAD_INDEX]);
        if (initialPrebuiltPadIndex >= 0) {
            indexes.add(initialPrebuiltPadIndex);
        }
        return indexes;
    }

    private static resolveInitialPrebuiltPadIndex(
        pads: ReadonlyArray<PadPlacement>,
        fallbackPrebuildTowerIndex: number
    ): number {
        const hintedIndex = this.INITIAL_PREBUILT_PAD_INDEX_HINT;
        if (
            hintedIndex >= 0 &&
            hintedIndex < pads.length &&
            pads[hintedIndex]?.type === 'tower' &&
            !this.isForceBuildablePadIndex(hintedIndex)
        ) {
            return hintedIndex;
        }

        const buildPad = pads[this.INITIAL_BUILD_COST_PAD_INDEX];
        const explicitPrebuildTowers: number[] = [];
        for (let index = 0; index < pads.length; index++) {
            const pad = pads[index];
            if (pad.type === 'tower' && pad.prebuild === true) {
                explicitPrebuildTowers.push(index);
            }
        }
        if (explicitPrebuildTowers.length > 0) {
            explicitPrebuildTowers.sort((a, b) => {
                const padA = pads[a];
                const padB = pads[b];
                const laneA = this.resolveLaneByNearestPath(padA.x, padA.z);
                const laneB = this.resolveLaneByNearestPath(padB.x, padB.z);
                const laneWeightA = laneA === 'mid' ? 0 : 1;
                const laneWeightB = laneB === 'mid' ? 0 : 1;
                if (laneWeightA !== laneWeightB) return laneWeightA - laneWeightB;

                if (buildPad) {
                    const distA = Math.hypot(padA.x - buildPad.x, padA.z - buildPad.z);
                    const distB = Math.hypot(padB.x - buildPad.x, padB.z - buildPad.z);
                    if (Math.abs(distA - distB) > 1e-4) return distA - distB;
                }
                return a - b;
            });
            return explicitPrebuildTowers[0];
        }

        if (
            fallbackPrebuildTowerIndex >= 0 &&
            fallbackPrebuildTowerIndex < pads.length &&
            pads[fallbackPrebuildTowerIndex]?.type === 'tower'
        ) {
            return fallbackPrebuildTowerIndex;
        }

        for (let index = 0; index < pads.length; index++) {
            if (pads[index]?.type !== 'tower') continue;
            if (this.isForceBuildablePadIndex(index)) continue;
            return index;
        }

        return -1;
    }

    private static resolveInitialUpgradeCost(): number {
        const unifiedStart = GameConfig.BUILDING.UPGRADE_COST?.START_COST;
        if (typeof unifiedStart === 'number' && Number.isFinite(unifiedStart)) {
            return unifiedStart;
        }

        const legacyStart = GameConfig.BUILDING.BASE_UPGRADE?.START_COST;
        if (typeof legacyStart === 'number' && Number.isFinite(legacyStart)) {
            return legacyStart;
        }

        return 20;
    }

    private static isForceBuildablePadIndex(index: number): boolean {
        return (
            index === this.INITIAL_BUILD_COST_PAD_INDEX ||
            this.PAD20_UNLOCK_TARGET_INDEXES.has(index) ||
            this.STAGE2_UNLOCK_TARGET_INDEXES.has(index)
        );
    }

    private static getLanePolylinesWorld(): Record<RouteLane, Array<{ x: number; z: number }>> {
        if (this._lanePolylines) {
            return this._lanePolylines;
        }

        const halfW = Math.max(1, GameConfig.MAP.LIMITS.x);
        const halfH = Math.max(1, GameConfig.MAP.LIMITS.z);
        const laneNormalizedToWorld = (nx: number, nz: number): { x: number; z: number } => ({
            x: nx * (halfW * 2) - halfW,
            z: (1 - nz) * (halfH * 2) - halfH,
        });

        this._lanePolylines = {
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

        return this._lanePolylines;
    }

    private static pointToPolylineDistance(
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
            const distance = this.pointToSegmentDistance(x, z, polyline[i], polyline[i + 1]);
            if (distance < best) {
                best = distance;
            }
        }
        return best;
    }

    private static pointToSegmentDistance(
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

    private static get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
