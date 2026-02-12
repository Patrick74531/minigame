import { Node } from 'cc';
import { Building } from './Building';
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
        const padPositions = GameConfig.BUILDING.PADS;

        for (const pos of padPositions) {
            // Special handling for Spa: Pre-spawned, invalid interaction (no pad/upgrade)
            if (pos.type === 'spa') {
                const buildingNode = BuildingFactory.createBuilding(
                    buildingContainer,
                    pos.x,
                    pos.z,
                    pos.type
                );
                console.log(
                    `[BuildingPadSpawner] Pre-spawned Static Spa at (${pos.x}, 0, ${pos.z})`
                );
                // No pad, no upgrade zone.
                continue;
            }

            // Pre-spawn special towers
            if (pos.type === 'frost_tower' || pos.type === 'lightning_tower') {
                const buildingNode = BuildingFactory.createBuilding(buildingContainer, pos.x, pos.z, pos.type);
                console.log(
                    `[BuildingPadSpawner] Pre-spawned ${pos.type} at (${pos.x}, 0, ${pos.z})`
                );

                // 为预生成的塔也创建升级投放区
                if (buildingNode) {
                    const buildingComp = buildingNode.getComponent(Building);

                    if (buildingComp) {
                        const padNode = new Node(`BuildingPad_${pos.type}`);
                        buildingContainer.addChild(padNode);
                        padNode.setPosition(pos.x, 0, pos.z);

                        const pad = padNode.addComponent(BuildingPad);
                        pad.buildingTypeId = pos.type;

                        // 关联建筑并进入升级模式
                        pad.onBuildingCreated(buildingComp);
                        pad.placeUpgradeZoneInFront(buildingNode);

                        buildingManager.registerPad(pad);
                        console.log(
                            `[BuildingPadSpawner] Created upgrade pad for pre-spawned ${pos.type}`
                        );
                    }
                }
                continue;
            }

            const padNode = new Node(`BuildingPad_${pos.type}`);
            buildingContainer.addChild(padNode);
            padNode.setPosition(pos.x, 0, pos.z);
            if ((pos as any).angle) {
                padNode.setRotationFromEuler(0, (pos as any).angle, 0);
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
