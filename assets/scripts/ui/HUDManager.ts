import {
    Node,
    Label,
    Color,
    UITransform,
    Widget,
    Graphics,
    UIOpacity,
    Tween,
    tween,
    Vec3,
} from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameEvents } from '../data/GameEvents';
import { UIFactory } from './UIFactory';
import { GameConfig } from '../data/GameConfig';
import { WaveService } from '../core/managers/WaveService';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { Localization } from '../core/i18n/Localization';

// UI_2D Layer
const UI_LAYER = 33554432;

/**
 * HUD 管理器
 * 负责游戏内 UI 的更新
 *
 * NOTE: 当前运行主要由 HUDManager 驱动。
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

    // === 经验条 UI ===
    private _xpBarBg: Graphics | null = null;
    private _xpBarFg: Graphics | null = null;
    private _levelLabel: Label | null = null;
    private _xpBarWidth: number = 260;
    private _xpBarHeight: number = 14;

    // === 波前预告 UI ===
    private _waveForecastRoot: Node | null = null;
    private _waveForecastLabel: Label | null = null;
    private _waveForecastBg: Graphics | null = null;
    private _waveForecastOpacity: UIOpacity | null = null;
    private readonly _waveForecastWidth: number = 620;
    private readonly _waveForecastHeight: number = 66;

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
        uiCanvas.getChildByName('WaveForecastBanner')?.destroy();

        // 创建金币显示
        this._coinLabel = UIFactory.createCoinDisplay(uiCanvas);

        // 创建基地 HP 显示
        this._baseHpLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.baseHp', {
                current: GameConfig.BUILDING.BASE_START_HP,
                max: GameConfig.BUILDING.BASE_START_HP,
            }),
            'BaseHPLabel'
        );
        // Position using Widget
        const hpWidget = this._baseHpLabel.node.addComponent(Widget);
        hpWidget.isAlignTop = true;
        hpWidget.isAlignHorizontalCenter = true;
        hpWidget.top = 20;

        this._baseHpLabel.fontSize = 24;

        // 创建建造点信息显示
        this.createBuildingInfoLabel(uiCanvas);

        // 创建波次显示 (Top Left)
        this._waveLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.wave', { wave: 1 }),
            'WaveLabel'
        );

        // Position using Widget
        const waveWidget = this._waveLabel.node.addComponent(Widget);
        waveWidget.isAlignTop = true;
        waveWidget.isAlignLeft = true;
        waveWidget.top = 20;
        waveWidget.left = 20;

        this._waveLabel.fontSize = 30;
        this._waveLabel.color = new Color(255, 215, 0, 255); // Gold color

        // 创建经验条 (Top Center)
        this.createXpBar(uiCanvas);
        this.createWaveForecastBanner(uiCanvas);

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
        this.eventManager.on(GameEvents.WAVE_START, this.onWaveStart, this);
        this.eventManager.on(GameEvents.WAVE_FORECAST, this.onWaveForecast, this);
        this.eventManager.on(GameEvents.WAVE_COMPLETE, this.onWaveComplete, this);
        // 监听英雄经验变化
        this.eventManager.on(GameEvents.HERO_XP_GAINED, this.onXpGained, this);
        this.eventManager.on(GameEvents.HERO_LEVEL_UP, this.onHeroLevelUp, this);
    }

    // === 公共接口 ===

    /**
     * 更新金币显示
     */
    public updateCoinDisplay(count: number): void {
        if (this._coinLabel) {
            this._coinLabel.string = Localization.instance.t('ui.hud.coins', { count });
        }
    }

    /**
     * 更新基地 HP
     */
    public updateBaseHp(current: number, max: number): void {
        if (this._baseHpLabel) {
            this._baseHpLabel.string = Localization.instance.t('ui.hud.baseHp', {
                current: Math.max(0, Math.floor(current)),
                max,
            });
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
            this._waveLabel.string = Localization.instance.t('ui.hud.wave', { wave });
        }
    }

    /**
     * 显示建造点信息
     */
    public showBuildingInfo(title: string, requiredCoins: number, collectedCoins: number): void {
        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.string = Localization.instance.t('ui.building.infoProgress', {
                title,
                collected: collectedCoins,
                required: requiredCoins,
            });
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

    private onWaveStart(data: { wave?: number }): void {
        // console.log(`[HUD] 波次 ${data.wave} 开始`);
        const snapshot = this.waveService.getSnapshot();
        const wave = snapshot.currentWave || data.wave || 1;
        this.updateWaveDisplay(wave);
    }

    private onWaveComplete(_data: { wave?: number; bonus?: number }): void {
        // 可以在这里显示波次完成的提示
    }

    private onWaveForecast(data: {
        wave?: number;
        archetypeId?: string;
        lane?: 'left' | 'center' | 'right';
        spawnType?: 'regular' | 'elite' | 'boss';
    }): void {
        const archetypeId = (data.archetypeId ?? '').trim();
        if (!archetypeId) return;

        const lane = data.lane ?? 'center';
        const spawnType = data.spawnType ?? 'regular';
        const enemyName = this.resolveForecastEnemyName(archetypeId);
        const laneName = Localization.instance.t(`ui.waveForecast.lane.${lane}`);
        const header = Localization.instance.t(
            spawnType === 'boss' ? 'ui.waveForecast.header.boss' : 'ui.waveForecast.header.normal'
        );
        const body = Localization.instance.t(
            spawnType === 'boss'
                ? 'ui.waveForecast.message.boss'
                : 'ui.waveForecast.message.normal',
            {
                enemy: enemyName,
                lane: laneName,
            }
        );
        this.showWaveForecastBanner(`${header} ${body}`, spawnType === 'boss');
    }

    private onXpGained(data: {
        xp: number;
        currentXp: number;
        maxXp: number;
        level: number;
    }): void {
        this.updateXpBar(data.currentXp, data.maxXp, data.level);
    }

    private onHeroLevelUp(data: { level: number }): void {
        this.updateXpBar(0, 1, data.level);
    }

    // === 经验条 ===

    private createXpBar(parent: Node): void {
        // 清理旧节点
        parent.getChildByName('XpBarRoot')?.destroy();

        const root = new Node('XpBarRoot');
        root.layer = UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._xpBarWidth + 80, this._xpBarHeight + 30);

        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 20;

        // 等级标签
        const lvNode = new Node('LevelLabel');
        lvNode.layer = UI_LAYER;
        root.addChild(lvNode);
        lvNode.addComponent(UITransform);
        this._levelLabel = lvNode.addComponent(Label);
        this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level: 1 });
        this._levelLabel.fontSize = 22;
        this._levelLabel.lineHeight = 26;
        this._levelLabel.color = new Color(255, 230, 140, 255);
        this._levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        lvNode.setPosition(0, 12, 0);

        // 背景条
        const bgNode = new Node('XpBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._xpBarBg = bgNode.addComponent(Graphics);
        this._xpBarBg.fillColor = new Color(40, 40, 40, 200);
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            4
        );
        this._xpBarBg.fill();
        // 边框
        this._xpBarBg.strokeColor = new Color(120, 120, 120, 180);
        this._xpBarBg.lineWidth = 1;
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            4
        );
        this._xpBarBg.stroke();
        bgNode.setPosition(0, -6, 0);

        // 前景条
        const fgNode = new Node('XpFg');
        fgNode.layer = UI_LAYER;
        root.addChild(fgNode);
        fgNode.addComponent(UITransform);
        this._xpBarFg = fgNode.addComponent(Graphics);
        fgNode.setPosition(0, -6, 0);
        this.drawXpFill(0);
    }

    private drawXpFill(ratio: number): void {
        if (!this._xpBarFg) return;
        this._xpBarFg.clear();
        const w = this._xpBarWidth * Math.max(0, Math.min(1, ratio));
        if (w < 1) return;
        this._xpBarFg.fillColor = new Color(80, 200, 255, 255);
        this._xpBarFg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            w,
            this._xpBarHeight,
            4
        );
        this._xpBarFg.fill();
    }

    public updateXpBar(currentXp: number, maxXp: number, level: number): void {
        const ratio = maxXp > 0 ? currentXp / maxXp : 0;
        this.drawXpFill(ratio);
        if (this._levelLabel) {
            this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level });
        }
    }

    private createWaveForecastBanner(parent: Node): void {
        const root = new Node('WaveForecastBanner');
        root.layer = UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._waveForecastWidth, this._waveForecastHeight);

        const widget = root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 66;

        this._waveForecastOpacity = root.addComponent(UIOpacity);
        this._waveForecastOpacity.opacity = 0;

        const bgNode = new Node('WaveForecastBg');
        bgNode.layer = UI_LAYER;
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._waveForecastBg = bgNode.addComponent(Graphics);

        const labelNode = new Node('WaveForecastText');
        labelNode.layer = UI_LAYER;
        root.addChild(labelNode);
        labelNode.addComponent(UITransform);
        this._waveForecastLabel = labelNode.addComponent(Label);
        this._waveForecastLabel.string = '';
        this._waveForecastLabel.fontSize = 28;
        this._waveForecastLabel.lineHeight = 34;
        this._waveForecastLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._waveForecastLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._waveForecastLabel.color = new Color(120, 235, 255, 255);

        this._waveForecastRoot = root;
        this.drawWaveForecastBackground(false);
        root.active = false;
    }

    private resolveForecastEnemyName(archetypeId: string): string {
        const key = `enemy.archetype.${archetypeId}`;
        const localized = Localization.instance.t(key);
        if (localized.startsWith('[[')) {
            return archetypeId;
        }
        return localized;
    }

    private drawWaveForecastBackground(isBoss: boolean): void {
        if (!this._waveForecastBg) return;
        const bg = this._waveForecastBg;
        const width = this._waveForecastWidth;
        const height = this._waveForecastHeight;

        bg.clear();
        bg.fillColor = isBoss ? new Color(76, 18, 18, 235) : new Color(14, 34, 54, 225);
        bg.roundRect(-width / 2, -height / 2, width, height, 10);
        bg.fill();
        bg.strokeColor = isBoss ? new Color(255, 110, 110, 255) : new Color(80, 210, 255, 255);
        bg.lineWidth = 3;
        bg.roundRect(-width / 2, -height / 2, width, height, 10);
        bg.stroke();
    }

    private showWaveForecastBanner(text: string, isBoss: boolean): void {
        if (!this._waveForecastRoot || !this._waveForecastLabel || !this._waveForecastOpacity) {
            return;
        }

        this._waveForecastLabel.string = text;
        this._waveForecastLabel.color = isBoss
            ? new Color(255, 130, 130, 255)
            : new Color(120, 235, 255, 255);
        this.drawWaveForecastBackground(isBoss);

        Tween.stopAllByTarget(this._waveForecastRoot);
        Tween.stopAllByTarget(this._waveForecastOpacity);

        this._waveForecastRoot.active = true;
        this._waveForecastRoot.setScale(0.92, 0.92, 1);
        this._waveForecastOpacity.opacity = 0;

        tween(this._waveForecastRoot)
            .to(0.14, { scale: new Vec3(1.03, 1.03, 1) })
            .to(0.18, { scale: new Vec3(1, 1, 1) })
            .start();

        tween(this._waveForecastOpacity)
            .to(0.14, { opacity: 255 })
            .delay(2.2)
            .to(0.25, { opacity: 0 })
            .call(() => {
                if (this._waveForecastRoot) {
                    this._waveForecastRoot.active = false;
                }
            })
            .start();
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        if (this._waveForecastRoot) {
            Tween.stopAllByTarget(this._waveForecastRoot);
        }
        if (this._waveForecastOpacity) {
            Tween.stopAllByTarget(this._waveForecastOpacity);
        }
        this._coinLabel = null;
        this._waveLabel = null;
        this._buildingInfoLabel = null;
        this._baseHpLabel = null;
        this._xpBarBg = null;
        this._xpBarFg = null;
        this._levelLabel = null;
        this._waveForecastRoot = null;
        this._waveForecastLabel = null;
        this._waveForecastBg = null;
        this._waveForecastOpacity = null;
        this._uiCanvas = null;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
