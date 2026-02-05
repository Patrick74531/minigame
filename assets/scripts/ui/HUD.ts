import { _decorator, Component, Label, Node } from 'cc';
import { BaseComponent } from '../core/base/BaseComponent';
import { EventManager } from '../core/managers/EventManager';
import { GameManager } from '../core/managers/GameManager';
import { GameEvents } from '../data/GameEvents';
import { WaveService } from '../core/managers/WaveService';

const { ccclass, property } = _decorator;

/**
 * HUD 界面控制器
 * 显示金币、波次、分数等信息
 *
 * NOTE: HUD 通过 WaveService 获取快照，避免直接依赖某个 WaveManager。
 * 若新增波次系统，请注册到 WaveService。
 * LEGACY: 当前运行主要由 HUDManager 负责 UI。
 */
@ccclass('HUD')
export class HUD extends BaseComponent {
    @property(Label)
    public coinLabel: Label | null = null;

    @property(Label)
    public waveLabel: Label | null = null;

    @property(Label)
    public scoreLabel: Label | null = null;

    @property(Label)
    public enemyCountLabel: Label | null = null;

    protected initialize(): void {
        this.registerEvents();
        this.updateAllLabels();
    }

    protected cleanup(): void {
        EventManager.instance.offAllByTarget(this);
    }

    private registerEvents(): void {
        EventManager.instance.on(GameEvents.COIN_CHANGED, this.onCoinChanged, this);
        EventManager.instance.on(GameEvents.WAVE_START, this.onWaveStart, this);
        EventManager.instance.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
    }

    // === 更新显示 ===

    private updateAllLabels(): void {
        this.updateCoinLabel();
        this.updateWaveLabel();
        this.updateScoreLabel();
        this.updateEnemyCountLabel();
    }

    private updateCoinLabel(): void {
        if (this.coinLabel) {
            this.coinLabel.string = `💰 ${GameManager.instance.coins}`;
        }
    }

    private updateWaveLabel(): void {
        if (this.waveLabel) {
            const snapshot = WaveService.instance.getSnapshot();
            if (snapshot.totalWaves && snapshot.totalWaves > 0) {
                this.waveLabel.string = `🌊 Wave ${snapshot.currentWave}/${snapshot.totalWaves}`;
            } else {
                this.waveLabel.string = `🌊 Wave ${snapshot.currentWave}`;
            }
        }
    }

    private updateScoreLabel(): void {
        if (this.scoreLabel) {
            this.scoreLabel.string = `⭐ ${GameManager.instance.score}`;
        }
    }

    private updateEnemyCountLabel(): void {
        if (this.enemyCountLabel) {
            const snapshot = WaveService.instance.getSnapshot();
            const count = snapshot.enemiesAlive ?? 0;
            this.enemyCountLabel.string = `👾 ${count}`;
        }
    }

    // === 事件处理 ===

    private onCoinChanged(_data: { current: number; delta: number }): void {
        this.updateCoinLabel();
    }

    private onWaveStart(_data: { waveIndex: number }): void {
        this.updateWaveLabel();
        this.updateEnemyCountLabel();
    }

    private onUnitDied(data: { unitType: string }): void {
        if (data.unitType.startsWith('enemy')) {
            // 延迟更新以等待 WaveManager 处理
            this.scheduleOnce(() => {
                this.updateEnemyCountLabel();
                this.updateScoreLabel();
            }, 0.05);
        }
    }

}
