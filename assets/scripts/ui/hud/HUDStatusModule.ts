import { Color, Graphics, Label, Node, UITransform, Widget } from 'cc';
import { DiamondService } from '../../core/diamond/DiamondService';
import { GameConfig } from '../../data/GameConfig';
import { WaveService } from '../../core/managers/WaveService';
import { Localization } from '../../core/i18n/Localization';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { BuildingType } from '../../gameplay/buildings/Building';
import { UIFactory } from '../UIFactory';
import { UIResponsive } from '../UIResponsive';
import {
    applyGameLabelStyle,
    applyLayerRecursive,
    HUD_UI_LAYER,
    type GameLabelStyleOptions,
} from './HUDCommon';
import type { HUDModule } from './HUDModule';

export class HUDStatusModule implements HUDModule {
    private _coinsLabel: Label | null = null;
    private _diamondsLabel: Label | null = null;
    private _currencyPanelNode: Node | null = null;
    private _diamondListener: ((balance: number) => void) | null = null;
    private _waveLabel: Label | null = null;
    private _waveWidget: Widget | null = null;
    private _desktopMoveHintWidget: Widget | null = null;
    private _buildingInfoLabel: Label | null = null;
    private _baseHpLabel: Label | null = null;

    private _xpBarBg: Graphics | null = null;
    private _xpBarFg: Graphics | null = null;
    private _levelLabel: Label | null = null;
    private _xpRootWidget: Widget | null = null;
    private _xpBarWidth = 320;
    private _xpBarHeight = 16;

    private _isWaitingForNextWave: boolean = false;
    private _currentCountdownSeconds: number = 0;

    public initialize(uiCanvas: Node): void {
        const currencyPanel = UIFactory.createCurrencyPanel(uiCanvas);
        this._coinsLabel = currencyPanel.coinsLabel;
        this._diamondsLabel = currencyPanel.diamondsLabel;
        this._currencyPanelNode = currencyPanel.panelNode;
        this._currencyPanelNode.active = true;

        const cpWidget = this._currencyPanelNode.addComponent(Widget);
        cpWidget.isAlignTop = true;
        cpWidget.isAlignLeft = true;
        cpWidget.top = 10;
        cpWidget.left = 10;

        // Subscribe to diamond balance changes
        this._diamondListener = (balance: number) => {
            if (this._diamondsLabel?.isValid) {
                this._diamondsLabel.string = String(balance);
            }
        };
        DiamondService.instance.addListener(this._diamondListener);
        if (this._diamondsLabel) {
            this._diamondsLabel.string = String(DiamondService.instance.balance);
        }

        this._baseHpLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.baseHp', {
                current: GameConfig.BUILDING.BASE_START_HP,
                max: GameConfig.BUILDING.BASE_START_HP,
            }),
            'BaseHPLabel'
        );
        const hpWidget = this._baseHpLabel.node.addComponent(Widget);
        hpWidget.isAlignTop = true;
        hpWidget.isAlignHorizontalCenter = true;
        hpWidget.top = 48;

        this._baseHpLabel.fontSize = 30;
        this._baseHpLabel.lineHeight = 36;
        this._baseHpLabel.overflow = Label.Overflow.SHRINK;
        this._baseHpLabel.color = new Color(244, 245, 255, 255);
        this.applyLabelStyle(this._baseHpLabel, {
            outlineColor: new Color(8, 16, 28, 255),
            outlineWidth: 4,
        });
        this._baseHpLabel.node.active = false;

        this.createBuildingInfoLabel(uiCanvas);

        this._waveLabel = UIFactory.createLabel(
            uiCanvas,
            Localization.instance.t('ui.hud.wave', { wave: 1 }),
            'WaveLabel'
        );
        this._waveWidget = this._waveLabel.node.addComponent(Widget);
        this._waveLabel.fontSize = 40;
        this._waveLabel.lineHeight = 44;
        this._waveLabel.overflow = Label.Overflow.SHRINK;
        this._waveLabel.color = new Color(255, 215, 80, 255);
        this.applyLabelStyle(this._waveLabel, {
            outlineColor: new Color(40, 20, 0, 255),
            outlineWidth: 5,
            shadowColor: new Color(0, 0, 0, 205),
        });

        this.createXpBar(uiCanvas);

        this._desktopMoveHintWidget =
            uiCanvas.getChildByName('DesktopMoveHint')?.getComponent(Widget) ?? null;
        this.applyHudEdgeLayout();
    }

    public cleanup(): void {
        if (this._diamondListener) {
            DiamondService.instance.removeListener(this._diamondListener);
            this._diamondListener = null;
        }
        this._coinsLabel = null;
        this._diamondsLabel = null;
        this._currencyPanelNode = null;
        this._waveLabel = null;
        this._waveWidget = null;
        this._desktopMoveHintWidget = null;
        this._buildingInfoLabel = null;
        this._baseHpLabel = null;
        this._xpRootWidget = null;
        this._xpBarBg = null;
        this._xpBarFg = null;
        this._levelLabel = null;
    }

    public onCanvasResize(): void {
        this.applyHudEdgeLayout();
    }

    public setVisible(visible: boolean): void {
        const nodes = [
            this._waveLabel?.node,
            this._xpRootWidget?.node, // The root of XP bar
            this._desktopMoveHintWidget?.node,
            this._buildingInfoLabel?.node,
        ];

        nodes.forEach(n => {
            if (n && n.isValid) {
                n.active = visible;
            }
        });

        if (this._currencyPanelNode?.isValid) {
            this._currencyPanelNode.active = visible;
        }
        if (this._baseHpLabel?.node?.isValid) {
            this._baseHpLabel.node.active = false;
        }
    }

    public onLanguageChanged(): void {
        if (this._waveLabel) {
            if (this._isWaitingForNextWave) {
                this._waveLabel.string = Localization.instance.t('ui.hud.wave.countdown', {
                    seconds: this._currentCountdownSeconds,
                });
            } else {
                this._waveLabel.string = Localization.instance.t('ui.hud.wave', {
                    wave: WaveService.instance.currentWave,
                });
            }
        }

        if (this._baseHpLabel) {
            const baseBuilding = BuildingManager.instance.activeBuildings.find(
                b => b.buildingType === BuildingType.BASE
            );
            const currentHP = baseBuilding?.currentHp ?? GameConfig.BUILDING.BASE_START_HP;

            this._baseHpLabel.string = Localization.instance.t('ui.hud.baseHp', {
                current: Math.max(0, Math.ceil(currentHP)),
                max: GameConfig.BUILDING.BASE_START_HP,
            });
        }

        // coinsLabel/diamondsLabel show raw numbers — no re-localization needed.

        if (this._levelLabel) {
            const level = this.parseLevel(this._levelLabel.string);
            this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level });
        }

        if (this._desktopMoveHintWidget) {
            const hintLabel = this._desktopMoveHintWidget.node.getComponent(Label);
            if (hintLabel) {
                hintLabel.string = Localization.instance.t('ui.hud.desktopMoveHint');
            }
        }
    }

    public updateCoinDisplay(count: number): void {
        if (!this._coinsLabel?.isValid) return;
        this._coinsLabel.string = String(count);
        if (this._currencyPanelNode?.isValid) this._currencyPanelNode.active = true;
    }

    public updateBaseHp(current: number, max: number): void {
        if (!this._baseHpLabel) return;
        this._baseHpLabel.string = Localization.instance.t('ui.hud.baseHp', {
            current: Math.max(0, Math.floor(current)),
            max,
        });

        if (current < max * 0.3) {
            this._baseHpLabel.color = new Color(255, 112, 112, 255);
        } else {
            this._baseHpLabel.color = new Color(244, 245, 255, 255);
        }
        this._baseHpLabel.node.active = false;
    }

    public updateWaveDisplay(wave: number): void {
        if (!this._waveLabel) return;
        this._isWaitingForNextWave = false;
        this._waveLabel.string = Localization.instance.t('ui.hud.wave', { wave });
    }

    public updateWaveCountdown(seconds: number): void {
        if (!this._waveLabel) return;
        this._isWaitingForNextWave = true;
        this._currentCountdownSeconds = seconds;
        this._waveLabel.string = Localization.instance.t('ui.hud.wave.countdown', { seconds });
    }

    public showBuildingInfo(title: string, requiredCoins: number, collectedCoins: number): void {
        if (!this._buildingInfoLabel) return;
        this._buildingInfoLabel.string = Localization.instance.t('ui.building.infoProgress', {
            title,
            collected: collectedCoins,
            required: requiredCoins,
        });
        this._buildingInfoLabel.node.active = true;
    }

    public hideBuildingInfo(): void {
        if (!this._buildingInfoLabel) return;
        this._buildingInfoLabel.node.active = false;
    }

    public updateXpBar(currentXp: number, maxXp: number, level: number): void {
        const ratio = maxXp > 0 ? currentXp / maxXp : 0;
        this.drawXpFill(ratio);
        if (this._levelLabel) {
            this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level });
        }
    }

    private createBuildingInfoLabel(parent: Node): void {
        const node = new Node('BuildingInfo');
        node.layer = HUD_UI_LAYER;
        parent.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0);

        const widget = node.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignHorizontalCenter = true;
        widget.bottom = 174;

        this._buildingInfoLabel = node.addComponent(Label);
        this._buildingInfoLabel.string = '';
        this._buildingInfoLabel.fontSize = 40;
        this._buildingInfoLabel.lineHeight = 46;
        this._buildingInfoLabel.color = new Color(255, 244, 212, 255);
        this._buildingInfoLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._buildingInfoLabel.enableWrapText = true;
        this._buildingInfoLabel.overflow = Label.Overflow.SHRINK;
        this.applyLabelStyle(this._buildingInfoLabel, {
            outlineColor: new Color(24, 16, 8, 255),
            outlineWidth: 4,
        });

        node.active = false;
    }

    private createXpBar(parent: Node): void {
        parent.getChildByName('XpBarRoot')?.destroy();

        const root = new Node('XpBarRoot');
        root.layer = HUD_UI_LAYER;
        parent.addChild(root);

        const transform = root.addComponent(UITransform);
        transform.setContentSize(this._xpBarWidth + 90, this._xpBarHeight + 34);

        this._xpRootWidget = root.addComponent(Widget);

        const lvNode = new Node('LevelLabel');
        root.addChild(lvNode);
        lvNode.addComponent(UITransform);
        this._levelLabel = lvNode.addComponent(Label);
        this._levelLabel.string = Localization.instance.t('ui.common.level.short', { level: 1 });
        this._levelLabel.fontSize = 26;
        this._levelLabel.lineHeight = 30;
        this._levelLabel.color = new Color(255, 231, 132, 255);
        this._levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.applyLabelStyle(this._levelLabel, {
            outlineColor: new Color(40, 24, 8, 255),
            outlineWidth: 4,
        });
        lvNode.setPosition(0, 14, 0);

        const bgNode = new Node('XpBg');
        root.addChild(bgNode);
        bgNode.addComponent(UITransform);
        this._xpBarBg = bgNode.addComponent(Graphics);
        this._xpBarBg.fillColor = new Color(12, 22, 34, 210);
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            7
        );
        this._xpBarBg.fill();
        this._xpBarBg.strokeColor = new Color(82, 180, 236, 215);
        this._xpBarBg.lineWidth = 2;
        this._xpBarBg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            this._xpBarWidth,
            this._xpBarHeight,
            7
        );
        this._xpBarBg.stroke();
        bgNode.setPosition(0, -6, 0);

        const fgNode = new Node('XpFg');
        root.addChild(fgNode);
        fgNode.addComponent(UITransform);
        this._xpBarFg = fgNode.addComponent(Graphics);
        fgNode.setPosition(0, -6, 0);
        this.drawXpFill(0);
        applyLayerRecursive(root, HUD_UI_LAYER);
    }

    private drawXpFill(ratio: number): void {
        if (!this._xpBarFg) return;
        this._xpBarFg.clear();
        const w = this._xpBarWidth * Math.max(0, Math.min(1, ratio));
        if (w < 1) return;
        this._xpBarFg.fillColor = new Color(92, 220, 255, 255);
        this._xpBarFg.roundRect(
            -this._xpBarWidth / 2,
            -this._xpBarHeight / 2,
            w,
            this._xpBarHeight,
            7
        );
        this._xpBarFg.fill();
    }

    private parseLevel(text: string): number {
        const num = Number(text.replace(/[^\d]/g, ''));
        return Number.isFinite(num) && num > 0 ? num : 1;
    }

    private applyLabelStyle(label: Label, options?: GameLabelStyleOptions): void {
        applyGameLabelStyle(label, options);
    }

    private applyHudEdgeLayout(): void {
        const padding = UIResponsive.getControlPadding();
        const size = UIResponsive.getVisibleSize();
        const compact = Math.min(size.width, size.height) < 700;
        const topInset = Math.max(14, Math.round(padding.top * 0.86));
        const bottomInset = Math.max(20, Math.round(padding.bottom * 0.82));

        if (this._currencyPanelNode?.isValid) {
            const panelW = Math.round(UIResponsive.clamp(size.width * 0.155, 130, 188));
            const panelH = Math.round(UIResponsive.clamp(size.height * 0.116, 62, 88));
            this._currencyPanelNode.getComponent(UITransform)?.setContentSize(panelW, panelH);
            const fontSize = compact ? 20 : 24;
            if (this._coinsLabel?.isValid) {
                this._coinsLabel.fontSize = fontSize;
                this._coinsLabel.lineHeight = fontSize + 4;
            }
            if (this._diamondsLabel?.isValid) {
                this._diamondsLabel.fontSize = fontSize;
                this._diamondsLabel.lineHeight = fontSize + 4;
            }
            const panelWidget = this._currencyPanelNode.getComponent(Widget);
            if (panelWidget) {
                panelWidget.isAlignTop = true;
                panelWidget.isAlignLeft = true;
                panelWidget.isAlignRight = false;
                panelWidget.isAlignBottom = false;
                panelWidget.isAlignHorizontalCenter = false;
                panelWidget.isAlignVerticalCenter = false;
                // Mirror the settings button's topPad so vertical centers align.
                const topPad = Math.max(10, Math.round(padding.top * 0.45));
                const settingsBtnH = Math.round(
                    UIResponsive.clamp(size.height * (compact ? 0.1 : 0.085), 48, 68)
                );
                panelWidget.top = Math.max(4, topPad + Math.round((settingsBtnH - panelH) * 0.5));
                panelWidget.left = Math.max(10, Math.round(padding.left * 0.72));
                panelWidget.updateAlignment();
            }
        }

        if (this._waveWidget) {
            const waveNode = this._waveWidget.node;
            waveNode
                .getComponent(UITransform)
                ?.setContentSize(
                    Math.round(UIResponsive.clamp(size.width * 0.42, 220, 460)),
                    Math.round(UIResponsive.clamp(size.height * 0.1, 46, 74))
                );
            if (this._waveLabel) {
                this._waveLabel.fontSize = compact ? 34 : 40;
                this._waveLabel.lineHeight = this._waveLabel.fontSize + 6;
            }
            this._waveWidget.isAlignTop = true;
            this._waveWidget.isAlignHorizontalCenter = true;
            this._waveWidget.isAlignLeft = false;
            this._waveWidget.isAlignRight = false;
            this._waveWidget.isAlignBottom = false;
            this._waveWidget.isAlignVerticalCenter = false;
            this._waveWidget.top = topInset;
            this._waveWidget.horizontalCenter = 0;
            this._waveWidget.updateAlignment();
        }

        if (this._xpRootWidget) {
            this._xpRootWidget.isAlignBottom = true;
            this._xpRootWidget.isAlignHorizontalCenter = true;
            this._xpRootWidget.isAlignTop = false;
            this._xpRootWidget.isAlignLeft = false;
            this._xpRootWidget.isAlignRight = false;
            this._xpRootWidget.isAlignVerticalCenter = false;
            this._xpRootWidget.bottom = bottomInset;
            this._xpRootWidget.horizontalCenter = 0;
            this._xpRootWidget.updateAlignment();
        }

        if (this._desktopMoveHintWidget) {
            const hintLabel = this._desktopMoveHintWidget.node.getComponent(Label);
            if (hintLabel) {
                hintLabel.overflow = Label.Overflow.SHRINK;
            }
            this._desktopMoveHintWidget.isAlignBottom = true;
            this._desktopMoveHintWidget.isAlignHorizontalCenter = true;
            this._desktopMoveHintWidget.isAlignTop = false;
            this._desktopMoveHintWidget.isAlignLeft = false;
            this._desktopMoveHintWidget.isAlignRight = false;
            this._desktopMoveHintWidget.bottom = Math.max(2, bottomInset - 34);
            this._desktopMoveHintWidget.horizontalCenter = 0;
            this._desktopMoveHintWidget.updateAlignment();
        }

        if (this._baseHpLabel) {
            this._baseHpLabel.node
                .getComponent(UITransform)
                ?.setContentSize(
                    Math.round(UIResponsive.clamp(size.width * 0.5, 280, 560)),
                    Math.round(UIResponsive.clamp(size.height * 0.1, 50, 76))
                );
            this._baseHpLabel.fontSize = compact ? 26 : 30;
            this._baseHpLabel.lineHeight = this._baseHpLabel.fontSize + 6;
        }

        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.node
                .getComponent(UITransform)
                ?.setContentSize(
                    Math.round(UIResponsive.clamp(size.width * 0.82, 420, 1020)),
                    Math.round(UIResponsive.clamp(size.height * 0.16, 70, 130))
                );
            this._buildingInfoLabel.fontSize = compact ? 32 : 40;
            this._buildingInfoLabel.lineHeight = this._buildingInfoLabel.fontSize + 6;
        }
    }
}
