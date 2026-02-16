import { Node, MeshRenderer, Prefab, resources, instantiate, Renderer, assetManager } from 'cc';
import { SunflowerPreview } from '../visuals/SunflowerPreview';

/**
 * 建筑模型可视层绑定器
 * 将 BuildingFactory 中的大量模型加载/挂载细节下沉到独立模块，
 * 保持 BuildingFactory 作为创建流程编排层。
 */
export class BuildingModelVisuals {
    private static _barracksModelPrefab: Prefab | null = null;
    private static _barracksModelLoading: boolean = false;
    private static _pendingBarracksModelNodes: Node[] = [];
    private static readonly BARRACKS_MODEL_PREFAB_PATHS = [
        'building/barn_3d',
        'building/barn_3d/barn_3d',
    ];
    private static readonly BARRACKS_MODEL_PREFAB_UUIDS = [
        'b988ccf3-7c10-4afe-adca-643852d64a68@24a58',
    ];
    private static readonly BARRACKS_MODEL_NODE_NAME = 'BarracksBarnModel';
    private static readonly BARRACKS_MODEL_SCALE = 6.0;
    private static readonly BARRACKS_MODEL_Y_OFFSET = 1.3;
    private static readonly BARRACKS_MODEL_Y_ROTATION = 180;

    private static _lightningTowerModelPrefab: Prefab | null = null;
    private static _lightningTowerModelLoading: boolean = false;
    private static _pendingLightningTowerModelNodes: Node[] = [];
    private static readonly LIGHTNING_TOWER_MODEL_PREFAB_PATHS = [
        'building/radar_3d',
        'building/radar_3d/radar_3d',
    ];
    private static readonly LIGHTNING_TOWER_MODEL_NODE_NAME = 'LightningRadarModel';
    private static readonly LIGHTNING_TOWER_MODEL_SCALE = 2;
    private static readonly LIGHTNING_TOWER_MODEL_Y_OFFSET = 1.7;
    private static readonly LIGHTNING_TOWER_MODEL_Y_ROTATION = 0;
    private static readonly LIGHTNING_TOWER_DEFAULT_NODE_SCALE = { x: 0.4, y: 0.8, z: 0.4 };

    private static _baseModelPrefab: Prefab | null = null;
    private static _baseModelLoading: boolean = false;
    private static _pendingBaseModelNodes: Node[] = [];
    private static _baseModelAutoGroundOffset: number | null = null;
    private static readonly BASE_MODEL_PREFAB_PATHS = ['building/house', 'building/house/house'];
    private static readonly BASE_MODEL_NODE_NAME = 'BaseHouseModel';
    private static readonly BASE_MODEL_SCALE = 1.0;
    private static readonly BASE_MODEL_Y_OFFSET = 0.0;
    private static readonly BASE_MODEL_Y_ROTATION = 0;
    private static readonly BASE_DEFAULT_NODE_SCALE = { x: 1, y: 1, z: 1 };

    private static _spaModelPrefab: Prefab | null = null;
    private static _spaModelLoading: boolean = false;
    private static _pendingSpaModelNodes: Node[] = [];
    private static readonly SPA_MODEL_PREFAB_PATHS = ['building/spa', 'building/spa/spa'];
    private static readonly SPA_MODEL_NODE_NAME = 'SpaModel';
    private static readonly SPA_MODEL_SCALE = 3.0;
    private static readonly SPA_MODEL_Y_OFFSET = 0.0;
    private static readonly SPA_MODEL_Y_ROTATION = 0;
    private static readonly SPA_DEFAULT_NODE_SCALE = { x: 3, y: 3, z: 3 };

    private static _rifleTowerModelPrefab: Prefab | null = null;
    private static _rifleTowerModelLoading: boolean = false;
    private static _pendingRifleTowerModelNodes: Node[] = [];
    private static readonly RIFLE_TOWER_MODEL_PREFAB_PATHS = [
        'building/rifle_tower',
        'building/rifle_tower/rifle_tower',
    ];
    private static readonly RIFLE_TOWER_MODEL_NODE_NAME = 'RifleTowerModel';
    private static readonly RIFLE_TOWER_MODEL_SCALE = 1.5;
    private static readonly RIFLE_TOWER_MODEL_Y_OFFSET = 0.0;
    private static readonly RIFLE_TOWER_MODEL_Y_ROTATION = 270;
    private static readonly RIFLE_TOWER_DEFAULT_NODE_SCALE = { x: 0.4, y: 0.8, z: 0.4 };

    private static _fencebarModelPrefab: Prefab | null = null;
    private static _fencebarModelLoading: boolean = false;
    private static _pendingFencebarModelNodes: Node[] = [];
    private static readonly FENCEBAR_MODEL_PREFAB_PATHS = [
        'building/fencebar',
        'building/fencebar/fencebar',
    ];
    private static readonly FENCEBAR_MODEL_NODE_NAME = 'FencebarModel';
    private static readonly FENCEBAR_MODEL_SCALE = 1.0;
    private static readonly FENCEBAR_MODEL_Y_OFFSET = 0.51;
    private static readonly FENCEBAR_MODEL_Y_ROTATION = 0;
    private static readonly FENCEBAR_DEFAULT_NODE_SCALE = { x: 0.8, y: 0.8, z: 0.8 };

    private static _farmModelPrefab: Prefab | null = null;
    private static _farmModelLoading: boolean = false;
    private static _pendingFarmModelNodes: Node[] = [];
    private static readonly FARM_MODEL_PREFAB_PATHS = ['building/gold', 'building/gold/gold'];
    private static readonly FARM_MODEL_NODE_NAME = 'FarmModel';
    private static readonly FARM_MODEL_SCALE = 4.0;
    private static readonly FARM_MODEL_Y_OFFSET = 1.0;
    private static readonly FARM_MODEL_Y_ROTATION = -45;
    private static readonly FARM_DEFAULT_NODE_SCALE = { x: 1, y: 1, z: 1 };

    public static attachFrostTowerSunflowerVisual(node: Node): void {
        const preview = node.getComponent(SunflowerPreview) ?? node.addComponent(SunflowerPreview);
        preview.resourcePath = 'building/sunflower';
        preview.yOffset = 1.15;
        preview.visualScale = 0.036;
        preview.fps = 8;
        preview.frameCountOverride = 0;
        preview.hideOwnerMeshOnReady = true;
    }

    public static attachBarracksBarnVisual(node: Node): void {
        this.attachBarracksBarnModelAsync(node);
    }

    public static attachLightningTowerRadarModel(node: Node): void {
        this.attachLightningTowerRadarModelAsync(node);
    }

    public static attachBaseModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachBaseModel(node)) return;

        this._pendingBaseModelNodes.push(node);
        if (this._baseModelLoading) return;

        this._baseModelLoading = true;
        this.loadBaseModelPrefabByPath(0);
    }

    public static attachRifleTowerModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachRifleTowerModel(node)) return;

        this._pendingRifleTowerModelNodes.push(node);
        if (this._rifleTowerModelLoading) return;

        this._rifleTowerModelLoading = true;
        this.loadRifleTowerModelPrefabByPath(0);
    }

    public static attachSpaModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachSpaModel(node)) return;

        this._pendingSpaModelNodes.push(node);
        if (this._spaModelLoading) return;

        this._spaModelLoading = true;
        this.loadSpaModelPrefabByPath(0);
    }

    public static attachFencebarModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachFencebarModel(node)) return;

        this._pendingFencebarModelNodes.push(node);
        if (this._fencebarModelLoading) return;

        this._fencebarModelLoading = true;
        this.loadFencebarModelPrefabByPath(0);
    }

    public static attachFarmModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachFarmModel(node)) return;

        this._pendingFarmModelNodes.push(node);
        if (this._farmModelLoading) return;

        this._farmModelLoading = true;
        this.loadFarmModelPrefab(0);
    }

    private static attachBarracksBarnModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachBarracksModel(node)) return;

        this._pendingBarracksModelNodes.push(node);
        if (this._barracksModelLoading) return;

        this._barracksModelLoading = true;
        this.loadBarracksModelPrefabByPath(0);
    }

    private static tryAttachBarracksModel(node: Node): boolean {
        if (!this._barracksModelPrefab) return false;
        this.applyBarracksModel(node, this._barracksModelPrefab);
        return true;
    }

    private static loadBarracksModelPrefabByPath(index: number): void {
        if (index >= this.BARRACKS_MODEL_PREFAB_PATHS.length) {
            this.loadBarracksModelPrefabByUuid(0);
            return;
        }

        const path = this.BARRACKS_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadBarracksModelPrefabByPath(index + 1);
                return;
            }
            this.onBarracksPrefabLoaded(prefab);
        });
    }

    private static loadBarracksModelPrefabByUuid(index: number): void {
        if (index >= this.BARRACKS_MODEL_PREFAB_UUIDS.length) {
            this._barracksModelLoading = false;
            this._pendingBarracksModelNodes.length = 0;
            return;
        }
        const uuid = this.BARRACKS_MODEL_PREFAB_UUIDS[index];
        assetManager.loadAny({ uuid }, (err, asset) => {
            if (err || !(asset instanceof Prefab)) {
                this.loadBarracksModelPrefabByUuid(index + 1);
                return;
            }
            this.onBarracksPrefabLoaded(asset);
        });
    }

    private static onBarracksPrefabLoaded(prefab: Prefab): void {
        this._barracksModelLoading = false;
        this._barracksModelPrefab = prefab;
        const pending = this._pendingBarracksModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applyBarracksModel(n, prefab);
        }
    }

    private static applyBarracksModel(node: Node, prefab: Prefab): void {
        const existing = node.getChildByName(this.BARRACKS_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const preview = node.getComponent(SunflowerPreview);
        if (preview) {
            preview.enabled = false;
        }
        const visualRoot = node.getChildByName('SunflowerVisualRoot');
        if (visualRoot && visualRoot.isValid) {
            visualRoot.destroy();
        }

        const model = instantiate(prefab);
        model.name = this.BARRACKS_MODEL_NODE_NAME;
        model.setPosition(0, this.BARRACKS_MODEL_Y_OFFSET, 0);
        model.setScale(
            this.BARRACKS_MODEL_SCALE,
            this.BARRACKS_MODEL_SCALE,
            this.BARRACKS_MODEL_SCALE
        );
        model.setRotationFromEuler(0, this.BARRACKS_MODEL_Y_ROTATION, 0);
        this.applyLayerRecursive(model, node.layer);
        node.addChild(model);

        const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh && hasRenderer) {
            ownerMesh.enabled = false;
        }
    }

    private static applyLayerRecursive(root: Node, layer: number): void {
        root.layer = layer;
        const mesh = root.getComponent(MeshRenderer);
        if (mesh) {
            mesh.shadowCastingMode = 1;
            mesh.receiveShadow = 1;
        }
        for (const child of root.children) {
            this.applyLayerRecursive(child, layer);
        }
    }

    private static getUniformScaleFactor(
        node: Node,
        baseline: { x: number; y: number; z: number }
    ): number {
        const sx = Math.abs(node.scale.x) > 1e-6 ? Math.abs(node.scale.x) : 1;
        const sy = Math.abs(node.scale.y) > 1e-6 ? Math.abs(node.scale.y) : 1;
        const sz = Math.abs(node.scale.z) > 1e-6 ? Math.abs(node.scale.z) : 1;
        const curAvg = (sx + sy + sz) / 3;

        const bx = Math.abs(baseline.x) > 1e-6 ? Math.abs(baseline.x) : 1;
        const by = Math.abs(baseline.y) > 1e-6 ? Math.abs(baseline.y) : 1;
        const bz = Math.abs(baseline.z) > 1e-6 ? Math.abs(baseline.z) : 1;
        const baseAvg = (bx + by + bz) / 3;

        if (baseAvg <= 1e-6) return 1;
        return curAvg / baseAvg;
    }

    private static attachLightningTowerRadarModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachLightningTowerModel(node)) return;

        this._pendingLightningTowerModelNodes.push(node);
        if (this._lightningTowerModelLoading) return;

        this._lightningTowerModelLoading = true;
        this.loadLightningTowerModelPrefabByPath(0);
    }

    private static tryAttachLightningTowerModel(node: Node): boolean {
        if (!this._lightningTowerModelPrefab) return false;
        this.applyLightningTowerModel(node, this._lightningTowerModelPrefab);
        return true;
    }

    private static onLightningTowerModelPrefabLoaded(prefab: Prefab): void {
        this._lightningTowerModelLoading = false;
        this._lightningTowerModelPrefab = prefab;
        const pending = this._pendingLightningTowerModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applyLightningTowerModel(n, prefab);
        }
    }

    private static applyLightningTowerModel(node: Node, prefab: Prefab): void {
        const existing = node.getChildByName(this.LIGHTNING_TOWER_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const preview = node.getComponent(SunflowerPreview);
        if (preview) {
            preview.enabled = false;
        }
        const visualRoot = node.getChildByName('SunflowerVisualRoot');
        if (visualRoot && visualRoot.isValid) {
            visualRoot.destroy();
        }

        const model = instantiate(prefab);
        model.name = this.LIGHTNING_TOWER_MODEL_NODE_NAME;
        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const scaleFactor = this.getUniformScaleFactor(
            node,
            this.LIGHTNING_TOWER_DEFAULT_NODE_SCALE
        );
        model.setPosition(0, this.LIGHTNING_TOWER_MODEL_Y_OFFSET / parentScaleY, 0);
        model.setScale(
            (this.LIGHTNING_TOWER_MODEL_SCALE * scaleFactor) / parentScaleX,
            (this.LIGHTNING_TOWER_MODEL_SCALE * scaleFactor) / parentScaleY,
            (this.LIGHTNING_TOWER_MODEL_SCALE * scaleFactor) / parentScaleZ
        );
        model.setRotationFromEuler(0, this.LIGHTNING_TOWER_MODEL_Y_ROTATION, 0);
        this.applyLayerRecursive(model, node.layer);
        node.addChild(model);

        const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh && hasRenderer) {
            ownerMesh.enabled = false;
        }
    }

    private static loadLightningTowerModelPrefabByPath(index: number): void {
        if (index >= this.LIGHTNING_TOWER_MODEL_PREFAB_PATHS.length) {
            this._lightningTowerModelLoading = false;
            this._pendingLightningTowerModelNodes.length = 0;
            return;
        }

        const path = this.LIGHTNING_TOWER_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadLightningTowerModelPrefabByPath(index + 1);
                return;
            }
            this.onLightningTowerModelPrefabLoaded(prefab);
        });
    }

    private static tryAttachBaseModel(node: Node): boolean {
        if (!this._baseModelPrefab) return false;
        this.applyBaseModel(node, this._baseModelPrefab);
        return true;
    }

    private static loadBaseModelPrefabByPath(index: number): void {
        if (index >= this.BASE_MODEL_PREFAB_PATHS.length) {
            this._baseModelLoading = false;
            this._pendingBaseModelNodes.length = 0;
            return;
        }

        const path = this.BASE_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadBaseModelPrefabByPath(index + 1);
                return;
            }
            this.onBaseModelPrefabLoaded(prefab);
        });
    }

    private static onBaseModelPrefabLoaded(prefab: Prefab): void {
        this._baseModelLoading = false;
        this._baseModelPrefab = prefab;
        this._baseModelAutoGroundOffset = this.estimateModelGroundOffset(prefab);
        const pending = this._pendingBaseModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applyBaseModel(n, prefab);
        }
    }

    private static applyBaseModel(node: Node, prefab: Prefab): void {
        const existing = node.getChildByName(this.BASE_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const model = instantiate(prefab);
        model.name = this.BASE_MODEL_NODE_NAME;

        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const groundOffset = this.getBaseModelGroundOffset(prefab);
        const scaleFactor = this.getUniformScaleFactor(node, this.BASE_DEFAULT_NODE_SCALE);

        model.setPosition(
            0,
            (this.BASE_MODEL_Y_OFFSET + groundOffset * scaleFactor) / parentScaleY,
            0
        );
        model.setScale(
            (this.BASE_MODEL_SCALE * scaleFactor) / parentScaleX,
            (this.BASE_MODEL_SCALE * scaleFactor) / parentScaleY,
            (this.BASE_MODEL_SCALE * scaleFactor) / parentScaleZ
        );
        model.setRotationFromEuler(0, this.BASE_MODEL_Y_ROTATION, 0);

        this.applyLayerRecursive(model, node.layer);
        node.addChild(model);

        const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh && hasRenderer) {
            ownerMesh.enabled = false;
        }
    }

    private static getBaseModelGroundOffset(prefab: Prefab): number {
        if (this._baseModelAutoGroundOffset === null) {
            this._baseModelAutoGroundOffset = this.estimateModelGroundOffset(prefab);
        }
        return this._baseModelAutoGroundOffset ?? 0;
    }

    private static estimateModelGroundOffset(prefab: Prefab): number {
        const probe = instantiate(prefab);
        let minLocalY = Number.POSITIVE_INFINITY;

        const renderers = probe.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            const mesh = (renderer as unknown as { mesh?: any }).mesh;
            if (!mesh) continue;

            const rawMinY = mesh?.struct?.minPosition?.y ?? mesh?._struct?.minPosition?.y;
            if (typeof rawMinY !== 'number' || !Number.isFinite(rawMinY)) continue;

            const nodeScaleY = renderer.node.scale.y;
            const nodePosY = renderer.node.position.y;
            const scaledMinY = nodePosY + rawMinY * nodeScaleY;
            if (scaledMinY < minLocalY) {
                minLocalY = scaledMinY;
            }
        }

        probe.destroy();

        if (!Number.isFinite(minLocalY)) {
            return 0;
        }

        return Math.max(0, -minLocalY * this.BASE_MODEL_SCALE);
    }

    private static tryAttachRifleTowerModel(node: Node): boolean {
        if (!this._rifleTowerModelPrefab) return false;
        this.applyRifleTowerModel(node, this._rifleTowerModelPrefab);
        return true;
    }

    private static loadRifleTowerModelPrefabByPath(index: number): void {
        if (index >= this.RIFLE_TOWER_MODEL_PREFAB_PATHS.length) {
            this._rifleTowerModelLoading = false;
            this._pendingRifleTowerModelNodes.length = 0;
            return;
        }

        const path = this.RIFLE_TOWER_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadRifleTowerModelPrefabByPath(index + 1);
                return;
            }
            this.onRifleTowerModelPrefabLoaded(prefab);
        });
    }

    private static onRifleTowerModelPrefabLoaded(prefab: Prefab): void {
        this._rifleTowerModelLoading = false;
        this._rifleTowerModelPrefab = prefab;
        const pending = this._pendingRifleTowerModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applyRifleTowerModel(n, prefab);
        }
    }

    private static applyRifleTowerModel(node: Node, prefab: Prefab): void {
        const existing = node.getChildByName(this.RIFLE_TOWER_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const model = instantiate(prefab);
        model.name = this.RIFLE_TOWER_MODEL_NODE_NAME;

        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const scaleFactor = this.getUniformScaleFactor(node, this.RIFLE_TOWER_DEFAULT_NODE_SCALE);

        model.setPosition(0, this.RIFLE_TOWER_MODEL_Y_OFFSET / parentScaleY, 0);
        model.setScale(
            (this.RIFLE_TOWER_MODEL_SCALE * scaleFactor) / parentScaleX,
            (this.RIFLE_TOWER_MODEL_SCALE * scaleFactor) / parentScaleY,
            (this.RIFLE_TOWER_MODEL_SCALE * scaleFactor) / parentScaleZ
        );
        model.setRotationFromEuler(0, this.RIFLE_TOWER_MODEL_Y_ROTATION, 0);

        this.applyLayerRecursive(model, node.layer);
        node.addChild(model);

        const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh && hasRenderer) {
            ownerMesh.enabled = false;
        }
    }

    private static tryAttachSpaModel(node: Node): boolean {
        if (!this._spaModelPrefab) return false;
        this.applySpaModel(node, this._spaModelPrefab);
        return true;
    }

    private static loadSpaModelPrefabByPath(index: number): void {
        if (index >= this.SPA_MODEL_PREFAB_PATHS.length) {
            this._spaModelLoading = false;
            this._pendingSpaModelNodes.length = 0;
            return;
        }

        const path = this.SPA_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadSpaModelPrefabByPath(index + 1);
                return;
            }
            this.onSpaModelPrefabLoaded(prefab);
        });
    }

    private static onSpaModelPrefabLoaded(prefab: Prefab): void {
        this._spaModelLoading = false;
        this._spaModelPrefab = prefab;
        const pending = this._pendingSpaModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applySpaModel(n, prefab);
        }
    }

    private static applySpaModel(node: Node, prefab: Prefab): void {
        const existing = node.getChildByName(this.SPA_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const model = instantiate(prefab);
        model.name = this.SPA_MODEL_NODE_NAME;

        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const scaleFactor = this.getUniformScaleFactor(node, this.SPA_DEFAULT_NODE_SCALE);

        model.setPosition(0, this.SPA_MODEL_Y_OFFSET / parentScaleY, 0);
        model.setScale(
            (this.SPA_MODEL_SCALE * scaleFactor) / parentScaleX,
            (this.SPA_MODEL_SCALE * scaleFactor) / parentScaleY,
            (this.SPA_MODEL_SCALE * scaleFactor) / parentScaleZ
        );
        model.setRotationFromEuler(0, this.SPA_MODEL_Y_ROTATION, 0);

        this.applyLayerRecursive(model, node.layer);
        node.addChild(model);

        const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh && hasRenderer) {
            ownerMesh.enabled = false;
        }
    }

    private static tryAttachFencebarModel(node: Node): boolean {
        if (!this._fencebarModelPrefab) return false;
        this.applyFencebarModel(node, this._fencebarModelPrefab);
        return true;
    }

    private static loadFencebarModelPrefabByPath(index: number): void {
        if (index >= this.FENCEBAR_MODEL_PREFAB_PATHS.length) {
            this._fencebarModelLoading = false;
            this._pendingFencebarModelNodes.length = 0;
            return;
        }

        const path = this.FENCEBAR_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadFencebarModelPrefabByPath(index + 1);
                return;
            }
            this.onFencebarModelPrefabLoaded(prefab);
        });
    }

    private static onFencebarModelPrefabLoaded(prefab: Prefab): void {
        this._fencebarModelLoading = false;
        this._fencebarModelPrefab = prefab;
        const pending = this._pendingFencebarModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applyFencebarModel(n, prefab);
        }
    }

    private static applyFencebarModel(node: Node, prefab: Prefab): void {
        const existing = node.getChildByName(this.FENCEBAR_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const container = new Node(this.FENCEBAR_MODEL_NODE_NAME);

        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const scaleFactor = this.getUniformScaleFactor(node, this.FENCEBAR_DEFAULT_NODE_SCALE);

        container.setPosition(0, this.FENCEBAR_MODEL_Y_OFFSET / parentScaleY, 0);
        container.setRotationFromEuler(0, this.FENCEBAR_MODEL_Y_ROTATION, 0);

        const containerScaleX = (this.FENCEBAR_MODEL_SCALE * scaleFactor) / parentScaleX;
        const containerScaleY = (this.FENCEBAR_MODEL_SCALE * scaleFactor) / parentScaleY;
        const containerScaleZ = (this.FENCEBAR_MODEL_SCALE * scaleFactor) / parentScaleZ;

        container.setScale(containerScaleX, containerScaleY, containerScaleZ);

        this.applyLayerRecursive(container, node.layer);
        node.addChild(container);

        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh) {
            ownerMesh.enabled = false;
        }

        const barCount = 20;
        const gap = 0.05;

        const modelWidth = this.estimateModelXSize(prefab);
        const effectiveWidth = modelWidth > 0 ? modelWidth : 0.5;
        const step = effectiveWidth + gap;

        const totalSpan = step * (barCount - 1);
        const startX = -totalSpan / 2;

        for (let i = 0; i < barCount; i++) {
            const bar = instantiate(prefab);
            bar.setPosition(startX + i * step, 0, 0);
            this.applyLayerRecursive(bar, node.layer);
            container.addChild(bar);
        }
    }

    private static estimateModelXSize(prefab: Prefab): number {
        const probe = instantiate(prefab);
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let found = false;

        const renderers = probe.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            const mesh = (renderer as unknown as { mesh?: any }).mesh;
            if (!mesh) continue;

            const minPos = mesh?.struct?.minPosition ?? mesh?._struct?.minPosition;
            const maxPos = mesh?.struct?.maxPosition ?? mesh?._struct?.maxPosition;

            if (!minPos || !maxPos) continue;

            const nodeScaleX = renderer.node.scale.x;
            const nodePosX = renderer.node.position.x;

            const worldMinX = nodePosX + minPos.x * nodeScaleX;
            const worldMaxX = nodePosX + maxPos.x * nodeScaleX;

            if (worldMinX < minX) minX = worldMinX;
            if (worldMaxX > maxX) maxX = worldMaxX;
            found = true;
        }

        probe.destroy();

        if (found && Number.isFinite(minX) && Number.isFinite(maxX)) {
            return maxX - minX;
        }
        return 0;
    }

    private static tryAttachFarmModel(node: Node): boolean {
        if (!this._farmModelPrefab) return false;
        this.applyFarmModel(node, this._farmModelPrefab);
        return true;
    }

    private static loadFarmModelPrefab(index: number): void {
        if (index >= this.FARM_MODEL_PREFAB_PATHS.length) {
            this._farmModelLoading = false;
            this._pendingFarmModelNodes.length = 0;
            return;
        }

        const path = this.FARM_MODEL_PREFAB_PATHS[index];
        resources.load(path, Prefab, (err, prefab) => {
            if (err || !prefab) {
                this.loadFarmModelPrefab(index + 1);
                return;
            }
            this.onFarmPrefabLoaded(prefab);
        });
    }

    private static onFarmPrefabLoaded(prefab: Prefab): void {
        this._farmModelLoading = false;
        this._farmModelPrefab = prefab;
        const pending = this._pendingFarmModelNodes.splice(0);
        for (const n of pending) {
            if (!n || !n.isValid) continue;
            this.applyFarmModel(n, prefab);
        }
    }

    private static applyFarmModel(node: Node, prefab: Prefab): void {
        const legacyPlatform = node.getChildByName('FarmPlatform');
        if (legacyPlatform && legacyPlatform.isValid) {
            legacyPlatform.destroy();
        }

        const existing = node.getChildByName(this.FARM_MODEL_NODE_NAME);
        if (existing && existing.isValid) return;

        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const scaleFactor = this.getUniformScaleFactor(node, this.FARM_DEFAULT_NODE_SCALE);

        const model = instantiate(prefab);
        model.name = this.FARM_MODEL_NODE_NAME;
        model.setPosition(0, this.FARM_MODEL_Y_OFFSET / parentScaleY, 0);
        model.setScale(
            (this.FARM_MODEL_SCALE * scaleFactor) / parentScaleX,
            (this.FARM_MODEL_SCALE * scaleFactor) / parentScaleY,
            (this.FARM_MODEL_SCALE * scaleFactor) / parentScaleZ
        );
        model.setRotationFromEuler(0, this.FARM_MODEL_Y_ROTATION, 0);
        this.applyLayerRecursive(model, node.layer);
        node.addChild(model);

        const hasRenderer = model.getComponentsInChildren(Renderer).length > 0;
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh && hasRenderer) {
            ownerMesh.enabled = false;
        }
    }
}
