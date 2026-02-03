import { _decorator, Node, MeshRenderer, primitives, utils, Material, Color } from 'cc';
import { Building, BuildingType } from './Building';
import { GameConfig } from '../../data/GameConfig';

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
    public static createBase(parent: Node, x: number, y: number, hp: number = 100): Node {
        const node = this.createCubeNode('Base', new Color(150, 100, 200, 255));
        node.setPosition(x, y, 0);
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
    public static clearCache(): void {
        this._materials.clear();
    }
}
