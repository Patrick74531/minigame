import { _decorator, Node, Label } from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameEvents } from '../data/GameEvents';
import { UIFactory } from './UIFactory';

/**
 * HUD 管理器
 * 负责游戏内 UI 的更新
 */
export class HUDManager {
    private static _instance: HUDManager | null = null;

    public static get instance(): HUDManager {
        if (!this._instance) {
            this._instance = new HUDManager();
        }
        return this._instance;
    }

    // === UI 元素 ===
    private _coinLabel: Label | null = null;
    private _waveLabel: Label | null = null;

    /**
     * 初始化 HUD
     */
    public initialize(uiCanvas: Node): void {
        // 创建金币显示
        this._coinLabel = UIFactory.createCoinDisplay(uiCanvas);
        
        console.log('[HUDManager] 初始化完成');
        
        // 监听事件
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // 监听波次开始
        EventManager.instance.on(GameEvents.WAVE_START, this.onWaveStart, this);
        EventManager.instance.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
    }

    // === 公共接口 ===

    /**
     * 更新金币显示
     */
    public updateCoinDisplay(count: number): void {
        if (this._coinLabel) {
            this._coinLabel.string = `Coins: ${count}`;
        }
    }

    /**
     * 更新波次显示
     */
    public updateWaveDisplay(wave: number, maxWaves: number): void {
        if (this._waveLabel) {
            this._waveLabel.string = `Wave: ${wave}/${maxWaves}`;
        }
    }

    // === 事件处理 ===

    private onWaveStart(data: { wave: number }): void {
        // 可以在这里显示波次开始的提示
        console.log(`[HUD] 波次 ${data.wave} 开始`);
    }

    private onWaveComplete(data: { wave: number; bonus: number }): void {
        // 可以在这里显示波次完成的提示
        console.log(`[HUD] 波次 ${data.wave} 完成, 奖励 ${data.bonus}`);
    }

    /**
     * 清理
     */
    public cleanup(): void {
        EventManager.instance.offAllByTarget(this);
        this._coinLabel = null;
        this._waveLabel = null;
    }
}
