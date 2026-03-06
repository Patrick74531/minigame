import { _decorator, Node } from 'cc';
import { Building, BuildingType } from './Building';
import { BuildingPad } from './BuildingPad'; // Added import
import { GameConfig } from '../../data/GameConfig';
import { HUDManager } from '../../ui/HUDManager';
import { GameEvents } from '../../data/GameEvents';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { WaveService } from '../../core/managers/WaveService';
import { WaveManager } from '../wave/WaveManager';
import { Hero } from '../units/Hero';

const { ccclass } = _decorator;

/**
 * 基地组件
 * 游戏核心保护目标，血量归零则游戏结束
 */
@ccclass('Base')
export class Base extends Building {
    private _upgradePad: BuildingPad | null = null;
    private _revivalUsed: boolean = false;
    private _awaitingRevival: boolean = false;

    public get revivalUsed(): boolean {
        return this._revivalUsed;
    }

    public restoreRevivalState(revivalUsed: boolean): void {
        this._revivalUsed = revivalUsed;
        this._awaitingRevival = false;
    }

    protected initialize(): void {
        this.buildingType = BuildingType.BASE;
        this.maxLevel = GameConfig.BUILDING.BASE_UPGRADE.MAX_LEVEL;
        this.upgradeCostMultiplier = GameConfig.BUILDING.BASE_UPGRADE.COST_MULTIPLIER;
        this.statMultiplier = GameConfig.BUILDING.BASE_UPGRADE.HP_MULTIPLIER;
        super.initialize();

        // Setup BuildingPad
        this.createUpgradePad();

        this.eventManager.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        this.eventManager.on(GameEvents.BASE_REVIVED, this.onBaseRevived, this);

        // Initial HUD Update
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    private createUpgradePad(): void {
        const padNode = new Node('UpgradePad');
        this.node.addChild(padNode);
        // Keep upgrade pad world-size stable even when Base node is scaled up/down.
        const sx = Math.abs(this.node.scale.x) > 1e-6 ? this.node.scale.x : 1;
        const sy = Math.abs(this.node.scale.y) > 1e-6 ? this.node.scale.y : 1;
        const sz = Math.abs(this.node.scale.z) > 1e-6 ? this.node.scale.z : 1;
        padNode.setScale(1 / sx, 1 / sy, 1 / sz);

        const pad = padNode.addComponent(BuildingPad);
        pad.buildingTypeId = 'base';
        pad.collectRadius = GameConfig.BUILDING.BASE_UPGRADE.COLLECT_RADIUS;
        pad.collectRate = GameConfig.BUILDING.BASE_UPGRADE.COLLECT_RATE;
        pad.collectInterval = GameConfig.BUILDING.BASE_UPGRADE.COLLECT_INTERVAL;
        pad.lockWorldPosition = false;

        // Ensure pad is registered with manager to get Hero reference
        const buildingManager = ServiceRegistry.get<any>('BuildingManager'); // Avoid circular dependency import if strict
        if (buildingManager && buildingManager.registerPad) {
            buildingManager.registerPad(pad);
        }

        // Use unified upgrade curve for all built buildings, keep legacy fallback.
        const startCost =
            GameConfig.BUILDING.UPGRADE_COST?.START_COST ??
            GameConfig.BUILDING.BASE_UPGRADE.START_COST;
        pad.initForExistingBuilding(this, startCost);

        // Position it
        pad.placeUpgradeZoneInFront(this.node, true);

        this._upgradePad = pad;
    }

    public syncUpgradePadForCurrentLevel(): void {
        if (!this._upgradePad || !this._upgradePad.node || !this._upgradePad.node.isValid) return;

        const nextCost = this.resolveNextUpgradeCostForLevel(this.level);
        this._upgradePad.initForExistingBuilding(this, nextCost);
        this._upgradePad.placeUpgradeZoneInFront(this.node, true);
    }

    private resolveNextUpgradeCostForLevel(level: number): number {
        const startCost =
            GameConfig.BUILDING.UPGRADE_COST?.START_COST ??
            GameConfig.BUILDING.BASE_UPGRADE.START_COST ??
            20;
        const costMultiplier =
            GameConfig.BUILDING.UPGRADE_COST?.COST_MULTIPLIER ??
            GameConfig.BUILDING.BASE_UPGRADE.COST_MULTIPLIER ??
            GameConfig.BUILDING.DEFAULT_COST_MULTIPLIER ??
            1.35;

        let cost = Math.max(1, Math.floor(startCost));
        const steps = Math.max(0, Math.floor(level) - 1);
        for (let i = 0; i < steps; i++) {
            cost = Math.max(1, Math.ceil(cost * costMultiplier));
        }
        return cost;
    }

    public takeDamage(damage: number, attacker?: any, isCrit: boolean = false): void {
        super.takeDamage(damage, attacker, isCrit);

        // Update HUD
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    private onEnemyReachedBase(data: { damage?: number }): void {
        const damage = data?.damage ?? GameConfig.ENEMY.BASE_REACH_DAMAGE;
        if (!this.isAlive) return;
        this.takeDamage(damage);
    }

    public refreshHudHp(): void {
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
    }

    protected update(dt: number): void {
        super.update(dt);
        // Base doesn't need custom update for upgrades anymore, handled by BuildingPad
    }

    /**
     * Override upgrade to trigger specific base events
     */
    public upgrade(): boolean {
        // Validation handled by super or Pad
        const upgraded = super.upgrade();
        if (!upgraded) return false;

        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);
        this.syncUpgradePadForCurrentLevel();

        // Trigger Roguelike card selection
        this.eventManager.emit(GameEvents.BASE_UPGRADE_READY, { baseLevel: this.level });

        return true;
    }

    protected onDestroyed(): void {
        // One-time revival: first destruction shows revival dialog instead of game over
        if (!this._revivalUsed) {
            this._revivalUsed = true;
            this._awaitingRevival = true;
            console.log('[Base] Destroyed — revival available.');
            const wave = this.resolveRevivalWave();
            this.gameManager.pauseGame();
            this.eventManager.emit(GameEvents.BASE_REVIVAL_AVAILABLE, { wave });
            return;
        }

        if (this._upgradePad && this._upgradePad.node.isValid) {
            this._upgradePad.node.destroy();
            this._upgradePad = null;
        }

        // Trigger generic building destruction (remove from map, fx)
        super.onDestroyed();

        // Trigger Game Over
        console.log('[Base] Destroyed! Game Over.');
        this.gameManager.gameOver(false); // Victory = false
    }

    private onBaseRevived(): void {
        if (!this._awaitingRevival) return;
        this._awaitingRevival = false;

        // Restore base to full HP and make node active again
        this.currentHp = this.maxHp;
        this.node.active = true;
        this.hudManager.updateBaseHp(this.currentHp, this.maxHp);

        // Restore all buildings via BuildingManager
        const bm = ServiceRegistry.get<any>('BuildingManager');
        if (bm && bm.rebuildAllBuildingsToPeakLevels) {
            bm.rebuildAllBuildingsToPeakLevels();
        } else if (bm && bm.rebuildDestroyedBuildingsToRecordedLevels) {
            bm.rebuildDestroyedBuildingsToRecordedLevels();
        }

        // Force-resume even if pause requests stacked (e.g. item dialog opened before base died)
        this.forceResumeAfterRevival();

        // Rebuild should always put the hero back at the initial spawn point.
        const heroNode = this.gameManager.hero;
        if (heroNode && heroNode.isValid) {
            const hero = heroNode.getComponent(Hero);
            hero?.forceReviveAtInitialSpawn();
        }

        // Use WaveLoop to clear enemies + restart this wave with the full 15s prep countdown
        const waveLoop = ServiceRegistry.get<any>('WaveLoop');
        if (waveLoop && typeof waveLoop.restartCurrentWaveForRevival === 'function') {
            waveLoop.restartCurrentWaveForRevival();
        }
    }

    private resolveRevivalWave(): number {
        const waveFromService = Math.max(0, Math.floor(this.waveService.currentWave));
        const waveFromGameManager = Math.max(0, Math.floor(this.gameManager.currentWave));
        return Math.max(1, waveFromService, waveFromGameManager);
    }

    private forceResumeAfterRevival(): void {
        // Pause requests can stack; consume all pause requests to avoid "rebuild then still frozen".
        for (let i = 0; i < 6 && !this.gameManager.isPlaying; i++) {
            this.gameManager.resumeGame();
        }
    }

    private get hudManager(): HUDManager {
        return ServiceRegistry.get<HUDManager>('HUDManager') ?? HUDManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }

    private get waveManager(): WaveManager {
        return ServiceRegistry.get<WaveManager>('WaveManager') ?? WaveManager.instance;
    }
}
