import { Node, UITransform, Color, Widget, Graphics, Label, UIOpacity, tween, Vec3 } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { GameManager } from '../core/managers/GameManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { HeroWeaponManager } from '../gameplay/weapons/HeroWeaponManager';
import { WeaponType, WeaponDef } from '../gameplay/weapons/WeaponTypes';
import { Localization } from '../core/i18n/Localization';

const UI_LAYER = 33554432;

const CARD_WIDTH = 240;
const CARD_HEIGHT = 360;
const CARD_GAP = 30;
const CARD_CORNER_RADIUS = 16;

/**
 * WeaponSelectUI
 * 空投武器选择界面（3 选 1），暂停期间展示。
 * 结构与 BuffCardUI 一致，保持 UI 风格统一。
 */
export class WeaponSelectUI extends Singleton<WeaponSelectUI>() {
    private _uiCanvas: Node | null = null;
    private _rootNode: Node | null = null;
    private _isShowing: boolean = false;

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.eventManager.on(GameEvents.WEAPONS_OFFERED, this.onWeaponsOffered, this);
        console.log('[WeaponSelectUI] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.WEAPONS_OFFERED, this.onWeaponsOffered, this);
        this.hideCards();
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
        maskG.fillColor = new Color(0, 0, 0, 160);
        maskG.rect(-640, -360, 1280, 720);
        maskG.fill();

        // 标题
        this.createTitle(this._rootNode);

        // 卡牌
        const totalWidth = weapons.length * CARD_WIDTH + (weapons.length - 1) * CARD_GAP;
        const startX = -totalWidth / 2 + CARD_WIDTH / 2;

        weapons.forEach((w, i) => {
            const card = this.createCardNode(w, i);
            this._rootNode!.addChild(card);
            card.setPosition(startX + i * (CARD_WIDTH + CARD_GAP), -20, 0);

            // 入场动画
            const opacity = card.addComponent(UIOpacity);
            opacity.opacity = 0;
            card.setScale(0.8, 0.8, 1);
            tween(card)
                .delay(i * 0.1)
                .to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
            tween(opacity)
                .delay(i * 0.1)
                .to(0.2, { opacity: 255 })
                .start();
        });
    }

    private hideCards(): void {
        if (this._rootNode) {
            this._rootNode.destroy();
            this._rootNode = null;
        }
        this._isShowing = false;
    }

    // === UI 构建 ===

    private createTitle(root: Node): void {
        const titleNode = new Node('Title');
        titleNode.layer = UI_LAYER;
        titleNode.addComponent(UITransform).setContentSize(600, 60);
        root.addChild(titleNode);

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.weapon.select.title');
        label.fontSize = 36;
        label.lineHeight = 40;
        label.color = new Color(255, 215, 0, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleNode.setPosition(0, 220, 0);
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
        g.fillColor = new Color(25, 25, 35, 230);
        g.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
        g.fill();
        g.strokeColor = themeColor;
        g.lineWidth = 3;
        g.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
        g.stroke();
        // 顶部色条
        g.fillColor = themeColor;
        g.roundRect(-CARD_WIDTH / 2, CARD_HEIGHT / 2 - 70, CARD_WIDTH, 70, CARD_CORNER_RADIUS);
        g.fill();
        g.fillColor = themeColor;
        g.rect(-CARD_WIDTH / 2, CARD_HEIGHT / 2 - 70, CARD_WIDTH, CARD_CORNER_RADIUS);
        g.fill();

        // 武器名称
        const nameNode = new Node('Name');
        nameNode.layer = UI_LAYER;
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 20, 50);
        cardNode.addChild(nameNode);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(def.nameKey);
        nameLabel.fontSize = 26;
        nameLabel.lineHeight = 30;
        nameLabel.color = Color.WHITE;
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.overflow = Label.Overflow.SHRINK;
        nameNode.setPosition(0, CARD_HEIGHT / 2 - 40, 0);

        // 等级标签
        const levelNode = new Node('Level');
        levelNode.layer = UI_LAYER;
        levelNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 20, 30);
        cardNode.addChild(levelNode);
        const levelLabel = levelNode.addComponent(Label);
        levelLabel.string = isUpgrade
            ? Localization.instance.t('ui.weapon.level.upgrade', {
                  from: currentLevel,
                  to: currentLevel + 1,
              })
            : Localization.instance.t('ui.weapon.level.new');
        levelLabel.fontSize = 18;
        levelLabel.lineHeight = 22;
        levelLabel.color = isUpgrade ? new Color(255, 215, 0, 255) : new Color(100, 255, 100, 255);
        levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        levelNode.setPosition(0, CARD_HEIGHT / 2 - 80, 0);

        // 武器描述
        const descNode = new Node('Desc');
        descNode.layer = UI_LAYER;
        descNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 24, 60);
        cardNode.addChild(descNode);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = Localization.instance.t(def.descriptionKey);
        descLabel.fontSize = 16;
        descLabel.lineHeight = 20;
        descLabel.color = new Color(190, 190, 190, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.TOP;
        descLabel.overflow = Label.Overflow.SHRINK;
        descNode.setPosition(0, 20, 0);

        // 属性预览
        const nextLevel = currentLevel + 1;
        const statsText = this.formatStats(def, nextLevel);
        const statsNode = new Node('Stats');
        statsNode.layer = UI_LAYER;
        statsNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 24, 120);
        cardNode.addChild(statsNode);
        const statsLabel = statsNode.addComponent(Label);
        statsLabel.string = statsText;
        statsLabel.fontSize = 17;
        statsLabel.lineHeight = 22;
        statsLabel.color = new Color(240, 240, 240, 255);
        statsLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        statsLabel.verticalAlign = Label.VerticalAlign.CENTER;
        statsLabel.overflow = Label.Overflow.CLAMP;
        statsNode.setPosition(0, -70, 0);

        // 点击
        cardNode.on(Node.EventType.TOUCH_END, () => {
            if (!this._isShowing) return;
            this.eventManager.emit(GameEvents.WEAPON_PICKED, { weaponId: type });
            this.hideCards();
        });

        return cardNode;
    }

    // === 属性格式化 ===

    private static readonly STAT_LABEL_KEYS: Record<string, string> = {
        damage: 'ui.weapon.stat.damage',
        attackInterval: 'ui.weapon.stat.attackInterval',
        range: 'ui.weapon.stat.range',
        projectileSpeed: 'ui.weapon.stat.projectileSpeed',
        spread: 'ui.weapon.stat.spread',
        gravity: 'ui.weapon.stat.gravity',
        burnDuration: 'ui.weapon.stat.burnDuration',
        explosionRadius: 'ui.weapon.stat.explosionRadius',
        spinSpeed: 'ui.weapon.stat.spinSpeed',
        waveSpeed: 'ui.weapon.stat.waveSpeed',
        waveRadius: 'ui.weapon.stat.waveRadius',
        slowPercent: 'ui.weapon.stat.slowPercent',
        slowDuration: 'ui.weapon.stat.slowDuration',
    };

    private formatStats(def: WeaponDef, level: number): string {
        const idx = Math.max(0, Math.min(level - 1, def.levels.length - 1));
        const stats = def.levels[idx];
        const lines: string[] = [];

        const keys = Object.keys(stats);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = (stats as any)[key];
            const labelKey = WeaponSelectUI.STAT_LABEL_KEYS[key];
            if (!labelKey) continue;
            const label = Localization.instance.t(labelKey);
            if (typeof value === 'number') {
                if (key === 'slowPercent') {
                    lines.push(`${label}: ${Math.round(value * 100)}%`);
                } else if (key === 'slowDuration') {
                    lines.push(
                        `${label}: ${Localization.instance.t('ui.common.seconds', { value })}`
                    );
                } else {
                    lines.push(`${label}: ${value}`);
                }
            }
        }
        return lines.join('\n');
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

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
