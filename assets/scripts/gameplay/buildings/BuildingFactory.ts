import {
    Node,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Color,
    Prefab,
    resources,
    instantiate,
    Renderer,
    assetManager,
} from 'cc';
import { Building, BuildingType } from './Building';
import { Tower } from './Tower';
import { GameConfig } from '../../data/GameConfig';
import { BuildingRegistry, BuildingTypeConfig } from './BuildingRegistry';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { Base } from './Base';
import { SunflowerPreview } from '../visuals/SunflowerPreview';
import { Spa } from './Spa';

/**
 * 建筑工厂
 * 负责创建和配置所有建筑实体
 */
export class BuildingFactory {
    private static _materials: Map<string, Material> = new Map();
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

    // === Base House Model ===
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

    // === Spa Model ===
    private static _spaModelPrefab: Prefab | null = null;
    private static _spaModelLoading: boolean = false;
    private static _pendingSpaModelNodes: Node[] = [];
    private static readonly SPA_MODEL_PREFAB_PATHS = ['building/spa', 'building/spa/spa'];
    private static readonly SPA_MODEL_NODE_NAME = 'SpaModel';
    private static readonly SPA_MODEL_SCALE = 3.0;
    private static readonly SPA_MODEL_Y_OFFSET = 0.0;
    private static readonly SPA_MODEL_Y_ROTATION = 0;
    private static readonly SPA_DEFAULT_NODE_SCALE = { x: 3, y: 3, z: 3 };

    // === Rifle Tower Model ===
    private static _rifleTowerModelPrefab: Prefab | null = null;
    private static _rifleTowerModelLoading: boolean = false;
    private static _pendingRifleTowerModelNodes: Node[] = [];
    private static readonly RIFLE_TOWER_MODEL_PREFAB_PATHS = [
        'building/rifle_tower',
        'building/rifle_tower/rifle_tower',
    ];
    private static readonly RIFLE_TOWER_MODEL_NODE_NAME = 'RifleTowerModel';
    private static readonly RIFLE_TOWER_MODEL_SCALE = 1.5; // Scaled up 3x from 0.5
    private static readonly RIFLE_TOWER_MODEL_Y_OFFSET = 0.0;
    private static readonly RIFLE_TOWER_MODEL_Y_ROTATION = 270;
    private static readonly RIFLE_TOWER_DEFAULT_NODE_SCALE = { x: 0.4, y: 0.8, z: 0.4 };

    // === Fencebar (Wall) Model ===
    private static _fencebarModelPrefab: Prefab | null = null;
    private static _fencebarModelLoading: boolean = false;
    private static _pendingFencebarModelNodes: Node[] = [];
    private static readonly FENCEBAR_MODEL_PREFAB_PATHS = [
        'building/fencebar',
        'building/fencebar/fencebar',
    ];
    private static readonly FENCEBAR_MODEL_NODE_NAME = 'FencebarModel';
    private static readonly FENCEBAR_MODEL_SCALE = 1.0;
    // fencebar mesh pivot is centered (~ -0.5009..0.5006), lift it so the bottom sits on ground.
    private static readonly FENCEBAR_MODEL_Y_OFFSET = 0.51;
    private static readonly FENCEBAR_MODEL_Y_ROTATION = 0;
    private static readonly FENCEBAR_DEFAULT_NODE_SCALE = { x: 0.8, y: 0.8, z: 0.8 };

    // === Farm (Gold Mine) Model ===
    private static _farmModelPrefab: Prefab | null = null;
    private static _farmModelLoading: boolean = false;
    private static _pendingFarmModelNodes: Node[] = [];
    private static readonly FARM_MODEL_PREFAB_PATHS = ['building/gold', 'building/gold/gold'];
    private static readonly FARM_MODEL_NODE_NAME = 'FarmModel';
    private static readonly FARM_MODEL_SCALE = 4.0;
    private static readonly FARM_MODEL_Y_OFFSET = 1.0;
    private static readonly FARM_MODEL_Y_ROTATION = -45; // Rotate to add depth
    private static readonly FARM_DEFAULT_NODE_SCALE = { x: 1, y: 1, z: 1 };

    public static createBarracks(parent: Node, x: number, z: number): Node {
        const barracksConfig = this.requireBuildingConfig('barracks');
        const node = this.createCubeNode('Barracks', new Color(100, 180, 100, 255));
        node.setPosition(x, 0, z); // 3D 坐标：Y=0 在地面
        node.setScale(0.45, 0.45, 0.45);
        parent.addChild(node);
        this.attachBarracksBarnVisual(node);

        const building = node.addComponent(Building);
        building.setConfig({
            type: BuildingType.BARRACKS,
            typeId: 'barracks',
            nameKey: barracksConfig.nameKey,
            cost: barracksConfig.cost,
            hp: barracksConfig.stats?.hp ?? GameConfig.BUILDING.BASE_HP,
            spawnInterval:
                barracksConfig.features?.spawnInterval ?? GameConfig.BUILDING.SPAWN_INTERVAL,
            maxUnits:
                barracksConfig.features?.maxUnits ?? GameConfig.BUILDING.MAX_SOLDIERS_PER_BARRACKS,
        });
        building.setUpgradeConfig({
            maxLevel: barracksConfig.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
            costMultiplier:
                barracksConfig.upgrades?.costMultiplier ??
                GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
            statMultiplier: barracksConfig.upgrades?.statMultiplier ?? 1.2,
            spawnIntervalMultiplier: barracksConfig.upgrades?.spawnIntervalMultiplier ?? 0.92,
            maxUnitsPerLevel: barracksConfig.upgrades?.maxUnitsPerLevel ?? 1,
            spawnBatchPerLevel: barracksConfig.upgrades?.spawnBatchPerLevel ?? 1,
        });

        return node;
    }

    /**
     * 创建基地
     */
    public static createBase(parent: Node, x: number, z: number, hp: number = 500): Node {
        const baseConfig = this.requireBuildingConfig('base');
        const node = this.createCubeNode('Base', new Color(150, 100, 200, 255));
        node.setPosition(x, 0, z);
        const baseScale = baseConfig?.visual?.scale ?? this.BASE_DEFAULT_NODE_SCALE;
        node.setScale(baseScale.x, baseScale.y, baseScale.z);

        const base = node.addComponent(Base);
        base.setConfig({
            type: BuildingType.BASE,
            typeId: 'base',
            nameKey: baseConfig.nameKey,
            hp: hp,
            spawnInterval: 0,
            maxUnits: 0,
        });
        // Ensure Base.onLoad reads configured HP (avoid one-frame HUD mismatch at default 500).
        parent.addChild(node);

        this.attachBaseModelAsync(node);

        return node;
    }

    /**
     * 创建 3D 立方体节点
     */
    private static createCubeNode(name: string, color: Color): Node {
        const node = new Node(name);
        const renderer = node.addComponent(MeshRenderer);

        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );

        const colorKey = `${color.r}_${color.g}_${color.b}`;
        let material = this._materials.get(colorKey);

        if (!material) {
            material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', color);
            this._materials.set(colorKey, material);
        }

        renderer.material = material;
        renderer.shadowCastingMode = 1;
        renderer.receiveShadow = true;
        return node;
    }

    /**
     * 创建防御塔
     */
    public static createTower(parent: Node, x: number, z: number): Node {
        const towerConfig = this.requireBuildingConfig('tower');
        // 红色/黄色区分防御塔
        const node = this.createCubeNode('Tower', new Color(220, 220, 60, 255)); // Yellow
        node.setPosition(x, 0, z);
        node.setPosition(x, 0, z);
        node.setScale(0.8, 0.8, 0.8); // Adjusted scale for model
        parent.addChild(node);

        this.attachRifleTowerModelAsync(node);

        const tower = node.addComponent(Tower);
        tower.setConfig({
            type: BuildingType.TOWER,
            typeId: 'tower',
            nameKey: towerConfig.nameKey,
            cost: towerConfig.cost,
            hp: towerConfig.stats?.hp ?? 300,
            // Towers don't spawn soldiers, so these values might be ignored or used differently
            spawnInterval: 0,
            maxUnits: 0,
        });

        // Custom Tower Config
        tower.attackRange = towerConfig.stats?.attackRange ?? 18;
        tower.attackDamage = towerConfig.stats?.attackDamage ?? 26;
        tower.attackInterval = towerConfig.stats?.attackInterval ?? 0.45;
        tower.setUpgradeConfig({
            maxLevel: towerConfig.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
            costMultiplier:
                towerConfig.upgrades?.costMultiplier ?? GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
            statMultiplier: towerConfig.upgrades?.statMultiplier ?? 1.2,
        });
        tower.setTowerUpgradeConfig({
            attackMultiplier: towerConfig.upgrades?.attackMultiplier ?? 1.22,
            rangeMultiplier: towerConfig.upgrades?.rangeMultiplier ?? 1.03,
            intervalMultiplier: towerConfig.upgrades?.intervalMultiplier ?? 0.95,
            chainRangePerLevel: towerConfig.upgrades?.chainRangePerLevel ?? 0,
        });

        return node;
    }

    /**
     * 创建冰霜塔 (AOE Slow)
     */
    public static createFrostTower(parent: Node, x: number, z: number): Node {
        const frostConfig = this.requireBuildingConfig('frost_tower');
        const node = this.createCubeNode('FrostTower', new Color(60, 100, 220, 255)); // Blue
        node.setPosition(x, 0, z);
        const scale = frostConfig?.visual?.scale || { x: 0.52, y: 1.02, z: 0.52 };
        node.setScale(scale.x, scale.y, scale.z);
        parent.addChild(node);
        this.attachFrostTowerSunflowerVisual(node);

        const tower = node.addComponent(Tower);
        tower.setConfig({
            type: BuildingType.FROST_TOWER,
            typeId: 'frost_tower',
            nameKey: frostConfig.nameKey,
            cost: frostConfig.cost,
            hp: frostConfig.stats?.hp ?? 280,
            spawnInterval: 0,
            maxUnits: 0,
        });

        // Frost Config (Low Damage, AOE Slow)
        tower.attackRange = frostConfig.stats?.attackRange ?? 16;
        tower.attackDamage = frostConfig.stats?.attackDamage ?? 12;
        tower.attackInterval = frostConfig.stats?.attackInterval ?? 0.8;

        // Bullet Visuals & Effects
        tower.bulletColor = new Color().fromHEX(frostConfig.features?.bulletColorHex ?? '#0096FF');
        tower.bulletExplosionRadius = frostConfig.features?.bulletExplosionRadius ?? 2.8;
        tower.bulletSlowPercent = frostConfig.features?.bulletSlowPercent ?? 0.45;
        tower.bulletSlowDuration = frostConfig.features?.bulletSlowDuration ?? 2.2;
        tower.castRainDirectly = frostConfig.features?.directRainCast ?? true;
        tower.rainRadiusPerLevel = frostConfig.features?.rainRadiusPerLevel ?? 0.22;
        tower.setUpgradeConfig({
            maxLevel: frostConfig.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
            costMultiplier:
                frostConfig.upgrades?.costMultiplier ?? GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
            statMultiplier: frostConfig.upgrades?.statMultiplier ?? 1.18,
        });
        tower.setTowerUpgradeConfig({
            attackMultiplier: frostConfig.upgrades?.attackMultiplier ?? 1.15,
            rangeMultiplier: frostConfig.upgrades?.rangeMultiplier ?? 1.03,
            intervalMultiplier: frostConfig.upgrades?.intervalMultiplier ?? 0.96,
            chainRangePerLevel: frostConfig.upgrades?.chainRangePerLevel ?? 0,
        });

        return node;
    }

    /**
     * Generic Building Creator (Data-Driven)
     */
    public static createBuilding(
        parent: Node,
        x: number,
        z: number,
        buildingId: string,
        unitContainer?: Node,
        angle: number = 0
    ): Node | null {
        const config = BuildingFactory.buildingRegistry.get(buildingId);
        if (!config) {
            console.error(`[BuildingFactory] Unknown building ID: ${buildingId}`);
            return null;
        }

        // 1. Visuals
        const colorHex = config.visual?.colorHex || '#FFFFFF';
        const color = new Color().fromHEX(colorHex);
        const node = this.createCubeNode(`Building_${buildingId}`, color);
        node.setPosition(x, 0, z);
        const scale = config.visual?.scale || { x: 1, y: 1, z: 1 };
        node.setScale(scale.x, scale.y, scale.z);
        if (angle !== 0) {
            node.setRotationFromEuler(0, angle, 0);
        }
        parent.addChild(node);

        // 2. Component Logic
        if (config.role === 'barracks' || config.role === 'building') {
            if (buildingId === 'barracks') {
                this.attachBarracksBarnVisual(node);
            } else if (buildingId === 'spa') {
                this.attachSpaModelAsync(node);
            } else if (buildingId === 'wall') {
                this.attachFencebarModelAsync(node);
            } else if (buildingId === 'farm') {
                this.attachFarmModelAsync(node);
            }
            const building =
                buildingId === 'spa' ? node.addComponent(Spa) : node.addComponent(Building);
            const isBarracks = config.role === 'barracks';
            const isFarm = buildingId === 'farm';
            building.setConfig({
                type: this.resolveBuildingType(buildingId, config.role),
                typeId: buildingId,
                nameKey: config.nameKey,
                cost: config.cost,
                hp: config.stats?.hp || 100,
                spawnInterval: isBarracks ? (config.features?.spawnInterval ?? 4.5) : 0,
                maxUnits: isBarracks ? (config.features?.maxUnits ?? 3) : 0,
                tauntRange: config.stats?.tauntRange ?? 0,
                incomePerTick: isFarm
                    ? Math.max(1, Math.floor(config.features?.incomePerTick ?? 1))
                    : undefined,
                incomeInterval: isFarm
                    ? Math.max(0.5, config.features?.incomeInterval ?? 6)
                    : undefined,
            });
            building.setUpgradeConfig({
                maxLevel: config.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
                costMultiplier:
                    config.upgrades?.costMultiplier ?? GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
                statMultiplier: config.upgrades?.statMultiplier ?? 1.2,
                spawnIntervalMultiplier: config.upgrades?.spawnIntervalMultiplier ?? 0.93,
                maxUnitsPerLevel: config.upgrades?.maxUnitsPerLevel ?? 0,
                spawnBatchPerLevel: isBarracks ? (config.upgrades?.spawnBatchPerLevel ?? 1) : 0,
                incomeMultiplier: isFarm ? (config.upgrades?.incomeMultiplier ?? 1.2) : undefined,
            });

            if (buildingId === 'spa') {
                const spaFeatures = config.features as
                    | { healRadius?: number; healInterval?: number }
                    | undefined;
                (building as Spa).setHealConfig({
                    radius: spaFeatures?.healRadius ?? 5,
                    healPercentPerSecond: 0.1,
                    tickInterval: spaFeatures?.healInterval ?? 1,
                });
            }

            if (unitContainer) {
                building.setUnitContainer(unitContainer);
            }
        } else if (config.role === 'tower') {
            if (buildingId === 'frost_tower') {
                this.attachFrostTowerSunflowerVisual(node);
            } else if (buildingId === 'lightning_tower') {
                this.attachLightningTowerRadarModel(node);
            } else if (buildingId === 'tower') {
                this.attachRifleTowerModelAsync(node);
            }

            const tower = node.addComponent(Tower);
            tower.setConfig({
                type: this.resolveBuildingType(buildingId, config.role),
                typeId: buildingId,
                nameKey: config.nameKey,
                cost: config.cost,
                hp: config.stats?.hp || 300,
                spawnInterval: 0,
                maxUnits: 0,
            });
            tower.setUpgradeConfig({
                maxLevel: config.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
                costMultiplier:
                    config.upgrades?.costMultiplier ?? GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
                statMultiplier: config.upgrades?.statMultiplier ?? 1.2,
            });
            tower.setTowerUpgradeConfig({
                attackMultiplier: config.upgrades?.attackMultiplier ?? 1.2,
                rangeMultiplier: config.upgrades?.rangeMultiplier ?? 1.03,
                intervalMultiplier: config.upgrades?.intervalMultiplier ?? 0.95,
                chainRangePerLevel: config.upgrades?.chainRangePerLevel ?? 0,
            });

            // Apply stats
            if (config.stats) {
                if (config.stats.attackRange !== undefined)
                    tower.attackRange = config.stats.attackRange;
                if (config.stats.attackDamage !== undefined)
                    tower.attackDamage = config.stats.attackDamage;
                if (config.stats.attackInterval !== undefined)
                    tower.attackInterval = config.stats.attackInterval;
            }

            // Apply features
            if (config.features) {
                if (config.features.bulletColorHex !== undefined) {
                    tower.bulletColor = new Color().fromHEX(config.features.bulletColorHex);
                }
                if (config.features.bulletExplosionRadius !== undefined)
                    tower.bulletExplosionRadius = config.features.bulletExplosionRadius;
                if (config.features.bulletSlowPercent !== undefined)
                    tower.bulletSlowPercent = config.features.bulletSlowPercent;
                if (config.features.bulletSlowDuration !== undefined)
                    tower.bulletSlowDuration = config.features.bulletSlowDuration;
                if (config.features.directRainCast !== undefined)
                    tower.castRainDirectly = config.features.directRainCast;
                if (config.features.rainRadiusPerLevel !== undefined)
                    tower.rainRadiusPerLevel = config.features.rainRadiusPerLevel;

                // Chain Lightning
                if (config.features.chainCount !== undefined)
                    tower.chainCount = config.features.chainCount;
                if (config.features.chainCountPerLevel !== undefined)
                    tower.chainCountPerLevel = config.features.chainCountPerLevel;
                if (config.features.chainRange !== undefined)
                    tower.chainRange = config.features.chainRange;

                if (config.features.useLaserVisual !== undefined)
                    tower.useLaserVisual = config.features.useLaserVisual;
            }
        }

        return node;
    }

    /**
     * 清理材质缓存
     */
    public static clearCache(): void {
        this._materials.clear();
    }

    private static get buildingRegistry(): BuildingRegistry {
        return (
            ServiceRegistry.get<BuildingRegistry>('BuildingRegistry') ?? BuildingRegistry.instance
        );
    }

    private static requireBuildingConfig(buildingId: string): BuildingTypeConfig {
        const config = this.buildingRegistry.get(buildingId);
        if (!config) {
            throw new Error(`[BuildingFactory] Missing building config: ${buildingId}`);
        }
        return config;
    }

    private static resolveBuildingType(
        buildingId: string,
        role?: 'building' | 'tower' | 'barracks'
    ): BuildingType {
        if (buildingId === 'frost_tower') return BuildingType.FROST_TOWER;
        if (buildingId === 'lightning_tower') return BuildingType.LIGHTNING_TOWER;
        if (role === 'tower') return BuildingType.TOWER;

        if (buildingId === 'wall') return BuildingType.WALL;
        if (buildingId === 'base') return BuildingType.BASE;
        if (buildingId === 'spa') return BuildingType.SPA;
        if (buildingId === 'farm') return BuildingType.FARM;

        if (role === 'barracks' || buildingId === 'barracks') return BuildingType.BARRACKS;
        return BuildingType.BARRACKS;
    }

    private static attachFrostTowerSunflowerVisual(node: Node): void {
        const preview = node.getComponent(SunflowerPreview) ?? node.addComponent(SunflowerPreview);
        preview.resourcePath = 'building/sunflower';
        preview.yOffset = 1.15;
        preview.visualScale = 0.036;
        preview.fps = 8;
        preview.frameCountOverride = 0;
        preview.hideOwnerMeshOnReady = true;
    }

    private static attachBarracksBarnVisual(node: Node): void {
        this.attachBarracksBarnModelAsync(node);
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
            mesh.receiveShadow = true;
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

    private static attachLightningTowerRadarModel(node: Node): void {
        this.attachLightningTowerRadarModelAsync(node);
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
        // Compensate parent non-uniform scale so the imported model keeps aspect ratio.
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
            // Keep cube mesh when 3D model load fails.
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

    // =================================================================================
    // Base House Model Logic
    // =================================================================================

    private static attachBaseModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachBaseModel(node)) return;

        this._pendingBaseModelNodes.push(node);
        if (this._baseModelLoading) return;

        this._baseModelLoading = true;
        this.loadBaseModelPrefabByPath(0);
    }

    private static tryAttachBaseModel(node: Node): boolean {
        if (!this._baseModelPrefab) return false;
        this.applyBaseModel(node, this._baseModelPrefab);
        return true;
    }

    private static loadBaseModelPrefabByPath(index: number): void {
        if (index >= this.BASE_MODEL_PREFAB_PATHS.length) {
            // Keep cube mesh when 3D model load fails.
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

        // When base is enlarged, lift by scaled ground offset to keep feet on ground.
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

        // Raise model so its lowest point touches y=0 plane.
        return Math.max(0, -minLocalY * this.BASE_MODEL_SCALE);
    }

    // =================================================================================
    // Rifle Tower Model Logic
    // =================================================================================

    private static attachRifleTowerModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachRifleTowerModel(node)) return;

        this._pendingRifleTowerModelNodes.push(node);
        if (this._rifleTowerModelLoading) return;

        this._rifleTowerModelLoading = true;
        this.loadRifleTowerModelPrefabByPath(0);
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

    // =================================================================================
    // Spa Model Logic
    // =================================================================================

    private static attachSpaModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachSpaModel(node)) return;

        this._pendingSpaModelNodes.push(node);
        if (this._spaModelLoading) return;

        this._spaModelLoading = true;
        this.loadSpaModelPrefabByPath(0);
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

    // =================================================================================
    // Fencebar (Wall) Model Logic
    // =================================================================================

    private static attachFencebarModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachFencebarModel(node)) return;

        this._pendingFencebarModelNodes.push(node);
        if (this._fencebarModelLoading) return;

        this._fencebarModelLoading = true;
        this.loadFencebarModelPrefabByPath(0);
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

        // Container for the 10 bars
        const container = new Node(this.FENCEBAR_MODEL_NODE_NAME);

        const parentScale = node.scale;
        const parentScaleX = Math.abs(parentScale.x) > 1e-6 ? Math.abs(parentScale.x) : 1;
        const parentScaleY = Math.abs(parentScale.y) > 1e-6 ? Math.abs(parentScale.y) : 1;
        const parentScaleZ = Math.abs(parentScale.z) > 1e-6 ? Math.abs(parentScale.z) : 1;
        const scaleFactor = this.getUniformScaleFactor(node, this.FENCEBAR_DEFAULT_NODE_SCALE);

        // Position container at the correct height
        container.setPosition(0, this.FENCEBAR_MODEL_Y_OFFSET / parentScaleY, 0);

        // Apply rotation to container
        container.setRotationFromEuler(0, this.FENCEBAR_MODEL_Y_ROTATION, 0);

        // Apply scale to container
        const containerScaleX = (this.FENCEBAR_MODEL_SCALE * scaleFactor) / parentScaleX;
        const containerScaleY = (this.FENCEBAR_MODEL_SCALE * scaleFactor) / parentScaleY;
        const containerScaleZ = (this.FENCEBAR_MODEL_SCALE * scaleFactor) / parentScaleZ;

        container.setScale(containerScaleX, containerScaleY, containerScaleZ);

        this.applyLayerRecursive(container, node.layer);
        node.addChild(container);

        // Ensure parent visual is hidden
        const ownerMesh = node.getComponent(MeshRenderer);
        if (ownerMesh) {
            ownerMesh.enabled = false;
        }

        // --- Instantiate 20 bars ---
        const barCount = 20;
        const gap = 0.05; // Smaller gap between bars

        // Estimate width of a single bar to calculate step
        const modelWidth = this.estimateModelXSize(prefab);
        // Default to ~0.5 if estimation fails or is 0 (thin post?)
        const effectiveWidth = modelWidth > 0 ? modelWidth : 0.5;
        const step = effectiveWidth + gap;

        // Calculate offset to center the row of bars
        // Total width from center of first to center of last is step * (barCount - 1)
        const totalSpan = step * (barCount - 1);
        const startX = -totalSpan / 2;

        for (let i = 0; i < barCount; i++) {
            const bar = instantiate(prefab);
            bar.setPosition(startX + i * step, 0, 0); // Local to container
            // Reset rotation if needed, or keep prefab rotation
            // bar.setRotationFromEuler(0, 0, 0);
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
            // Unsafe cast to access mesh struct
            const mesh = (renderer as unknown as { mesh?: any }).mesh;
            if (!mesh) continue;

            // Access min/max position from mesh struct
            // Note: Cocos Creator mesh struct access can vary by version.
            const minPos = mesh?.struct?.minPosition ?? mesh?._struct?.minPosition;
            const maxPos = mesh?.struct?.maxPosition ?? mesh?._struct?.maxPosition;

            if (!minPos || !maxPos) continue;

            const nodeScaleX = renderer.node.scale.x;
            const nodePosX = renderer.node.position.x;

            // Calculate world-ish X (local to prefab root)
            // Assuming no complex rotation hierarchy for simple props
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

    // =================================================================================
    // Farm Model Logic
    // =================================================================================

    private static attachFarmModelAsync(node: Node): void {
        if (!node || !node.isValid) return;
        if (this.tryAttachFarmModel(node)) return;

        this._pendingFarmModelNodes.push(node);
        if (this._farmModelLoading) return;

        this._farmModelLoading = true;
        this.loadFarmModelPrefab(0);
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
        // Compensate parent non-uniform scale so mine keeps its volume.
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
