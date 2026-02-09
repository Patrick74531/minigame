import { Node, MeshRenderer, primitives, utils, Material, Color } from 'cc';
import { Building, BuildingType } from './Building';
import { Tower } from './Tower';
import { GameConfig } from '../../data/GameConfig';
import { BuildingRegistry } from './BuildingRegistry';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { Base } from './Base';
import { SunflowerPreview } from '../visuals/SunflowerPreview';

/**
 * 建筑工厂
 * 负责创建和配置所有建筑实体
 */
export class BuildingFactory {
    private static _materials: Map<string, Material> = new Map();

    /**
     * 创建兵营
     */
    /**
     * 创建兵营
     */
    public static createBarracks(parent: Node, x: number, z: number): Node {
        const barracksConfig = this.buildingRegistry.get('barracks');
        const node = this.createCubeNode('Barracks', new Color(100, 180, 100, 255));
        node.setPosition(x, 0, z); // 3D 坐标：Y=0 在地面
        node.setScale(0.45, 0.45, 0.45);
        parent.addChild(node);

        const building = node.addComponent(Building);
        building.setConfig({
            type: BuildingType.BARRACKS,
            cost: barracksConfig?.cost ?? 0,
            hp: barracksConfig?.stats?.hp ?? GameConfig.BUILDING.BASE_HP,
            spawnInterval:
                barracksConfig?.features?.spawnInterval ?? GameConfig.BUILDING.SPAWN_INTERVAL,
            maxUnits:
                barracksConfig?.features?.maxUnits ?? GameConfig.BUILDING.MAX_SOLDIERS_PER_BARRACKS,
        });
        building.setUpgradeConfig({
            maxLevel: barracksConfig?.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
            costMultiplier:
                barracksConfig?.upgrades?.costMultiplier ??
                GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
            statMultiplier: barracksConfig?.upgrades?.statMultiplier ?? 1.2,
            spawnIntervalMultiplier: barracksConfig?.upgrades?.spawnIntervalMultiplier ?? 0.92,
            maxUnitsPerLevel: barracksConfig?.upgrades?.maxUnitsPerLevel ?? 1,
            spawnBatchPerLevel: barracksConfig?.upgrades?.spawnBatchPerLevel ?? 1,
        });

        return node;
    }

    /**
     * 创建基地
     */
    public static createBase(parent: Node, x: number, z: number, hp: number = 500): Node {
        const node = this.createCubeNode('Base', new Color(150, 100, 200, 255));
        node.setPosition(x, 0, z);
        node.setScale(0.8, 0.8, 0.8);

        const base = node.addComponent(Base);
        base.setConfig({
            type: BuildingType.BASE,
            hp: hp,
            spawnInterval: 0,
            maxUnits: 0,
        });
        // Ensure Base.onLoad reads configured HP (avoid one-frame HUD mismatch at default 500).
        parent.addChild(node);

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
        return node;
    }

    /**
     * 清理材质缓存
     */
    /**
     * 创建防御塔
     */
    public static createTower(parent: Node, x: number, z: number): Node {
        const towerConfig = this.buildingRegistry.get('tower');
        // 红色/黄色区分防御塔
        const node = this.createCubeNode('Tower', new Color(220, 220, 60, 255)); // Yellow
        node.setPosition(x, 0, z);
        node.setScale(0.4, 0.8, 0.4); // Taller, thinner
        parent.addChild(node);

        const tower = node.addComponent(Tower);
        tower.setConfig({
            type: BuildingType.TOWER,
            cost: towerConfig?.cost ?? 0,
            hp: towerConfig?.stats?.hp ?? 300,
            // Towers don't spawn soldiers, so these values might be ignored or used differently
            spawnInterval: 0,
            maxUnits: 0,
        });

        // Custom Tower Config
        tower.attackRange = towerConfig?.stats?.attackRange ?? 18;
        tower.attackDamage = towerConfig?.stats?.attackDamage ?? 26;
        tower.attackInterval = towerConfig?.stats?.attackInterval ?? 0.45;
        tower.setUpgradeConfig({
            maxLevel: towerConfig?.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
            costMultiplier:
                towerConfig?.upgrades?.costMultiplier ??
                GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
            statMultiplier: towerConfig?.upgrades?.statMultiplier ?? 1.2,
        });
        tower.setTowerUpgradeConfig({
            attackMultiplier: towerConfig?.upgrades?.attackMultiplier ?? 1.22,
            rangeMultiplier: towerConfig?.upgrades?.rangeMultiplier ?? 1.03,
            intervalMultiplier: towerConfig?.upgrades?.intervalMultiplier ?? 0.95,
            chainRangePerLevel: towerConfig?.upgrades?.chainRangePerLevel ?? 0,
        });

        return node;
    }

    /**
     * 创建冰霜塔 (AOE Slow)
     */
    public static createFrostTower(parent: Node, x: number, z: number): Node {
        const frostConfig = this.buildingRegistry.get('frost_tower');
        const node = this.createCubeNode('FrostTower', new Color(60, 100, 220, 255)); // Blue
        node.setPosition(x, 0, z);
        const scale = frostConfig?.visual?.scale || { x: 0.52, y: 1.02, z: 0.52 };
        node.setScale(scale.x, scale.y, scale.z);
        parent.addChild(node);
        this.attachFrostTowerSunflowerVisual(node);

        const tower = node.addComponent(Tower);
        tower.setConfig({
            type: BuildingType.TOWER,
            cost: frostConfig?.cost ?? 0,
            hp: frostConfig?.stats?.hp ?? 280,
            spawnInterval: 0,
            maxUnits: 0,
        });

        // Frost Config (Low Damage, AOE Slow)
        tower.attackRange = frostConfig?.stats?.attackRange ?? 16;
        tower.attackDamage = frostConfig?.stats?.attackDamage ?? 12;
        tower.attackInterval = frostConfig?.stats?.attackInterval ?? 0.8;

        // Bullet Visuals & Effects
        tower.bulletColor = new Color().fromHEX(frostConfig?.features?.bulletColorHex ?? '#0096FF');
        tower.bulletExplosionRadius = frostConfig?.features?.bulletExplosionRadius ?? 2.8;
        tower.bulletSlowPercent = frostConfig?.features?.bulletSlowPercent ?? 0.45;
        tower.bulletSlowDuration = frostConfig?.features?.bulletSlowDuration ?? 2.2;
        tower.castRainDirectly = frostConfig?.features?.directRainCast ?? true;
        tower.rainRadiusPerLevel = frostConfig?.features?.rainRadiusPerLevel ?? 0.22;
        tower.setUpgradeConfig({
            maxLevel: frostConfig?.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
            costMultiplier:
                frostConfig?.upgrades?.costMultiplier ??
                GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
            statMultiplier: frostConfig?.upgrades?.statMultiplier ?? 1.18,
        });
        tower.setTowerUpgradeConfig({
            attackMultiplier: frostConfig?.upgrades?.attackMultiplier ?? 1.15,
            rangeMultiplier: frostConfig?.upgrades?.rangeMultiplier ?? 1.03,
            intervalMultiplier: frostConfig?.upgrades?.intervalMultiplier ?? 0.96,
            chainRangePerLevel: frostConfig?.upgrades?.chainRangePerLevel ?? 0,
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
        unitContainer?: Node
    ): Node | null {
        const config = BuildingFactory.buildingRegistry.get(buildingId);
        if (!config) {
            console.error(`[BuildingFactory] Unknown building ID: ${buildingId}`);
            return null;
        }

        // 1. Visuals
        const colorHex = config.visual?.colorHex || '#FFFFFF';
        const color = new Color().fromHEX(colorHex);
        const node = this.createCubeNode(config.name, color);
        node.setPosition(x, 0, z);
        const scale = config.visual?.scale || { x: 1, y: 1, z: 1 };
        node.setScale(scale.x, scale.y, scale.z);
        parent.addChild(node);

        // 2. Component Logic
        if (config.role === 'barracks' || config.role === 'building') {
            const building = node.addComponent(Building);
            const isBarracks = config.role === 'barracks';
            building.setConfig({
                type: this.resolveBuildingType(buildingId, config.role),
                cost: config.cost,
                hp: config.stats?.hp || 100,
                spawnInterval: isBarracks ? (config.features?.spawnInterval ?? 4.5) : 0,
                maxUnits: isBarracks ? (config.features?.maxUnits ?? 3) : 0,
            });
            building.setUpgradeConfig({
                maxLevel: config.upgrades?.maxLevel ?? GameConfig.BUILDING.DEFAULT_MAX_LEVEL,
                costMultiplier:
                    config.upgrades?.costMultiplier ?? GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER,
                statMultiplier: config.upgrades?.statMultiplier ?? 1.2,
                spawnIntervalMultiplier: config.upgrades?.spawnIntervalMultiplier ?? 0.93,
                maxUnitsPerLevel: config.upgrades?.maxUnitsPerLevel ?? 0,
                spawnBatchPerLevel: isBarracks ? (config.upgrades?.spawnBatchPerLevel ?? 1) : 0,
            });
            if (unitContainer) {
                building.setUnitContainer(unitContainer);
            }
        } else if (config.role === 'tower') {
            if (buildingId === 'frost_tower') {
                this.attachFrostTowerSunflowerVisual(node);
            }
            const tower = node.addComponent(Tower);
            tower.setConfig({
                type: BuildingType.TOWER,
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
                if (config.features.chainRange !== undefined)
                    tower.chainRange = config.features.chainRange;
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

    private static resolveBuildingType(
        buildingId: string,
        role?: 'building' | 'tower' | 'barracks'
    ): BuildingType {
        if (role === 'tower') return BuildingType.TOWER;
        if (buildingId === 'wall') return BuildingType.WALL;
        if (buildingId === 'base') return BuildingType.BASE;
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
}
