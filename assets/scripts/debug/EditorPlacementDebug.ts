import {
    _decorator,
    Component,
    Node,
    RenderRoot2D,
    Billboard,
    Label,
    LabelOutline,
    UITransform,
    Color,
} from 'cc';
import { GameConfig } from '../data/GameConfig';
import { BuildingRegistry } from '../gameplay/buildings/BuildingRegistry';
import { BuildingPad } from '../gameplay/buildings/BuildingPad';

const { ccclass, property, executionOrder } = _decorator;
type Scale3 = { x: number; y: number; z: number };

@ccclass('PadPlacementEntry')
export class PadPlacementEntry {
    @property
    public type: string = 'barracks';

    @property({ tooltip: '同类型建筑编号（自动生成，仅调试展示）' })
    public typeIndex: number = 1;

    @property({ tooltip: '显示标签（自动生成，仅调试展示）' })
    public debugLabel: string = 'barracks #1';

    @property
    public x: number = 0;

    @property
    public z: number = 0;

    @property({ tooltip: 'Y 轴旋转角度（度），对应 GameConfig.BUILDING.PADS[*].angle' })
    public angle: number = 0;

    @property({ tooltip: '是否开局预建（对应 GameConfig.BUILDING.PADS[*].prebuild）' })
    public prebuild: boolean = false;

    @property({ tooltip: '覆写建造花费（>=0 生效，<0 使用默认）' })
    public overrideCost: number = -1;
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
    private static readonly PAD_DEBUG_LABEL_NODE = '__PadDebugLabel';
    private static readonly ROAD_DIRECTIONS: ReadonlyArray<{ x: number; z: number }> = [
        { x: 1, z: 0 },
        { x: 0, z: 1 },
        { x: 1, z: 1 },
    ];

    @property({ tooltip: '运行时自动把下面配置写入 GameConfig（需开启组件）' })
    public autoApplyOnLoad: boolean = true;

    @property({ tooltip: '在运行时显示建造点编号标签（tower #1 / wall #2 ...）' })
    public showPadLabelsInGame: boolean = true;

    @property({ tooltip: '建造点调试标签的高度偏移（世界单位）' })
    public padLabelYOffset: number = 2.6;

    @property({ tooltip: '自动按三条道路对称布置防御塔（运行时生效）' })
    public autoLayoutRoadsideTowers: boolean = true;

    @property({ tooltip: '道路覆盖比例（0.5=从基地向外铺到道路一半长度）' })
    public roadsideCoverageRatio: number = 0.5;

    @property({ tooltip: '从基地开始的起铺距离（避免贴脸）' })
    public roadsideStartDistance: number = 5.5;

    @property({ tooltip: '塔位基准尺寸（用于计算间距）' })
    public towerPadSize: number = 2.4;

    @property({ tooltip: '同侧塔位间隙占塔宽比例（0.5=留半个塔）' })
    public sameSideGapRatio: number = 0.5;

    @property({ tooltip: '塔位距道路中心线偏移（道路两侧对称）' })
    public roadsideOffset: number = 3.2;

    @property({ tooltip: '上/下两路单排时距道路中心线偏移（建议比上面更小）' })
    public topBottomLaneOffset: number = 2.2;

    @property({ tooltip: '自动布塔时替换旧的普通 tower 点位' })
    public replaceExistingTowerPads: boolean = true;

    @property({ tooltip: '自动移除旧版特殊塔位（frost_tower / lightning_tower）' })
    public removeLegacyTypedTowers: boolean = true;

    @property({ tooltip: '上/下两路仅保留单排（靠地图内侧）' })
    public singleRowOnTopBottomLanes: boolean = true;

    @property({ tooltip: '上/下两路单排优先外侧（远离地图中心，更贴近路边）' })
    public topBottomPreferOuterSide: boolean = true;

    @property({ tooltip: '上/下两路内侧固定塔数量（每条路）' })
    public topBottomInnerTowerCount: number = 4;

    @property({ tooltip: '上/下两路从 Spa 起算的起始距离（世界单位）' })
    public topBottomStartDistanceFromSpa: number = 8.5;

    @property({ tooltip: '上路内侧固定塔整体向右偏移（世界单位，建议=塔宽）' })
    public topLaneInnerRightShift: number = 0;

    @property({ tooltip: '道路采样世界半宽（默认对应 MapGenerator: 28*2/2 = 28）' })
    public laneWorldHalfWidth: number = 28;

    @property({ tooltip: '道路采样世界半高（默认对应 MapGenerator: 28*2/2 = 28）' })
    public laneWorldHalfHeight: number = 28;

    @property({ tooltip: '从基地外圈后再开始布塔（避免压在基地周围）' })
    public baseKeepoutDistance: number = 6.0;

    @property({ tooltip: '按离基地最近排序，额外移除前 N 个自动塔位' })
    public skipFirstRoadsideTowers: number = 3;

    @property({ tooltip: '在最终结果中再额外移除 1 个离基地最近的自动塔位（塔1）' })
    public removeRoadsideTowerOne: boolean = true;

    @property({ tooltip: '仅清理基地到 Spa 之间走廊内的塔位' })
    public clearOnlyBaseToSpaCorridor: boolean = true;

    @property({ tooltip: '基地到 Spa 清理走廊半宽（世界单位）' })
    public baseSpaClearHalfWidth: number = 5.6;

    @property({ tooltip: '在上路近基地段补一个对称塔（与首个保留塔镜像）' })
    public addTopLaneNearBaseMirror: boolean = true;

    @property({ tooltip: '基地周围禁布塔半径（世界单位）' })
    public baseTowerClearRadius: number = 0.0;

    @property({ tooltip: 'Spa 周围禁布塔半径（世界单位）' })
    public spaTowerClearRadius: number = 0.0;

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
        this.mergePadAnglesFromConfig();
        if (this.autoLayoutRoadsideTowers) {
            this.layoutSymmetricRoadsideTowers();
        }
        this.refreshPadPlacementIds();

        if (this.autoApplyOnLoad) {
            this.applyToGameConfig();
        }
    }

    protected start(): void {
        // Building pad debug labels are disabled globally.
        this.clearPadDebugLabels();
    }

    protected onDestroy(): void {
        this.unschedule(this.syncPadDebugLabels);
        // 场景卸载过程中节点树可能处于半销毁状态，避免在这里遍历全场景。
        // 标签节点会随着场景销毁自动清理。
    }

    /**
     * 当组件第一次挂到节点时，自动带入当前配置，便于直接微调
     */
    public resetInEditor(): void {
        this.captureBaseScales();
        this.loadFromGameConfig();
        if (this.autoLayoutRoadsideTowers) {
            this.layoutSymmetricRoadsideTowers();
        }
        this.refreshPadPlacementIds();
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

        const pads = GameConfig.BUILDING.PADS as unknown as Array<{
            x: number;
            z: number;
            type: string;
            angle?: number;
            prebuild?: boolean;
            overrideCost?: number;
        }>;
        this.padPlacements = pads.map(pad => {
            const entry = new PadPlacementEntry();
            entry.type = pad.type;
            entry.x = pad.x;
            entry.z = pad.z;
            entry.angle = typeof pad.angle === 'number' ? pad.angle : 0;
            entry.prebuild = pad.prebuild === true;
            entry.overrideCost = typeof pad.overrideCost === 'number' ? pad.overrideCost : -1;
            return entry;
        });
        this.refreshPadPlacementIds();

        const types = GameConfig.BUILDING.TYPES as Record<string, unknown>;
        this.buildingScaleOverrides = Object.keys(types).map(type => {
            const entry = new BuildingScaleEntry();
            entry.type = type;
            entry.scale = 1;
            return entry;
        });
    }

    public applyToGameConfig(): void {
        this.refreshPadPlacementIds();

        const spawn = GameConfig.MAP.BASE_SPAWN as { x: number; z: number };
        spawn.x = this.baseSpawnX;
        spawn.z = this.baseSpawnZ;

        const pads = GameConfig.BUILDING.PADS as unknown as Array<{
            x: number;
            z: number;
            type: string;
            angle?: number;
            prebuild?: boolean;
            overrideCost?: number;
        }>;
        const previousOverrideCostByKey = new Map<string, number>();
        for (const pad of pads) {
            if (typeof pad.overrideCost !== 'number') continue;
            const rx = Math.round(pad.x * 10);
            const rz = Math.round(pad.z * 10);
            const key = `${pad.type}|${rx}|${rz}`;
            previousOverrideCostByKey.set(key, pad.overrideCost);
        }
        pads.length = 0;
        for (const entry of this.padPlacements) {
            const type = (entry.type || '').trim();
            if (!type) continue;
            const pad: {
                x: number;
                z: number;
                type: string;
                angle?: number;
                prebuild?: boolean;
                overrideCost?: number;
            } = {
                type,
                x: entry.x,
                z: entry.z,
            };
            if (Math.abs(entry.angle) > 0.001) {
                pad.angle = entry.angle;
            }
            if (entry.prebuild) {
                pad.prebuild = true;
            }
            const normalizedOverrideCost = Number.isFinite(entry.overrideCost)
                ? Math.round(entry.overrideCost)
                : -1;
            if (normalizedOverrideCost >= 0) {
                pad.overrideCost = normalizedOverrideCost;
            } else {
                const rx = Math.round(entry.x * 10);
                const rz = Math.round(entry.z * 10);
                const fallbackKey = `${type}|${rx}|${rz}`;
                const fallbackOverrideCost = previousOverrideCostByKey.get(fallbackKey);
                if (typeof fallbackOverrideCost === 'number') {
                    pad.overrideCost = fallbackOverrideCost;
                }
            }
            pads.push(pad);
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
        // Building pad debug labels are disabled globally.
        this.clearPadDebugLabels();
    }

    /**
     * 兼容旧数据：旧版 PadPlacementEntry 没有 angle 字段，会导致朝向信息丢失。
     * 若当前 entries 全是 0，则从 GameConfig 同坐标同类型条目回填 angle。
     */
    private mergePadAnglesFromConfig(): void {
        if (!this.padPlacements || this.padPlacements.length === 0) return;
        const hasAnyNonZero = this.padPlacements.some(entry => Math.abs(entry.angle) > 0.001);
        if (hasAnyNonZero) return;

        const cfgPads = GameConfig.BUILDING.PADS as unknown as Array<{
            x: number;
            z: number;
            type: string;
            angle?: number;
            overrideCost?: number;
        }>;
        const angleByKey = new Map<string, number>();
        for (const pad of cfgPads) {
            if (typeof pad.angle !== 'number' || Math.abs(pad.angle) <= 0.001) continue;
            const key = `${pad.type}|${pad.x}|${pad.z}`;
            angleByKey.set(key, pad.angle);
        }
        if (angleByKey.size === 0) return;

        for (const entry of this.padPlacements) {
            const key = `${entry.type}|${entry.x}|${entry.z}`;
            const fallback = angleByKey.get(key);
            if (fallback !== undefined) {
                entry.angle = fallback;
            }
        }
    }

    /**
     * 为每个建造点生成同类型编号，便于在 Inspector 区分重复条目。
     * 例：tower #1 / tower #2 / wall #1 ...
     */
    private refreshPadPlacementIds(): void {
        const countByType = new Map<string, number>();
        for (const entry of this.padPlacements) {
            const type = (entry.type || '').trim() || 'unknown';
            const index = (countByType.get(type) ?? 0) + 1;
            countByType.set(type, index);
            entry.typeIndex = index;
            entry.debugLabel = `${type} #${index}`;
        }
    }

    /**
     * 三路对称布塔：
     * - 沿 3 条道路方向（右、下、右下）从基地向外铺设
     * - 仅覆盖道路前半段（由 roadsideCoverageRatio 控制）
     * - 每个采样点在道路两侧各放一个 tower
     * - 同侧间距 = towerPadSize * (1 + sameSideGapRatio)
     */
    private layoutSymmetricRoadsideTowers(): void {
        const removeTypes = new Set<string>();
        if (this.replaceExistingTowerPads) {
            removeTypes.add('tower');
        }
        if (this.removeLegacyTypedTowers) {
            removeTypes.add('frost_tower');
            removeTypes.add('lightning_tower');
        }
        const keep: PadPlacementEntry[] =
            removeTypes.size > 0
                ? this.padPlacements.filter(entry => !removeTypes.has((entry.type || '').trim()))
                : [...this.padPlacements];

        const occupied = keep.map(entry => ({ x: entry.x, z: entry.z }));
        const limitX = Math.max(1, GameConfig.MAP.LIMITS.x);
        const limitZ = Math.max(1, GameConfig.MAP.LIMITS.z);
        const coverage = Math.max(0.1, Math.min(1, this.roadsideCoverageRatio));
        const startDist = Math.max(
            0,
            Math.max(this.roadsideStartDistance, this.baseKeepoutDistance)
        );
        const spacing = Math.max(0.8, this.towerPadSize * (1 + this.sameSideGapRatio));
        const sideOffset = Math.max(0.8, this.roadsideOffset);
        const topBottomOffset = Math.max(0.8, this.topBottomLaneOffset);
        const minSeparation = Math.max(1.2, this.towerPadSize * 1.02);
        const topBottomFixedCount = Math.max(0, Math.floor(this.topBottomInnerTowerCount));
        const topBottomSpaStartDistance = Math.max(0, this.topBottomStartDistanceFromSpa);

        const generatedRegular: PadPlacementEntry[] = [];
        const generatedTopBottomInner: PadPlacementEntry[] = [];
        const generatedTopInner: PadPlacementEntry[] = [];
        let topLaneMirrorCandidate: PadPlacementEntry | null = null;

        const mapCenterX = 0;
        const mapCenterZ = 0;

        const lanes = this.getLanePolylinesWorld(
            Math.max(1, this.laneWorldHalfWidth),
            Math.max(1, this.laneWorldHalfHeight)
        );

        for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
            const lane = lanes[laneIndex];
            if (lane.length < 2) continue;
            const isTopBottomLane = laneIndex === 0 || laneIndex === 2;
            const useTopBottomInnerFixed = isTopBottomLane && topBottomFixedCount > 0;
            const laneLength = this.computePolylineLength(lane);
            if (laneLength <= 0.1) continue;
            const placeLength = laneLength * coverage;
            if (!useTopBottomInnerFixed && placeLength <= startDist + 0.2) continue;

            // 上路固定塔从第 2 个采样位开始（跳过原 tower #1 起点）。
            const topLaneStartFromSecondSlot = useTopBottomInnerFixed && laneIndex === 0;
            const topLaneStartOffset = topLaneStartFromSecondSlot ? spacing : 0;
            let t = useTopBottomInnerFixed
                ? topBottomSpaStartDistance + topLaneStartOffset
                : startDist;
            const stopDistance = useTopBottomInnerFixed ? laneLength - 0.2 : placeLength + 0.001;
            if (t > stopDistance) continue;

            let placedInLane = 0;
            let sampledCount = 0;
            const maxSamples = useTopBottomInnerFixed
                ? Math.max(topBottomFixedCount * 6, topBottomFixedCount + 4)
                : Number.MAX_SAFE_INTEGER;

            while (t <= stopDistance + 0.001) {
                if (useTopBottomInnerFixed && placedInLane >= topBottomFixedCount) break;
                if (sampledCount >= maxSamples) break;
                sampledCount += 1;
                const sample = this.samplePolyline(lane, t);
                const sampleDistance = t;
                t += spacing;
                if (!sample) continue;
                const normalX = -sample.tz;
                const normalZ = sample.tx;
                const laneOffset = isTopBottomLane ? topBottomOffset : sideOffset;
                const candidates: Array<{ x: number; z: number; nx: number; nz: number }> = [
                    {
                        x: sample.x + normalX * laneOffset,
                        z: sample.z + normalZ * laneOffset,
                        nx: normalX,
                        nz: normalZ,
                    },
                    {
                        x: sample.x - normalX * laneOffset,
                        z: sample.z - normalZ * laneOffset,
                        nx: -normalX,
                        nz: -normalZ,
                    },
                ];
                // 上路固定塔整体向右挪，避免与 farm 重叠（按世界坐标 +X）。
                if (useTopBottomInnerFixed && laneIndex === 0) {
                    const rightShift = Math.max(0, this.topLaneInnerRightShift);
                    if (rightShift > 0) {
                        candidates[0].x += rightShift;
                        candidates[1].x += rightShift;
                    }
                }
                const useSingleRow =
                    isTopBottomLane && (this.singleRowOnTopBottomLanes || useTopBottomInnerFixed);
                const preferOuter = useTopBottomInnerFixed ? false : this.topBottomPreferOuterSide;
                const selectedCandidates = useSingleRow
                    ? [
                          this.pickCandidateByCenterDistance(
                              candidates,
                              mapCenterX,
                              mapCenterZ,
                              preferOuter
                          ),
                      ]
                    : candidates;

                let placedAtThisSample = false;
                for (const p of selectedCandidates) {
                    if (p.x <= -limitX || p.x >= limitX || p.z <= -limitZ || p.z >= limitZ) {
                        continue;
                    }
                    if (this.isInsideTowerClearZone(p.x, p.z, keep)) {
                        continue;
                    }
                    if (this.isTooCloseToOccupied(p.x, p.z, occupied, minSeparation)) {
                        continue;
                    }
                    const entry = new PadPlacementEntry();
                    entry.type = 'tower';
                    entry.x = this.roundToTenth(p.x);
                    entry.z = this.roundToTenth(p.z);
                    // 朝向改为垂直道路（沿法线），并使建成建筑落在远离道路一侧
                    // BuildingPad 会把升级区往 -forward 方向挪，所以这里 forward 取“远离道路”的法线。
                    entry.angle = this.roundToTenth((Math.atan2(p.nx, p.nz) * 180) / Math.PI);
                    if (useTopBottomInnerFixed) {
                        generatedTopBottomInner.push(entry);
                        if (laneIndex === 0) {
                            generatedTopInner.push(entry);
                        }
                        placedInLane += 1;
                    } else {
                        generatedRegular.push(entry);
                    }
                    occupied.push({ x: entry.x, z: entry.z });
                    placedAtThisSample = true;
                    if (useTopBottomInnerFixed) break;
                }

                // 上路（lane 0）近基地镜像候选：最后阶段再补，避免被“前3个清理/走廊清理”误删
                if (
                    !useTopBottomInnerFixed &&
                    placedAtThisSample &&
                    laneIndex === 0 &&
                    useSingleRow &&
                    this.addTopLaneNearBaseMirror
                ) {
                    const chosen = selectedCandidates[0];
                    const mirror = candidates[0] === chosen ? candidates[1] : candidates[0];
                    const nearBaseBand = sampleDistance <= startDist + spacing * 1.6;
                    if (mirror && nearBaseBand && !topLaneMirrorCandidate) {
                        const inBounds =
                            mirror.x > -limitX &&
                            mirror.x < limitX &&
                            mirror.z > -limitZ &&
                            mirror.z < limitZ;
                        if (inBounds) {
                            const entry = new PadPlacementEntry();
                            entry.type = 'tower';
                            entry.x = this.roundToTenth(mirror.x);
                            entry.z = this.roundToTenth(mirror.z);
                            entry.angle = this.roundToTenth(
                                (Math.atan2(mirror.nx, mirror.nz) * 180) / Math.PI
                            );
                            topLaneMirrorCandidate = entry;
                        }
                    }
                }
            }
        }
        this.rebalanceTopLaneFixedTowers(
            generatedTopBottomInner,
            generatedTopInner,
            keep,
            generatedRegular,
            spacing,
            minSeparation,
            limitX,
            limitZ
        );

        const prunedRegular = this.pruneNearestGeneratedTowers(generatedRegular).filter(
            entry => !this.isInsideTowerClearZone(entry.x, entry.z, keep)
        );
        const finalRegular = [...prunedRegular];
        if (
            this.addTopLaneNearBaseMirror &&
            topLaneMirrorCandidate &&
            !this.isTooCloseToOccupied(
                topLaneMirrorCandidate.x,
                topLaneMirrorCandidate.z,
                [
                    ...keep.map(e => ({ x: e.x, z: e.z })),
                    ...generatedTopBottomInner.map(e => ({ x: e.x, z: e.z })),
                    ...prunedRegular.map(e => ({ x: e.x, z: e.z })),
                ],
                Math.max(0.6, this.towerPadSize * 0.55)
            )
        ) {
            finalRegular.push(topLaneMirrorCandidate);
        }
        // 始终再去掉离基地最近的 1 个自动塔位（用于去除道路前第 1 格）。
        if (finalRegular.length > 0) {
            let nearestIndex = 0;
            let nearestDistSq = Number.MAX_VALUE;
            for (let i = 0; i < finalRegular.length; i++) {
                const e = finalRegular[i];
                const dx = e.x - this.baseSpawnX;
                const dz = e.z - this.baseSpawnZ;
                const d2 = dx * dx + dz * dz;
                if (d2 < nearestDistSq) {
                    nearestDistSq = d2;
                    nearestIndex = i;
                }
            }
            finalRegular.splice(nearestIndex, 1);
        }
        this.padPlacements = [...keep, ...generatedTopBottomInner, ...finalRegular];
    }

    /**
     * 上路固定塔手动重排：
     * - 移除最左侧（通常是 tower #1）
     * - 在最右侧（通常是 tower #4）右边补 1 个塔
     */
    private rebalanceTopLaneFixedTowers(
        generatedTopBottomInner: PadPlacementEntry[],
        generatedTopInner: PadPlacementEntry[],
        keep: PadPlacementEntry[],
        generatedRegular: PadPlacementEntry[],
        spacing: number,
        minSeparation: number,
        limitX: number,
        limitZ: number
    ): void {
        if (generatedTopInner.length <= 0) return;

        let leftMost = generatedTopInner[0];
        for (const entry of generatedTopInner) {
            if (entry.x < leftMost.x) {
                leftMost = entry;
            }
        }

        const removeFromAll = (target: PadPlacementEntry) => {
            const i1 = generatedTopInner.indexOf(target);
            if (i1 >= 0) generatedTopInner.splice(i1, 1);
            const i2 = generatedTopBottomInner.indexOf(target);
            if (i2 >= 0) generatedTopBottomInner.splice(i2, 1);
        };
        removeFromAll(leftMost);
        if (generatedTopInner.length <= 0) return;

        let rightMost = generatedTopInner[0];
        for (const entry of generatedTopInner) {
            if (entry.x > rightMost.x) {
                rightMost = entry;
            }
        }

        const occupied = [
            ...keep.map(e => ({ x: e.x, z: e.z })),
            ...generatedRegular.map(e => ({ x: e.x, z: e.z })),
            ...generatedTopBottomInner.map(e => ({ x: e.x, z: e.z })),
        ];

        const maxTry = 4;
        for (let i = 1; i <= maxTry; i++) {
            const candidateX = this.roundToTenth(rightMost.x + spacing * i);
            const candidateZ = this.roundToTenth(rightMost.z);
            if (
                candidateX <= -limitX ||
                candidateX >= limitX ||
                candidateZ <= -limitZ ||
                candidateZ >= limitZ
            ) {
                continue;
            }
            if (this.isInsideTowerClearZone(candidateX, candidateZ, keep)) {
                continue;
            }
            if (this.isTooCloseToOccupied(candidateX, candidateZ, occupied, minSeparation)) {
                continue;
            }

            const extra = new PadPlacementEntry();
            extra.type = 'tower';
            extra.x = candidateX;
            extra.z = candidateZ;
            extra.angle = rightMost.angle;
            generatedTopInner.push(extra);
            generatedTopBottomInner.push(extra);
            break;
        }
    }

    private getLanePolylinesWorld(
        halfW: number,
        halfH: number
    ): Array<Array<{ x: number; z: number }>> {
        const topLane = [
            { x: 0.05, z: 0.95 },
            { x: 0.06, z: 0.92 },
            { x: 0.95, z: 0.92 },
        ];
        const midLane = [
            { x: 0.05, z: 0.95 },
            { x: 0.35, z: 0.65 },
            { x: 0.5, z: 0.5 },
            { x: 0.65, z: 0.35 },
            { x: 0.95, z: 0.05 },
        ];
        const botLane = [
            { x: 0.05, z: 0.95 },
            { x: 0.08, z: 0.94 },
            { x: 0.08, z: 0.05 },
        ];

        return [topLane, midLane, botLane].map(lane =>
            lane.map(p => this.laneNormalizedToWorld(p.x, p.z, halfW, halfH))
        );
    }

    private laneNormalizedToWorld(
        nx: number,
        nz: number,
        halfW: number,
        halfH: number
    ): { x: number; z: number } {
        const x = nx * (halfW * 2) - halfW;
        const z = (1 - nz) * (halfH * 2) - halfH;
        return { x, z };
    }

    private computePolylineLength(points: Array<{ x: number; z: number }>): number {
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dz = points[i + 1].z - points[i].z;
            total += Math.sqrt(dx * dx + dz * dz);
        }
        return total;
    }

    private samplePolyline(
        points: Array<{ x: number; z: number }>,
        distance: number
    ): { x: number; z: number; tx: number; tz: number } | null {
        if (points.length < 2) return null;
        if (distance <= 0) {
            const dx0 = points[1].x - points[0].x;
            const dz0 = points[1].z - points[0].z;
            const l0 = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
            return { x: points[0].x, z: points[0].z, tx: dx0 / l0, tz: dz0 / l0 };
        }

        let remain = distance;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const segLen = Math.sqrt(dx * dx + dz * dz);
            if (segLen <= 0.0001) continue;
            if (remain <= segLen) {
                const t = remain / segLen;
                return {
                    x: a.x + dx * t,
                    z: a.z + dz * t,
                    tx: dx / segLen,
                    tz: dz / segLen,
                };
            }
            remain -= segLen;
        }

        const lastA = points[points.length - 2];
        const lastB = points[points.length - 1];
        const dx = lastB.x - lastA.x;
        const dz = lastB.z - lastA.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        return { x: lastB.x, z: lastB.z, tx: dx / len, tz: dz / len };
    }

    private isTooCloseToOccupied(
        x: number,
        z: number,
        points: Array<{ x: number; z: number }>,
        minDistance: number
    ): boolean {
        const minSq = minDistance * minDistance;
        for (const p of points) {
            const dx = x - p.x;
            const dz = z - p.z;
            if (dx * dx + dz * dz < minSq) return true;
        }
        return false;
    }

    private pickCandidateByCenterDistance(
        candidates: Array<{ x: number; z: number; nx: number; nz: number }>,
        centerX: number,
        centerZ: number,
        preferFarther: boolean
    ): { x: number; z: number; nx: number; nz: number } {
        if (candidates.length <= 1) return candidates[0];
        let best = candidates[0];
        let bestDistSq = preferFarther ? -1 : Number.MAX_VALUE;
        for (const c of candidates) {
            const dx = c.x - centerX;
            const dz = c.z - centerZ;
            const distSq = dx * dx + dz * dz;
            if (preferFarther ? distSq > bestDistSq : distSq < bestDistSq) {
                bestDistSq = distSq;
                best = c;
            }
        }
        return best;
    }

    private roundToTenth(v: number): number {
        return Math.round(v * 10) / 10;
    }

    private pruneNearestGeneratedTowers(generated: PadPlacementEntry[]): PadPlacementEntry[] {
        const skip = Math.max(0, Math.floor(this.skipFirstRoadsideTowers));
        if (skip <= 0 || generated.length === 0) return generated;

        const ranked = generated.map((entry, index) => {
            const dx = entry.x - this.baseSpawnX;
            const dz = entry.z - this.baseSpawnZ;
            return { index, distSq: dx * dx + dz * dz };
        });
        ranked.sort((a, b) => a.distSq - b.distSq);

        const removeCount = Math.min(skip, ranked.length);
        const removeSet = new Set(ranked.slice(0, removeCount).map(item => item.index));
        return generated.filter((_, index) => !removeSet.has(index));
    }

    private isInsideTowerClearZone(
        x: number,
        z: number,
        existingEntries: PadPlacementEntry[]
    ): boolean {
        if (this.clearOnlyBaseToSpaCorridor) {
            const spa = this.getSpaEntry(existingEntries);
            if (!spa) return false;
            const vx = spa.x - this.baseSpawnX;
            const vz = spa.z - this.baseSpawnZ;
            const lenSq = vx * vx + vz * vz;
            if (lenSq <= 0.0001) return false;
            const len = Math.sqrt(lenSq);

            const px = x - this.baseSpawnX;
            const pz = z - this.baseSpawnZ;
            const proj = (px * vx + pz * vz) / len;
            if (proj < 0 || proj > len) return false; // 仅清理基地到 Spa 之间

            const cross = Math.abs(px * vz - pz * vx);
            const lateralDist = cross / len;
            return lateralDist <= Math.max(0, this.baseSpaClearHalfWidth);
        }

        const baseR = Math.max(0, this.baseTowerClearRadius);
        if (baseR > 0) {
            const dx = x - this.baseSpawnX;
            const dz = z - this.baseSpawnZ;
            if (dx * dx + dz * dz <= baseR * baseR) return true;
        }

        const spaR = Math.max(0, this.spaTowerClearRadius);
        if (spaR <= 0) return false;

        for (const entry of existingEntries) {
            if ((entry.type || '').trim() !== 'spa') continue;
            const dx = x - entry.x;
            const dz = z - entry.z;
            if (dx * dx + dz * dz <= spaR * spaR) return true;
        }
        return false;
    }

    private getSpaEntry(entries: PadPlacementEntry[]): PadPlacementEntry | null {
        for (const entry of entries) {
            if ((entry.type || '').trim() === 'spa') return entry;
        }
        return null;
    }

    private syncPadDebugLabels(): void {
        if (!this.showPadLabelsInGame) return;
        const scene = this.node.scene;
        if (!scene) return;

        this.refreshPadPlacementIds();

        const pads = scene
            .getComponentsInChildren(BuildingPad)
            .filter(pad => pad && pad.node && pad.node.isValid);
        if (pads.length === 0) return;

        const queueByType = new Map<string, string[]>();
        for (const entry of this.padPlacements) {
            const type = (entry.type || '').trim();
            if (!type || type === 'spa') continue;
            let queue = queueByType.get(type);
            if (!queue) {
                queue = [];
                queueByType.set(type, queue);
            }
            queue.push(entry.debugLabel || `${type} #${entry.typeIndex}`);
        }

        const fallbackCountByType = new Map<string, number>();
        for (const pad of pads) {
            const type = (pad.buildingTypeId || '').trim() || 'unknown';
            const queue = queueByType.get(type);

            let labelText: string;
            if (queue && queue.length > 0) {
                labelText = queue.shift()!;
            } else {
                const n = (fallbackCountByType.get(type) ?? 0) + 1;
                fallbackCountByType.set(type, n);
                labelText = `${type} #${n}`;
            }

            this.upsertPadDebugLabel(pad.node, labelText);
        }
    }

    private upsertPadDebugLabel(padNode: Node, text: string): void {
        let root = padNode.getChildByName(EditorPlacementDebug.PAD_DEBUG_LABEL_NODE);
        if (!root) {
            root = new Node(EditorPlacementDebug.PAD_DEBUG_LABEL_NODE);
            padNode.addChild(root);
            root.addComponent(RenderRoot2D);
            root.addComponent(Billboard);
            root.setScale(0.012, 0.012, 0.012);

            const labelNode = new Node('Text');
            root.addChild(labelNode);
            labelNode.addComponent(UITransform).setContentSize(520, 80);
            const label = labelNode.addComponent(Label);
            label.fontSize = 30;
            label.lineHeight = 34;
            label.isBold = true;
            label.color = new Color(255, 230, 120, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;

            const outline = labelNode.addComponent(LabelOutline);
            outline.color = new Color(0, 0, 0, 255);
            outline.width = 3;
        }

        root.setPosition(0, this.padLabelYOffset, 0);
        const label = root.getComponentInChildren(Label);
        if (label) {
            label.string = text;
        }
    }

    private clearPadDebugLabels(): void {
        const scene = this.node.scene;
        if (!scene) return;
        let pads: BuildingPad[] = [];
        try {
            pads = scene.getComponentsInChildren(BuildingPad);
        } catch {
            return;
        }
        for (const pad of pads) {
            const node = pad.node?.getChildByName(EditorPlacementDebug.PAD_DEBUG_LABEL_NODE);
            if (node && node.isValid) {
                node.destroy();
            }
        }
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
