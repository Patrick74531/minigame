import { Node, UITransform, Color, Graphics, Label, Widget, view } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { HeroWeaponManager } from '../gameplay/weapons/HeroWeaponManager';
import { WeaponType, WeaponDef } from '../gameplay/weapons/WeaponTypes';
import { Localization } from '../core/i18n/Localization';
import { UIResponsive } from './UIResponsive';

const UI_LAYER = 33554432;
const ICON_SIZE = 56;
const ICON_GAP = 8;
const ICON_CORNER_RADIUS = 8;
const KEY_HINTS: string[] = ['H', 'J', 'K', 'L'];

/**
 * WeaponBarUI
 * 屏幕右下角的武器快捷栏，显示已拥有的武器图标。
 * 点击图标可切换当前武器，当前选中的武器有高亮边框。
 */
export class WeaponBarUI extends Singleton<WeaponBarUI>() {
    private _uiCanvas: Node | null = null;
    private _barNode: Node | null = null;
    private _barWidget: Widget | null = null;
    private _iconNodes: Map<WeaponType, Node> = new Map();
    private _showKeyboardHints: boolean = false;

    public initialize(uiCanvas: Node): void {
        this._showKeyboardHints = !UIResponsive.shouldUseTouchControls();
        this._uiCanvas = uiCanvas;
        this.createBarContainer();

        this.eventManager.on(GameEvents.WEAPON_INVENTORY_CHANGED, this.refresh, this);
        this.eventManager.on(GameEvents.WEAPON_SWITCHED, this.refresh, this);
        view.on('canvas-resize', this.onResize, this);
        this.updateLayout();
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.WEAPON_INVENTORY_CHANGED, this.refresh, this);
        this.eventManager.off(GameEvents.WEAPON_SWITCHED, this.refresh, this);
        view.off('canvas-resize', this.onResize, this);
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

        const manager = HeroWeaponManager.instance;
        const inventory = manager.inventory;
        const activeType = manager.activeWeaponType;
        let index = 0;

        inventory.forEach((instance, type) => {
            const def = manager.getWeaponDef(type);
            if (!def) return;

            const icon = this.createIconNode(type, def, instance.level, type === activeType, index);
            this._barNode!.addChild(icon);

            // 从右向左排列，同时向内收半个图标，避免首个图标贴边/越界
            const x = -ICON_SIZE * 0.5 - index * (ICON_SIZE + ICON_GAP);
            icon.setPosition(x, 0, 0);
            this._iconNodes.set(type, icon);
            index++;
        });
    }

    // === UI 构建 ===

    private createBarContainer(): void {
        if (!this._uiCanvas) return;

        this._barNode = new Node('WeaponBar');
        this._barNode.layer = UI_LAYER;
        this._uiCanvas.addChild(this._barNode);

        const transform = this._barNode.addComponent(UITransform);
        transform.setContentSize(300, ICON_SIZE + 20);
        transform.setAnchorPoint(1, 0);

        this._barWidget = this._barNode.addComponent(Widget);
        this._barWidget.isAlignBottom = true;
        this._barWidget.isAlignRight = true;
    }

    private onResize(): void {
        this.updateLayout();
    }

    private updateLayout(): void {
        if (!this._barNode || !this._barWidget) return;

        const isTouch = UIResponsive.shouldUseTouchControls();
        const padding = isTouch ? UIResponsive.getControlPadding() : { right: 20, bottom: 20 };
        const scale = isTouch ? UIResponsive.getControlScale() : 1;
        this._barNode.setScale(scale, scale, 1);

        this._barWidget.bottom = padding.bottom;
        this._barWidget.right = padding.right;
        this._barWidget.updateAlignment();
    }

    private createIconNode(
        type: WeaponType,
        def: WeaponDef,
        level: number,
        isActive: boolean,
        slotIndex: number
    ): Node {
        const node = new Node(`WeaponIcon_${type}`);
        node.layer = UI_LAYER;
        node.addComponent(UITransform).setContentSize(ICON_SIZE, ICON_SIZE);

        const themeColor = this.hexToColor(def.iconColor);

        // 背景
        const g = node.addComponent(Graphics);
        g.fillColor = isActive ? new Color(50, 50, 60, 240) : new Color(30, 30, 40, 200);
        g.roundRect(-ICON_SIZE / 2, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, ICON_CORNER_RADIUS);
        g.fill();

        // 边框（选中高亮）
        g.strokeColor = isActive ? new Color(255, 215, 0, 255) : themeColor;
        g.lineWidth = isActive ? 3 : 1.5;
        g.roundRect(-ICON_SIZE / 2, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, ICON_CORNER_RADIUS);
        g.stroke();

        // 武器色块（简易图标）
        g.fillColor = themeColor;
        g.roundRect(-16, -16, 32, 32, 4);
        g.fill();

        // 等级标签
        const lvNode = new Node('Lv');
        lvNode.layer = UI_LAYER;
        lvNode.addComponent(UITransform).setContentSize(ICON_SIZE, 16);
        node.addChild(lvNode);
        const lvLabel = lvNode.addComponent(Label);
        lvLabel.string = Localization.instance.t('ui.common.level.short', { level });
        lvLabel.fontSize = 12;
        lvLabel.lineHeight = 14;
        lvLabel.color = Color.WHITE;
        lvLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        lvNode.setPosition(0, -ICON_SIZE / 2 + 10, 0);

        if (this._showKeyboardHints && slotIndex >= 0 && slotIndex < KEY_HINTS.length) {
            const keyNode = new Node('KeyHint');
            keyNode.layer = UI_LAYER;
            keyNode.addComponent(UITransform).setContentSize(20, 20);
            node.addChild(keyNode);

            const keyLabel = keyNode.addComponent(Label);
            keyLabel.string = KEY_HINTS[slotIndex];
            keyLabel.fontSize = 14;
            keyLabel.lineHeight = 16;
            keyLabel.color = new Color(255, 230, 120, 255);
            keyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            keyNode.setPosition(-ICON_SIZE / 2 + 10, ICON_SIZE / 2 - 10, 0);
        }

        // 点击切换
        node.on(Node.EventType.TOUCH_END, () => {
            HeroWeaponManager.instance.switchWeapon(type);
        });

        return node;
    }

    // === 工具 ===

    private hexToColor(hex: string): Color {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return new Color(r, g, b, 255);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
