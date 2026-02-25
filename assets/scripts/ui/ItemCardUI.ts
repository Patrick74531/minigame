import { Node, UITransform, Color, Graphics, Label, UIOpacity, view } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { Localization } from '../core/i18n/Localization';
import { SelectionCardTheme } from './SelectionCardTheme';
import { ItemId, ITEM_DEFS } from '../gameplay/items/ItemDefs';

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
        this._isShowing = true;
        const viewport = this.getViewportSize();

        this._root = this.createOverlay(viewport.width, viewport.height);
        this._uiCanvas.addChild(this._root);

        this.createTitle(this._root, viewport.width, viewport.height);

        const cardContainer = new Node('ItemCardContainer');
        cardContainer.layer = UI_LAYER;
        cardContainer.addComponent(UITransform);
        this._root.addChild(cardContainer);

        const totalWidth = items.length * CARD_WIDTH + (items.length - 1) * CARD_GAP;
        const size = this._root.getComponent(UITransform)?.contentSize;
        if (size && totalWidth > size.width - 100) {
            const scale = (size.width - 100) / totalWidth;
            cardContainer.setScale(scale, scale, 1);
        }

        const startX = -totalWidth / 2 + CARD_WIDTH / 2;
        for (let i = 0; i < items.length; i++) {
            const itemId = items[i];
            const def = ITEM_DEFS[itemId];
            if (!def) continue;

            const cardNode = this.createCardNode(def, i);
            cardNode.setPosition(startX + i * (CARD_WIDTH + CARD_GAP), -20, 0);
            cardContainer.addChild(cardNode);
            SelectionCardTheme.playCardReveal(cardNode, i);
        }
    }

    public hideCards(): void {
        if (this._root && this._root.isValid) {
            this._root.destroy();
        }
        this._root = null;
        this._isShowing = false;
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

    private createTitle(parent: Node, _width: number, height: number): void {
        const titleNode = new Node('ItemTitle');
        titleNode.layer = UI_LAYER;
        parent.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(600, 50);
        titleNode.setPosition(0, height * 0.5 - 70, 0);

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.item.select.title');
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        SelectionCardTheme.applyLabelTheme(label, {
            fontSize: 28,
            lineHeight: 36,
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
        descLabel.overflow = Label.Overflow.CLAMP;
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

    private getViewportSize(): { width: number; height: number } {
        const size = view.getVisibleSize();
        return { width: size.width, height: size.height };
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
