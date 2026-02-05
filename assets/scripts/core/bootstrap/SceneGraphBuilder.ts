import { Node } from 'cc';
import { CoinDropManager } from '../../gameplay/economy/CoinDropManager';
import { EffectManager } from '../managers/EffectManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';

export type SceneGraphNodes = {
    container: Node;
    enemyContainer: Node;
    soldierContainer: Node;
    buildingContainer: Node;
    coinContainer: Node;
    effectContainer: Node;
};

/**
 * SceneGraphBuilder
 * 负责创建与组织场景内核心容器节点
 */
export class SceneGraphBuilder {
    public static build(root: Node): SceneGraphNodes {
        const old = root.getChildByName('GameContainer');
        if (old) {
            old.destroy();
        }

        const container = new Node('GameContainer');
        root.addChild(container);

        const enemyContainer = new Node('Enemies');
        const soldierContainer = new Node('Soldiers');
        const buildingContainer = new Node('Buildings');
        const coinContainer = new Node('Coins');

        container.addChild(enemyContainer);
        container.addChild(soldierContainer);
        container.addChild(buildingContainer);
        container.addChild(coinContainer);

        SceneGraphBuilder.coinDropManager.initialize(coinContainer);

        const effectContainer = new Node('Effects');
        container.addChild(effectContainer);
        SceneGraphBuilder.effectManager.initialize(effectContainer);

        return {
            container,
            enemyContainer,
            soldierContainer,
            buildingContainer,
            coinContainer,
            effectContainer,
        };
    }

    private static get coinDropManager(): CoinDropManager {
        return (
            ServiceRegistry.get<CoinDropManager>('CoinDropManager') ??
            CoinDropManager.instance
        );
    }

    private static get effectManager(): EffectManager {
        return (
            ServiceRegistry.get<EffectManager>('EffectManager') ??
            EffectManager.instance
        );
    }
}
