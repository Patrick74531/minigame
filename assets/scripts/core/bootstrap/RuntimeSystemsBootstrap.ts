import { Node } from 'cc';
import { PlayerInputAdapter } from '../input/PlayerInputAdapter';
import { BuildingSystemTick } from '../../gameplay/buildings/BuildingSystemTick';

export type RuntimeSystems = {
    inputAdapter: PlayerInputAdapter;
};

/**
 * RuntimeSystemsBootstrap
 * 负责创建运行时系统（输入、建造系统调度等）
 */
export class RuntimeSystemsBootstrap {
    public static build(container: Node): RuntimeSystems {
        const inputNode = new Node('PlayerInput');
        container.addChild(inputNode);
        const inputAdapter = inputNode.addComponent(PlayerInputAdapter);

        const buildingNode = new Node('BuildingSystem');
        container.addChild(buildingNode);
        buildingNode.addComponent(BuildingSystemTick);

        return { inputAdapter };
    }
}
