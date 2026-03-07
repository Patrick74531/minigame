import { Node, assetManager } from 'cc';
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

const RESUME_AFTER_RELOAD_KEY = '__gvr_resume_after_reload_v1';
const RESUME_AFTER_RELOAD_MAX_AGE_MS = 2 * 60 * 1000;

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
    onAudioPreferenceSelected?: (enabled: boolean) => void;
    showHomePage?: boolean;
    saveData?: GameSaveDataV2 | null;
};

/**
 * GameStartFlow
 * 负责游戏启动与初始实体生成流程
 */
export class GameStartFlow {
    private static _tiktokResourcesReadyPromise: Promise<void> | null = null;

    public static run(ctx: StartContext): void {
        const game = this.gameManager;
        const resumeReason = this.consumePendingResumeAfterReloadReason();

        // If homepage is requested (default true) and not already playing
        if (ctx.showHomePage !== false) {
            if (resumeReason) {
                const saveData = ctx.saveData ?? GameSaveManager.instance.load();
                if (saveData) {
                    console.log(
                        `[GameStartFlow] Auto-continue after forced reload (${resumeReason}).`
                    );
                    const continueCtx = { ...ctx, saveData };
                    this._showLoadingScreen(continueCtx);
                    return;
                }
            }
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
    }

    private static _showLoadingScreen(ctx: StartContext) {
        this.ensureTikTokResourcesBundleReady()
            .catch(err => {
                console.warn(
                    '[GameStartFlow] TikTok resources bundle gate failed, continue with default loader.',
                    err
                );
            })
            .finally(() => {
                this._showLoadingScreenAfterBundleReady(ctx);
            });
    }

    private static _showLoadingScreenAfterBundleReady(ctx: StartContext) {
        // onComplete fires AFTER GPU warmup (loading screen still visible during warmup)
        const screen = LoadingScreen.show(ctx.containers.ui, () => {
            GameResourceLoader.loadPhase2();
        });
        this.hideTikTokNativeLoading();
        const audioChoicePromise: Promise<boolean> = screen
            .waitForAudioChoice()
            .then(enabled => {
                ctx.onAudioPreferenceSelected?.(enabled);
                return enabled;
            })
            .catch(err => {
                console.warn(
                    '[GameStartFlow] Failed to resolve audio preference. Fallback to disabled.',
                    err
                );
                ctx.onAudioPreferenceSelected?.(false);
                return false;
            });

        const phase1ReadyPromise: Promise<boolean> = GameResourceLoader.loadPhase1(
            (loaded, total) => {
                if (screen.isValid) screen.setProgress(loaded, total);
            }
        )
            .then(() => true)
            .catch(err => {
                console.warn(
                    '[GameStartFlow] Phase1 resource load failed, continue to gameplay.',
                    err
                );
                return false;
            });

        Promise.all([phase1ReadyPromise, audioChoicePromise]).then(([phase1Ready]) => {
            // Phase 1 in CPU memory. Start game NOW while loading screen covers the scene.
            // The 3D scene renders behind the loading screen, uploading GPU textures.
            this.startGame(ctx);
            this.gameManager.startGame();
            // Restore coins/score AFTER gameManager.startGame() which resets them to INITIAL_COINS.
            if (ctx.saveData) {
                this.gameManager.setCoins(ctx.saveData.coins);
                this.gameManager.setScore(ctx.saveData.score);
            }
            if (!screen.isValid) return;
            if (phase1Ready) {
                // GPU warmup: wait 1.0 s (~60 frames) for textures to upload before revealing scene.
                screen.scheduleOnce(() => {
                    if (screen.isValid) screen.signalReadyToClose();
                }, 1.0);
                return;
            }
            // If phase 1 failed, avoid extra warmup delay and reveal immediately.
            screen.signalReadyToClose();
        });
    }

    private static ensureTikTokResourcesBundleReady(): Promise<void> {
        if (!this.isTikTokRuntime()) return Promise.resolve();
        if (assetManager.getBundle('resources')) return Promise.resolve();
        if (this._tiktokResourcesReadyPromise) return this._tiktokResourcesReadyPromise;

        const loadBundle = () =>
            new Promise<void>((resolve, reject) => {
                assetManager.loadBundle('resources', err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });

        this._tiktokResourcesReadyPromise = loadBundle().catch(firstErr => {
            const ttLike = (
                globalThis as unknown as {
                    tt?: {
                        loadSubpackage?: (options: {
                            name: string;
                            success?: () => void;
                            fail?: (err: unknown) => void;
                        }) => void;
                    };
                }
            ).tt;

            if (!ttLike?.loadSubpackage) {
                throw firstErr;
            }

            return new Promise<void>((resolve, reject) => {
                ttLike.loadSubpackage?.({
                    name: 'resources',
                    success: () => {
                        loadBundle().then(resolve).catch(reject);
                    },
                    fail: reject,
                });
            });
        });

        return this._tiktokResourcesReadyPromise;
    }

    private static isTikTokRuntime(): boolean {
        const g = globalThis as unknown as { __GVR_PLATFORM__?: unknown; tt?: unknown };
        return g.__GVR_PLATFORM__ === 'tiktok' || typeof g.tt !== 'undefined';
    }

    private static hideTikTokNativeLoading(): void {
        try {
            const g = globalThis as Record<string, unknown> & {
                __GVR_HIDE_TIKTOK_NATIVE_LOADING__?: () => void;
            };
            if (typeof g.__GVR_HIDE_TIKTOK_NATIVE_LOADING__ === 'function') {
                g.__GVR_HIDE_TIKTOK_NATIVE_LOADING__();
            }
        } catch {
            // Ignore missing runtime hook.
        }

        try {
            const w = window as unknown as {
                __GVR_HIDE_TIKTOK_NATIVE_LOADING__?: () => void;
            };
            if (typeof w.__GVR_HIDE_TIKTOK_NATIVE_LOADING__ === 'function') {
                w.__GVR_HIDE_TIKTOK_NATIVE_LOADING__();
            }
        } catch {
            // Ignore runtimes without window.
        }
    }

    private static consumePendingResumeAfterReloadReason(): string | null {
        try {
            const raw = globalThis.sessionStorage?.getItem(RESUME_AFTER_RELOAD_KEY);
            if (!raw) return null;
            globalThis.sessionStorage?.removeItem(RESUME_AFTER_RELOAD_KEY);

            const parsed = JSON.parse(raw) as { reason?: unknown; ts?: unknown } | null;
            if (!parsed || typeof parsed !== 'object') return null;

            const ts =
                typeof parsed.ts === 'number'
                    ? parsed.ts
                    : typeof parsed.ts === 'string'
                      ? Number(parsed.ts)
                      : NaN;
            if (!Number.isFinite(ts)) return null;
            if (Date.now() - ts > RESUME_AFTER_RELOAD_MAX_AGE_MS) return null;

            return typeof parsed.reason === 'string' && parsed.reason.length > 0
                ? parsed.reason
                : 'reload';
        } catch {
            return null;
        }
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
        // Continue flow should not replay early-run tutorial dialogs.
        HUDManager.instance.suppressBasicTutorialDialogsForContinue();

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
            baseComp.restoreRevivalState(Boolean(save.baseRevivalUsed));
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
