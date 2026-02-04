import { Node, Label, Color, UITransform, Widget } from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameEvents } from '../data/GameEvents';
import { UIFactory } from './UIFactory';

// UI_2D Layer
const UI_LAYER = 33554432;

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
    private _buildingInfoLabel: Label | null = null;
    private _baseHpLabel: Label | null = null;
    private _uiCanvas: Node | null = null;

    /**
     * 初始化 HUD
     */
    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;

        // Cleanup duplicate UI nodes from previous sessions
        uiCanvas.getChildByName('CoinDisplay')?.destroy();
        uiCanvas.getChildByName('BaseHPLabel')?.destroy();
        uiCanvas.getChildByName('BuildingInfo')?.destroy();
        uiCanvas.getChildByName('WaveLabel')?.destroy();

        // 创建金币显示
        this._coinLabel = UIFactory.createCoinDisplay(uiCanvas);

        // 创建基地 HP 显示
        this._baseHpLabel = UIFactory.createLabel(uiCanvas, 'Base HP: 100/100', 'BaseHPLabel');
        this._baseHpLabel.node.setPosition(0, 300); // 屏幕上方
        this._baseHpLabel.fontSize = 24;

        // 创建建造点信息显示
        this.createBuildingInfoLabel(uiCanvas);

        // 创建波次显示 (Top Left)
        this._waveLabel = UIFactory.createLabel(uiCanvas, 'Wave: 1', 'WaveLabel');
        this._waveLabel.node.setPosition(-350, 300); // Top Left
        this._waveLabel.fontSize = 30;
        this._waveLabel.color = new Color(255, 215, 0, 255); // Gold color

        // console.log('[HUDManager] 初始化完成');

        // 监听事件
        this.setupEventListeners();
    }

    /**
     * 创建建造点信息标签
     */
    private createBuildingInfoLabel(parent: Node): void {
        const node = new Node('BuildingInfo');
        node.layer = UI_LAYER;
        parent.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0); // 锚点设为底部中心

        const widget = node.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 150;

        this._buildingInfoLabel = node.addComponent(Label);
        this._buildingInfoLabel.string = '';
        this._buildingInfoLabel.fontSize = 36;
        this._buildingInfoLabel.lineHeight = 40;
        this._buildingInfoLabel.color = new Color(255, 255, 255, 255); // 白色
        this._buildingInfoLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        // 默认隐藏
        node.active = false;
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
     * 更新基地 HP
     */
    public updateBaseHp(current: number, max: number): void {
        if (this._baseHpLabel) {
            this._baseHpLabel.string = `Base HP: ${Math.max(0, Math.floor(current))}/${max}`;
            // 简单的变色逻辑
            if (current < max * 0.3) {
                this._baseHpLabel.color = new Color(255, 50, 50, 255);
            } else {
                this._baseHpLabel.color = new Color(255, 255, 255, 255);
            }
        }
    }

    /**
     * 更新波次显示
     */
    public updateWaveDisplay(wave: number): void {
        if (this._waveLabel) {
            this._waveLabel.string = `Wave: ${wave}`;
        }
    }

    /**
     * 显示建造点信息
     */
    public showBuildingInfo(
        buildingName: string,
        requiredCoins: number,
        collectedCoins: number
    ): void {
        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.string = `${buildingName}: ${collectedCoins}/${requiredCoins} 金币`;
            this._buildingInfoLabel.node.active = true;
        }
    }

    /**
     * 隐藏建造点信息
     */
    public hideBuildingInfo(): void {
        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.node.active = false;
        }
    }

    // === 事件处理 ===

    private onWaveStart(data: { wave: number }): void {
        // console.log(`[HUD] 波次 ${data.wave} 开始`);
        this.updateWaveDisplay(data.wave);
    }

    private onWaveComplete(data: { wave: number; bonus: number }): void {
        // 可以在这里显示波次完成的提示
        // console.log(`[HUD] 波次 ${data.wave} 完成, 奖励 ${data.bonus}`);
    }

    /**
     * 清理
     */
    public cleanup(): void {
        EventManager.instance.offAllByTarget(this);
        this._coinLabel = null;
        this._waveLabel = null;
        this._buildingInfoLabel = null;
        this._baseHpLabel = null;
        this._uiCanvas = null;
    }
}
