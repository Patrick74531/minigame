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
 * 每波开始时生成空投，抽取武器供玩家选择。
 * 空投宝箱打开后暂停游戏，展示 3 把武器供选择。
 *
 * NOTE: 与 BuffCardService 类似的事件驱动模式。
 */
export class AirdropService extends Singleton<AirdropService>() {
    private static readonly OFFER_INTERVAL_WAVES = 3;

    /** 当前待选武器 */
    private _pendingWeapons: WeaponType[] = [];
    private _waveCounter: number = 0;

    public get pendingWeapons(): WeaponType[] {
        return this._pendingWeapons;
    }

    // === 生命周期 ===

    public initialize(): void {
        this._waveCounter = 0;
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        console.log('[AirdropService] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.off(GameEvents.WEAPON_PICKED, this.onWeaponPicked, this);
        this._pendingWeapons = [];
        this._waveCounter = 0;
    }

    // === 事件处理 ===

    private onWaveStart(data: { wave?: number }): void {
        const wave = Math.max(1, Math.floor(data.wave ?? this._waveCounter + 1));
        this._waveCounter = wave;

        if (wave % AirdropService.OFFER_INTERVAL_WAVES !== 0) {
            return;
        }

        // 每 3 波开始时触发一次空投
        this.spawnAirdrop();
    }

    private spawnAirdrop(): void {
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
