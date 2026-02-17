import { Node, instantiate } from 'cc';
import { GameManager } from '../managers/GameManager';
import { GameConfig } from '../../data/GameConfig';
import { SpawnBootstrap } from './SpawnBootstrap';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';
import { MapGenerator } from '../../gameplay/map/MapGenerator';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { HomePage } from '../../ui/home/HomePage';
import { HUDManager } from '../../ui/HUDManager';
import { EventManager } from '../managers/EventManager';
import { GameEvents } from '../../data/GameEvents';

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
        // Hide HUD initially
        HUDManager.instance.setVisible(false);

        // Create HomePage
        const homeNode = new Node('HomePage');
        ctx.containers.ui.addChild(homeNode);
        homeNode.addComponent(HomePage);
        
        // Listen for GAME_START one time to proceed with game initialization
        const onStart = () => {
             this.startGame(ctx);
             EventManager.instance.off(GameEvents.GAME_START, onStart, this);
        };
        
        EventManager.instance.on(GameEvents.GAME_START, onStart, this);
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
