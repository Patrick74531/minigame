import { Node, UITransform, Color, Widget, Graphics, Label, UIOpacity, tween, Vec3 } from 'cc';
import { EventManager } from '../core/managers/EventManager';
import { GameManager } from '../core/managers/GameManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import {
    BuffCardService,
    BuffCardDef,
    BuffCardEffect,
} from '../gameplay/roguelike/BuffCardService';
import { GameConfig } from '../data/GameConfig';
import { Localization } from '../core/i18n/Localization';

// UI_2D Layer
const UI_LAYER = 33554432;

/** 单张卡牌视觉尺寸 */
const CARD_WIDTH = 220;
const CARD_HEIGHT = 340;
const CARD_GAP = 30;
const CARD_CORNER_RADIUS = 16;

/**
 * BuffCardUI
 * 基地升级后弹出的肉鸽卡牌选择界面。
 * 监听 BUFF_CARDS_DRAWN 事件展示卡牌，玩家点击后发送 BUFF_CARD_PICKED。
 *
 * NOTE: 纯 UI 层，不包含任何游戏逻辑。
 */
export class BuffCardUI {
    private static _instance: BuffCardUI | null = null;

    public static get instance(): BuffCardUI {
        if (!this._instance) {
            this._instance = new BuffCardUI();
        }
        return this._instance;
    }

    public static destroyInstance(): void {
        this._instance = null;
    }

    private _root: Node | null = null;
    private _uiCanvas: Node | null = null;
    private _isShowing: boolean = false;

    public get isShowing(): boolean {
        return this._isShowing;
    }

    // === 初始化 ===

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.eventManager.on(GameEvents.BUFF_CARDS_DRAWN, this.onBuffCardsDrawn, this);
    }

    public cleanup(): void {
        this.eventManager.offAllByTarget(this);
        this.hideCards();
        this._uiCanvas = null;
    }

    // === 展示/隐藏 ===

    private onBuffCardsDrawn(_data: { count: number }): void {
        const cards = this.buffCardService.pendingCards;
        if (cards.length === 0) return;

        this.showCards([...cards]);
    }

    public showCards(cards: BuffCardDef[]): void {
        if (!this._uiCanvas || this._isShowing) return;
        this._isShowing = true;

        // 暂停游戏
        this.gameManager.pauseGame();

        // 创建根节点（全屏遮罩）
        this._root = this.createOverlay();
        this._uiCanvas.addChild(this._root);

        // 创建标题
        this.createTitle(this._root);

        // 创建卡牌容器
        const cardContainer = new Node('CardContainer');
        cardContainer.layer = UI_LAYER;
        cardContainer.addComponent(UITransform);
        this._root.addChild(cardContainer);

        // 居中排列卡牌
        const totalWidth = cards.length * CARD_WIDTH + (cards.length - 1) * CARD_GAP;
        
        // Dynamic scaling if total width exceeds screen width
        const size = this._root.getComponent(UITransform)?.contentSize;
        if (size && totalWidth > size.width - 100) {
             const scale = (size.width - 100) / totalWidth;
             cardContainer.setScale(scale, scale, 1);
        }

        const startX = -totalWidth / 2 + CARD_WIDTH / 2;

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cardNode = this.createCardNode(card, i);
            cardNode.setPosition(startX + i * (CARD_WIDTH + CARD_GAP), -20, 0);
            cardContainer.addChild(cardNode);

            // 入场动画：从下方弹入
            const targetY = cardNode.position.y;
            cardNode.setPosition(cardNode.position.x, targetY - 200, 0);

            const opacity = cardNode.addComponent(UIOpacity);
            opacity.opacity = 0;

            tween(cardNode)
                .delay(i * 0.12)
                .to(
                    0.3,
                    { position: new Vec3(cardNode.position.x, targetY, 0) },
                    { easing: 'backOut' }
                )
                .start();

            tween(opacity)
                .delay(i * 0.12)
                .to(0.2, { opacity: 255 })
                .start();
        }
    }

    public hideCards(): void {
        if (this._root && this._root.isValid) {
            this._root.destroy();
            this._root = null;
        }
        this._isShowing = false;
    }

    // === 卡牌创建 ===

    private createOverlay(): Node {
        const overlay = new Node('BuffCardOverlay');
        overlay.layer = UI_LAYER;

        const transform = overlay.addComponent(UITransform);
        transform.setContentSize(1280, 720);

        const widget = overlay.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;

        // 半透明黑色背景
        const bg = new Node('OverlayBG');
        bg.layer = UI_LAYER;
        const bgTransform = bg.addComponent(UITransform);
        bgTransform.setContentSize(1280, 720);
        overlay.addChild(bg);

        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 160);
        g.rect(-640, -360, 1280, 720);
        g.fill();

        return overlay;
    }

    private createTitle(parent: Node): void {
        const titleNode = new Node('CardTitle');
        titleNode.layer = UI_LAYER;
        parent.addChild(titleNode);

        titleNode.addComponent(UITransform);

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.buff.select.title');
        label.fontSize = 38;
        label.lineHeight = 44;
        label.color = new Color(255, 215, 0, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;

        // Responsive Title using Widget
        const widget = titleNode.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 100;
    }

    private createCardNode(card: BuffCardDef, _index: number): Node {
        const cardNode = new Node(`Card_${card.id}`);
        cardNode.layer = UI_LAYER;

        const transform = cardNode.addComponent(UITransform);
        transform.setContentSize(CARD_WIDTH, CARD_HEIGHT);

        // 稀有度颜色
        const rarityHex = GameConfig.BUFF_CARDS.RARITY_COLORS[card.rarity] ?? '#4A9FD9';
        const rarityColor = this.hexToColor(rarityHex);

        // 卡牌背景
        const bg = new Node('CardBG');
        bg.layer = UI_LAYER;
        bg.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
        cardNode.addChild(bg);

        const g = bg.addComponent(Graphics);
        // 卡牌底色（深色）
        g.fillColor = new Color(30, 30, 40, 230);
        g.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
        g.fill();
        // 卡牌边框（稀有度色）
        g.strokeColor = rarityColor;
        g.lineWidth = 3;
        g.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
        g.stroke();
        // 顶部色条（稀有度色）
        g.fillColor = rarityColor;
        g.roundRect(-CARD_WIDTH / 2, CARD_HEIGHT / 2 - 60, CARD_WIDTH, 60, CARD_CORNER_RADIUS);
        g.fill();
        // 覆盖底部圆角（使色条下缘为直角）
        g.fillColor = rarityColor;
        g.rect(-CARD_WIDTH / 2, CARD_HEIGHT / 2 - 60, CARD_WIDTH, CARD_CORNER_RADIUS);
        g.fill();

        // 卡牌名称
        const nameNode = new Node('CardName');
        nameNode.layer = UI_LAYER;
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 20, 50);
        cardNode.addChild(nameNode);

        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(card.nameKey);
        nameLabel.fontSize = 26;
        nameLabel.lineHeight = 30;
        nameLabel.color = Color.WHITE;
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.overflow = Label.Overflow.SHRINK;
        nameNode.setPosition(0, CARD_HEIGHT / 2 - 35, 0);

        // 属性提升详情（动态生成，唯一文字区域）
        const detailNode = new Node('CardDetail');
        detailNode.layer = UI_LAYER;
        detailNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 24, 200);
        cardNode.addChild(detailNode);

        const detailLabel = detailNode.addComponent(Label);
        detailLabel.string = this.formatEffects(card.effects);
        detailLabel.fontSize = 20;
        detailLabel.lineHeight = 28;
        detailLabel.color = new Color(240, 240, 240, 255);
        detailLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        detailLabel.verticalAlign = Label.VerticalAlign.CENTER;
        detailLabel.overflow = Label.Overflow.CLAMP;
        detailNode.setPosition(0, -30, 0);

        // 点击区域（覆盖整张卡牌）
        this.addClickHandler(cardNode, card);

        return cardNode;
    }

    private addClickHandler(cardNode: Node, card: BuffCardDef): void {
        cardNode.on(Node.EventType.TOUCH_END, () => {
            if (!this._isShowing) return;

            // 选中动画
            tween(cardNode)
                .to(0.15, { scale: new Vec3(1.1, 1.1, 1) })
                .to(0.1, { scale: new Vec3(1, 1, 1) })
                .call(() => {
                    this.onCardSelected(card);
                })
                .start();
        });
    }

    private onCardSelected(card: BuffCardDef): void {
        // 发送卡牌选择事件
        this.eventManager.emit(GameEvents.BUFF_CARD_PICKED, { cardId: card.id });

        // 隐藏卡牌界面
        this.hideCards();

        // 恢复游戏
        this.gameManager.resumeGame();
    }

    // === 属性格式化 ===

    private static readonly STAT_NAME_KEYS: Record<string, string> = {
        attack: 'ui.buff.stat.attack',
        attackInterval: 'ui.buff.stat.attackInterval',
        moveSpeed: 'ui.buff.stat.moveSpeed',
        attackRange: 'ui.buff.stat.attackRange',
        critRate: 'ui.buff.stat.critRate',
        critDamage: 'ui.buff.stat.critDamage',
    };

    /** critRate / critDamage 的 add 值以百分比展示 */
    private static readonly PERCENT_ADD_KEYS = new Set(['critRate', 'critDamage']);

    private formatEffects(effects: BuffCardEffect): string {
        const lines: string[] = [];

        const statKeys: (keyof BuffCardEffect)[] = [
            'attack',
            'attackInterval',
            'moveSpeed',
            'attackRange',
            'critRate',
            'critDamage',
        ];

        for (const key of statKeys) {
            const mod = effects[key];
            if (!mod || typeof mod !== 'object') continue;

            const keyName = BuffCardUI.STAT_NAME_KEYS[key as string];
            if (!keyName) continue;
            const name = Localization.instance.t(keyName);
            const parts: string[] = [];

            if ('multiply' in mod && mod.multiply !== undefined) {
                const pct = Math.round((mod.multiply - 1) * 100);
                if (pct > 0) {
                    parts.push(`+${pct}%`);
                } else if (pct < 0) {
                    parts.push(`${pct}%`);
                }
            }
            if ('add' in mod && mod.add !== undefined) {
                if (BuffCardUI.PERCENT_ADD_KEYS.has(key)) {
                    const pct = Math.round(mod.add * 100);
                    if (pct > 0) {
                        parts.push(`+${pct}%`);
                    } else if (pct < 0) {
                        parts.push(`${pct}%`);
                    }
                } else {
                    if (mod.add > 0) {
                        parts.push(`+${mod.add}`);
                    } else if (mod.add < 0) {
                        parts.push(`${mod.add}`);
                    }
                }
            }

            if (parts.length > 0) {
                lines.push(`${name} ${parts.join(' ')}`);
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

    private get buffCardService(): BuffCardService {
        return ServiceRegistry.get<BuffCardService>('BuffCardService') ?? BuffCardService.instance;
    }
}
