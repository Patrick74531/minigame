import { Node } from 'cc';
import { GameManager } from '../managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { SpawnBootstrap } from './SpawnBootstrap';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';
import { MapGenerator } from '../../gameplay/map/MapGenerator';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { HomePage } from '../../ui/home/HomePage';
import { HUDManager } from '../../ui/HUDManager';
import { LoadingScreen } from '../../ui/LoadingScreen';
import { GameResourceLoader } from './GameResourceLoader';

export type StartContext = {
    mapGenerator: MapGenerator | null;
    waveLoop: WaveLoop | null;
    containers: {
        enemy: Node;
        soldier: Node;
        building: Node;
        ui: Node; // Added UI container to context
    };
    onSpawned?: (base: Node, hero: Node) => void;
    showHomePage?: boolean;
};

/**
 * GameStartFlow
 * 负责游戏启动与初始实体生成流程
 */
export class GameStartFlow {
    public static run(ctx: StartContext): void {
        const game = this.gameManager;

        // If homepage is requested (default true) and not already playing
        if (ctx.showHomePage !== false) {
            this.showHomePage(ctx);
            return;
        }

        // Direct start (e.g. restart or debug)
        this.startGame(ctx);
        game.startGame();
    }

    private static showHomePage(ctx: StartContext) {
        HUDManager.instance.setVisible(false);

        const homeNode = new Node('HomePage');
        ctx.containers.ui.addChild(homeNode);
        const homePage = homeNode.addComponent(HomePage);

        homePage.setOnStartRequested(() => {
            homeNode.destroy();
            this._showLoadingScreen(ctx);
        });
    }

    private static _showLoadingScreen(ctx: StartContext) {
        const screen = LoadingScreen.show(ctx.containers.ui, () => {
            this.startGame(ctx);
            this.gameManager.startGame();
            GameResourceLoader.loadPhase2();
        });

        GameResourceLoader.loadPhase1((loaded, total) => {
            if (screen.isValid) {
                screen.setProgress(loaded, total);
            }
        }).catch(() => {
            if (screen.isValid) screen.setProgress(1, 1);
        });
    }

    // Refactored actual start logic (Map generation, Spawning)
    private static startGame(ctx: StartContext) {
        // Show HUD when game starts
        HUDManager.instance.setVisible(true);

        if (ctx.mapGenerator) {
            // ctx.mapGenerator.generateTestMap();
            // ctx.mapGenerator.generateFromImage('cyberpunk_map');
            ctx.mapGenerator.generateProceduralMap();
        }

        const spawned = SpawnBootstrap.spawn(ctx.containers);
        ctx.onSpawned?.(spawned.base, spawned.hero);

        SpawnBootstrap.startWaves(ctx.waveLoop, GameConfig.WAVE.FIRST_WAVE_DELAY);

        console.log(`[Game] 💰 初始金币: ${this.gameManager.coins}`);
    }

    private static get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
