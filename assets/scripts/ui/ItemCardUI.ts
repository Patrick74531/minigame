import { Node, UITransform, Color, Graphics, Label, UIOpacity } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { Localization } from '../core/i18n/Localization';
import { SelectionCardTheme, type GrantToken } from './SelectionCardTheme';
import { ItemId, ITEM_DEFS } from '../gameplay/items/ItemDefs';
import { UIResponsive } from './UIResponsive';
import { TikTokAdService } from '../core/ads/TikTokAdService';
import { ItemService } from '../gameplay/items/ItemService';
import { GameManager } from '../core/managers/GameManager';

const UI_LAYER = 33554432;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 300;
const CARD_GAP = 28;

/**
 * ItemCardUI
 * Boss宝箱拾取后展示3选1道具卡片选择界面。
 * 复用 SelectionCardTheme 的视觉风格和交互模式。
 */
export class ItemCardUI extends Singleton<ItemCardUI>() {
    private _uiCanvas: Node | null = null;
    private _root: Node | null = null;
    private _isShowing: boolean = false;
    private _offeredItems: ItemId[] = [];

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.eventManager.on(GameEvents.ITEM_CARDS_OFFERED, this.onItemsOffered, this);
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.ITEM_CARDS_OFFERED, this.onItemsOffered, this);
        this.hideCards();
        this._uiCanvas = null;
    }

    private onItemsOffered(data: { items: string[] }): void {
        this.showCards(data.items as ItemId[]);
    }

    public showCards(items: ItemId[]): void {
        if (!this._uiCanvas || this._isShowing) return;
        if (
            SelectionCardTheme.isTikTokRuntime() &&
            TikTokAdService.isSessionSlotUnlocked('item_card')
        ) {
            this.grantAllItemsAndPlayFeedback(items);
            return;
        }
        this._isShowing = true;
        this._offeredItems = [...items];
        const viewport = this.getViewportSize();
        const padding = UIResponsive.getControlPadding();
        const isPortraitTikTok = UIResponsive.isTikTokPhonePortraitProfile();

        this._root = this.createOverlay(viewport.width, viewport.height);
        this._uiCanvas.addChild(this._root);

        this.createTitle(this._root, viewport.width, viewport.height);

        const totalWidth = items.length * CARD_WIDTH + (items.length - 1) * CARD_GAP;
        const usePortraitTriangle = isPortraitTikTok && items.length === 3;
        const triangleRowGap = 32;
        const containerWidth = usePortraitTriangle ? CARD_WIDTH * 2 + CARD_GAP : totalWidth;
        const containerHeight = usePortraitTriangle
            ? CARD_HEIGHT * 2 + triangleRowGap
            : CARD_HEIGHT;
        const cardContainer = new Node('ItemCardContainer');
        cardContainer.layer = UI_LAYER;
        cardContainer.addComponent(UITransform).setContentSize(containerWidth, containerHeight);
        this._root.addChild(cardContainer);

        const size = this._root.getComponent(UITransform)?.contentSize;
        let cardScale = 1;
        if (size) {
            const availableWidth = Math.max(
                220,
                size.width - padding.left - padding.right - (usePortraitTriangle ? 16 : 24)
            );
            const availableHeight = Math.max(
                180,
                size.height - padding.top - padding.bottom - (usePortraitTriangle ? 140 : 160)
            );
            const widthScale = availableWidth / containerWidth;
            const heightScale = availableHeight / containerHeight;
            const maxScale = usePortraitTriangle ? 1.18 : 1;
            const scale = Math.min(maxScale, widthScale, heightScale);
            cardScale = scale;
            cardContainer.setScale(scale, scale, 1);
        }
        const cardContainerY = usePortraitTriangle ? -Math.round(viewport.height * 0.08) : 0;
        cardContainer.setPosition(0, cardContainerY, 0);

        const startX = -totalWidth / 2 + CARD_WIDTH / 2;
        const triangleBottomX = (CARD_WIDTH + CARD_GAP) * 0.5;
        const triangleTopY = CARD_HEIGHT * 0.5 + triangleRowGap * 0.5;
        const triangleBottomY = -(CARD_HEIGHT * 0.5 + triangleRowGap * 0.5);
        for (let i = 0; i < items.length; i++) {
            const itemId = items[i];
            const def = ITEM_DEFS[itemId];
            if (!def) continue;

            const cardNode = this.createCardNode(def, i);
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
                isPortraitTikTok ? 56 : 48,
                Math.min(
                    isPortraitTikTok ? 90 : 64,
                    viewport.height * (isPortraitTikTok ? 0.095 : 0.09)
                )
            )
        );
        const titleTop = Math.round(
            Math.max(
                padding.top + 8,
                Math.min(
                    isPortraitTikTok ? 120 : 96,
                    viewport.height * (isPortraitTikTok ? 0.1 : 0.12) + padding.top * 0.2
                )
            )
        );
        const titleBottomY = viewport.height * 0.5 - titleTop - titleHeight;
        const cardTopY = usePortraitTriangle
            ? cardContainerY + (triangleTopY + CARD_HEIGHT * 0.5) * cardScale
            : cardContainerY + (-20 + CARD_HEIGHT * 0.5) * cardScale;
        const titleToCardGap = titleBottomY - cardTopY;
        const adBtnY = Math.round(cardTopY + (titleToCardGap > 80 ? titleToCardGap * 0.5 : 40));
        const adBtnWidth = Math.round(
            Math.max(
                240,
                Math.min(
                    viewport.width - padding.left - padding.right - 24,
                    (CARD_WIDTH * 2 + CARD_GAP) * cardScale
                )
            )
        );
        SelectionCardTheme.createAdButton(
            this._root!,
            Localization.instance.t('ui.ad.unlock_run_all_items'),
            { x: 0, y: adBtnY },
            () => this.onAdButtonTapped(),
            {
                width: adBtnWidth,
                height: 56,
                fontSize: 15,
            }
        );
    }

    public hideCards(): void {
        if (this._root && this._root.isValid) {
            this._root.destroy();
        }
        this._root = null;
        this._isShowing = false;
        this._offeredItems = [];
    }

    private createOverlay(width: number, height: number): Node {
        const root = new Node('ItemCardOverlay');
        root.layer = UI_LAYER;
        const transform = root.addComponent(UITransform);
        transform.setContentSize(width, height);
        root.addComponent(UIOpacity).opacity = 255;

        const bg = root.addComponent(Graphics);
        SelectionCardTheme.drawOverlayMask(bg, width, height);

        return root;
    }

    private createTitle(parent: Node, width: number, height: number): void {
        const isPortraitTikTok = UIResponsive.isTikTokPhonePortraitProfile();
        const titleNode = new Node('ItemTitle');
        titleNode.layer = UI_LAYER;
        parent.addChild(titleNode);
        const titleWidth = Math.round(
            Math.max(
                isPortraitTikTok ? 320 : 420,
                Math.min(isPortraitTikTok ? 860 : 760, width * (isPortraitTikTok ? 0.9 : 0.7))
            )
        );
        const titleHeight = Math.round(
            Math.max(
                isPortraitTikTok ? 56 : 48,
                Math.min(isPortraitTikTok ? 90 : 64, height * (isPortraitTikTok ? 0.095 : 0.09))
            )
        );
        titleNode.addComponent(UITransform).setContentSize(titleWidth, titleHeight);
        const padding = UIResponsive.getControlPadding();
        const titleTop = Math.round(
            Math.max(
                padding.top + 8,
                Math.min(
                    isPortraitTikTok ? 120 : 96,
                    height * (isPortraitTikTok ? 0.1 : 0.12) + padding.top * 0.2
                )
            )
        );
        titleNode.setPosition(0, height * 0.5 - titleTop - titleHeight * 0.5, 0);

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.item.select.title');
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;

        SelectionCardTheme.applyLabelTheme(label, {
            fontSize: isPortraitTikTok ? 24 : 28,
            lineHeight: isPortraitTikTok ? 30 : 36,
            color: new Color(255, 244, 214, 255),
            bold: true,
            outlineColor: new Color(10, 18, 30, 255),
            outlineWidth: 3,
            shadowColor: new Color(0, 0, 0, 168),
            shadowOffsetY: -2,
        });
    }

    private createCardNode(def: (typeof ITEM_DEFS)[ItemId], _index: number): Node {
        const node = new Node(`ItemCard_${def.id}`);
        node.layer = UI_LAYER;
        node.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);

        const accent = this.hexToColor(def.iconColor);

        const bg = node.addComponent(Graphics);
        SelectionCardTheme.drawCardBackground(bg, CARD_WIDTH, CARD_HEIGHT, accent, 72);

        // Icon symbol
        const iconNode = new Node('ItemIcon');
        iconNode.layer = UI_LAYER;
        node.addChild(iconNode);
        iconNode.addComponent(UITransform).setContentSize(60, 60);
        iconNode.setPosition(0, CARD_HEIGHT * 0.5 - 42, 0);

        const iconLabel = iconNode.addComponent(Label);
        iconLabel.string = def.iconSymbol;
        iconLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        iconLabel.verticalAlign = Label.VerticalAlign.CENTER;
        SelectionCardTheme.applyLabelTheme(iconLabel, {
            fontSize: 36,
            lineHeight: 42,
            color: new Color(255, 255, 255, 255),
            outlineColor: accent,
            outlineWidth: 2,
        });

        // Name
        const nameNode = new Node('ItemName');
        nameNode.layer = UI_LAYER;
        node.addChild(nameNode);
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 24, 40);
        nameNode.setPosition(0, 50, 0);

        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(def.nameKey);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        nameLabel.overflow = Label.Overflow.SHRINK;
        nameLabel.enableWrapText = false;
        SelectionCardTheme.applyLabelTheme(nameLabel, {
            fontSize: 22,
            lineHeight: 26,
            color: new Color(255, 244, 214, 255),
            bold: true,
            outlineWidth: 2,
        });

        // Short description
        const descNode = new Node('ItemDesc');
        descNode.layer = UI_LAYER;
        node.addChild(descNode);
        descNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 32, 100);
        descNode.setPosition(0, -20, 0);

        const descLabel = descNode.addComponent(Label);
        descLabel.string = Localization.instance.t(def.shortKey);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        descLabel.overflow = Label.Overflow.SHRINK;
        descLabel.enableWrapText = true;
        SelectionCardTheme.applyLabelTheme(descLabel, {
            fontSize: 16,
            lineHeight: 22,
            color: new Color(200, 218, 240, 255),
            outlineWidth: 2,
        });

        // Rarity badge
        SelectionCardTheme.createBadge(
            node,
            Localization.instance.t(def.shortKey).length > 8 ? '★' : '★★',
            accent,
            { w: 56, h: 24 },
            { x: 0, y: -CARD_HEIGHT * 0.5 + 30 },
            new Color(255, 244, 214, 255)
        );

        // Click handler
        SelectionCardTheme.bindCardClick(node, () => {
            this.onCardSelected(def.id);
        });

        return node;
    }

    private onCardSelected(itemId: ItemId): void {
        this.eventManager.emit(GameEvents.ITEM_CARD_PICKED, { itemId });
        this.hideCards();
    }

    private onAdButtonTapped(): void {
        if (!this._isShowing || this._offeredItems.length === 0) return;

        TikTokAdService.showRewardedAd('item_card').then(rewarded => {
            if (!rewarded) {
                if (TikTokAdService.wasLastAdCancelled()) {
                    TikTokAdService.showToast(Localization.instance.t('ui.ad.not_rewarded'));
                }
                return;
            }
            TikTokAdService.unlockSessionSlot('item_card');
            const offered = [...this._offeredItems];
            const itemService =
                ServiceRegistry.get<ItemService>('ItemService') ?? ItemService.instance;
            itemService.addAllItems(this._offeredItems);
            this.hideCards();
            this.playItemGrantAnimation(offered);
            const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
            gm.resumeGame();
        });
    }

    private grantAllItemsAndPlayFeedback(items: ItemId[]): void {
        if (items.length <= 0) return;
        const itemService = ServiceRegistry.get<ItemService>('ItemService') ?? ItemService.instance;
        itemService.addAllItems(items);
        this.playItemGrantAnimation(items);
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.resumeGame();
    }

    private playItemGrantAnimation(items: ItemId[]): void {
        if (!this._uiCanvas || !this._uiCanvas.isValid || items.length <= 0) return;
        const tokens: GrantToken[] = items.map(itemId => {
            const def = ITEM_DEFS[itemId];
            return {
                text: def?.iconSymbol ?? '+',
                color: this.hexToColor(def?.iconColor ?? '#A8CCFF'),
            };
        });
        const viewport = this.getViewportSize();
        SelectionCardTheme.playGrantAnimation(this._uiCanvas, {
            message: Localization.instance.t('ui.ad.auto_grant.items'),
            tokens,
            targetNodeName: 'ItemBar',
            fallbackTarget: {
                x: -Math.round(viewport.width * 0.34),
                y: -Math.round(viewport.height * 0.24),
            },
        });
    }

    private getViewportSize(): { width: number; height: number } {
        const viewport = UIResponsive.getLayoutViewportSize(480, 320);
        return { width: viewport.width, height: viewport.height };
    }

    private hexToColor(hex: string): Color {
        if (!hex || hex.length < 7 || !hex.startsWith('#')) {
            return new Color(168, 204, 255, 255);
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return new Color(r, g, b, 255);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
