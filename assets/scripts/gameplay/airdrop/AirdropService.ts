import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { GameManager } from '../../core/managers/GameManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameConfig } from '../../data/GameConfig';
import { GameEvents } from '../../data/GameEvents';
import { HeroWeaponManager } from '../weapons/HeroWeaponManager';
import { WeaponType } from '../weapons/WeaponTypes';

/**
 * AirdropService
 * 开局立即生成一次空投，随后按波次间隔生成空投，抽取武器供玩家选择。
 * 空投宝箱打开后暂停游戏，展示 3 把武器供选择。
 *
 * NOTE: 与 BuffCardService 类似的事件驱动模式。
 */
export class AirdropService extends Singleton<AirdropService>() {
    /** 两次空投之间要经过的波次数（例：开局后第 3 波再触发） */
    private static readonly WAVES_BETWEEN_OFFERS = 2;

    /** 当前待选武器 */
    private _pendingWeapons: WeaponType[] = [];
    private _waveCounter: number = 0;
    /** 下一次按波次触发空投的目标波次 */
    private _nextOfferWave: number = 1 + AirdropService.WAVES_BETWEEN_OFFERS;
    /** 从存档恢复时设为 true，跳过 GAME_START 的初始空投 */
    private _suppressNextGameStartOffer: boolean = false;

    public get pendingWeapons(): WeaponType[] {
        return this._pendingWeapons;
    }

    public get nextOfferWave(): number {
        return this._nextOfferWave;
    }

    public setNextOfferWave(wave: number): void {
        this._nextOfferWave = Math.max(1, Math.floor(wave));
    }

    /** 从存档恢复时调用，阻止 GAME_START 触发的初始武器选择 */
    public suppressInitialOffer(): void {
        this._suppressNextGameStartOffer = true;
    }

    // === 生命周期 ===

    public initialize(): void {
        this._waveCounter = 0;
        this._nextOfferWave = 1 + AirdropService.WAVES_BETWEEN_OFFERS;
        this.eventManager.on(GameEvents.GAME_START, this.onGameStart, this);
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        console.log('[AirdropService] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.GAME_START, this.onGameStart, this);
        this.eventManager.off(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.off(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        this._pendingWeapons = [];
        this._waveCounter = 0;
        this._nextOfferWave = 1 + AirdropService.WAVES_BETWEEN_OFFERS;
        this._suppressNextGameStartOffer = false;
    }

    // === 事件处理 ===

    private onGameStart(): void {
        if (this._suppressNextGameStartOffer) {
            this._suppressNextGameStartOffer = false;
            return;
        }
        // 开局立即给一次武器选择
        this.spawnAirdrop();
    }

    private onWaveStart(data: { wave?: number }): void {
        const wave = Math.max(1, Math.floor(data.wave ?? this._waveCounter + 1));
        this._waveCounter = wave;

        if (wave < this._nextOfferWave) {
            return;
        }

        // 开局后每经过两波，在目标波次触发一次空投（3,5,7,...）
        this.spawnAirdrop();
        this._nextOfferWave = wave + AirdropService.WAVES_BETWEEN_OFFERS;
    }

    private spawnAirdrop(): void {
        if (this._pendingWeapons.length > 0) {
            return;
        }

        const count = GameConfig.WEAPON_SYSTEM.PICK_COUNT;
        const manager = HeroWeaponManager.instance;
        this._pendingWeapons = manager.drawWeapons(count);

        if (this._pendingWeapons.length === 0) {
            console.warn('[AirdropService] 无可用武器');
            return;
        }

        console.log(`[AirdropService] 空投武器: ${this._pendingWeapons.join(', ')}`);

        // 暂停游戏
        this.gameManager.pauseGame();

        // 通知 UI 展示武器选择
        this.eventManager.emit(GameEvents.WEAPONS_OFFERED, {
            weapons: this._pendingWeapons,
        });
    }

    private onWeaponPicked(data: { weaponId: string }): void {
        console.log(`[AirdropService] 玩家选择武器: ${data.weaponId}`);
        this._pendingWeapons = [];

        // 恢复游戏（UI 层处理隐藏）
        this.gameManager.resumeGame();
    }

    // === 工具 ===

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
