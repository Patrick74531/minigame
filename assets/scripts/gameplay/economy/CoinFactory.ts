import { _decorator, Node, MeshRenderer, primitives, utils, Material, Color, Vec3 } from 'cc';
import { GameManager } from '../../core/managers/GameManager';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { GameConfig } from '../../data/GameConfig';

/**
 * 金币工厂和管理
 */
export class CoinFactory {
    private static _materials: Map<string, Material> = new Map();

    /**
     * 创建金币
     */
    public static createCoin(parent: Node, x: number, y: number, value: number): Node {
        const node = this.createCubeNode('Coin', new Color(255, 165, 0, 255));
        node.setPosition(x, y, 0.3);
        node.setScale(0.2, 0.2, 0.2);
        parent.addChild(node);

        // 存储金币数据
        (node as any).coinData = {
            value: value,
            lifetime: 0,
            collected: false,
        };

        return node;
    }

    /**
     * 更新金币 (浮动动画 + 自动收集)
     * @returns 是否应该销毁
     */
    public static updateCoin(coin: Node, dt: number): boolean {
        const data = (coin as any).coinData;
        if (!data || data.collected) return true;

        data.lifetime += dt;

        // 浮动动画
        const pos = coin.position;
        const floatY = Math.sin(data.lifetime * 5) * 0.02;
        coin.setPosition(pos.x, pos.y + floatY, pos.z);

        // 2秒后自动收集
        if (data.lifetime >= 2) {
            data.collected = true;
            GameManager.instance.addCoins(data.value);
            EventManager.instance.emit(GameEvents.COIN_COLLECTED, { value: data.value });
            return true;
        }

        return false;
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
}
