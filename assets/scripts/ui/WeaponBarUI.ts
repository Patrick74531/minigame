import {
    Node,
    UITransform,
    Color,
    Graphics,
    Label,
    Widget,
    view,
    Sprite,
    resources,
    SpriteFrame,
    Texture2D,
    ImageAsset,
} from 'cc';
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
    private _iconNodes: Map<WeaponType, Node> = new Map();
    private _iconFrameCache: Map<string, SpriteFrame> = new Map();
    private _iconLoading: Set<string> = new Set();
    private _iconWaiting: Map<string, Set<Sprite>> = new Map();
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
        this._iconNodes.clear();
        this._iconFrameCache.clear();
        this._iconLoading.clear();
        this._iconWaiting.clear();
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

        // Bypass Widget entirely — position directly from visible viewport edges.
        // UICanvas UITransform is hardcoded 1280×720 by UIFactory; Widget.isAlignRight
        // anchors to canvas-edge ±640, while the camera only shows ±(visW/2).
        // Disable Widget entirely so onEnable() cannot re-apply original alignment values.
        if (this._barWidget) this._barWidget.enabled = false;
        const vis = UIResponsive.getVisibleSize();
        // Bar anchor is (1, 0): setPosition places the right-bottom corner of the node.
        this._barNode.setPosition(
            Math.round(vis.width * 0.5 - padding.right),
            Math.round(-vis.height * 0.5 + padding.bottom),
            0
        );

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

        // Background
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

        // Icon Sprite
        const iconNode = new Node('IconSprite');
        iconNode.layer = UI_LAYER;
        node.addChild(iconNode);
        const spriteSize = iconSize * 0.75;
        iconNode.addComponent(UITransform).setContentSize(spriteSize, spriteSize);
        const sprite = iconNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        if (def.iconPath) {
            this.loadWeaponIcon(sprite, def.iconPath);
        }

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

    private loadWeaponIcon(sprite: Sprite, path: string): void {
        const normalizedPath = path.trim();
        const cached = this._iconFrameCache.get(normalizedPath);
        if (cached) {
            sprite.spriteFrame = cached;
            return;
        }

        const waitingSet = this.getIconWaitingSet(normalizedPath);
        waitingSet.add(sprite);
        if (this._iconLoading.has(normalizedPath)) {
            return;
        }
        this._iconLoading.add(normalizedPath);

        const candidates = this.getIconLoadCandidates(normalizedPath);
        this.loadWeaponIconByCandidate(candidates, 0, frame => {
            this._iconLoading.delete(normalizedPath);
            const waiting = this.getIconWaitingSet(normalizedPath);
            if (!frame) {
                console.error(`[WeaponBarUI] Failed to load weapon icon from paths:`, candidates);
                waiting.clear();
                return;
            }

            this._iconFrameCache.set(normalizedPath, frame);
            for (const waitingSprite of waiting) {
                if (!waitingSprite?.isValid) continue;
                waitingSprite.spriteFrame = frame;
            }
            waiting.clear();
        });
    }

    private getIconLoadCandidates(path: string): string[] {
        const rawCandidates = [
            path,
            `${path}/spriteFrame`,
            `${path}/texture`,
            path.endsWith('.webp') ? path : `${path}.webp`,
            path.endsWith('.webp') ? `${path}/spriteFrame` : `${path}.webp/spriteFrame`,
            path.endsWith('.webp') ? `${path}/texture` : `${path}.webp/texture`,
        ];

        const candidates: string[] = [];
        for (const candidate of rawCandidates) {
            if (!candidate || candidates.includes(candidate)) continue;
            candidates.push(candidate);
        }
        return candidates;
    }

    private loadWeaponIconByCandidate(
        candidates: string[],
        index: number,
        done: (frame: SpriteFrame | null) => void
    ): void {
        if (index >= candidates.length) {
            done(null);
            return;
        }

        const candidate = candidates[index];
        resources.load(candidate, SpriteFrame, (sfErr, spriteFrame) => {
            if (!sfErr && spriteFrame) {
                done(spriteFrame);
                return;
            }

            resources.load(candidate, Texture2D, (texErr, texture) => {
                if (!texErr && texture) {
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    done(frame);
                    return;
                }

                resources.load(candidate, ImageAsset, (imgErr, imageAsset) => {
                    if (!imgErr && imageAsset) {
                        const textureFromImage = new Texture2D();
                        textureFromImage.image = imageAsset;
                        const frameFromImage = new SpriteFrame();
                        frameFromImage.texture = textureFromImage;
                        done(frameFromImage);
                        return;
                    }

                    this.loadWeaponIconByCandidate(candidates, index + 1, done);
                });
            });
        });
    }

    private getIconWaitingSet(path: string): Set<Sprite> {
        let waitingSet = this._iconWaiting.get(path);
        if (!waitingSet) {
            waitingSet = new Set<Sprite>();
            this._iconWaiting.set(path, waitingSet);
        }
        return waitingSet;
    }

    private updateContainerSize(iconCount: number): void {
        if (!this._barNode) return;
        const iconAreaWidth =
            iconCount > 0 ? iconCount * this._iconSize + Math.max(0, iconCount - 1) * ICON_GAP : 0;
        const width = Math.max(BAR_MIN_WIDTH, iconAreaWidth + BAR_PADDING_X * 2);
        const height = Math.max(BAR_MIN_HEIGHT, this._iconSize + BAR_PADDING_Y * 2 + 12);
        this._barNode.getComponent(UITransform)?.setContentSize(width, height);
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
