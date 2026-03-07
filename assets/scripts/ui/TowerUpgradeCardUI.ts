import { Node, UITransform, Color, Widget, Graphics, Label } from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameManager } from '../core/managers/GameManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import {
    TowerUpgradeCardService,
    type TowerUpgradeCardDef,
} from '../gameplay/roguelike/TowerUpgradeCardService';
import { Localization } from '../core/i18n/Localization';
import { SelectionCardTheme, type GrantToken } from './SelectionCardTheme';
import { UIResponsive } from './UIResponsive';
import { TikTokAdService } from '../core/ads/TikTokAdService';

const UI_LAYER = 33554432;
const CARD_WIDTH = 258;
const CARD_HEIGHT = 378;
const CARD_GAP = 34;

export class TowerUpgradeCardUI {
    private static _instance: TowerUpgradeCardUI | null = null;

    public static get instance(): TowerUpgradeCardUI {
        if (!this._instance) {
            this._instance = new TowerUpgradeCardUI();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    private _root: Node | null = null;
    private _uiCanvas: Node | null = null;
    private _isShowing: boolean = false;
    private _activeBuildingId: string | null = null;
    private _pendingBuildingId: string | null = null;
    private _pendingShowTimer: ReturnType<typeof setTimeout> | null = null;
    private _pausedByTowerUpgradeCard: boolean = false;

    public get isShowing(): boolean {
        return this._isShowing;
    }

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.eventManager.on(
            GameEvents.TOWER_UPGRADE_CARDS_DRAWN,
            this.onTowerUpgradeCardsDrawn,
            this
        );
    }

    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        this.hideCards();
        this.clearPendingTimer();
        this._pendingBuildingId = null;
        this._uiCanvas = null;
        this._activeBuildingId = null;
        this.resumeIfPausedByTowerUpgradeCard();
    }

    private onTowerUpgradeCardsDrawn(data: { buildingId: string; count: number }): void {
        const cards = this.towerUpgradeCardService.pendingCards;
        if (cards.length === 0) return;
        this._pendingBuildingId = data.buildingId;
        this.tryShowPending();
    }

    private tryShowPending(): void {
        if (this._isShowing) return;
        const cards = this.towerUpgradeCardService.pendingCards;
        if (cards.length === 0) {
            this._pendingBuildingId = null;
            return;
        }
        if (this.isDialogueBusy() || this.isOtherModalShowing()) {
            this.schedulePendingRetry();
            return;
        }
        const buildingId = this._pendingBuildingId ?? '';
        this._pendingBuildingId = null;
        this.clearPendingTimer();
        this.showCards([...cards], buildingId);
    }

    private schedulePendingRetry(): void {
        if (this._pendingShowTimer !== null) return;
        this._pendingShowTimer = setTimeout(() => {
            this._pendingShowTimer = null;
            this.tryShowPending();
        }, 80);
    }

    private clearPendingTimer(): void {
        if (this._pendingShowTimer === null) return;
        clearTimeout(this._pendingShowTimer);
        this._pendingShowTimer = null;
    }

    private isDialogueBusy(): boolean {
        const hud = ServiceRegistry.get<{
            isDialogueBusy?: () => boolean;
            isRevivalShowing?: () => boolean;
        }>('HUDManager');
        if (hud?.isDialogueBusy?.()) return true;
        if (hud?.isRevivalShowing?.()) return true;
        return false;
    }

    private isOtherModalShowing(): boolean {
        const w = ServiceRegistry.get<{ isShowing?: boolean }>('WeaponSelectUI');
        if (w?.isShowing) return true;
        const b = ServiceRegistry.get<{ isShowing?: boolean }>('BuffCardUI');
        if (b?.isShowing) return true;
        const i = ServiceRegistry.get<{ isShowing?: boolean }>('ItemCardUI');
        if (i?.isShowing) return true;
        const ts = ServiceRegistry.get<{ isShowing?: boolean }>('TowerSelectUI');
        if (ts?.isShowing) return true;
        return false;
    }

    public showCards(cards: TowerUpgradeCardDef[], buildingId: string): void {
        if (!this._uiCanvas || this._isShowing) return;
        const resolvedBuildingId = buildingId || this.towerUpgradeCardService.activeTowerId || '';
        if (!resolvedBuildingId) return;
        if (
            SelectionCardTheme.isTikTokRuntime() &&
            TikTokAdService.isSessionSlotUnlocked('tower_attr_card')
        ) {
            this.towerUpgradeCardService.applyAllCards();
            this.playTowerUpgradeGrantAnimation(cards);
            return;
        }
        this._isShowing = true;
        this._activeBuildingId = resolvedBuildingId;

        const viewport = this.getViewportSize();
        const padding = UIResponsive.getControlPadding();
        const isPortraitTikTok = UIResponsive.isTikTokPhonePortraitProfile();
        this.pauseByTowerUpgradeCardIfNeeded();

        this._root = this.createOverlay(viewport.width, viewport.height);
        this._uiCanvas.addChild(this._root);
        this.createTitle(this._root, viewport.width, viewport.height);

        const totalWidth = cards.length * CARD_WIDTH + (cards.length - 1) * CARD_GAP;
        const usePortraitTriangle = isPortraitTikTok && cards.length === 3;
        const triangleRowGap = 34;
        const containerWidth = usePortraitTriangle ? CARD_WIDTH * 2 + CARD_GAP : totalWidth;
        const containerHeight = usePortraitTriangle
            ? CARD_HEIGHT * 2 + triangleRowGap
            : CARD_HEIGHT;

        const cardContainer = new Node('CardContainer');
        cardContainer.layer = UI_LAYER;
        cardContainer.addComponent(UITransform).setContentSize(containerWidth, containerHeight);
        this._root.addChild(cardContainer);

        const size = this._root.getComponent(UITransform)?.contentSize;
        let cardScale = 1;
        if (size) {
            const availableWidth = Math.max(
                240,
                size.width - padding.left - padding.right - (usePortraitTriangle ? 16 : 24)
            );
            const availableHeight = Math.max(
                180,
                size.height - padding.top - padding.bottom - (usePortraitTriangle ? 150 : 180)
            );
            const widthScale = availableWidth / containerWidth;
            const heightScale = availableHeight / containerHeight;
            const maxScale = usePortraitTriangle ? 1.15 : 1;
            const scale = Math.min(maxScale, widthScale, heightScale);
            cardScale = scale;
            cardContainer.setScale(scale, scale, 1);
        }

        const cardContainerY = usePortraitTriangle
            ? -Math.round(viewport.height * 0.08)
            : Math.round(-padding.bottom * 0.04);
        cardContainer.setPosition(0, cardContainerY, 0);

        const startX = -totalWidth / 2 + CARD_WIDTH / 2;
        const triangleBottomX = (CARD_WIDTH + CARD_GAP) * 0.5;
        const triangleTopY = CARD_HEIGHT * 0.5 + triangleRowGap * 0.5;
        const triangleBottomY = -(CARD_HEIGHT * 0.5 + triangleRowGap * 0.5);

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cardNode = this.createCardNode(card);
            if (usePortraitTriangle) {
                if (i === 0) {
                    cardNode.setPosition(0, triangleTopY, 0);
                } else if (i === 1) {
                    cardNode.setPosition(-triangleBottomX, triangleBottomY, 0);
                } else {
                    cardNode.setPosition(triangleBottomX, triangleBottomY, 0);
                }
            } else {
                cardNode.setPosition(startX + i * (CARD_WIDTH + CARD_GAP), -20, 0);
            }
            cardContainer.addChild(cardNode);
            SelectionCardTheme.playCardReveal(cardNode, i);
        }

        // 广告按钮（仅 TikTok 环境）
        const titleHeight = Math.round(
            Math.max(
                isPortraitTikTok ? 58 : 64,
                Math.min(
                    isPortraitTikTok ? 96 : 90,
                    viewport.height * (isPortraitTikTok ? 0.1 : 0.11)
                )
            )
        );
        const titleTop = Math.round(
            Math.max(
                padding.top + 8,
                Math.min(
                    isPortraitTikTok ? 120 : 160,
                    viewport.height * (isPortraitTikTok ? 0.1 : 0.14) + padding.top * 0.2
                )
            )
        );
        const titleBottomY = viewport.height * 0.5 - titleTop - titleHeight;
        const cardTopY = usePortraitTriangle
            ? cardContainerY + (triangleTopY + CARD_HEIGHT * 0.5) * cardScale
            : cardContainerY + (-20 + CARD_HEIGHT * 0.5) * cardScale;
        const adBtnHeight = isPortraitTikTok ? 82 : 78;
        const adBtnHalfH = adBtnHeight * 0.5;
        const adBtnMinY = cardTopY + adBtnHalfH + (isPortraitTikTok ? 12 : 10);
        const adBtnMaxY = titleBottomY - adBtnHalfH - (isPortraitTikTok ? 10 : 8);
        const adBtnY = Math.round(
            adBtnMaxY > adBtnMinY ? (adBtnMinY + adBtnMaxY) * 0.5 : adBtnMinY
        );
        const adBtnWidth = Math.round(
            Math.max(
                276,
                Math.min(
                    viewport.width - padding.left - padding.right - 24,
                    (CARD_WIDTH * 2 + CARD_GAP) * cardScale
                )
            )
        );
        SelectionCardTheme.createAdButton(
            this._root!,
            Localization.instance.t('ui.ad.get_all_upgrades'),
            { x: 0, y: adBtnY },
            () => this.onAdButtonTapped(),
            {
                width: adBtnWidth,
                height: adBtnHeight,
                fontSize: 16,
                subtitle: Localization.instance.t('ui.ad.unlock_run_all_tower_upgrades'),
                subtitleFontSize: 11,
            }
        );
    }

    public hideCards(): void {
        if (this._root && this._root.isValid) {
            this._root.destroy();
            this._root = null;
        }
        this._isShowing = false;
        this._activeBuildingId = null;
        this.tryShowPending();
        if (!this._isShowing) {
            this.resumeIfPausedByTowerUpgradeCard();
        }
    }

    private createOverlay(viewportWidth: number, viewportHeight: number): Node {
        const overlay = new Node('TowerUpgradeCardOverlay');
        overlay.layer = UI_LAYER;

        const transform = overlay.addComponent(UITransform);
        transform.setContentSize(viewportWidth, viewportHeight);

        const widget = overlay.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;

        const bg = new Node('OverlayBG');
        bg.layer = UI_LAYER;
        const bgTransform = bg.addComponent(UITransform);
        bgTransform.setContentSize(viewportWidth, viewportHeight);
        overlay.addChild(bg);

        const g = bg.addComponent(Graphics);
        SelectionCardTheme.drawOverlayMask(g, viewportWidth, viewportHeight);

        return overlay;
    }

    private createTitle(parent: Node, viewportWidth: number, viewportHeight: number): void {
        const isPortraitTikTok = UIResponsive.isTikTokPhonePortraitProfile();
        const titleNode = new Node('TowerUpgradeTitle');
        titleNode.layer = UI_LAYER;
        parent.addChild(titleNode);

        titleNode
            .addComponent(UITransform)
            .setContentSize(
                Math.round(
                    Math.max(
                        isPortraitTikTok ? 320 : 420,
                        Math.min(
                            isPortraitTikTok ? 900 : 920,
                            viewportWidth * (isPortraitTikTok ? 0.92 : 0.76)
                        )
                    )
                ),
                Math.round(
                    Math.max(
                        isPortraitTikTok ? 58 : 64,
                        Math.min(
                            isPortraitTikTok ? 96 : 90,
                            viewportHeight * (isPortraitTikTok ? 0.1 : 0.11)
                        )
                    )
                )
            );

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.tower.upgrade.select.title');
        label.overflow = Label.Overflow.SHRINK;
        SelectionCardTheme.applyLabelTheme(label, {
            fontSize: isPortraitTikTok ? 32 : 46,
            lineHeight: isPortraitTikTok ? 38 : 52,
            color: new Color(255, 218, 112, 255),
            bold: true,
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(46, 24, 8, 255),
            outlineWidth: isPortraitTikTok ? 4 : 5,
        });

        const widget = titleNode.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        const padding = UIResponsive.getControlPadding();
        widget.top = Math.round(
            Math.max(
                padding.top + 8,
                Math.min(
                    isPortraitTikTok ? 120 : 160,
                    viewportHeight * (isPortraitTikTok ? 0.1 : 0.14) + padding.top * 0.2
                )
            )
        );

        const decoNode = new Node('TitleDeco');
        decoNode.layer = UI_LAYER;
        titleNode.addChild(decoNode);
        const deco = decoNode.addComponent(Graphics);
        deco.strokeColor = new Color(255, 219, 120, 210);
        deco.lineWidth = 2;
        deco.moveTo(-230, -20);
        deco.lineTo(-95, -20);
        deco.stroke();
        deco.moveTo(95, -20);
        deco.lineTo(230, -20);
        deco.stroke();
    }

    private createCardNode(card: TowerUpgradeCardDef): Node {
        const cardNode = new Node(`TowerUpgradeCard_${card.id}`);
        cardNode.layer = UI_LAYER;
        cardNode.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);

        const themeColor = new Color(74, 159, 217, 255);

        const bg = new Node('CardBG');
        bg.layer = UI_LAYER;
        bg.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
        cardNode.addChild(bg);

        const g = bg.addComponent(Graphics);
        SelectionCardTheme.drawCardBackground(g, CARD_WIDTH, CARD_HEIGHT, themeColor, 78);

        const nameNode = new Node('CardName');
        nameNode.layer = UI_LAYER;
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 30, 56);
        cardNode.addChild(nameNode);

        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(card.nameKey);
        SelectionCardTheme.applyLabelTheme(nameLabel, {
            fontSize: 28,
            lineHeight: 32,
            color: Color.WHITE,
            bold: true,
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(18, 20, 34, 255),
            outlineWidth: 3,
        });
        nameLabel.overflow = Label.Overflow.SHRINK;
        nameLabel.enableWrapText = false;
        nameNode.setPosition(0, CARD_HEIGHT / 2 - 42, 0);

        SelectionCardTheme.createBadge(
            cardNode,
            Localization.instance.t('ui.tower.upgrade.badge'),
            themeColor,
            { w: 126, h: 30 },
            { x: 0, y: CARD_HEIGHT / 2 - 88 },
            new Color(176, 255, 206, 255)
        );

        const detailNode = new Node('CardDetail');
        detailNode.layer = UI_LAYER;
        detailNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 30, 230);
        cardNode.addChild(detailNode);

        const detailLabel = detailNode.addComponent(Label);
        detailLabel.string = this.formatCardDetail(card);
        SelectionCardTheme.applyLabelTheme(detailLabel, {
            fontSize: 21,
            lineHeight: 29,
            color: new Color(236, 244, 255, 255),
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(10, 22, 38, 255),
            outlineWidth: 2,
        });
        detailLabel.overflow = Label.Overflow.SHRINK;
        detailLabel.enableWrapText = true;
        detailNode.setPosition(0, -52, 0);

        SelectionCardTheme.bindCardClick(cardNode, () => {
            if (!this._isShowing || !this._activeBuildingId) return;
            this.onCardSelected(card);
        });

        return cardNode;
    }

    private formatCardDetail(card: TowerUpgradeCardDef): string {
        if (card.stat === 'attack') {
            const name = Localization.instance.t('ui.buff.stat.attack');
            const pct = Math.round((card.multiply - 1) * 100);
            return `${name} +${pct}%`;
        }

        if (card.stat === 'range') {
            const lines: string[] = [];
            const name = Localization.instance.t('ui.buff.stat.attackRange');
            const pct = Math.round((card.multiply - 1) * 100);
            lines.push(`${name} +${pct}%`);
            if (typeof card.minRangeGain === 'number' && card.minRangeGain > 0) {
                lines.push(
                    Localization.instance.t('ui.tower.upgrade.range.minGain', {
                        value: this.formatValue(card.minRangeGain),
                    })
                );
            }
            return lines.join('\n');
        }

        const intervalName = Localization.instance.t('ui.buff.stat.attackInterval');
        const reducePct = Math.round((1 - card.multiply) * 100);
        return `${intervalName} -${reducePct}%`;
    }

    private onCardSelected(card: TowerUpgradeCardDef): void {
        if (!this._activeBuildingId) return;
        const buildingId = this._activeBuildingId;

        this.eventManager.emit(GameEvents.TOWER_UPGRADE_CARD_PICKED, {
            buildingId,
            stat: card.stat,
        });

        this.hideCards();
    }

    private onAdButtonTapped(): void {
        if (!this._isShowing || !this._activeBuildingId) return;

        TikTokAdService.showRewardedAd('tower_attr_card').then(rewarded => {
            if (!rewarded) {
                if (TikTokAdService.wasLastAdCancelled()) {
                    TikTokAdService.showToast(Localization.instance.t('ui.ad.not_rewarded'));
                }
                return;
            }
            TikTokAdService.unlockSessionSlot('tower_attr_card');
            const cards = [...this.towerUpgradeCardService.pendingCards];
            this.towerUpgradeCardService.applyAllCards();
            this.hideCards();
            this.playTowerUpgradeGrantAnimation(cards);
        });
    }

    private pauseByTowerUpgradeCardIfNeeded(): void {
        if (this._pausedByTowerUpgradeCard) return;
        this.gameManager.pauseGame();
        this._pausedByTowerUpgradeCard = true;
    }

    private resumeIfPausedByTowerUpgradeCard(): void {
        if (!this._pausedByTowerUpgradeCard) return;
        this._pausedByTowerUpgradeCard = false;
        this.gameManager.resumeGame();
    }

    private playTowerUpgradeGrantAnimation(cards: TowerUpgradeCardDef[]): void {
        if (!this._uiCanvas || !this._uiCanvas.isValid || cards.length <= 0) return;
        const tokens: GrantToken[] = cards.map(card => ({
            text: this.getTowerUpgradeTokenText(card.stat),
            color: this.getTowerUpgradeTokenColor(card.stat),
        }));
        const viewport = this.getViewportSize();
        SelectionCardTheme.playGrantAnimation(this._uiCanvas, {
            message: Localization.instance.t('ui.ad.auto_grant.tower_upgrades'),
            tokens,
            fallbackTarget: { x: 0, y: -Math.round(viewport.height * 0.28) },
        });
    }

    private getTowerUpgradeTokenText(stat: 'attack' | 'range' | 'speed'): string {
        if (stat === 'attack') return 'ATK';
        if (stat === 'range') return 'RNG';
        return 'SPD';
    }

    private getTowerUpgradeTokenColor(stat: 'attack' | 'range' | 'speed'): Color {
        if (stat === 'attack') return new Color(255, 126, 88, 255);
        if (stat === 'range') return new Color(88, 198, 255, 255);
        return new Color(120, 224, 156, 255);
    }

    private formatValue(value: number): string {
        if (!Number.isFinite(value)) return '0';
        const rounded = Math.round(value * 100) / 100;
        if (Math.abs(rounded - Math.round(rounded)) < 0.0001) {
            return `${Math.round(rounded)}`;
        }
        return `${rounded.toFixed(2)}`;
    }

    private getViewportSize(): { width: number; height: number } {
        return UIResponsive.getLayoutViewportSize(480, 320, 'canvas');
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }

    private get towerUpgradeCardService(): TowerUpgradeCardService {
        return (
            ServiceRegistry.get<TowerUpgradeCardService>('TowerUpgradeCardService') ??
            TowerUpgradeCardService.instance
        );
    }
}
