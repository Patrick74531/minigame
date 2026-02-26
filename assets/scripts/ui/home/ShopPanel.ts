import {
    BlockInputEvents,
    Button,
    Color,
    Graphics,
    Label,
    Layers,
    Mask,
    Node,
    ScrollView,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    Widget,
} from 'cc';
import { Localization } from '../../core/i18n/Localization';
import { DiamondService } from '../../core/diamond/DiamondService';
import { ALL_ITEM_IDS, ITEM_DEFS, type ItemId } from '../../gameplay/items/ItemDefs';
import { ShopInventoryStore } from '../../core/diamond/ShopInventoryStore';
import { applyGameLabelStyle } from '../hud/HUDCommon';
import { UIResponsive } from '../UIResponsive';

const ITEM_PRICE = 100;

export class ShopPanel {
    private _root: Node | null = null;
    private _panel: Node | null = null;
    private _balanceLabel: Label | null = null;
    private _itemNodes: Node[] = [];
    private _onClose: (() => void) | null = null;
    private _diamondListener: ((balance: number) => void) | null = null;
    private _uiLayer: number = Layers.Enum.UI_2D;

    constructor(parent: Node, onClose: () => void) {
        this._onClose = onClose;
        this._uiLayer = parent.layer;
        this.build(parent);
    }

    public destroy(): void {
        if (this._diamondListener) {
            DiamondService.instance.removeListener(this._diamondListener);
            this._diamondListener = null;
        }
        if (this._root && this._root.isValid) {
            Tween.stopAllByTarget(this._root);
            this._root.destroy();
        }
        this._root = null;
        this._panel = null;
        this._balanceLabel = null;
        this._itemNodes = [];
    }

    private build(parent: Node): void {
        const canvasTf = parent.getComponent(UITransform);
        const vw = canvasTf ? canvasTf.contentSize.width : 1280;
        const vh = canvasTf ? canvasTf.contentSize.height : 720;

        // Root overlay
        const root = new Node('ShopPanel');
        root.layer = this._uiLayer;
        parent.addChild(root);
        root.addComponent(UITransform).setContentSize(vw, vh);
        const rootWidget = root.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;
        rootWidget.top = 0;
        rootWidget.bottom = 0;
        rootWidget.left = 0;
        rootWidget.right = 0;
        root.addComponent(BlockInputEvents);

        // Semi-transparent backdrop
        const backdrop = new Node('Backdrop');
        backdrop.layer = this._uiLayer;
        root.addChild(backdrop);
        backdrop.addComponent(UITransform).setContentSize(vw, vh);
        const bdWidget = backdrop.addComponent(Widget);
        bdWidget.isAlignTop = true;
        bdWidget.isAlignBottom = true;
        bdWidget.isAlignLeft = true;
        bdWidget.isAlignRight = true;
        const bdGfx = backdrop.addComponent(Graphics);
        bdGfx.fillColor = new Color(0, 0, 0, 180);
        bdGfx.rect(-vw / 2, -vh / 2, vw, vh);
        bdGfx.fill();

        // Main dialog panel
        const shortSide = Math.min(vw, vh);
        const panelW = Math.round(Math.min(680, vw * 0.88));
        const panelH = Math.round(Math.min(520, vh * 0.82));

        const panel = new Node('ShopDialog');
        panel.layer = this._uiLayer;
        root.addChild(panel);
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        const panelWidget = panel.addComponent(Widget);
        panelWidget.isAlignHorizontalCenter = true;
        panelWidget.isAlignVerticalCenter = true;
        panelWidget.horizontalCenter = 0;
        panelWidget.verticalCenter = 0;
        this._panel = panel;

        // Panel background
        const panelBg = panel.addComponent(Graphics);
        this.drawPanelBg(panelBg, panelW, panelH);

        // Title bar
        const titleNode = new Node('ShopTitle');
        titleNode.layer = this._uiLayer;
        panel.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(panelW - 80, 50);
        titleNode.setPosition(0, panelH / 2 - 40, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.shop.title');
        titleLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.05, 28, 42));
        titleLabel.isBold = true;
        titleLabel.color = new Color(255, 230, 80, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        titleLabel.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(titleLabel, {
            outlineWidth: 4,
            outlineColor: new Color(40, 18, 4, 255),
        });

        // Diamond balance display
        const balanceNode = new Node('BalanceDisplay');
        balanceNode.layer = this._uiLayer;
        panel.addChild(balanceNode);
        balanceNode.addComponent(UITransform).setContentSize(panelW - 60, 36);
        balanceNode.setPosition(0, panelH / 2 - 80, 0);
        this._balanceLabel = balanceNode.addComponent(Label);
        this._balanceLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.035, 20, 30));
        this._balanceLabel.isBold = true;
        this._balanceLabel.color = new Color(160, 230, 255, 255);
        this._balanceLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._balanceLabel.verticalAlign = Label.VerticalAlign.CENTER;
        this._balanceLabel.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(this._balanceLabel, {
            outlineWidth: 2,
            outlineColor: new Color(0, 0, 0, 180),
        });
        this.updateBalanceLabel();

        // Close button (top-right)
        const closeBtn = this.createCloseButton(panel, panelW, panelH);
        panel.addChild(closeBtn);

        // Item grid area
        const gridTop = panelH / 2 - 100;
        const gridBottom = -panelH / 2 + 20;
        const gridHeight = gridTop - gridBottom;
        const gridNode = new Node('ItemGrid');
        gridNode.layer = this._uiLayer;
        panel.addChild(gridNode);
        gridNode.addComponent(UITransform).setContentSize(panelW - 40, gridHeight);
        gridNode.setPosition(0, (gridTop + gridBottom) / 2, 0);

        this.buildItemGrid(gridNode, panelW - 40, gridHeight, shortSide);

        // Listen for balance changes
        this._diamondListener = () => this.updateBalanceLabel();
        DiamondService.instance.addListener(this._diamondListener);

        // Animate in
        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 0;
        root.setScale(0.92, 0.92, 1);
        tween(root)
            .to(0.18, { scale: new Vec3(1.02, 1.02, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(opacity).to(0.18, { opacity: 255 }).start();

        this._root = root;
    }

    private buildItemGrid(
        container: Node,
        containerW: number,
        containerH: number,
        shortSide: number
    ): void {
        const items = ALL_ITEM_IDS;
        const cols = containerW > 450 ? 3 : 2;
        const gapX = 14;
        const gapY = 16;
        const topPad = 8;
        const cardW = Math.round((containerW - (cols - 1) * gapX) / cols);
        const cardH = Math.max(160, Math.round(Math.min(200, containerH * 0.45)));
        const rows = Math.ceil(items.length / cols);
        const totalH = topPad + rows * cardH + (rows - 1) * gapY + topPad;

        // Viewport node: clips content via Mask, handles scroll via ScrollView
        const viewport = new Node('ScrollViewport');
        viewport.layer = this._uiLayer;
        container.addChild(viewport);
        viewport.addComponent(UITransform).setContentSize(containerW, containerH);
        viewport.addComponent(Mask);

        // Content node: full height, may extend beyond viewport
        const contentNode = new Node('Content');
        contentNode.layer = this._uiLayer;
        viewport.addChild(contentNode);
        const contentH = Math.max(totalH, containerH);
        contentNode.addComponent(UITransform).setContentSize(containerW, contentH);
        // Align content top with viewport top so first item is visible
        contentNode.setPosition(0, (containerH - contentH) / 2, 0);

        // ScrollView on viewport
        const sv = viewport.addComponent(ScrollView);
        sv.content = contentNode;
        sv.vertical = true;
        sv.horizontal = false;
        sv.inertia = true;
        sv.brake = 0.75;

        const totalGridW = cols * cardW + (cols - 1) * gapX;
        for (let i = 0; i < items.length; i++) {
            const itemId = items[i];
            const def = ITEM_DEFS[itemId];
            if (!def) continue;

            const row = Math.floor(i / cols);
            const col = i % cols;
            const x = -totalGridW / 2 + col * (cardW + gapX) + cardW / 2;
            const y = contentH / 2 - topPad - row * (cardH + gapY) - cardH / 2;

            const card = this.createItemCard(itemId, def, cardW, cardH, shortSide);
            card.setPosition(x, y, 0);
            contentNode.addChild(card);
            this._itemNodes.push(card);
        }
    }

    private createItemCard(
        itemId: ItemId,
        def: (typeof ITEM_DEFS)[ItemId],
        w: number,
        h: number,
        shortSide: number
    ): Node {
        const card = new Node(`Card_${itemId}`);
        card.layer = this._uiLayer;
        card.addComponent(UITransform).setContentSize(w, h);

        // Card background
        const bg = card.addComponent(Graphics);
        const r = Math.max(8, Math.round(Math.min(w, h) * 0.06));
        bg.fillColor = new Color(22, 28, 48, 230);
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.fill();
        bg.strokeColor = new Color(100, 160, 255, 160);
        bg.lineWidth = 2;
        bg.roundRect(-w / 2, -h / 2, w, h, r);
        bg.stroke();

        // Icon / symbol
        const iconNode = new Node('Icon');
        iconNode.layer = this._uiLayer;
        card.addChild(iconNode);
        const iconSize = Math.round(Math.min(w, h) * 0.28);
        iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
        iconNode.setPosition(0, h * 0.22, 0);
        const iconLabel = iconNode.addComponent(Label);
        iconLabel.string = def.iconSymbol;
        iconLabel.fontSize = Math.round(iconSize * 0.7);
        iconLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        iconLabel.verticalAlign = Label.VerticalAlign.CENTER;
        iconLabel.overflow = Label.Overflow.SHRINK;

        // Name
        const nameNode = new Node('Name');
        nameNode.layer = this._uiLayer;
        card.addChild(nameNode);
        nameNode.addComponent(UITransform).setContentSize(w - 16, 28);
        nameNode.setPosition(0, h * 0.02, 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(def.nameKey);
        nameLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.026, 16, 22));
        nameLabel.isBold = true;
        nameLabel.color = new Color(255, 230, 120, 255);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        nameLabel.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(nameLabel, {
            outlineWidth: 2,
            outlineColor: new Color(0, 0, 0, 180),
        });

        // Short description
        const descNode = new Node('Desc');
        descNode.layer = this._uiLayer;
        card.addChild(descNode);
        descNode.addComponent(UITransform).setContentSize(w - 16, 32);
        descNode.setPosition(0, -h * 0.12, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = Localization.instance.t(def.shortKey);
        descLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.02, 13, 17));
        descLabel.color = new Color(200, 210, 230, 220);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        descLabel.enableWrapText = true;
        descLabel.overflow = Label.Overflow.SHRINK;

        // Buy button
        const buyBtn = new Node('BuyButton');
        buyBtn.layer = this._uiLayer;
        card.addChild(buyBtn);
        const btnW = Math.round(w * 0.7);
        const btnH = Math.round(Math.min(h * 0.18, 40));
        buyBtn.addComponent(UITransform).setContentSize(btnW, btnH);
        buyBtn.setPosition(0, -h * 0.32, 0);
        buyBtn.addComponent(Button).transition = Button.Transition.SCALE;

        const buyBg = buyBtn.addComponent(Graphics);
        const btnR = Math.max(6, Math.round(btnH * 0.3));
        buyBg.fillColor = new Color(72, 192, 96, 255);
        buyBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnR);
        buyBg.fill();
        buyBg.strokeColor = new Color(255, 255, 255, 180);
        buyBg.lineWidth = 2;
        buyBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnR);
        buyBg.stroke();

        const buyLabelNode = new Node('BuyLabel');
        buyLabelNode.layer = this._uiLayer;
        buyBtn.addChild(buyLabelNode);
        buyLabelNode.addComponent(UITransform).setContentSize(btnW - 10, btnH);
        const buyLabel = buyLabelNode.addComponent(Label);
        buyLabel.string = `◆ ${ITEM_PRICE}`;
        buyLabel.fontSize = Math.round(UIResponsive.clamp(shortSide * 0.024, 15, 22));
        buyLabel.isBold = true;
        buyLabel.color = Color.WHITE;
        buyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        buyLabel.verticalAlign = Label.VerticalAlign.CENTER;
        buyLabel.overflow = Label.Overflow.SHRINK;
        applyGameLabelStyle(buyLabel, {
            outlineWidth: 2,
            outlineColor: new Color(0, 0, 0, 200),
        });

        buyBtn.on(
            Button.EventType.CLICK,
            () => this.onBuyItem(itemId, buyLabel, buyBg, btnW, btnH, btnR),
            this
        );

        return card;
    }

    private onBuyItem(
        itemId: ItemId,
        label: Label,
        bg: Graphics,
        btnW: number,
        btnH: number,
        btnR: number
    ): void {
        const ds = DiamondService.instance;
        if (ds.balance < ITEM_PRICE) {
            // Flash red
            label.string = Localization.instance.t('ui.shop.insufficient');
            label.color = new Color(255, 100, 100, 255);
            bg.clear();
            bg.fillColor = new Color(180, 50, 50, 255);
            bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnR);
            bg.fill();
            setTimeout(() => {
                if (!label.isValid) return;
                label.string = `◆ ${ITEM_PRICE}`;
                label.color = Color.WHITE;
                bg.clear();
                bg.fillColor = new Color(72, 192, 96, 255);
                bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnR);
                bg.fill();
                bg.strokeColor = new Color(255, 255, 255, 180);
                bg.lineWidth = 2;
                bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnR);
                bg.stroke();
            }, 1200);
            return;
        }

        // Disable button temporarily
        label.string = '...';
        ds.buyItem(itemId, (success, balance, error) => {
            if (!label.isValid) return;
            if (success) {
                ShopInventoryStore.addItem(itemId);
                label.string = Localization.instance.t('ui.shop.bought');
                label.color = new Color(160, 255, 160, 255);
                setTimeout(() => {
                    if (!label.isValid) return;
                    label.string = `◆ ${ITEM_PRICE}`;
                    label.color = Color.WHITE;
                }, 1500);
            } else {
                label.string =
                    error === 'Insufficient diamonds'
                        ? Localization.instance.t('ui.shop.insufficient')
                        : Localization.instance.t('ui.shop.error');
                label.color = new Color(255, 100, 100, 255);
                setTimeout(() => {
                    if (!label.isValid) return;
                    label.string = `◆ ${ITEM_PRICE}`;
                    label.color = Color.WHITE;
                }, 1500);
            }
        });
    }

    private updateBalanceLabel(): void {
        if (!this._balanceLabel || !this._balanceLabel.isValid) return;
        const balance = DiamondService.instance.balance;
        this._balanceLabel.string = Localization.instance.t('ui.shop.balance', {
            amount: String(balance),
        });
    }

    private createCloseButton(parent: Node, panelW: number, panelH: number): Node {
        const btn = new Node('CloseButton');
        btn.layer = this._uiLayer;
        const size = 44;
        btn.addComponent(UITransform).setContentSize(size, size);
        btn.setPosition(panelW / 2 - 32, panelH / 2 - 32, 0);
        btn.addComponent(Button).transition = Button.Transition.SCALE;

        const bg = btn.addComponent(Graphics);
        bg.fillColor = new Color(200, 60, 60, 230);
        bg.circle(0, 0, size / 2);
        bg.fill();
        bg.strokeColor = new Color(255, 255, 255, 200);
        bg.lineWidth = 2;
        bg.circle(0, 0, size / 2);
        bg.stroke();

        // X label
        const xNode = new Node('X');
        xNode.layer = this._uiLayer;
        btn.addChild(xNode);
        xNode.addComponent(UITransform).setContentSize(size, size);
        const xLabel = xNode.addComponent(Label);
        xLabel.string = '\u2715';
        xLabel.fontSize = 24;
        xLabel.isBold = true;
        xLabel.color = Color.WHITE;
        xLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        xLabel.verticalAlign = Label.VerticalAlign.CENTER;

        btn.on(
            Button.EventType.CLICK,
            () => {
                this._onClose?.();
            },
            this
        );

        return btn;
    }

    private drawPanelBg(bg: Graphics, w: number, h: number): void {
        const outerR = Math.max(14, Math.round(Math.min(w, h) * 0.04));
        const innerInset = Math.max(8, Math.round(Math.min(w, h) * 0.02));

        bg.fillColor = new Color(13, 18, 38, 240);
        bg.roundRect(-w / 2, -h / 2, w, h, outerR);
        bg.fill();

        // Decorative inner border
        bg.strokeColor = new Color(100, 180, 255, 140);
        bg.lineWidth = 2;
        bg.roundRect(
            -w / 2 + innerInset,
            -h / 2 + innerInset,
            w - innerInset * 2,
            h - innerInset * 2,
            Math.max(8, outerR - 4)
        );
        bg.stroke();

        // Outer glow border
        bg.strokeColor = new Color(138, 92, 246, 200);
        bg.lineWidth = 3;
        bg.roundRect(-w / 2, -h / 2, w, h, outerR);
        bg.stroke();
    }
}
