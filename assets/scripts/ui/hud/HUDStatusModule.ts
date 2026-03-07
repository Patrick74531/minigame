import {
    Color,
    Graphics,
    Label,
    LabelOutline,
    LabelShadow,
    Node,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Widget,
} from 'cc';
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
    private static readonly TIKTOK_WEAPON_ICON_SIZE = 96;
    private static readonly TIKTOK_WEAPON_ICON_SCALE = 0.72;
    private static readonly TIKTOK_WEAPON_ICON_GAP = 14;
    private static readonly TIKTOK_WEAPON_BAR_PADDING_X = 14;

    private _coinsLabel: Label | null = null;
    private _diamondsLabel: Label | null = null;
    private _currencyPanelNode: Node | null = null;
    private _diamondListener: ((balance: number) => void) | null = null;
    private _waveLabel: Label | null = null;
    private _waveWidget: Widget | null = null;
    private _desktopMoveHintWidget: Widget | null = null;
    private _desktopMoveHintOpacity: UIOpacity | null = null;
    private _desktopMoveHintDismissed: boolean = false;
    private _buildingInfoLabel: Label | null = null;
    private _baseHpLabel: Label | null = null;

    private _xpBarBg: Graphics | null = null;
    private _xpBarFg: Graphics | null = null;
    private _levelLabel: Label | null = null;
    private _xpRootWidget: Widget | null = null;
    private _xpBarWidth = 320;
    private _xpBarHeight = 16;
    private _xpFillRatio = 0;

    private _isWaitingForNextWave: boolean = false;
    private _currentCountdownSeconds: number = 0;

    public initialize(uiCanvas: Node): void {
        this._desktopMoveHintDismissed = false;

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
        this._desktopMoveHintOpacity =
            this._desktopMoveHintWidget?.node.getComponent(UIOpacity) ??
            this._desktopMoveHintWidget?.node.addComponent(UIOpacity) ??
            null;
        if (this._desktopMoveHintWidget?.node?.isValid) {
            this._desktopMoveHintWidget.node.active = true;
        }
        if (this._desktopMoveHintOpacity) {
            this._desktopMoveHintOpacity.opacity = 210;
        }

        this.refreshWaveLabelStyle();
        this.applyHudEdgeLayout();
    }

    public cleanup(): void {
        if (this._desktopMoveHintWidget?.node) {
            Tween.stopAllByTarget(this._desktopMoveHintWidget.node);
        }
        if (this._desktopMoveHintOpacity) {
            Tween.stopAllByTarget(this._desktopMoveHintOpacity);
        }
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
        this._desktopMoveHintOpacity = null;
        this._desktopMoveHintDismissed = false;
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

        if (this._desktopMoveHintDismissed && this._desktopMoveHintWidget?.node?.isValid) {
            this._desktopMoveHintWidget.node.active = false;
        }

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
            this.refreshWaveLabelStyle();
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
        this.refreshWaveLabelStyle();
    }

    public updateWaveCountdown(seconds: number): void {
        if (!this._waveLabel) return;
        this._isWaitingForNextWave = true;
        this._currentCountdownSeconds = seconds;
        this._waveLabel.string = Localization.instance.t('ui.hud.wave.countdown', { seconds });
        this.refreshWaveLabelStyle();
    }

    public dismissDesktopMoveHint(): void {
        if (this._desktopMoveHintDismissed || !this._desktopMoveHintWidget?.node?.isValid) {
            return;
        }

        this._desktopMoveHintDismissed = true;
        const node = this._desktopMoveHintWidget.node;
        const opacity =
            this._desktopMoveHintOpacity ??
            node.getComponent(UIOpacity) ??
            node.addComponent(UIOpacity);
        this._desktopMoveHintOpacity = opacity;

        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);

        tween(opacity)
            .to(0.22, { opacity: 0 })
            .call(() => {
                if (node.isValid) {
                    node.active = false;
                }
            })
            .start();
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
        this._buildingInfoLabel.fontSize = 30;
        this._buildingInfoLabel.lineHeight = 36;
        this._buildingInfoLabel.color = new Color(242, 234, 210, 240);
        this._buildingInfoLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._buildingInfoLabel.enableWrapText = true;
        this._buildingInfoLabel.overflow = Label.Overflow.SHRINK;
        this.applyLabelStyle(this._buildingInfoLabel, {
            outlineColor: new Color(20, 14, 8, 220),
            outlineWidth: 3,
            shadowColor: new Color(0, 0, 0, 150),
            shadowOffsetY: -1,
            shadowBlur: 1,
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
        this._xpFillRatio = Math.max(0, Math.min(1, ratio));
        this._xpBarFg.clear();
        const w = this._xpBarWidth * this._xpFillRatio;
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

    private updateXpGeometry(width: number, height: number, isTikTokPortrait: boolean): void {
        const targetW = Math.round(width);
        const targetH = Math.round(height);
        if (
            targetW === this._xpBarWidth &&
            targetH === this._xpBarHeight &&
            this._xpBarBg &&
            this._xpBarFg
        ) {
            return;
        }

        this._xpBarWidth = targetW;
        this._xpBarHeight = targetH;

        const root = this._xpRootWidget?.node;
        root?.getComponent(UITransform)?.setContentSize(
            this._xpBarWidth + 90,
            this._xpBarHeight + 34
        );

        const levelNode = root?.getChildByName('LevelLabel');
        if (levelNode?.isValid) {
            const levelLabel = levelNode.getComponent(Label);
            if (levelLabel) {
                levelLabel.fontSize = isTikTokPortrait ? 16 : 26;
                levelLabel.lineHeight = levelLabel.fontSize + 4;
            }
            levelNode.setPosition(0, isTikTokPortrait ? 14 : 14, 0);
        }

        const yOffset = isTikTokPortrait ? -4 : -6;
        root?.getChildByName('XpBg')?.setPosition(0, yOffset, 0);
        root?.getChildByName('XpFg')?.setPosition(0, yOffset, 0);

        if (this._xpBarBg) {
            const radius = Math.max(5, Math.round(this._xpBarHeight * 0.44));
            this._xpBarBg.clear();
            this._xpBarBg.fillColor = new Color(12, 22, 34, 210);
            this._xpBarBg.roundRect(
                -this._xpBarWidth / 2,
                -this._xpBarHeight / 2,
                this._xpBarWidth,
                this._xpBarHeight,
                radius
            );
            this._xpBarBg.fill();
            this._xpBarBg.strokeColor = new Color(82, 180, 236, 215);
            this._xpBarBg.lineWidth = isTikTokPortrait ? 1.5 : 2;
            this._xpBarBg.roundRect(
                -this._xpBarWidth / 2,
                -this._xpBarHeight / 2,
                this._xpBarWidth,
                this._xpBarHeight,
                radius
            );
            this._xpBarBg.stroke();
        }

        this.drawXpFill(this._xpFillRatio);
    }

    private parseLevel(text: string): number {
        const num = Number(text.replace(/[^\d]/g, ''));
        return Number.isFinite(num) && num > 0 ? num : 1;
    }

    private applyLabelStyle(label: Label, options?: GameLabelStyleOptions): void {
        applyGameLabelStyle(label, options);
    }

    private refreshWaveLabelStyle(): void {
        if (!this._waveLabel) return;

        const outline = this._waveLabel.node.getComponent(LabelOutline);
        const shadow = this._waveLabel.node.getComponent(LabelShadow);
        const isCountdown = this._isWaitingForNextWave;
        const isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();

        this._waveLabel.color = isCountdown
            ? new Color(224, 234, 246, 255)
            : new Color(255, 215, 80, 255);

        if (outline) {
            outline.color = isCountdown
                ? new Color(10, 18, 28, 235)
                : new Color(40, 20, 0, 255);
            outline.width = isTikTokPortrait ? 2 : isCountdown ? 3 : 4;
        }

        if (shadow) {
            shadow.enabled = !isTikTokPortrait;
            shadow.color = isCountdown
                ? new Color(0, 0, 0, 150)
                : new Color(0, 0, 0, 205);
            shadow.offset.set(1, -1);
            shadow.blur = isCountdown ? 1 : 2;
        }
    }

    private redrawCurrencyPanelBackground(panelW: number, panelH: number): void {
        const bg = this._currencyPanelNode?.getComponent(Graphics);
        if (!bg) return;

        const radius = Math.max(8, Math.round(panelH * 0.28));
        bg.clear();
        bg.fillColor = new Color(10, 16, 32, 210);
        bg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
        bg.fill();
        bg.strokeColor = new Color(255, 200, 60, 110);
        bg.lineWidth = Math.max(1, Math.round(panelH * 0.04));
        bg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, radius);
        bg.stroke();
    }

    private applyHudEdgeLayout(): void {
        const padding = UIResponsive.getControlPadding();
        const size = UIResponsive.getVisibleSize();
        const isTikTokPortrait = UIResponsive.isTikTokPhonePortraitProfile();
        const compact = isTikTokPortrait || Math.min(size.width, size.height) < 700;
        const topInset = isTikTokPortrait
            ? Math.max(8, Math.round(padding.top * 0.42))
            : Math.max(14, Math.round(padding.top * 0.86));
        const bottomInset = isTikTokPortrait
            ? Math.max(16, Math.round(padding.bottom * 0.76))
            : Math.max(20, Math.round(padding.bottom * 0.82));
        const tiktokTopReserve = isTikTokPortrait
            ? Math.max(84, Math.round(padding.top * 0.55), Math.round(size.height * 0.12))
            : 0;

        if (this._currencyPanelNode?.isValid) {
            const panelWidget = this._currencyPanelNode.getComponent(Widget);
            const iconNodes = this._currencyPanelNode.children.filter(
                child => child.name === 'CIcon'
            );
            const coinIconNode = iconNodes[0] ?? null;
            const diamondIconNode = iconNodes[1] ?? null;
            const coinValueNode = this._coinsLabel?.node ?? null;
            const diamondValueNode = this._diamondsLabel?.node ?? null;

            if (isTikTokPortrait) {
                const panelW = Math.round(UIResponsive.clamp(size.width * 0.2, 78, 96));
                const panelH = Math.round(UIResponsive.clamp(size.height * 0.048, 30, 36));
                this._currencyPanelNode.getComponent(UITransform)?.setContentSize(panelW, panelH);
                this.redrawCurrencyPanelBackground(panelW, panelH);

                const coinFontSize = Math.max(14, Math.min(18, Math.round(panelH * 0.5)));
                if (this._coinsLabel?.isValid) {
                    this._coinsLabel.fontSize = coinFontSize;
                    this._coinsLabel.lineHeight = coinFontSize + 4;
                    this._coinsLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
                }

                if (diamondIconNode?.isValid) {
                    diamondIconNode.active = false;
                }
                if (diamondValueNode?.isValid) {
                    diamondValueNode.active = false;
                }

                if (coinIconNode?.isValid) {
                    const iconSize = Math.round(UIResponsive.clamp(panelH * 0.52, 14, 18));
                    coinIconNode.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
                    coinIconNode.setPosition(Math.round(-panelW * 0.5 + 5 + iconSize * 0.5), 0, 0);
                    coinIconNode.active = true;
                }
                if (coinValueNode?.isValid) {
                    const iconSize =
                        coinIconNode?.getComponent(UITransform)?.contentSize.width ?? 16;
                    const valueW = Math.max(24, Math.round(panelW * 0.44));
                    const groupGap = Math.max(3, Math.round(panelW * 0.03));
                    const groupW = iconSize + groupGap + valueW;
                    const groupLeft = -groupW * 0.5;
                    const iconX = Math.round(groupLeft + iconSize * 0.5);
                    const valueX = Math.round(iconX + iconSize * 0.5 + groupGap + valueW * 0.5);

                    if (coinIconNode?.isValid) {
                        coinIconNode.setPosition(iconX, 0, 0);
                    }
                    coinValueNode.getComponent(UITransform)?.setContentSize(valueW, panelH);
                    coinValueNode.setPosition(valueX, 0, 0);
                    if (this._coinsLabel) {
                        this._coinsLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                    }
                }

                const mapTopPad = tiktokTopReserve;
                const halfW = size.width * 0.5;
                const halfH = size.height * 0.5;
                const minimapTopY = halfH - mapTopPad;
                const leftPad = Math.max(10, Math.round(padding.left * 0.22));
                const clampedX = Math.round(-halfW + leftPad + panelW * 0.5);
                this._currencyPanelNode.setPosition(
                    clampedX,
                    Math.round(minimapTopY - panelH * 0.5),
                    0
                );

                if (panelWidget) {
                    panelWidget.enabled = false;
                }
            } else {
                const panelW = Math.round(UIResponsive.clamp(size.width * 0.165, 152, 214));
                const panelH = Math.round(UIResponsive.clamp(size.height * 0.116, 62, 88));
                this._currencyPanelNode.getComponent(UITransform)?.setContentSize(panelW, panelH);
                this.redrawCurrencyPanelBackground(panelW, panelH);
                const iconSize = Math.round(UIResponsive.clamp(panelH * 0.48, 20, 28));
                const gap = Math.max(3, Math.round(panelW * 0.018));
                const horizontalInset = Math.max(8, Math.round(panelW * 0.06));
                const contentW = panelW - horizontalInset * 2;
                const sectionGap = Math.max(6, Math.round(contentW * 0.07));
                const pairW = Math.max(
                    iconSize + gap + 34,
                    Math.floor((contentW - sectionGap) * 0.5)
                );
                const valueW = Math.max(34, pairW - iconSize - gap);
                const startX = -panelW * 0.5 + horizontalInset;
                const coinIconX = Math.round(startX + iconSize * 0.5);
                const coinValX = Math.round(coinIconX + iconSize * 0.5 + gap + valueW * 0.5);
                const diamPairStartX = startX + pairW + sectionGap;
                const diamIconX = Math.round(diamPairStartX + iconSize * 0.5);
                const diamValX = Math.round(diamIconX + iconSize * 0.5 + gap + valueW * 0.5);

                if (coinIconNode?.isValid) {
                    coinIconNode.active = true;
                    coinIconNode.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
                    coinIconNode.setPosition(coinIconX, 0, 0);
                }
                if (coinValueNode?.isValid) {
                    coinValueNode.getComponent(UITransform)?.setContentSize(valueW, panelH);
                    coinValueNode.setPosition(coinValX, 0, 0);
                }
                if (diamondIconNode?.isValid) {
                    diamondIconNode.active = true;
                    diamondIconNode.getComponent(UITransform)?.setContentSize(iconSize, iconSize);
                    diamondIconNode.setPosition(diamIconX, 0, 0);
                }
                if (diamondValueNode?.isValid) {
                    diamondValueNode.getComponent(UITransform)?.setContentSize(valueW, panelH);
                    diamondValueNode.setPosition(diamValX, 0, 0);
                }

                const fontSize = compact ? 20 : 24;
                if (this._coinsLabel?.isValid) {
                    const valueFontSize = Math.round(
                        UIResponsive.clamp(Math.min(fontSize, valueW * 0.5), 16, 22)
                    );
                    this._coinsLabel.fontSize = valueFontSize;
                    this._coinsLabel.lineHeight = valueFontSize + 4;
                    this._coinsLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                }
                if (this._diamondsLabel?.isValid) {
                    const valueFontSize = Math.round(
                        UIResponsive.clamp(Math.min(fontSize, valueW * 0.5), 16, 22)
                    );
                    this._diamondsLabel.fontSize = valueFontSize;
                    this._diamondsLabel.lineHeight = valueFontSize + 4;
                    this._diamondsLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
                    this._diamondsLabel.node.active = true;
                }
                if (panelWidget) {
                    panelWidget.enabled = true;
                    panelWidget.isAlignTop = true;
                    panelWidget.isAlignLeft = true;
                    panelWidget.isAlignRight = false;
                    panelWidget.isAlignBottom = false;
                    panelWidget.isAlignHorizontalCenter = false;
                    panelWidget.isAlignVerticalCenter = false;
                    const topPad = Math.max(10, Math.round(padding.top * 0.45));
                    const settingsBtnH = Math.round(
                        UIResponsive.clamp(size.height * (compact ? 0.1 : 0.085), 48, 68)
                    );
                    panelWidget.top = Math.max(
                        4,
                        topPad + Math.round((settingsBtnH - panelH) * 0.5)
                    );
                    panelWidget.left = Math.max(10, Math.round(padding.left * 0.72));
                    panelWidget.updateAlignment();
                }
            }
        }

        if (this._waveWidget) {
            const waveNode = this._waveWidget.node;
            waveNode
                .getComponent(UITransform)
                ?.setContentSize(
                    Math.round(
                        isTikTokPortrait
                            ? UIResponsive.clamp(size.width * 0.36, 136, 172)
                            : UIResponsive.clamp(size.width * 0.42, 220, 460)
                    ),
                    Math.round(
                        isTikTokPortrait
                            ? UIResponsive.clamp(size.height * 0.046, 28, 36)
                            : UIResponsive.clamp(size.height * 0.1, 46, 74)
                    )
                );
            if (this._waveLabel) {
                this._waveLabel.fontSize = isTikTokPortrait
                    ? 18
                    : this._isWaitingForNextWave
                      ? compact
                            ? 26
                            : 30
                      : compact
                        ? 32
                        : 36;
                this._waveLabel.lineHeight = this._waveLabel.fontSize + 6;
                this._waveLabel.enableWrapText = !isTikTokPortrait;

                const outline = this._waveLabel.node.getComponent(LabelOutline);
                if (outline) {
                    outline.width = isTikTokPortrait ? 2 : this._isWaitingForNextWave ? 3 : 4;
                }
                const shadow = this._waveLabel.node.getComponent(LabelShadow);
                if (shadow) {
                    shadow.enabled = !isTikTokPortrait;
                    if (!isTikTokPortrait) {
                        shadow.offset.set(1, -1);
                        shadow.blur = this._isWaitingForNextWave ? 1 : 2;
                    }
                }
            }
            this._waveWidget.isAlignTop = true;
            this._waveWidget.isAlignHorizontalCenter = true;
            this._waveWidget.isAlignLeft = false;
            this._waveWidget.isAlignRight = false;
            this._waveWidget.isAlignBottom = false;
            this._waveWidget.isAlignVerticalCenter = false;
            this._waveWidget.top = isTikTokPortrait
                ? tiktokTopReserve + Math.max(4, Math.round(size.height * 0.055))
                : topInset;
            this._waveWidget.horizontalCenter = 0;
            this._waveWidget.updateAlignment();
        }

        if (this._xpRootWidget) {
            const tiktokWeaponIconSize = Math.round(
                HUDStatusModule.TIKTOK_WEAPON_ICON_SIZE * HUDStatusModule.TIKTOK_WEAPON_ICON_SCALE
            );
            const xpWidth = isTikTokPortrait ? tiktokWeaponIconSize * 2 : 320;
            const xpHeight = isTikTokPortrait
                ? Math.round(UIResponsive.clamp(size.height * 0.018, 10, 13))
                : 16;
            this.updateXpGeometry(xpWidth, xpHeight, isTikTokPortrait);

            if (this._levelLabel?.isValid) {
                this._levelLabel.color = isTikTokPortrait
                    ? new Color(255, 215, 80, 255)
                    : new Color(255, 231, 132, 255);
                const levelOutline = this._levelLabel.node.getComponent(LabelOutline);
                if (levelOutline) {
                    levelOutline.width = isTikTokPortrait ? 2 : 4;
                    levelOutline.color = isTikTokPortrait
                        ? new Color(40, 20, 0, 255)
                        : new Color(40, 24, 8, 255);
                }
                const levelShadow = this._levelLabel.node.getComponent(LabelShadow);
                if (levelShadow) {
                    levelShadow.enabled = !isTikTokPortrait;
                    if (!isTikTokPortrait) {
                        levelShadow.offset.set(2, -2);
                        levelShadow.blur = 2;
                    }
                }
            }

            if (isTikTokPortrait) {
                const halfW = size.width * 0.5;
                const halfH = size.height * 0.5;
                const weaponBarWidth =
                    tiktokWeaponIconSize * 2 +
                    HUDStatusModule.TIKTOK_WEAPON_ICON_GAP +
                    HUDStatusModule.TIKTOK_WEAPON_BAR_PADDING_X * 2;
                const xpRootHeight = this._xpBarHeight + 34;
                const bottomGap = Math.max(6, Math.round(padding.bottom * 0.12));

                this._xpRootWidget.enabled = false;
                this._xpRootWidget.node.setPosition(
                    Math.round(-halfW + padding.left + weaponBarWidth * 0.5),
                    Math.round(-halfH + bottomGap + xpRootHeight * 0.5),
                    0
                );
            } else {
                this._xpRootWidget.enabled = true;
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
        }

        if (this._desktopMoveHintWidget) {
            const hintLabel = this._desktopMoveHintWidget.node.getComponent(Label);
            if (hintLabel) {
                hintLabel.overflow = Label.Overflow.SHRINK;
                hintLabel.fontSize = isTikTokPortrait ? 16 : compact ? 18 : 20;
                hintLabel.lineHeight = hintLabel.fontSize + 4;
                hintLabel.color = new Color(208, 222, 238, 220);
                const outline = hintLabel.node.getComponent(LabelOutline);
                if (outline) {
                    outline.width = 1;
                    outline.color = new Color(10, 18, 28, 220);
                }
                const shadow = hintLabel.node.getComponent(LabelShadow);
                if (shadow) {
                    shadow.offset.set(1, -1);
                    shadow.blur = 1;
                    shadow.color = new Color(0, 0, 0, 120);
                }
            }
            this._desktopMoveHintWidget.isAlignBottom = true;
            this._desktopMoveHintWidget.isAlignHorizontalCenter = true;
            this._desktopMoveHintWidget.isAlignTop = false;
            this._desktopMoveHintWidget.isAlignLeft = false;
            this._desktopMoveHintWidget.isAlignRight = false;
            this._desktopMoveHintWidget.bottom = Math.max(2, bottomInset - 26);
            this._desktopMoveHintWidget.horizontalCenter = 0;
            this._desktopMoveHintWidget.updateAlignment();
        }

        if (this._baseHpLabel) {
            this._baseHpLabel.node
                .getComponent(UITransform)
                ?.setContentSize(
                    Math.round(
                        isTikTokPortrait
                            ? UIResponsive.clamp(size.width * 0.56, 220, 360)
                            : UIResponsive.clamp(size.width * 0.5, 280, 560)
                    ),
                    Math.round(
                        isTikTokPortrait
                            ? UIResponsive.clamp(size.height * 0.08, 40, 58)
                            : UIResponsive.clamp(size.height * 0.1, 50, 76)
                    )
                );
            this._baseHpLabel.fontSize = isTikTokPortrait ? 22 : compact ? 26 : 30;
            this._baseHpLabel.lineHeight = this._baseHpLabel.fontSize + 6;
        }

        if (this._buildingInfoLabel) {
            this._buildingInfoLabel.node
                .getComponent(UITransform)
                ?.setContentSize(
                    Math.round(
                        isTikTokPortrait
                            ? UIResponsive.clamp(size.width * 0.76, 240, 380)
                            : UIResponsive.clamp(size.width * 0.68, 360, 780)
                    ),
                    Math.round(
                        isTikTokPortrait
                            ? UIResponsive.clamp(size.height * 0.085, 40, 62)
                            : UIResponsive.clamp(size.height * 0.1, 52, 86)
                    )
                );
            this._buildingInfoLabel.fontSize = isTikTokPortrait ? 20 : compact ? 24 : 28;
            this._buildingInfoLabel.lineHeight = this._buildingInfoLabel.fontSize + 6;
        }

        this.refreshWaveLabelStyle();
    }
}
