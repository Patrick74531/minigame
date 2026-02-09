import { Node } from 'cc';
import { MapGenerator } from '../../gameplay/map/MapGenerator';
import { CombatSystem } from '../../gameplay/combat/CombatSystem';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';
import { SunflowerPreview } from '../../gameplay/visuals/SunflowerPreview';
import { GameConfig } from '../../data/GameConfig';

export type GameplayNodes = {
    mapGenerator: MapGenerator;
    combatSystem: CombatSystem;
    waveLoop: WaveLoop;
    waveNode: Node;
};

/**
 * GameplayBootstrap
 * 负责创建与挂载核心玩法系统节点
 */
export class GameplayBootstrap {
    public static build(container: Node, generateMap: boolean = false): GameplayNodes {
        const mapNode = new Node('MapGenerator');
        container.addChild(mapNode);
        const mapGenerator = mapNode.addComponent(MapGenerator);
        if (generateMap) {
            mapGenerator.generateProceduralMap();
        }

        const combatNode = new Node('CombatSystem');
        container.addChild(combatNode);
        const combatSystem = combatNode.addComponent(CombatSystem);

        const waveNode = new Node('WaveLoop');
        container.addChild(waveNode);
        const waveLoop = waveNode.addComponent(WaveLoop);

        const sunflowerPreviewNode = new Node('SunflowerPreview');
        container.addChild(sunflowerPreviewNode);
        sunflowerPreviewNode.setPosition(
            GameConfig.MAP.BASE_SPAWN.x + 1.5,
            0,
            GameConfig.MAP.BASE_SPAWN.z + 1.5
        );
        sunflowerPreviewNode.addComponent(SunflowerPreview);

        return { mapGenerator, combatSystem, waveLoop, waveNode };
    }
}
