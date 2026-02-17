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
const DESKTOP_ICON_SIZE = 86;
const TOUCH_ICON_SIZE = 96;
const ICON_GAP = 14;
const KEY_HINTS: string[] = ['H', 'J', 'K', 'L'];
const BAR_PADDING_X = 14;
const BAR_PADDING_Y = 10;
const BAR_MIN_WIDTH = 170;
const BAR_MIN_HEIGHT = 108;

/**
 * WeaponBarUI
 * 屏幕右下角的武器快捷栏，显示已拥有的武器图标。
 * 点击图标可切换当前武器，当前选中的武器有高亮边框。
 */
export class WeaponBarUI extends Singleton<WeaponBarUI>() {
    private _uiCanvas: Node | null = null;
    private _barNode: Node | null = null;
    private _barWidget: Widget | null = null;
    private _barBackground: Graphics | null = null;
    private _iconNodes: Map<WeaponType, Node> = new Map();
    private _showKeyboardHints: boolean = false;
    private _iconSize: number = DESKTOP_ICON_SIZE;

    public initialize(uiCanvas: Node): void {
        this._showKeyboardHints = !UIResponsive.shouldUseTouchControls();
        this._uiCanvas = uiCanvas;
        this.createBarContainer();

        this.eventManager.on(GameEvents.WEAPON_INVENTORY_CHANGED, this.refresh, this);
        this.eventManager.on(GameEvents.WEAPON_SWITCHED, this.refresh, this);
        view.on('canvas-resize', this.onResize, this);
        this.updateLayout();
        this.refresh();
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
        this._barBackground = null;
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
        const iconSize = this._iconSize;
        const spacing = iconSize + ICON_GAP;
        let index = 0;

        inventory.forEach((instance, type) => {
            const def = manager.getWeaponDef(type);
            if (!def) return;

            const icon = this.createIconNode(type, def, instance.level, type === activeType, index);
            this._barNode!.addChild(icon);

            const x = -BAR_PADDING_X - iconSize * 0.5 - index * spacing;
            const y = BAR_PADDING_Y + iconSize * 0.5;
            icon.setPosition(x, y, 0);
            this._iconNodes.set(type, icon);
            index++;
        });

        this.updateContainerSize(index);
        this.drawBarBackground();
    }

    // === UI 构建 ===

    private createBarContainer(): void {
        if (!this._uiCanvas) return;

        this._barNode = new Node('WeaponBar');
        this._barNode.layer = UI_LAYER;
        this._uiCanvas.addChild(this._barNode);

        const transform = this._barNode.addComponent(UITransform);
        transform.setContentSize(BAR_MIN_WIDTH, BAR_MIN_HEIGHT);
        transform.setAnchorPoint(1, 0);

        this._barWidget = this._barNode.addComponent(Widget);
        this._barWidget.isAlignBottom = true;
        this._barWidget.isAlignRight = true;

        this._barBackground = this._barNode.addComponent(Graphics);
        this.drawBarBackground();
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

        this._barWidget.bottom = padding.bottom;
        this._barWidget.right = padding.right;
        this._barWidget.updateAlignment();

        this._showKeyboardHints = !isTouch;
        this.refresh();
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
        const iconSize = this._iconSize;
        node.addComponent(UITransform).setContentSize(iconSize, iconSize);

        const themeColor = this.hexToColor(def.iconColor);

        const g = node.addComponent(Graphics);
        const radius = Math.max(10, Math.round(iconSize * 0.18));

        g.fillColor = isActive ? new Color(34, 48, 60, 252) : new Color(20, 30, 42, 232);
        g.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, radius);
        g.fill();

        g.fillColor = isActive ? new Color(64, 154, 206, 58) : new Color(32, 84, 112, 42);
        g.roundRect(
            -iconSize / 2 + 4,
            -iconSize / 2 + 4,
            iconSize - 8,
            iconSize - 8,
            Math.max(8, radius - 3)
        );
        g.fill();

        g.strokeColor = isActive
            ? new Color(255, 220, 116, 255)
            : new Color(themeColor.r, themeColor.g, themeColor.b, 255);
        g.lineWidth = isActive ? 4 : 2;
        g.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, radius);
        g.stroke();

        this.drawWeaponGlyph(g, type, themeColor, iconSize, isActive);

        this.createLevelBadge(node, level, iconSize, isActive);

        if (this._showKeyboardHints && slotIndex >= 0 && slotIndex < KEY_HINTS.length) {
            this.createKeyHintBadge(node, slotIndex, iconSize);
        }

        node.on(Node.EventType.TOUCH_START, () => {
            node.setScale(0.95, 0.95, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => {
            node.setScale(1, 1, 1);
        });
        node.on(Node.EventType.TOUCH_END, () => {
            node.setScale(1, 1, 1);
            HeroWeaponManager.instance.switchWeapon(type);
        });

        return node;
    }

    private updateContainerSize(iconCount: number): void {
        if (!this._barNode) return;
        const iconAreaWidth =
            iconCount > 0 ? iconCount * this._iconSize + Math.max(0, iconCount - 1) * ICON_GAP : 0;
        const width = Math.max(BAR_MIN_WIDTH, iconAreaWidth + BAR_PADDING_X * 2);
        const height = Math.max(BAR_MIN_HEIGHT, this._iconSize + BAR_PADDING_Y * 2 + 12);
        this._barNode.getComponent(UITransform)?.setContentSize(width, height);
    }

    private drawBarBackground(): void {
        if (!this._barBackground || !this._barNode) return;
        const tf = this._barNode.getComponent(UITransform);
        if (!tf) return;

        const w = tf.contentSize.width;
        const h = tf.contentSize.height;
        const g = this._barBackground;
        const radius = Math.max(14, Math.round(h * 0.22));

        g.clear();
        g.fillColor = new Color(12, 18, 30, 192);
        g.roundRect(-w, 0, w, h, radius);
        g.fill();

        g.strokeColor = new Color(65, 170, 225, 210);
        g.lineWidth = 2;
        g.roundRect(-w, 0, w, h, radius);
        g.stroke();
    }

    private createLevelBadge(
        parent: Node,
        level: number,
        iconSize: number,
        isActive: boolean
    ): void {
        const badge = new Node('LvBadge');
        badge.layer = UI_LAYER;
        parent.addChild(badge);
        badge.addComponent(UITransform).setContentSize(38, 20);
        badge.setPosition(iconSize * 0.24, -iconSize * 0.32, 0);

        const bg = badge.addComponent(Graphics);
        bg.fillColor = isActive ? new Color(255, 214, 109, 255) : new Color(52, 82, 115, 255);
        bg.roundRect(-19, -10, 38, 20, 8);
        bg.fill();
        bg.strokeColor = isActive ? new Color(255, 244, 193, 255) : new Color(126, 194, 244, 240);
        bg.lineWidth = 1.5;
        bg.roundRect(-19, -10, 38, 20, 8);
        bg.stroke();

        const labelNode = new Node('LvLabel');
        labelNode.layer = UI_LAYER;
        badge.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(36, 18);
        const label = labelNode.addComponent(Label);
        label.string = Localization.instance.t('ui.common.level.short', { level });
        label.fontSize = 12;
        label.lineHeight = 14;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = isActive ? new Color(42, 24, 10, 255) : new Color(232, 244, 255, 255);
    }

    private createKeyHintBadge(parent: Node, slotIndex: number, iconSize: number): void {
        const keyNode = new Node('KeyHint');
        keyNode.layer = UI_LAYER;
        parent.addChild(keyNode);
        keyNode.addComponent(UITransform).setContentSize(20, 20);
        keyNode.setPosition(-iconSize * 0.32, iconSize * 0.32, 0);

        const keyBg = keyNode.addComponent(Graphics);
        keyBg.fillColor = new Color(11, 20, 31, 255);
        keyBg.roundRect(-10, -10, 20, 20, 5);
        keyBg.fill();
        keyBg.strokeColor = new Color(255, 210, 96, 255);
        keyBg.lineWidth = 1.5;
        keyBg.roundRect(-10, -10, 20, 20, 5);
        keyBg.stroke();

        const keyLabelNode = new Node('KeyHintLabel');
        keyLabelNode.layer = UI_LAYER;
        keyNode.addChild(keyLabelNode);
        keyLabelNode.addComponent(UITransform).setContentSize(18, 18);
        const keyLabel = keyLabelNode.addComponent(Label);
        keyLabel.string = KEY_HINTS[slotIndex];
        keyLabel.fontSize = 13;
        keyLabel.lineHeight = 16;
        keyLabel.color = new Color(255, 233, 156, 255);
        keyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        keyLabel.verticalAlign = Label.VerticalAlign.CENTER;
    }

    private drawWeaponGlyph(
        g: Graphics,
        type: WeaponType,
        themeColor: Color,
        iconSize: number,
        isActive: boolean
    ): void {
        const glow = isActive ? 1 : 0.86;
        const baseColor = new Color(
            Math.round(themeColor.r * glow),
            Math.round(themeColor.g * glow),
            Math.round(themeColor.b * glow),
            255
        );

        switch (type) {
            case WeaponType.MACHINE_GUN:
                this.drawMachineGunGlyph(g, baseColor, iconSize);
                return;
            case WeaponType.FLAMETHROWER:
                this.drawFlamethrowerGlyph(g, baseColor, iconSize);
                return;
            case WeaponType.CANNON:
                this.drawCannonGlyph(g, baseColor, iconSize);
                return;
            case WeaponType.GLITCH_WAVE:
                this.drawGlitchWaveGlyph(g, baseColor, iconSize);
                return;
            default:
                this.drawMachineGunGlyph(g, baseColor, iconSize);
        }
    }

    private drawMachineGunGlyph(g: Graphics, c: Color, s: number): void {
        g.fillColor = new Color(28, 38, 50, 255);
        g.roundRect(-s * 0.28, -s * 0.08, s * 0.34, s * 0.16, s * 0.04);
        g.fill();
        g.fillColor = c;
        g.roundRect(-s * 0.32, -s * 0.1, s * 0.34, s * 0.2, s * 0.05);
        g.fill();
        g.roundRect(s * 0.02, -s * 0.05, s * 0.2, s * 0.1, s * 0.03);
        g.fill();

        g.fillColor = new Color(255, 220, 160, 255);
        for (let i = 0; i < 3; i++) {
            g.circle(s * (0.18 + i * 0.08), s * (-0.01 + i * 0.03), s * 0.03);
            g.fill();
        }
    }

    private drawFlamethrowerGlyph(g: Graphics, c: Color, s: number): void {
        g.fillColor = new Color(38, 44, 56, 255);
        g.roundRect(-s * 0.32, -s * 0.07, s * 0.22, s * 0.14, s * 0.04);
        g.fill();
        g.fillColor = c;
        g.roundRect(-s * 0.3, -s * 0.08, s * 0.22, s * 0.16, s * 0.04);
        g.fill();

        g.fillColor = new Color(255, 182, 60, 255);
        g.circle(-s * 0.02, s * 0.02, s * 0.08);
        g.fill();
        g.fillColor = new Color(255, 96, 34, 255);
        g.circle(s * 0.1, s * 0.03, s * 0.09);
        g.fill();
        g.fillColor = new Color(255, 225, 126, 255);
        g.circle(s * 0.02, s * 0.03, s * 0.04);
        g.fill();
        g.fillColor = new Color(255, 134, 58, 255);
        g.circle(s * 0.2, s * 0.02, s * 0.06);
        g.fill();
    }

    private drawCannonGlyph(g: Graphics, c: Color, s: number): void {
        g.fillColor = new Color(22, 30, 44, 255);
        g.circle(-s * 0.06, -s * 0.01, s * 0.16);
        g.fill();

        g.fillColor = c;
        g.circle(-s * 0.06, -s * 0.01, s * 0.15);
        g.fill();
        g.roundRect(-s * 0.04, -s * 0.05, s * 0.28, s * 0.1, s * 0.03);
        g.fill();

        g.fillColor = new Color(255, 220, 188, 255);
        g.circle(s * 0.28, 0, s * 0.04);
        g.fill();
    }

    private drawGlitchWaveGlyph(g: Graphics, c: Color, s: number): void {
        g.strokeColor = c;
        g.lineWidth = 3;
        g.circle(0, 0, s * 0.18);
        g.stroke();
        g.lineWidth = 2;
        g.circle(0, 0, s * 0.28);
        g.stroke();

        g.strokeColor = new Color(188, 248, 255, 255);
        g.lineWidth = 4;
        g.moveTo(-s * 0.24, -s * 0.04);
        g.lineTo(-s * 0.06, s * 0.08);
        g.lineTo(s * 0.08, -s * 0.02);
        g.lineTo(s * 0.26, s * 0.1);
        g.stroke();
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
