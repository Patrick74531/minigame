import { Node, UITransform, Color, Graphics, Label, Vec3 } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { HeroWeaponManager } from '../gameplay/weapons/HeroWeaponManager';
import { WeaponType, WeaponDef } from '../gameplay/weapons/WeaponTypes';

const UI_LAYER = 33554432;
const ICON_SIZE = 56;
const ICON_GAP = 8;
const ICON_CORNER_RADIUS = 8;

/**
 * WeaponBarUI
 * 屏幕右下角的武器快捷栏，显示已拥有的武器图标。
 * 点击图标可切换当前武器，当前选中的武器有高亮边框。
 */
export class WeaponBarUI extends Singleton<WeaponBarUI>() {
    private _uiCanvas: Node | null = null;
    private _barNode: Node | null = null;
    private _iconNodes: Map<WeaponType, Node> = new Map();

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.createBarContainer();

        this.eventManager.on(GameEvents.WEAPON_PICKED, this.refresh, this);
        this.eventManager.on(GameEvents.WEAPON_SWITCHED, this.refresh, this);
        console.log('[WeaponBarUI] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.WEAPON_PICKED, this.refresh, this);
        this.eventManager.off(GameEvents.WEAPON_SWITCHED, this.refresh, this);
        if (this._barNode) {
            this._barNode.destroy();
            this._barNode = null;
        }
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

            const icon = this.createIconNode(type, def, instance.level, type === activeType);
            this._barNode!.addChild(icon);

            // 从右向左排列
            const x = -(index * (ICON_SIZE + ICON_GAP));
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

        // 右下角定位
        this._barNode.setPosition(600, -320, 0);
    }

    private createIconNode(
        type: WeaponType,
        def: WeaponDef,
        level: number,
        isActive: boolean
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
        lvLabel.string = `Lv.${level}`;
        lvLabel.fontSize = 12;
        lvLabel.lineHeight = 14;
        lvLabel.color = Color.WHITE;
        lvLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        lvNode.setPosition(0, -ICON_SIZE / 2 + 10, 0);

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
