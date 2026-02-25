import { Node, UITransform, Color, Graphics, Label, Widget, view } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { GameManager } from '../core/managers/GameManager';
import { Localization } from '../core/i18n/Localization';
import { UIResponsive } from './UIResponsive';
import { ItemService } from '../gameplay/items/ItemService';
import { ItemId, ITEM_DEFS, ALL_ITEM_IDS } from '../gameplay/items/ItemDefs';
import { SelectionCardTheme } from './SelectionCardTheme';

const UI_LAYER = 33554432;
const DESKTOP_ICON_SIZE = 56;
const TOUCH_ICON_SIZE = 64;
const ICON_GAP = 10;
const BAR_PADDING_X = 10;
const BAR_PADDING_Y = 8;

/**
 * ItemBarUI
 * 屏幕右下角武器栏上方的道具快捷栏。
 * 显示已拥有的道具图标和数量，点击使用道具（带确认弹窗）。
 */
export class ItemBarUI extends Singleton<ItemBarUI>() {
    private _uiCanvas: Node | null = null;
    private _barNode: Node | null = null;
    private _barWidget: Widget | null = null;
    private _iconNodes: Map<ItemId, Node> = new Map();
    private _iconSize: number = DESKTOP_ICON_SIZE;
    private _confirmOverlay: Node | null = null;

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.createBarContainer();

        this.eventManager.on(GameEvents.ITEM_INVENTORY_CHANGED, this.refresh, this);
        this.eventManager.on(GameEvents.ITEM_USED, this.refresh, this);
        view.on('canvas-resize', this.onResize, this);
        this.updateLayout();
        this.refresh();
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.ITEM_INVENTORY_CHANGED, this.refresh, this);
        this.eventManager.off(GameEvents.ITEM_USED, this.refresh, this);
        view.off('canvas-resize', this.onResize, this);
        this.dismissConfirm();
        if (this._barNode) {
            this._barNode.destroy();
            this._barNode = null;
        }
        this._barWidget = null;
        this._iconNodes.clear();
    }

    // === 刷新 ===

    private refresh(): void {
        this.clearIcons();
        this.buildIcons();
    }

    private clearIcons(): void {
        this._iconNodes.forEach(node => node.destroy());
        this._iconNodes.clear();
    }

    private buildIcons(): void {
        if (!this._barNode) return;

        const itemService = ItemService.instance;
        const iconSize = this._iconSize;
        const spacing = iconSize + ICON_GAP;
        let index = 0;

        for (const itemId of ALL_ITEM_IDS) {
            const count = itemService.getItemCount(itemId);
            if (count <= 0) continue;

            const def = ITEM_DEFS[itemId];
            const icon = this.createIconNode(itemId, def, count, index);
            this._barNode.addChild(icon);

            const x = -BAR_PADDING_X - iconSize * 0.5 - index * spacing;
            const y = BAR_PADDING_Y + iconSize * 0.5;
            icon.setPosition(x, y, 0);
            this._iconNodes.set(itemId, icon);
            index++;
        }

        this.updateContainerSize(index);

        if (this._barNode) {
            this._barNode.active = index > 0;
        }
    }

    // === UI 构建 ===

    private createBarContainer(): void {
        if (!this._uiCanvas) return;

        this._barNode = new Node('ItemBar');
        this._barNode.layer = UI_LAYER;
        this._uiCanvas.addChild(this._barNode);

        const transform = this._barNode.addComponent(UITransform);
        transform.setContentSize(100, 70);
        transform.setAnchorPoint(1, 0);

        this._barWidget = this._barNode.addComponent(Widget);
        this._barWidget.isAlignBottom = true;
        this._barWidget.isAlignRight = true;
        this._barNode.active = false;
    }

    private onResize(): void {
        this.updateLayout();
    }

    private updateLayout(): void {
        if (!this._barNode || !this._barWidget) return;

        const isTouch = UIResponsive.shouldUseTouchControls();
        const padding = isTouch ? UIResponsive.getControlPadding() : { right: 20, bottom: 20 };
        const scale = isTouch ? UIResponsive.getControlScale() : 1;
        this._iconSize = isTouch ? TOUCH_ICON_SIZE : DESKTOP_ICON_SIZE;
        this._barNode.setScale(scale, scale, 1);

        if (this._barWidget) this._barWidget.enabled = false;
        const vis = UIResponsive.getVisibleSize();

        // Position above weapon bar: weapon bar is at bottom-right,
        // item bar goes above it with offset
        const weaponBarHeight = isTouch ? 110 : 96;
        this._barNode.setPosition(
            Math.round(vis.width * 0.5 - padding.right),
            Math.round(-vis.height * 0.5 + padding.bottom + weaponBarHeight + 8),
            0
        );

        this.refresh();
    }

    private createIconNode(
        itemId: ItemId,
        def: (typeof ITEM_DEFS)[ItemId],
        count: number,
        _slotIndex: number
    ): Node {
        const node = new Node(`ItemIcon_${itemId}`);
        node.layer = UI_LAYER;
        const iconSize = this._iconSize;
        node.addComponent(UITransform).setContentSize(iconSize, iconSize);

        const themeColor = this.hexToColor(def.iconColor);

        // Background
        const g = node.addComponent(Graphics);
        const radius = Math.max(10, Math.round(iconSize * 0.18));

        g.fillColor = new Color(24, 38, 52, 242);
        g.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, radius);
        g.fill();

        g.fillColor = new Color(themeColor.r, themeColor.g, themeColor.b, 32);
        g.roundRect(
            -iconSize / 2 + 3,
            -iconSize / 2 + 3,
            iconSize - 6,
            iconSize - 6,
            Math.max(8, radius - 2)
        );
        g.fill();

        g.strokeColor = new Color(themeColor.r, themeColor.g, themeColor.b, 200);
        g.lineWidth = 2;
        g.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, radius);
        g.stroke();

        // Icon symbol
        const iconLabelNode = new Node('Symbol');
        iconLabelNode.layer = UI_LAYER;
        node.addChild(iconLabelNode);
        iconLabelNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
        iconLabelNode.setPosition(0, 4, 0);
        const iconLabel = iconLabelNode.addComponent(Label);
        iconLabel.string = def.iconSymbol;
        iconLabel.fontSize = Math.round(iconSize * 0.42);
        iconLabel.lineHeight = Math.round(iconSize * 0.5);
        iconLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        iconLabel.verticalAlign = Label.VerticalAlign.CENTER;
        iconLabel.color = new Color(255, 255, 255, 255);

        // Count badge
        if (count > 1) {
            this.createCountBadge(node, count, iconSize, themeColor);
        }

        // Touch handlers
        node.on(Node.EventType.TOUCH_START, () => {
            node.setScale(0.93, 0.93, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => {
            node.setScale(1, 1, 1);
        });
        node.on(Node.EventType.TOUCH_END, () => {
            node.setScale(1, 1, 1);
            this.showConfirmDialog(itemId);
        });

        return node;
    }

    private createCountBadge(parent: Node, count: number, iconSize: number, _accent: Color): void {
        const badge = new Node('CountBadge');
        badge.layer = UI_LAYER;
        parent.addChild(badge);
        badge.addComponent(UITransform).setContentSize(24, 18);
        badge.setPosition(iconSize * 0.28, -iconSize * 0.28, 0);

        const bg = badge.addComponent(Graphics);
        bg.fillColor = new Color(220, 60, 60, 255);
        bg.roundRect(-12, -9, 24, 18, 7);
        bg.fill();

        const labelNode = new Node('CountLabel');
        labelNode.layer = UI_LAYER;
        badge.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(22, 16);
        const label = labelNode.addComponent(Label);
        label.string = `${count}`;
        label.fontSize = 12;
        label.lineHeight = 14;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 255, 255, 255);
    }

    private updateContainerSize(iconCount: number): void {
        if (!this._barNode) return;
        const iconAreaWidth =
            iconCount > 0 ? iconCount * this._iconSize + Math.max(0, iconCount - 1) * ICON_GAP : 0;
        const width = Math.max(70, iconAreaWidth + BAR_PADDING_X * 2);
        const height = Math.max(70, this._iconSize + BAR_PADDING_Y * 2);
        this._barNode.getComponent(UITransform)?.setContentSize(width, height);
    }

    // === 确认弹窗 ===

    public showConfirmDialog(itemId: ItemId): void {
        if (this._confirmOverlay || !this._uiCanvas) return;

        const def = ITEM_DEFS[itemId];
        if (!def) return;

        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.pauseGame();

        const vis = UIResponsive.getVisibleSize();
        const root = new Node('ItemConfirmOverlay');
        root.layer = UI_LAYER;
        const rootTransform = root.addComponent(UITransform);
        rootTransform.setContentSize(vis.width, vis.height);
        root.addComponent(Graphics);

        const bg = root.getComponent(Graphics)!;
        bg.fillColor = new Color(5, 10, 18, 200);
        bg.rect(-vis.width * 0.5, -vis.height * 0.5, vis.width, vis.height);
        bg.fill();

        this._uiCanvas.addChild(root);
        this._confirmOverlay = root;

        // Dialog box
        const dialogW = Math.min(400, vis.width - 60);
        const dialogH = 260;
        const dialog = new Node('Dialog');
        dialog.layer = UI_LAYER;
        root.addChild(dialog);
        dialog.addComponent(UITransform).setContentSize(dialogW, dialogH);

        const dialogBg = dialog.addComponent(Graphics);
        const accent = this.hexToColor(def.iconColor);
        SelectionCardTheme.drawCardBackground(dialogBg, dialogW, dialogH, accent, 52);

        // Title
        const titleNode = new Node('ConfirmTitle');
        titleNode.layer = UI_LAYER;
        dialog.addChild(titleNode);
        titleNode.addComponent(UITransform).setContentSize(dialogW - 32, 40);
        titleNode.setPosition(0, dialogH * 0.5 - 30, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = Localization.instance.t('ui.item.confirm.title');
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
        SelectionCardTheme.applyLabelTheme(titleLabel, {
            fontSize: 22,
            lineHeight: 28,
            color: new Color(255, 244, 214, 255),
            bold: true,
            outlineWidth: 2,
        });

        // Description
        const name = Localization.instance.t(def.nameKey);
        const desc = Localization.instance.t(def.descriptionKey);
        const message = Localization.instance.t('ui.item.confirm.message', {
            name,
            description: desc,
        });

        const descNode = new Node('ConfirmDesc');
        descNode.layer = UI_LAYER;
        dialog.addChild(descNode);
        descNode.addComponent(UITransform).setContentSize(dialogW - 48, 120);
        descNode.setPosition(0, 10, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = message;
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        descLabel.overflow = Label.Overflow.SHRINK;
        SelectionCardTheme.applyLabelTheme(descLabel, {
            fontSize: 16,
            lineHeight: 22,
            color: new Color(200, 218, 240, 255),
            outlineWidth: 2,
        });

        // Buttons
        const btnY = -dialogH * 0.5 + 42;
        this.createConfirmButton(
            dialog,
            Localization.instance.t('ui.item.confirm.yes'),
            new Color(46, 160, 80, 255),
            -70,
            btnY,
            () => this.onConfirmUse(itemId)
        );
        this.createConfirmButton(
            dialog,
            Localization.instance.t('ui.item.confirm.no'),
            new Color(120, 80, 80, 255),
            70,
            btnY,
            () => this.onConfirmCancel()
        );
    }

    private createConfirmButton(
        parent: Node,
        text: string,
        bgColor: Color,
        x: number,
        y: number,
        onClick: () => void
    ): void {
        const btn = new Node('ConfirmBtn');
        btn.layer = UI_LAYER;
        parent.addChild(btn);
        const btnW = 120;
        const btnH = 38;
        btn.addComponent(UITransform).setContentSize(btnW, btnH);
        btn.setPosition(x, y, 0);

        const g = btn.addComponent(Graphics);
        g.fillColor = bgColor;
        g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 10);
        g.fill();
        g.strokeColor = new Color(
            Math.min(255, bgColor.r + 60),
            Math.min(255, bgColor.g + 60),
            Math.min(255, bgColor.b + 60),
            200
        );
        g.lineWidth = 1.5;
        g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 10);
        g.stroke();

        const labelNode = new Node('BtnLabel');
        labelNode.layer = UI_LAYER;
        btn.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(btnW - 8, btnH - 4);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 16;
        label.lineHeight = 20;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = new Color(255, 255, 255, 255);

        btn.on(Node.EventType.TOUCH_START, () => btn.setScale(0.95, 0.95, 1));
        btn.on(Node.EventType.TOUCH_CANCEL, () => btn.setScale(1, 1, 1));
        btn.on(Node.EventType.TOUCH_END, () => {
            btn.setScale(1, 1, 1);
            onClick();
        });
    }

    private onConfirmUse(itemId: ItemId): void {
        this.dismissConfirm();
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.resumeGame();
        ItemService.instance.useItem(itemId);
    }

    private onConfirmCancel(): void {
        this.dismissConfirm();
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.resumeGame();
    }

    private dismissConfirm(): void {
        if (this._confirmOverlay && this._confirmOverlay.isValid) {
            this._confirmOverlay.destroy();
        }
        this._confirmOverlay = null;
    }

    // === 工具 ===

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
