import { _decorator, Component, Label, Node } from 'cc';
import { BaseComponent } from '../core/base/BaseComponent';
import { EventManager } from '../core/managers/EventManager';
import { GameManager } from '../core/managers/GameManager';
import { GameEvents } from '../data/GameEvents';
import { WaveManager as CoreWaveManager } from '../core/managers/WaveManager';
import { WaveManager as GameplayWaveManager } from '../gameplay/wave/WaveManager';

const { ccclass, property } = _decorator;

/**
 * HUD 界面控制器
 * 显示金币、波次、分数等信息
 *
 * NOTE: HUD 读取波次信息时，优先兼容“核心/玩法”两套 WaveManager。
 * 新增或替换波次系统时，请同步更新 getWaveSnapshot()。
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
            const snapshot = this.getWaveSnapshot();
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
            const snapshot = this.getWaveSnapshot();
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

    private getWaveSnapshot(): {
        currentWave: number;
        totalWaves?: number;
        enemiesAlive?: number;
    } {
        // Prefer gameplay WaveManager if it is actively configured.
        if (typeof GameplayWaveManager.hasInstance === 'function' && GameplayWaveManager.hasInstance()) {
            const wm = GameplayWaveManager.instance;
            if (wm.totalWaves > 0) {
                return {
                    currentWave: wm.currentWaveIndex + 1,
                    totalWaves: wm.totalWaves,
                    enemiesAlive: wm.enemiesAlive,
                };
            }
        }

        // Fallback to core WaveManager (infinite wave mode)
        const core = CoreWaveManager.instance;
        return {
            currentWave: core.currentWave || 0,
            enemiesAlive: core.enemies.length,
        };
    }
}
