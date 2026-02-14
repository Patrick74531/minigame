import { Node } from 'cc';
import { BuildingFactory } from './BuildingFactory';
import { BuildingPad } from './BuildingPad';
import { BuildingManager } from './BuildingManager';
import { GameConfig } from '../../data/GameConfig';

/**
 * BuildingPadSpawner
 * 负责根据配置生成建造点，减少 GameController 胶水逻辑
 */
export class BuildingPadSpawner {
    public static spawnPads(buildingContainer: Node, buildingManager: BuildingManager): void {
        const padPositions = GameConfig.BUILDING.PADS as Array<{
            type: string;
            x: number;
            z: number;
            angle?: number;
        }>;

        for (const pos of padPositions) {
            const angle = typeof pos.angle === 'number' ? pos.angle : 0;

            // Special handling for Spa: Pre-spawned, invalid interaction (no pad/upgrade)
            if (pos.type === 'spa') {
                BuildingFactory.createBuilding(
                    buildingContainer,
                    pos.x,
                    pos.z,
                    pos.type,
                    undefined,
                    angle
                );
                console.log(
                    `[BuildingPadSpawner] Pre-spawned Static Spa at (${pos.x}, 0, ${pos.z}), angle=${angle}`
                );
                // No pad, no upgrade zone.
                continue;
            }

            const padNode = new Node(`BuildingPad_${pos.type}`);
            buildingContainer.addChild(padNode);
            padNode.setPosition(pos.x, 0, pos.z);
            if (Math.abs(angle) > 0.001) {
                padNode.setRotationFromEuler(0, angle, 0);
            }

            console.log(
                `[BuildingPadSpawner] 创建建造点: type=${pos.type}, pos=(${pos.x}, 0, ${pos.z})`
            );

            const pad = padNode.addComponent(BuildingPad);
            pad.buildingTypeId = pos.type;

            buildingManager.registerPad(pad);
        }

        console.log(
            `[BuildingPadSpawner] 创建了 ${padPositions.length} 个建造点, 父节点: ${buildingContainer.name}`
        );
    }
}
