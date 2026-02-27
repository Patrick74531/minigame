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
import { GameSaveManager } from '../managers/GameSaveManager';
import type { GameSaveDataV2 } from '../managers/GameSaveManager';
import { HeroLevelSystem } from '../../gameplay/units/HeroLevelSystem';
import { HeroWeaponManager } from '../../gameplay/weapons/HeroWeaponManager';
import { AirdropService } from '../../gameplay/airdrop/AirdropService';
import { BuffCardService } from '../../gameplay/roguelike/BuffCardService';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { WaveManager } from '../../gameplay/wave/WaveManager';
import { Base } from '../../gameplay/buildings/Base';
import { ItemService } from '../../gameplay/items/ItemService';
import { ShopInventoryStore } from '../diamond/ShopInventoryStore';
import type { ItemId } from '../../gameplay/items/ItemDefs';
import { Hero } from '../../gameplay/units/Hero';
import { EventManager } from '../managers/EventManager';
import { GameEvents } from '../../data/GameEvents';

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
    onCoopRequested?: (matchId: string) => void;
    showHomePage?: boolean;
    saveData?: GameSaveDataV2 | null;
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
            const freshCtx = { ...ctx, saveData: null };
            this._showLoadingScreen(freshCtx);
        });

        homePage.setOnContinueRequested(() => {
            const saveData = GameSaveManager.instance.load();
            homeNode.destroy();
            const continueCtx = { ...ctx, saveData };
            this._showLoadingScreen(continueCtx);
        });

        homePage.setOnCoopRequested((matchId: string) => {
            homeNode.destroy();
            ctx.onCoopRequested?.(matchId);
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
                // Restore coins/score AFTER gameManager.startGame() which resets them to INITIAL_COINS.
                if (ctx.saveData) {
                    this.gameManager.setCoins(ctx.saveData.coins);
                    this.gameManager.setScore(ctx.saveData.score);
                }
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
                if (ctx.saveData) {
                    this.gameManager.setCoins(ctx.saveData.coins);
                    this.gameManager.setScore(ctx.saveData.score);
                }
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

        // Load shop purchases from home screen into ItemService for this run
        const shopItems = ShopInventoryStore.drainItems();
        for (const entry of shopItems) {
            ItemService.instance.addItem(entry.id as ItemId, entry.count);
        }

        const startingWave = ctx.saveData?.waveNumber ?? 1;
        SpawnBootstrap.startWaves(ctx.waveLoop, GameConfig.WAVE.FIRST_WAVE_DELAY, startingWave);

        if (ctx.saveData) {
            this.applyPostStartRestore(ctx.saveData, spawned.base, spawned.hero);
        }
    }

    private static applyPostStartRestore(save: GameSaveDataV2, base: Node, hero: Node): void {
        // NOTE: coins/score are intentionally NOT set here — gameManager.startGame() resets them
        // to INITIAL_COINS after this method runs. They are applied in _showLoadingScreen instead.

        // Suppress the unconditional GAME_START weapon offer — player already has weapons.
        AirdropService.instance.suppressInitialOffer();

        HeroLevelSystem.instance.restoreState(save.heroLevel, save.heroXp);

        if (save.weapons && save.weapons.length > 0) {
            HeroWeaponManager.instance.restoreInventory(save.weapons, save.activeWeaponType);
        }

        if (save.buildings && save.buildings.length > 0) {
            BuildingManager.instance.restoreFromSave(save.buildings);
        }

        // Fast-forward WaveManager boss schedule & lane unlocks to match restored wave.
        if (save.waveNumber > 1) {
            WaveManager.instance.restoreToWave(save.waveNumber);
        }

        const baseComp = base.getComponent(Base);
        if (baseComp) {
            const targetBaseLevel = Math.max(1, Math.floor(save.baseLevel ?? 1));
            if (targetBaseLevel > baseComp.level) {
                baseComp.restoreToLevel(targetBaseLevel);
            }
            baseComp.syncUpgradePadForCurrentLevel();
            // Replay base-upgrade side effects (hero/barracks scaling) without opening buff-card UI.
            this.eventManager.emit(GameEvents.BASE_UPGRADE_READY, {
                baseLevel: targetBaseLevel,
                suppressCardDraw: true,
            });
        }
        if (baseComp && typeof save.baseHpRatio === 'number') {
            baseComp.currentHp = Math.max(1, Math.floor(save.baseHpRatio * baseComp.maxHp));
            baseComp.refreshHudHp();
        }

        if (save.buffCardIds && save.buffCardIds.length > 0) {
            BuffCardService.instance.restorePickedHistory(save.buffCardIds);
        }

        if (typeof save.nextOfferWave === 'number' && save.nextOfferWave > 1) {
            AirdropService.instance.setNextOfferWave(save.nextOfferWave);
        }

        if (save.items && save.items.length > 0) {
            ItemService.instance.restoreFromSave(save.items);
        }

        const heroComp = hero.getComponent(Hero);
        if (heroComp) {
            heroComp.restoreCoinCount(save.heroCoinCount);
        }

        console.log(
            `[GameStartFlow] Restored save: wave=${save.waveNumber}, baseLv=${Math.max(1, Math.floor(save.baseLevel ?? 1))}, gmCoins=${save.coins}, heroCoins=${save.heroCoinCount}, heroLv=${save.heroLevel}, buildings=${save.buildings?.length ?? 0}`
        );
    }

    private static get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private static get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
