import {
    Node,
    UITransform,
    Color,
    Widget,
    Graphics,
    Label,
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
import { SelectionCardTheme } from './SelectionCardTheme';

const UI_LAYER = 33554432;

const CARD_WIDTH = 258;
const CARD_HEIGHT = 378;
const CARD_GAP = 34;

/**
 * WeaponSelectUI
 * 空投武器选择界面（3 选 1），暂停期间展示。
 * 结构与 BuffCardUI 一致，保持 UI 风格统一。
 */
export class WeaponSelectUI extends Singleton<WeaponSelectUI>() {
    private _uiCanvas: Node | null = null;
    private _rootNode: Node | null = null;
    private _isShowing: boolean = false;

    // Icon loading cache
    private _iconFrameCache: Map<string, SpriteFrame> = new Map();
    private _iconLoading: Set<string> = new Set();
    private _iconWaiting: Map<string, Set<Sprite>> = new Map();

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.eventManager.on(GameEvents.WEAPONS_OFFERED, this.onWeaponsOffered, this);
        console.log('[WeaponSelectUI] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.WEAPONS_OFFERED, this.onWeaponsOffered, this);
        this.hideCards();
        this._iconFrameCache.clear();
        this._iconLoading.clear();
        this._iconWaiting.clear();
    }

    // === 事件处理 ===

    private onWeaponsOffered(data: { weapons: string[] }): void {
        const weaponIds = data.weapons as WeaponType[];
        const defs: { type: WeaponType; def: WeaponDef }[] = [];
        const manager = HeroWeaponManager.instance;

        for (const id of weaponIds) {
            const def = manager.getWeaponDef(id);
            if (def) defs.push({ type: id, def });
        }
        if (defs.length === 0) return;

        this.showCards(defs);
    }

    // === 展示 / 隐藏 ===

    public showCards(weapons: { type: WeaponType; def: WeaponDef }[]): void {
        if (!this._uiCanvas || this._isShowing) return;
        this._isShowing = true;

        // 创建根节点（全屏遮罩）
        this._rootNode = new Node('WeaponSelectRoot');
        this._rootNode.layer = UI_LAYER;
        this._uiCanvas.addChild(this._rootNode);

        const rootTransform = this._rootNode.addComponent(UITransform);
        rootTransform.setContentSize(1280, 720);

        const widget = this._rootNode.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;

        // 半透明遮罩
        const maskNode = new Node('Mask');
        maskNode.layer = UI_LAYER;
        this._rootNode.addChild(maskNode);
        const maskTransform = maskNode.addComponent(UITransform);
        maskTransform.setContentSize(1280, 720);
        const maskWidget = maskNode.addComponent(Widget);
        maskWidget.isAlignTop =
            maskWidget.isAlignBottom =
            maskWidget.isAlignLeft =
            maskWidget.isAlignRight =
                true;
        maskWidget.top = maskWidget.bottom = maskWidget.left = maskWidget.right = 0;
        const maskG = maskNode.addComponent(Graphics);
        SelectionCardTheme.drawOverlayMask(maskG, 1280, 720);

        // 标题
        this.createTitle(this._rootNode);

        // 卡牌
        const totalWidth = weapons.length * CARD_WIDTH + (weapons.length - 1) * CARD_GAP;

        // Dynamic scaling if total width exceeds screen width
        const size = this._rootNode.getComponent(UITransform)?.contentSize;
        // Create a container for scaling
        const cardContainer = new Node('CardContainer');
        cardContainer.layer = UI_LAYER;
        this._rootNode.addChild(cardContainer);

        if (size && totalWidth > size.width - 100) {
            const scale = (size.width - 100) / totalWidth;
            cardContainer.setScale(scale, scale, 1);
        }

        const startX = -totalWidth / 2 + CARD_WIDTH / 2;

        weapons.forEach((w, i) => {
            const card = this.createCardNode(w, i);
            cardContainer.addChild(card);
            card.setPosition(startX + i * (CARD_WIDTH + CARD_GAP), -20, 0);
            SelectionCardTheme.playCardReveal(card, i);
        });
    }

    private hideCards(): void {
        if (this._rootNode) {
            this._rootNode.destroy();
            this._rootNode = null;
        }
        this._isShowing = false;
        // Clear waiting sets to avoid memory leaks if sprites are destroyed
        this._iconWaiting.clear();
        this._iconLoading.clear();
    }

    // === UI 构建 ===

    private createTitle(root: Node): void {
        const titleNode = new Node('Title');
        titleNode.layer = UI_LAYER;
        titleNode.addComponent(UITransform).setContentSize(760, 72);
        root.addChild(titleNode);

        // Responsive Title using Widget
        const widget = titleNode.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 100;

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.weapon.select.title');
        SelectionCardTheme.applyLabelTheme(label, {
            fontSize: 48,
            lineHeight: 54,
            color: new Color(255, 214, 92, 255),
            bold: true,
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(52, 26, 6, 255),
            outlineWidth: 5,
            shadowColor: new Color(0, 0, 0, 210),
        });
        titleNode.setPosition(0, 214, 0);

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

    private createCardNode(weapon: { type: WeaponType; def: WeaponDef }, _index: number): Node {
        const { type, def } = weapon;
        const manager = HeroWeaponManager.instance;
        const existing = manager.inventory.get(type);
        const currentLevel = existing ? existing.level : 0;
        const isUpgrade = currentLevel > 0;

        const cardNode = new Node(`WeaponCard_${type}`);
        cardNode.layer = UI_LAYER;
        cardNode.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);

        // 颜色
        const themeColor = this.hexToColor(def.iconColor);

        // 背景
        const bg = new Node('BG');
        bg.layer = UI_LAYER;
        bg.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
        cardNode.addChild(bg);

        const g = bg.addComponent(Graphics);
        SelectionCardTheme.drawCardBackground(g, CARD_WIDTH, CARD_HEIGHT, themeColor, 78);

        // 武器名称
        const nameNode = new Node('Name');
        nameNode.layer = UI_LAYER;
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 30, 56);
        cardNode.addChild(nameNode);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(def.nameKey);
        SelectionCardTheme.applyLabelTheme(nameLabel, {
            fontSize: 30,
            lineHeight: 34,
            color: Color.WHITE,
            bold: true,
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(18, 20, 34, 255),
            outlineWidth: 3,
        });
        nameLabel.overflow = Label.Overflow.SHRINK;
        nameNode.setPosition(0, CARD_HEIGHT / 2 - 42, 0);

        // 等级标签
        const levelText = isUpgrade
            ? Localization.instance.t('ui.weapon.level.upgrade', {
                  from: currentLevel,
                  to: currentLevel + 1,
              })
            : Localization.instance.t('ui.weapon.level.new');
        SelectionCardTheme.createBadge(
            cardNode,
            levelText,
            SelectionCardTheme.blendColor(themeColor, new Color(255, 224, 146, 255), 0.3),
            { w: 146, h: 30 },
            { x: 0, y: CARD_HEIGHT / 2 - 88 },
            isUpgrade ? new Color(255, 226, 126, 255) : new Color(158, 252, 186, 255)
        );

        // 武器描述
        const descNode = new Node('Desc');
        descNode.layer = UI_LAYER;
        descNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 26, 82);
        cardNode.addChild(descNode);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = Localization.instance.t(def.descriptionKey);
        SelectionCardTheme.applyLabelTheme(descLabel, {
            fontSize: 18,
            lineHeight: 24,
            color: new Color(194, 208, 232, 255),
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.TOP,
            outlineColor: new Color(8, 20, 32, 255),
            outlineWidth: 2,
            shadowBlur: 1,
        });
        descLabel.overflow = Label.Overflow.SHRINK;
        descNode.setPosition(0, 34, 0);

        // 武器图标 (替代原有的 Stats)
        const iconContainer = new Node('WeaponIcon');
        iconContainer.layer = UI_LAYER;
        cardNode.addChild(iconContainer);
        const containerSize = 100;
        iconContainer.addComponent(UITransform).setContentSize(containerSize, containerSize);
        iconContainer.setPosition(0, -60, 0); // Center of the bottom area

        // Icon Sprite
        const spriteNode = new Node('Sprite');
        spriteNode.layer = UI_LAYER;
        iconContainer.addChild(spriteNode);
        const spriteSize = 80;
        spriteNode.addComponent(UITransform).setContentSize(spriteSize, spriteSize);

        const sprite = spriteNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        if (def.iconPath) {
            this.loadWeaponIcon(sprite, def.iconPath);
        }

        // 点击
        SelectionCardTheme.bindCardClick(cardNode, () => {
            if (!this._isShowing) return;
            this.eventManager.emit(GameEvents.WEAPON_PICKED, { weaponId: type });
            this.hideCards();
        });

        return cardNode;
    }

    // === Icon Loading Logic (Copied from WeaponBarUI) ===

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
                console.error(
                    `[WeaponSelectUI] Failed to load weapon icon from paths:`,
                    candidates
                );
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
