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
import { HeroLevelSystem } from '../../gameplay/units/HeroLevelSystem';
import { GameSaveManager, GameSaveData } from '../managers/GameSaveManager';

export type StartContext = {
    mapGenerator: MapGenerator | null;
    waveLoop: WaveLoop | null;
    containers: {
        enemy: Node;
        soldier: Node;
        building: Node;
        ui: Node;
    };
    onSpawned?: (base: Node, hero: Node) => void;
    showHomePage?: boolean;
    saveData?: GameSaveData | null;
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
            ctx.saveData = null;
            this._showLoadingScreen(ctx);
        });

        homePage.setOnContinueRequested(() => {
            const save = GameSaveManager.instance.load();
            homeNode.destroy();
            ctx.saveData = save;
            this._showLoadingScreen(ctx);
        });
    }

    private static _showLoadingScreen(ctx: StartContext) {
        // onComplete fires AFTER GPU warmup (loading screen still visible during warmup)
        const screen = LoadingScreen.show(ctx.containers.ui, () => {
            GameResourceLoader.loadPhase2();
        });

        GameResourceLoader.loadPhase1((loaded, total) => {
            if (screen.isValid) screen.setProgress(loaded, total);
        })
            .then(() => {
                // Phase 1 in CPU memory. Start game NOW while loading screen covers the scene.
                // The 3D scene renders behind the loading screen, uploading GPU textures.
                this.startGame(ctx);
                this.gameManager.startGame();
                this.applyPostStartRestore(ctx.saveData);
                // GPU warmup: wait 0.5 s (~30 frames) for textures to upload before revealing scene.
                if (screen.isValid) {
                    screen.scheduleOnce(() => {
                        if (screen.isValid) screen.signalReadyToClose();
                    }, 0.5);
                }
            })
            .catch(() => {
                // On any load error still enter game
                this.startGame(ctx);
                this.gameManager.startGame();
                this.applyPostStartRestore(ctx.saveData);
                if (screen.isValid) screen.signalReadyToClose();
            });
    }

    // Refactored actual start logic (Map generation, Spawning)
    private static startGame(ctx: StartContext) {
        // Show HUD when game starts
        HUDManager.instance.setVisible(true);

        if (ctx.mapGenerator) {
            ctx.mapGenerator.generateProceduralMap();
        }

        const spawned = SpawnBootstrap.spawn(ctx.containers);
        ctx.onSpawned?.(spawned.base, spawned.hero);

        const startingWave = ctx.saveData?.waveNumber ?? 1;
        SpawnBootstrap.startWaves(ctx.waveLoop, GameConfig.WAVE.FIRST_WAVE_DELAY, startingWave);
    }

    private static applyPostStartRestore(saveData?: GameSaveData | null): void {
        if (!saveData) return;
        this.gameManager.setCoins(saveData.coins);
        this.gameManager.setScore(saveData.score);
        HeroLevelSystem.instance.restoreState(saveData.heroLevel, saveData.heroXp);
    }

    private static get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
