import { _decorator, Node, MeshRenderer, primitives, utils, Material, Color } from 'cc';
import { Building, BuildingType } from './Building';
import { Tower } from './Tower';
import { GameConfig } from '../../data/GameConfig';
import { BuildingRegistry } from './BuildingRegistry';

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
        const node = this.createCubeNode('Barracks', new Color(100, 180, 100, 255));
        node.setPosition(x, 0, z); // 3D 坐标：Y=0 在地面
        node.setScale(0.45, 0.45, 0.45);
        parent.addChild(node);

        const building = node.addComponent(Building);
        building.setConfig({
            type: BuildingType.BARRACKS,
            hp: GameConfig.BUILDING.BASE_HP,
            spawnInterval: GameConfig.BUILDING.SPAWN_INTERVAL,
            maxUnits: GameConfig.BUILDING.MAX_SOLDIERS_PER_BARRACKS,
        });

        return node;
    }

    /**
     * 创建基地
     */
    public static createBase(parent: Node, x: number, z: number, hp: number = 100): Node {
        const node = this.createCubeNode('Base', new Color(150, 100, 200, 255));
        node.setPosition(x, 0, z); // Fix: use Z for depth, Y=0 for floor
        node.setScale(0.8, 0.8, 0.8);
        parent.addChild(node);

        // 存储基地数据
        (node as any).baseData = {
            hp: hp,
            maxHp: hp,
        };

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
        // 红色/黄色区分防御塔
        const node = this.createCubeNode('Tower', new Color(220, 220, 60, 255)); // Yellow
        node.setPosition(x, 0, z);
        node.setScale(0.4, 0.8, 0.4); // Taller, thinner
        parent.addChild(node);

        const tower = node.addComponent(Tower);
        tower.setConfig({
            type: BuildingType.TOWER,
            hp: 300,
            // Towers don't spawn soldiers, so these values might be ignored or used differently
            spawnInterval: 0, 
            maxUnits: 0,
        });
        
        // Custom Tower Config
        tower.attackRange = 25; // Increased range
        tower.attackDamage = 25;
        tower.attackInterval = 0.5; // Faster attack

        return node;
    }

    /**
     * 创建冰霜塔 (AOE Slow)
     */
    public static createFrostTower(parent: Node, x: number, z: number): Node {
        const node = this.createCubeNode('FrostTower', new Color(60, 100, 220, 255)); // Blue
        node.setPosition(x, 0, z);
        node.setScale(0.4, 0.8, 0.4);
        parent.addChild(node);

        const tower = node.addComponent(Tower);
        tower.setConfig({
            type: BuildingType.TOWER,
            hp: 300,
            spawnInterval: 0, 
            maxUnits: 0,
        });
        
        // Frost Config (Low Damage, AOE Slow)
        tower.attackRange = 22;
        tower.attackDamage = 5; // Low Damage
        tower.attackInterval = 0.8;
        
        // Bullet Visuals & Effects
        tower.bulletColor = new Color(0, 150, 255, 255); // Cyan/Blue Glow
        tower.bulletExplosionRadius = 2.5; // AOE
        tower.bulletSlowPercent = 0.5; // 50% Slow
        tower.bulletSlowDuration = 2.0;

        return node;
    }

    /**
     * Generic Building Creator (Data-Driven)
     */
    public static createBuilding(parent: Node, x: number, z: number, buildingId: string, unitContainer?: Node): Node | null {
         const config = BuildingRegistry.instance.get(buildingId);
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
             building.setConfig({
                 type: BuildingType.BARRACKS, // TODO: Map role to enum if needed
                 hp: config.stats?.hp || 100,
                 spawnInterval: config.features?.spawnInterval || 10,
                 maxUnits: config.features?.maxUnits || 5,
             });
             if (unitContainer) {
                 building.setUnitContainer(unitContainer);
             }
         } else if (config.role === 'tower') {
             const tower = node.addComponent(Tower);
             tower.setConfig({
                 type: BuildingType.TOWER,
                 hp: config.stats?.hp || 300,
                 spawnInterval: 0,
                 maxUnits: 0
             });
             
             // Apply stats
             if (config.stats) {
                 if (config.stats.attackRange) tower.attackRange = config.stats.attackRange;
                 if (config.stats.attackDamage) tower.attackDamage = config.stats.attackDamage;
                 if (config.stats.attackInterval) tower.attackInterval = config.stats.attackInterval;
             }

             // Apply features
             if (config.features) {
                 if (config.features.bulletColorHex) {
                     tower.bulletColor = new Color().fromHEX(config.features.bulletColorHex);
                 }
                 if (config.features.bulletExplosionRadius) tower.bulletExplosionRadius = config.features.bulletExplosionRadius;
                 if (config.features.bulletSlowPercent) tower.bulletSlowPercent = config.features.bulletSlowPercent;
                 if (config.features.bulletSlowDuration) tower.bulletSlowDuration = config.features.bulletSlowDuration;
                 
                 // Chain Lightning
                 if (config.features.chainCount) tower.chainCount = config.features.chainCount;
                 if (config.features.chainRange) tower.chainRange = config.features.chainRange;
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
}
