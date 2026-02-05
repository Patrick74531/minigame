import { Node } from 'cc';
import { GameManager } from '../managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { SpawnBootstrap } from './SpawnBootstrap';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';
import { MapGenerator } from '../../gameplay/map/MapGenerator';
import { ServiceRegistry } from '../managers/ServiceRegistry';

export type StartContext = {
    mapGenerator: MapGenerator | null;
    waveLoop: WaveLoop | null;
    containers: {
        enemy: Node;
        soldier: Node;
        building: Node;
    };
    onSpawned?: (base: Node, hero: Node) => void;
};

/**
 * GameStartFlow
 * 负责游戏启动与初始实体生成流程
 */
export class GameStartFlow {
    public static run(ctx: StartContext): void {
        const game = this.gameManager;
        game.startGame();

        if (ctx.mapGenerator) {
            // ctx.mapGenerator.generateTestMap();
            // ctx.mapGenerator.generateFromImage('cyberpunk_map');
            ctx.mapGenerator.generateProceduralMap();
        }

        const spawned = SpawnBootstrap.spawn(ctx.containers);
        ctx.onSpawned?.(spawned.base, spawned.hero);

        SpawnBootstrap.startWaves(ctx.waveLoop, 2);

        console.log(`[Game] 💰 初始金币: ${game.coins}`);
    }

    private static get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
