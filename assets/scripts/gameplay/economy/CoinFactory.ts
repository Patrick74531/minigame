import {
    _decorator,
    Node,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Color,
    BoxCollider,
} from 'cc';
// import { GameManager } from '../../core/managers/GameManager';
// import { EventManager } from '../../core/managers/EventManager';
// import { GameEvents } from '../../data/GameEvents';
// import { GameConfig } from '../../data/GameConfig';
import { Coin } from './Coin';

/**
 * 金币工厂和管理
 */
export class CoinFactory {
    private static _materials: Map<string, Material> = new Map();

    /**
     * 创建金币
     */
    public static createCoin(parent: Node, x: number, z: number, value: number): Node {
        const node = this.createCubeNode('Coin', new Color(255, 165, 0, 255));
        node.setPosition(x, 0.5, z);
        node.setScale(0.3, 0.3, 0.3); // Slightly larger for visibility
        parent.addChild(node);

        // Physics: Trigger for Pickup
        const collider = node.addComponent(BoxCollider);
        collider.isTrigger = true;
        // Set Group to COIN (1 << 1)
        collider.setGroup(1 << 1);
        collider.setMask((1 << 0) | (1 << 1)); // Collide with Default (Hero usually 1<<0)

        // Logic Component
        const coinComp = node.addComponent(Coin);
        coinComp.value = value;

        return node;
    }

    // Removed updateCoin (Handled by Coin component)

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
}
