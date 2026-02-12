import { _decorator, Component } from 'cc';
import { GameConfig } from '../data/GameConfig';
import { BuildingRegistry } from '../gameplay/buildings/BuildingRegistry';

const { ccclass, property, executionOrder } = _decorator;
type Scale3 = { x: number; y: number; z: number };

@ccclass('PadPlacementEntry')
export class PadPlacementEntry {
    @property
    public type: string = 'barracks';

    @property
    public x: number = 0;

    @property
    public z: number = 0;
}

@ccclass('BuildingScaleEntry')
export class BuildingScaleEntry {
    @property
    public type: string = 'barracks';

    @property({ tooltip: '整体缩放倍率（1=不变，1.2=放大20%）' })
    public scale: number = 1;
}

@ccclass('EditorPlacementDebug')
@executionOrder(-10000)
export class EditorPlacementDebug extends Component {
    private _baseScaleByType: Record<string, Scale3> = {};

    @property({ tooltip: '运行时自动把下面配置写入 GameConfig（需开启组件）' })
    public autoApplyOnLoad: boolean = true;

    @property({ tooltip: '基地 X 坐标（对应 GameConfig.MAP.BASE_SPAWN.x）' })
    public baseSpawnX: number = -9;

    @property({ tooltip: '基地 Z 坐标（对应 GameConfig.MAP.BASE_SPAWN.z）' })
    public baseSpawnZ: number = -9;

    @property({
        type: [PadPlacementEntry],
        tooltip: '建筑/建造点坐标（对应 GameConfig.BUILDING.PADS）',
    })
    public padPlacements: PadPlacementEntry[] = [];

    @property({
        type: [BuildingScaleEntry],
        tooltip: '按建筑类型覆盖大小（对应 GameConfig.BUILDING.TYPES[*].visual.scale）',
    })
    public buildingScaleOverrides: BuildingScaleEntry[] = [];

    protected onLoad(): void {
        this.ensureBaseScales();
        if (this.padPlacements.length <= 0 || this.buildingScaleOverrides.length <= 0) {
            this.loadFromGameConfig();
        }

        if (this.autoApplyOnLoad) {
            this.applyToGameConfig();
        }
    }

    /**
     * 当组件第一次挂到节点时，自动带入当前配置，便于直接微调
     */
    protected resetInEditor(): void {
        this.captureBaseScales();
        this.loadFromGameConfig();
    }

    private ensureBaseScales(): void {
        if (Object.keys(this._baseScaleByType).length > 0) return;
        this.captureBaseScales();
    }

    private captureBaseScales(): void {
        this._baseScaleByType = {};
        const types = GameConfig.BUILDING.TYPES as Record<
            string,
            { visual?: { scale?: { x?: number; y?: number; z?: number } } }
        >;
        for (const [type, cfg] of Object.entries(types)) {
            const scale = cfg.visual?.scale;
            this._baseScaleByType[type] = {
                x: scale?.x ?? 1,
                y: scale?.y ?? 1,
                z: scale?.z ?? 1,
            };
        }
    }

    public loadFromGameConfig(): void {
        this.ensureBaseScales();

        const spawn = GameConfig.MAP.BASE_SPAWN as { x: number; z: number };
        this.baseSpawnX = spawn.x;
        this.baseSpawnZ = spawn.z;

        const pads = GameConfig.BUILDING.PADS as Array<{ x: number; z: number; type: string }>;
        this.padPlacements = pads.map(pad => {
            const entry = new PadPlacementEntry();
            entry.type = pad.type;
            entry.x = pad.x;
            entry.z = pad.z;
            return entry;
        });

        const types = GameConfig.BUILDING.TYPES as Record<string, unknown>;
        this.buildingScaleOverrides = Object.keys(types).map(type => {
            const entry = new BuildingScaleEntry();
            entry.type = type;
            entry.scale = 1;
            return entry;
        });
    }

    public applyToGameConfig(): void {
        const spawn = GameConfig.MAP.BASE_SPAWN as { x: number; z: number };
        spawn.x = this.baseSpawnX;
        spawn.z = this.baseSpawnZ;

        const pads = GameConfig.BUILDING.PADS as Array<{ x: number; z: number; type: string }>;
        pads.length = 0;
        for (const entry of this.padPlacements) {
            const type = (entry.type || '').trim();
            if (!type) continue;
            pads.push({
                type,
                x: entry.x,
                z: entry.z,
            });
        }

        const types = GameConfig.BUILDING.TYPES as Record<
            string,
            { visual?: { scale?: { x: number; y: number; z: number } } }
        >;
        for (const entry of this.buildingScaleOverrides) {
            const type = (entry.type || '').trim();
            if (!type || !types[type]) continue;

            if (!types[type].visual) {
                types[type].visual = {};
            }
            const baseScale = this._baseScaleByType[type] ?? {
                x: types[type].visual?.scale?.x ?? 1,
                y: types[type].visual?.scale?.y ?? 1,
                z: types[type].visual?.scale?.z ?? 1,
            };
            const mul = Math.max(0.01, entry.scale);
            types[type].visual!.scale = {
                x: baseScale.x * mul,
                y: baseScale.y * mul,
                z: baseScale.z * mul,
            };
        }

        this.syncBuildingRegistry();
    }

    private syncBuildingRegistry(): void {
        const registry = BuildingRegistry.instance;
        const types = GameConfig.BUILDING.TYPES as Record<
            string,
            { visual?: { colorHex?: string; scale?: { x: number; y: number; z: number } } }
        >;
        for (const [type, source] of Object.entries(types)) {
            const target = registry.get(type);
            if (!target) continue;
            if (!source.visual) continue;
            if (!target.visual) {
                target.visual = {
                    colorHex: source.visual.colorHex ?? '#FFFFFF',
                    scale: source.visual.scale ?? { x: 1, y: 1, z: 1 },
                };
                continue;
            }
            target.visual.scale = source.visual.scale ?? { x: 1, y: 1, z: 1 };
            if (source.visual.colorHex) {
                target.visual.colorHex = source.visual.colorHex;
            }
        }
    }
}
