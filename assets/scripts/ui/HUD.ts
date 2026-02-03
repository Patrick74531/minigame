import { _decorator, Component, Label, Node } from 'cc';
import { BaseComponent } from '../core/base/BaseComponent';
import { EventManager } from '../core/managers/EventManager';
import { GameManager } from '../core/managers/GameManager';
import { WaveManager } from '../gameplay/wave/WaveManager';
import { GameEvents } from '../data/GameEvents';

const { ccclass, property } = _decorator;

/**
 * HUD 界面控制器
 * 显示金币、波次、分数等信息
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
            const current = WaveManager.instance.currentWaveIndex + 1;
            const total = WaveManager.instance.totalWaves;
            this.waveLabel.string = `🌊 Wave ${current}/${total}`;
        }
    }

    private updateScoreLabel(): void {
        if (this.scoreLabel) {
            this.scoreLabel.string = `⭐ ${GameManager.instance.score}`;
        }
    }

    private updateEnemyCountLabel(): void {
        if (this.enemyCountLabel) {
            this.enemyCountLabel.string = `👾 ${WaveManager.instance.enemiesAlive}`;
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
