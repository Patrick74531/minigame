import {
    Billboard,
    Color,
    Label,
    LabelOutline,
    LabelShadow,
    Node,
    RenderRoot2D,
    UITransform,
} from 'cc';
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

/**
 * BuildingPadSpawner
 * 负责根据配置生成建造点，减少 GameController 胶水逻辑
 */
export class BuildingPadSpawner {
    private static readonly PREBUILT_LEVEL1_TYPES = new Set(['barracks', 'farm']);
    private static readonly SHOW_HIDDEN_PAD_INDEX_MARKERS = true;
    private static readonly HIDDEN_PAD_INDEX_MARKER_Y = 2.9;
    private static readonly INITIAL_VISIBLE_PAD_INDEXES = new Set([20, 21]);
    private static readonly INITIAL_PREBUILT_PAD_INDEX = 21;
    private static readonly INITIAL_PREBUILT_REBUILD_COST = 10;
    private static readonly INITIAL_BUILD_COST_PAD_INDEX = 20;
    private static readonly INITIAL_BUILD_COST = 10;
    private static readonly PAD20_UNLOCK_TARGET_INDEXES = new Set([1, 18, 19]);
    private static readonly PAD20_UNLOCK_TARGET_COST = 20;
    private static readonly STAGE2_UNLOCK_TARGET_INDEXES = new Set([14, 15, 16, 17]);
    private static readonly STAGE2_UNLOCK_TARGET_COST = 40;
    private static readonly LOCKED_LANE_PAD_TYPES = new Set([
        'tower',
        'frost_tower',
        'lightning_tower',
        'wall',
    ]);
    private static _hiddenPadNodesByLane: Record<RouteLane, Node[]> = {
        top: [],
        mid: [],
        bottom: [],
    };
    private static _laneUnlockListening: boolean = false;
    private static _lanePolylines: Record<RouteLane, Array<{ x: number; z: number }>> | null = null;

    public static spawnPads(buildingContainer: Node, buildingManager: BuildingManager): void {
        this._hiddenPadNodesByLane = {
            top: [],
            mid: [],
            bottom: [],
        };

        const padPositions =
            (GameConfig.BUILDING.PADS as ReadonlyArray<{
                type: string;
                x: number;
                z: number;
                angle?: number;
                prebuild?: boolean;
                overrideCost?: number;
            }>) ?? [];
        const fallbackPrebuildTowerIndex = this.resolveFallbackPrebuildTowerIndex(padPositions);
        if (fallbackPrebuildTowerIndex >= 0) {
            const fallback = padPositions[fallbackPrebuildTowerIndex];
            console.log(
                `[BuildingPadSpawner] Fallback prebuild tower selected at (${fallback.x}, 0, ${fallback.z})`
            );
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
                console.log(
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

            console.log(
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
            if (index === this.INITIAL_PREBUILT_PAD_INDEX) {
                pad.overrideCost = this.INITIAL_PREBUILT_REBUILD_COST;
            }
            if (index === this.INITIAL_BUILD_COST_PAD_INDEX) {
                pad.overrideCost = this.INITIAL_BUILD_COST;
            }

            const lane = this.resolveLaneByNearestPath(pos.x, pos.z);
            if (lane === 'mid') {
                pad.padIndex = index;
            }

            buildingManager.registerPad(pad, index);
            this.applyLockedLanePadVisibility(padNode, pos.type, pos.x, pos.z);

            // 初始阶段仅开放 20/21 号板子，其它全部隐藏等待后续解锁。
            const isInitiallyVisiblePad = this.INITIAL_VISIBLE_PAD_INDEXES.has(index);
            if (!isInitiallyVisiblePad) {
                padNode.active = false;
            }
            if (this.SHOW_HIDDEN_PAD_INDEX_MARKERS && !isInitiallyVisiblePad) {
                this.createHiddenPadIndexMarker(buildingContainer, index, pos.x, pos.z);
            }

            const shouldForceBuildable =
                index === this.INITIAL_BUILD_COST_PAD_INDEX ||
                this.PAD20_UNLOCK_TARGET_INDEXES.has(index) ||
                this.STAGE2_UNLOCK_TARGET_INDEXES.has(index);
            const shouldForcePrebuild = index === this.INITIAL_PREBUILT_PAD_INDEX;
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
            if (index !== this.INITIAL_PREBUILT_PAD_INDEX && pos.type !== 'spa') {
                buildingNode.active = false;
            }

            const building = buildingNode.getComponent(Building);
            if (!building) {
                console.warn(
                    `[BuildingPadSpawner] Missing Building component on prebuilt ${pos.type} node.`
                );
                continue;
            }

            const baseCost = this.buildingRegistry.get(pos.type)?.cost ?? 0;
            const nextUpgradeCost = Math.ceil(baseCost * building.upgradeCostMultiplier);
            pad.initForExistingBuilding(building, nextUpgradeCost);

            // Globally hide all upgrade pads initially for prebuilt buildings
            padNode.active = false;

            console.log(
                `[BuildingPadSpawner] Prebuilt level-1 ${pos.type} at (${pos.x}, 0, ${pos.z}), next upgrade cost=${nextUpgradeCost}`
            );
        }

        console.log(
            `[BuildingPadSpawner] 创建了 ${padPositions.length} 个建造点, 父节点: ${buildingContainer.name}`
        );

        buildingManager.refreshUpgradePadVisibilityGate();
        this.ensureLaneUnlockListener();
    }

    private static get buildingRegistry(): BuildingRegistry {
        return BuildingRegistry.instance;
    }

    private static createHiddenPadIndexMarker(
        parent: Node,
        index: number,
        x: number,
        z: number
    ): void {
        const markerRoot = new Node(`HiddenPadIndex_${index}`);
        parent.addChild(markerRoot);
        markerRoot.setPosition(x, this.HIDDEN_PAD_INDEX_MARKER_Y, z);
        markerRoot.addComponent(RenderRoot2D);
        markerRoot.addComponent(Billboard);
        markerRoot.setScale(0.012, 0.012, 0.012);

        const labelNode = new Node('Label');
        markerRoot.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(260, 100);

        const label = labelNode.addComponent(Label);
        label.string = `${index}`;
        label.fontSize = 82;
        label.lineHeight = 86;
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 216, 92, 255);

        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(0, 0, 0, 255);
        outline.width = 5;

        const shadow = labelNode.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 210);
        shadow.offset.set(3, -3);
        shadow.blur = 2;
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
        if (!nodes || nodes.length <= 0) return;

        for (const node of nodes) {
            if (!node || !node.isValid) continue;
            node.active = true;
        }
        this._hiddenPadNodesByLane[data.lane] = [];
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

    private static resolveFallbackPrebuildTowerIndex(
        pads: ReadonlyArray<{
            type: string;
            x: number;
            z: number;
            prebuild?: boolean;
        }>
    ): number {
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
