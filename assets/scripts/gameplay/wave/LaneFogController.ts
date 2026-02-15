import {
    Color,
    EffectAsset,
    Material,
    Mesh,
    MeshRenderer,
    Node,
    primitives,
    resources,
    Texture2D,
    Tween,
    tween,
    utils,
    Vec4,
} from 'cc';
import { GameConfig } from '../../data/GameConfig';
import type { LaneDirection2D, RouteLane } from './WaveLaneRouting';
import { ROUTE_LANE_SEQUENCE } from './WaveLaneRouting';
import type { SpawnPortalPoint } from './WaveSpawnPortals';

type TowerPadPoint = {
    x: number;
    z: number;
    dist: number;
};

type ConfigPad = {
    x: number;
    z: number;
    type: string;
};

type LaneFogRuntime = {
    root: Node;
    layers: Array<{
        material: Material;
        baseOpacity: number;
        timeOffset: number;
        moteStrength: number;
    }>;
    fadeState: { factor: number };
    time: number;
};

type FogLayerSpec = {
    name: string;
    y: number;
    technique: number;
    opacityScale: number;
    widthScale: number;
    flowScale: number;
    noiseScale: number;
    timeOffset: number;
    moteScale: number;
};

const FOG_EFFECT_PATH = 'shaders/fog-mask';
const FOG_TEX_PRIMARY = 'textures/fog';
const FOG_TEX_SECONDARY = 'textures/fog';

const START_AFTER_FIRST_TOWER_MID = 2.8;
const START_AFTER_FIRST_TOWER_SIDE = 0;
const SAMPLE_STEP = 2.2;
const MAX_LANE_POINTS = 10;

const LANE_INNER_WIDTH = 8.4;
const LANE_OUTER_WIDTH = 18.6;
const LANE_NOISE_WARP = 2.4;
const ALPHA_NOISE_LOW = 0.24;
const ALPHA_NOISE_HIGH = 0.8;
const MOTE_STRENGTH = 0.2;
const BASE_CLEAR_RADIUS = 11.2;
const BASE_CLEAR_FEATHER = 4.8;

const MAP_PADDING = 1.5;
const FOG_LAYER_SPECS: ReadonlyArray<FogLayerSpec> = [
    {
        name: 'ground',
        y: 0.16,
        technique: 0,
        opacityScale: 1.0,
        widthScale: 1.0,
        flowScale: 1.0,
        noiseScale: 1.0,
        timeOffset: 0,
        moteScale: 1.0,
    },
    {
        name: 'midVolume',
        y: 1.55,
        technique: 1,
        opacityScale: 0.62,
        widthScale: 1.18,
        flowScale: 0.84,
        noiseScale: 1.22,
        timeOffset: 1.7,
        moteScale: 0.82,
    },
    {
        name: 'highVolume',
        y: 3.0,
        technique: 1,
        opacityScale: 0.44,
        widthScale: 1.38,
        flowScale: 0.72,
        noiseScale: 1.36,
        timeOffset: 3.3,
        moteScale: 0.68,
    },
];

const TOWER_TYPES = new Set(['tower', 'frost_tower', 'lightning_tower']);

export class LaneFogController {
    private _root: Node | null = null;
    private _fogMesh: Mesh | null = null;
    private _disposed: boolean = false;
    private _baseX: number = 0;
    private _baseZ: number = 0;

    private _portalByLane: Record<RouteLane, SpawnPortalPoint> = {
        top: { x: 0, y: 0 },
        mid: { x: 0, y: 0 },
        bottom: { x: 0, y: 0 },
    };
    private _directionByLane: Record<RouteLane, LaneDirection2D> = {
        top: { x: 1, y: 0 },
        mid: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
        bottom: { x: 0, y: 1 },
    };

    private _blockedLanes: Set<RouteLane> = new Set();
    private _laneRuntimes: Map<RouteLane, LaneFogRuntime> = new Map();
    private _lanePolylines: Record<RouteLane, Array<{ x: number; z: number }>> = {
        top: [],
        mid: [],
        bottom: [],
    };
    private _towerByLane: Record<RouteLane, TowerPadPoint[]> = {
        top: [],
        mid: [],
        bottom: [],
    };

    private _fogEffect: EffectAsset | null = null;
    private _fogTexA: Texture2D | null = null;
    private _fogTexB: Texture2D | null = null;

    public initialize(
        baseNode: Node,
        portalIndexByLane: Record<RouteLane, number>,
        portals: SpawnPortalPoint[],
        directionByLane: Record<RouteLane, LaneDirection2D>,
        unlockedLanes: ReadonlySet<RouteLane>
    ): void {
        this.cleanup();

        this._disposed = false;
        this._baseX = baseNode.position.x;
        this._baseZ = baseNode.position.z;
        this._directionByLane = directionByLane;

        this._portalByLane = {
            top: portals[portalIndexByLane.top] ?? { x: this._baseX + 8, y: this._baseZ },
            mid: portals[portalIndexByLane.mid] ?? { x: this._baseX + 6, y: this._baseZ + 6 },
            bottom: portals[portalIndexByLane.bottom] ?? { x: this._baseX, y: this._baseZ + 8 },
        };

        this._blockedLanes.clear();
        for (const lane of ROUTE_LANE_SEQUENCE) {
            if (!unlockedLanes.has(lane)) {
                this._blockedLanes.add(lane);
            }
        }

        this._lanePolylines = this.getLanePolylinesWorld();
        this._towerByLane = this.collectTowerPadsByLane();

        const scene = baseNode.scene;
        if (!scene) return;

        const root = new Node('LaneFogRoot');
        root.layer = baseNode.layer;
        scene.addChild(root);
        this._root = root;

        void this.prepareAssetsAndBuild();
    }

    public unlockLane(lane: RouteLane): void {
        this._blockedLanes.delete(lane);
        this.hideLaneFog(lane);
    }

    public tick(dt: number): void {
        for (const runtime of this._laneRuntimes.values()) {
            runtime.time += dt;
            for (const layer of runtime.layers) {
                layer.material.setProperty('time', runtime.time + layer.timeOffset);
            }
        }
    }

    public cleanup(): void {
        this._disposed = true;
        this._blockedLanes.clear();

        for (const runtime of this._laneRuntimes.values()) {
            Tween.stopAllByTarget(runtime.fadeState);
            if (runtime.root.isValid) {
                runtime.root.destroy();
            }
        }
        this._laneRuntimes.clear();

        if (this._root && this._root.isValid) {
            this._root.destroy();
        }
        this._root = null;

        this._fogEffect = null;
        this._fogTexA = null;
        this._fogTexB = null;
    }

    private async prepareAssetsAndBuild(): Promise<void> {
        const [effect, texA, texB] = await Promise.all([
            this.loadEffectAsset(FOG_EFFECT_PATH),
            this.loadTexture(FOG_TEX_PRIMARY),
            this.loadTexture(FOG_TEX_SECONDARY),
        ]);

        if (this._disposed || !this._root || !this._root.isValid || !effect) {
            return;
        }

        this._fogEffect = effect;
        this._fogTexA = texA ?? texB;
        this._fogTexB = texB ?? texA;

        if (this._fogTexA) this.setTextureRepeat(this._fogTexA);
        if (this._fogTexB) this.setTextureRepeat(this._fogTexB);

        this.buildBlockedLaneFog();
    }

    private buildBlockedLaneFog(): void {
        for (const lane of this._blockedLanes) {
            this.ensureLaneFog(lane);
        }
    }

    private ensureLaneFog(lane: RouteLane): void {
        if (!this._root || !this._root.isValid || !this._fogEffect) return;
        if (this._laneRuntimes.has(lane)) return;

        const lanePath = this.buildFogPath(lane);
        if (lanePath.length < 2) return;

        const laneRoot = new Node(`Fog_${lane}`);
        laneRoot.layer = this._root.layer;
        this._root.addChild(laneRoot);

        const runtimeLayers = this.createLaneFogLayers(laneRoot, lane, lanePath);
        if (runtimeLayers.length <= 0) {
            laneRoot.destroy();
            return;
        }

        const runtime: LaneFogRuntime = {
            root: laneRoot,
            layers: runtimeLayers,
            fadeState: { factor: 1 },
            time: Math.random() * 9.0,
        };
        this.applyOpacity(runtime, 1);
        for (const layer of runtime.layers) {
            layer.material.setProperty('time', runtime.time + layer.timeOffset);
        }

        this._laneRuntimes.set(lane, runtime);
    }

    private hideLaneFog(lane: RouteLane): void {
        const runtime = this._laneRuntimes.get(lane);
        if (!runtime) return;

        Tween.stopAllByTarget(runtime.fadeState);
        tween(runtime.fadeState)
            .to(
                0.82,
                {
                    factor: 0,
                },
                {
                    onUpdate: () => this.applyOpacity(runtime, runtime.fadeState.factor),
                }
            )
            .call(() => {
                if (runtime.root.isValid) runtime.root.destroy();
            })
            .start();

        this._laneRuntimes.delete(lane);
    }

    private createLaneMaterial(
        lane: RouteLane,
        lanePath: Array<{ x: number; z: number }>,
        spec: FogLayerSpec
    ): Material | null {
        if (!this._fogEffect) return null;

        const material = new Material();
        material.initialize({ effectAsset: this._fogEffect, technique: spec.technique });

        if (this._fogTexA) material.setProperty('fogTexA', this._fogTexA);
        if (this._fogTexB) material.setProperty('fogTexB', this._fogTexB);

        const tint = this.resolveLaneTint(lane);
        material.setProperty('tintColor', tint);

        const flowSeed = lane === 'top' ? 0.19 : lane === 'mid' ? 0.52 : 0.83;
        material.setProperty(
            'flowA',
            new Vec4(
                (0.16 + flowSeed * 0.08) * spec.flowScale,
                (0.15 + flowSeed * 0.07) * spec.flowScale,
                0.012 + flowSeed * 0.007,
                0.004 + flowSeed * 0.004
            )
        );
        material.setProperty(
            'flowB',
            new Vec4(
                (0.34 + flowSeed * 0.11) * spec.flowScale,
                (0.3 + flowSeed * 0.09) * spec.flowScale,
                -(0.009 + flowSeed * 0.006),
                0.006 + flowSeed * 0.004
            )
        );

        material.setProperty(
            'laneWidth',
            new Vec4(
                LANE_INNER_WIDTH * spec.widthScale,
                LANE_OUTER_WIDTH * spec.widthScale,
                LANE_NOISE_WARP,
                0
            )
        );
        material.setProperty(
            'alphaParams',
            new Vec4(
                this.resolveLaneBaseOpacity(lane) * spec.opacityScale,
                ALPHA_NOISE_LOW,
                ALPHA_NOISE_HIGH,
                MOTE_STRENGTH * spec.moteScale
            )
        );
        material.setProperty(
            'noiseParams',
            new Vec4(
                (0.68 + flowSeed * 0.14) * spec.noiseScale,
                0.17 + flowSeed * 0.05,
                (1.28 + flowSeed * 0.26) * spec.noiseScale,
                0.08
            )
        );
        material.setProperty(
            'baseMask',
            new Vec4(
                this._baseX,
                this._baseZ,
                BASE_CLEAR_RADIUS * spec.widthScale,
                BASE_CLEAR_FEATHER
            )
        );
        material.setProperty('lanePointCount', Math.min(MAX_LANE_POINTS, lanePath.length));

        for (let i = 0; i < MAX_LANE_POINTS; i++) {
            const p = lanePath[Math.min(i, lanePath.length - 1)] ?? lanePath[lanePath.length - 1];
            material.setProperty(`lanePoint${i}`, new Vec4(p.x, p.z, 0, 0));
        }

        material.setProperty('time', 0);
        return material;
    }

    private createLaneFogLayers(
        laneRoot: Node,
        lane: RouteLane,
        lanePath: Array<{ x: number; z: number }>
    ): LaneFogRuntime['layers'] {
        const layers: LaneFogRuntime['layers'] = [];
        for (const spec of FOG_LAYER_SPECS) {
            const plane = new Node(`FogMask_${lane}_${spec.name}`);
            plane.layer = this._root?.layer ?? 0;
            plane.setPosition(0, spec.y, 0);
            laneRoot.addChild(plane);

            const renderer = plane.addComponent(MeshRenderer);
            renderer.mesh = this.getFogPlaneMesh();

            const material = this.createLaneMaterial(lane, lanePath, spec);
            if (!material) {
                if (plane.isValid) {
                    plane.destroy();
                }
                continue;
            }

            renderer.material = material;
            layers.push({
                material,
                baseOpacity: this.resolveLaneBaseOpacity(lane) * spec.opacityScale,
                timeOffset: spec.timeOffset,
                moteStrength: MOTE_STRENGTH * spec.moteScale,
            });
        }
        return layers;
    }

    private applyOpacity(runtime: LaneFogRuntime, factor: number): void {
        const clamped = Math.max(0, Math.min(1, factor));
        for (const layer of runtime.layers) {
            layer.material.setProperty(
                'alphaParams',
                new Vec4(
                    layer.baseOpacity * clamped,
                    ALPHA_NOISE_LOW,
                    ALPHA_NOISE_HIGH,
                    layer.moteStrength
                )
            );
        }
    }

    private resolveLaneBaseOpacity(lane: RouteLane): number {
        if (lane === 'mid') return 0.55;
        return 0.6;
    }

    private resolveLaneTint(lane: RouteLane): Color {
        if (lane === 'top') {
            return new Color(212, 232, 240, 255);
        }
        if (lane === 'bottom') {
            return new Color(208, 226, 236, 255);
        }
        return new Color(216, 234, 242, 255);
    }

    private buildFogPath(lane: RouteLane): Array<{ x: number; z: number }> {
        const polyline = this._lanePolylines[lane];
        const laneLength = this.computePolylineLength(polyline);
        if (laneLength <= 0.3) return [];

        const startDistance = this.resolveFogStartDistance(lane, laneLength);
        const endDistance = this.resolveFogEndDistance(lane, laneLength);
        const sampled = this.samplePolylineSection(
            polyline,
            startDistance,
            endDistance,
            SAMPLE_STEP
        );

        if (sampled.length <= MAX_LANE_POINTS) {
            return sampled;
        }

        const reduced: Array<{ x: number; z: number }> = [];
        const lastIndex = sampled.length - 1;
        for (let i = 0; i < MAX_LANE_POINTS; i++) {
            const t = i / Math.max(1, MAX_LANE_POINTS - 1);
            const idx = Math.round(t * lastIndex);
            reduced.push(sampled[idx]);
        }
        return reduced;
    }

    private resolveFogStartDistance(lane: RouteLane, laneLength: number): number {
        const firstTowerDist = this._towerByLane[lane][0]?.dist;
        const fallback = Math.max(5.4, laneLength * 0.24);
        if (typeof firstTowerDist !== 'number' || !Number.isFinite(firstTowerDist)) {
            return Math.min(fallback, Math.max(2.2, laneLength - 2.2));
        }

        const startOffset =
            lane === 'mid' ? START_AFTER_FIRST_TOWER_MID : START_AFTER_FIRST_TOWER_SIDE;
        const candidate = firstTowerDist + startOffset;
        return Math.max(0.8, Math.min(candidate, Math.max(0.8, laneLength - 1.8)));
    }

    private resolveFogEndDistance(lane: RouteLane, laneLength: number): number {
        const portal = this._portalByLane[lane];
        const portalDist = Math.hypot(portal.x - this._baseX, portal.y - this._baseZ);
        const candidate = Math.max(portalDist + 1.2, laneLength - 0.2);
        return Math.min(laneLength, Math.max(3.2, candidate));
    }

    private collectTowerPadsByLane(): Record<RouteLane, TowerPadPoint[]> {
        const grouped: Record<RouteLane, TowerPadPoint[]> = {
            top: [],
            mid: [],
            bottom: [],
        };

        const pads = (GameConfig.BUILDING.PADS as ReadonlyArray<ConfigPad>) ?? [];
        for (const pad of pads) {
            if (!TOWER_TYPES.has(pad.type)) continue;

            const dist = Math.hypot(pad.x - this._baseX, pad.z - this._baseZ);
            if (!Number.isFinite(dist) || dist <= 0.01) continue;

            const lane = this.pickLaneByNearestPath(pad.x, pad.z);
            grouped[lane].push({ x: pad.x, z: pad.z, dist });
        }

        for (const lane of ROUTE_LANE_SEQUENCE) {
            grouped[lane].sort((a, b) => a.dist - b.dist);
        }

        return grouped;
    }

    private pickLaneByNearestPath(x: number, z: number): RouteLane {
        let bestLane: RouteLane = 'mid';
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const lane of ROUTE_LANE_SEQUENCE) {
            const distance = this.pointToPolylineDistance(x, z, this._lanePolylines[lane]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestLane = lane;
            }
        }

        return bestLane;
    }

    private getLanePolylinesWorld(): Record<RouteLane, Array<{ x: number; z: number }>> {
        const halfW = Math.max(1, GameConfig.MAP.LIMITS.x);
        const halfH = Math.max(1, GameConfig.MAP.LIMITS.z);

        const top = [
            this.laneNormalizedToWorld(0.05, 0.95, halfW, halfH),
            this.laneNormalizedToWorld(0.06, 0.92, halfW, halfH),
            this.laneNormalizedToWorld(0.95, 0.92, halfW, halfH),
        ];
        const mid = [
            this.laneNormalizedToWorld(0.05, 0.95, halfW, halfH),
            this.laneNormalizedToWorld(0.35, 0.65, halfW, halfH),
            this.laneNormalizedToWorld(0.5, 0.5, halfW, halfH),
            this.laneNormalizedToWorld(0.65, 0.35, halfW, halfH),
            this.laneNormalizedToWorld(0.95, 0.05, halfW, halfH),
        ];
        const bottom = [
            this.laneNormalizedToWorld(0.05, 0.95, halfW, halfH),
            this.laneNormalizedToWorld(0.08, 0.94, halfW, halfH),
            this.laneNormalizedToWorld(0.08, 0.05, halfW, halfH),
        ];

        return { top, mid, bottom };
    }

    private laneNormalizedToWorld(
        nx: number,
        nz: number,
        halfW: number,
        halfH: number
    ): { x: number; z: number } {
        return {
            x: nx * (halfW * 2) - halfW,
            z: (1 - nz) * (halfH * 2) - halfH,
        };
    }

    private samplePolylineSection(
        polyline: Array<{ x: number; z: number }>,
        startDistance: number,
        endDistance: number,
        step: number
    ): Array<{ x: number; z: number }> {
        const totalLength = this.computePolylineLength(polyline);
        if (totalLength <= 0.01) return [];

        const start = Math.max(0, Math.min(startDistance, totalLength));
        const end = Math.max(start + 0.01, Math.min(endDistance, totalLength));
        const spacing = Math.max(0.3, step);

        const points: Array<{ x: number; z: number }> = [];
        for (let d = start; d < end; d += spacing) {
            points.push(this.samplePolylineAtDistance(polyline, d));
        }
        points.push(this.samplePolylineAtDistance(polyline, end));

        const deduped: Array<{ x: number; z: number }> = [];
        for (const p of points) {
            const last = deduped[deduped.length - 1];
            if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 0.05) {
                deduped.push(p);
            }
        }
        return deduped;
    }

    private samplePolylineAtDistance(
        polyline: Array<{ x: number; z: number }>,
        distance: number
    ): { x: number; z: number } {
        if (polyline.length <= 0) {
            return { x: this._baseX, z: this._baseZ };
        }
        if (polyline.length === 1) {
            return { x: polyline[0].x, z: polyline[0].z };
        }

        let remain = distance;
        for (let i = 0; i < polyline.length - 1; i++) {
            const a = polyline[i];
            const b = polyline[i + 1];
            const segLen = Math.hypot(b.x - a.x, b.z - a.z);
            if (segLen <= 0.0001) continue;

            if (remain <= segLen) {
                const t = remain / segLen;
                return {
                    x: a.x + (b.x - a.x) * t,
                    z: a.z + (b.z - a.z) * t,
                };
            }
            remain -= segLen;
        }

        return { x: polyline[polyline.length - 1].x, z: polyline[polyline.length - 1].z };
    }

    private computePolylineLength(polyline: Array<{ x: number; z: number }>): number {
        let len = 0;
        for (let i = 0; i < polyline.length - 1; i++) {
            const a = polyline[i];
            const b = polyline[i + 1];
            len += Math.hypot(b.x - a.x, b.z - a.z);
        }
        return len;
    }

    private pointToPolylineDistance(
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
            const dist = this.pointToSegmentDistance(x, z, polyline[i], polyline[i + 1]);
            if (dist < best) {
                best = dist;
            }
        }
        return best;
    }

    private pointToSegmentDistance(
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

    private getFogPlaneMesh(): Mesh {
        if (this._fogMesh) return this._fogMesh;
        const limits = GameConfig.MAP.LIMITS;
        this._fogMesh = utils.MeshUtils.createMesh(
            primitives.plane({
                width: limits.x * 2 + MAP_PADDING * 2,
                length: limits.z * 2 + MAP_PADDING * 2,
                widthSegments: 1,
                lengthSegments: 1,
            })
        );
        return this._fogMesh;
    }

    private loadEffectAsset(path: string): Promise<EffectAsset | null> {
        return new Promise(resolve => {
            resources.load(path, EffectAsset, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }
                resolve(asset);
            });
        });
    }

    private loadTexture(path: string): Promise<Texture2D | null> {
        return new Promise(resolve => {
            resources.load(path, Texture2D, (err, tex) => {
                if (err || !tex) {
                    resolve(null);
                    return;
                }
                resolve(tex);
            });
        });
    }

    private setTextureRepeat(tex: Texture2D): void {
        const texAny = tex as Texture2D & { setWrapMode?: (u: number, v: number) => void };
        const wm = (Texture2D as unknown as { WrapMode?: { REPEAT?: number } }).WrapMode?.REPEAT;
        if (texAny.setWrapMode && wm !== undefined) {
            texAny.setWrapMode(wm, wm);
        }
    }
}
