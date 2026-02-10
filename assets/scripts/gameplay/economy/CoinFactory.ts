import {
    _decorator,
    Node,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Color,
    BoxCollider,
    resources,
    Prefab,
    instantiate,
} from 'cc';
import { GameConfig } from '../../data/GameConfig';

import { Coin } from './Coin';

/**
 * 金币工厂和管理
 */
export class CoinFactory {
    private static _materials: Map<string, Material> = new Map();
    private static _starCoinPrefab: Prefab | null = null;
    private static _isLoading: boolean = false;

    public static loadResources(): void {
        if (this._isLoading || this._starCoinPrefab) return;
        this._isLoading = true;

        // Try loading 'effects/star_coin'
        resources.load('effects/star_coin', Prefab, (err, prefab) => {
            if (!err && prefab) {
                console.log('[CoinFactory] Successfully loaded star_coin prefab (path: effects/star_coin)');
                this._starCoinPrefab = prefab;
                this._isLoading = false;
                return;
            }
            
            console.warn('[CoinFactory] Failed to load effects/star_coin:', err);

            // Try loading 'effects/star_coin/star_coin' (common GLTF import issue)
            resources.load('effects/star_coin/star_coin', Prefab, (err2, prefab2) => {
                if (!err2 && prefab2) {
                     console.log('[CoinFactory] Successfully loaded star_coin prefab (path: effects/star_coin/star_coin)');
                     this._starCoinPrefab = prefab2;
                } else {
                     console.error('[CoinFactory] Failed to load star_coin from both paths.', err2);
                }
                this._isLoading = false;
            });
        });
    }

    /**
     * 创建金币
     */
    public static createCoin(parent: Node, x: number, z: number, value: number): Node {
        let node: Node;
        if (this._starCoinPrefab) {
            node = instantiate(this._starCoinPrefab);
            node.setScale(0.35, 0.35, 0.35); 
            // Default rotation (0,0,0) makes it upright/vertical on ground (if model is Y-up / Standing)
            node.setRotationFromEuler(0, 0, 0);

            // Enhance Visuals
            // Use builtin-unlit to GUARANTEE the color appears exactly as defined (no lighting interference)
            const goldMaterial = new Material();
            goldMaterial.initialize({ effectName: 'builtin-unlit' });
            
            const goldColor = new Color(255, 190, 0, 255); // Rich Gold
            goldMaterial.setProperty('mainColor', goldColor);
            // Unlit doesn't use metallic/roughness/emission, just mainColor

            const renderers = node.getComponentsInChildren(MeshRenderer);
            for (const renderer of renderers) {
                 renderer.material = goldMaterial;
            }
        } else {
            console.warn('[CoinFactory] StarCoin prefab not ready, using cube.');
            node = this.createCubeNode('Coin', new Color(255, 165, 0, 255));
            node.setScale(0.3, 0.3, 0.3); // Slightly larger for visibility
        }
        node.setPosition(x, GameConfig.PHYSICS.COIN_Y, z);
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
