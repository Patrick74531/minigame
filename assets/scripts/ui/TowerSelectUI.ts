import { Node, UITransform, Color, Widget, Graphics, Label, UIOpacity, tween, Vec3 } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { Localization } from '../core/i18n/Localization';
import { GameConfig } from '../data/GameConfig';
import { GameManager } from '../core/managers/GameManager';

const UI_LAYER = 33554432;

const CARD_WIDTH = 240;
const CARD_HEIGHT = 320;
const CARD_GAP = 40;
const CARD_CORNER_RADIUS = 16;

/**
 * TowerSelectUI
 * 塔防建筑选择界面（3 选 1）
 */
export class TowerSelectUI extends Singleton<TowerSelectUI>() {
    private _uiCanvas: Node | null = null;
    private _rootNode: Node | null = null;
    private _isShowing: boolean = false;
    private _currentPadNode: Node | null = null;

    private readonly TOWER_TYPES = ['tower', 'frost_tower', 'lightning_tower'];

    public initialize(uiCanvas: Node): void {
        this._uiCanvas = uiCanvas;
        this.eventManager.on(GameEvents.REQUEST_TOWER_SELECTION, this.onRequestSelection, this);
        console.log('[TowerSelectUI] 初始化完成');
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.REQUEST_TOWER_SELECTION, this.onRequestSelection, this);
        this.hideCards();
    }

    private onRequestSelection(data: { padNode: Node }): void {
        if (!data || !data.padNode) return;
        this._currentPadNode = data.padNode;
        this.showCards();
    }

    public showCards(): void {
        if (!this._uiCanvas || this._isShowing) return;
        this._isShowing = true;

        // 暂停游戏
        this.gameManager.pauseGame();

        // 创建根节点（全屏遮罩）
        this._rootNode = new Node('TowerSelectRoot');
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
        maskWidget.isAlignTop = maskWidget.isAlignBottom = maskWidget.isAlignLeft = maskWidget.isAlignRight = true;
        maskWidget.top = maskWidget.bottom = maskWidget.left = maskWidget.right = 0;
        const maskG = maskNode.addComponent(Graphics);
        maskG.fillColor = new Color(0, 0, 0, 160);
        maskG.rect(-640, -360, 1280, 720);
        maskG.fill();

        // 点击遮罩关闭（可选，但通常强制选择）
        // maskNode.on(Node.EventType.TOUCH_END, () => this.hideCards());

        // 标题
        this.createTitle(this._rootNode);

        // 卡牌容器
        const container = new Node('CardContainer');
        container.layer = UI_LAYER;
        this._rootNode.addChild(container);
        
        // 动态缩放适配
        const totalWidth = this.TOWER_TYPES.length * CARD_WIDTH + (this.TOWER_TYPES.length - 1) * CARD_GAP;
        const size = rootTransform.contentSize;
        if (totalWidth > size.width - 100) {
            const scale = (size.width - 100) / totalWidth;
            container.setScale(scale, scale, 1);
        }

        const startX = -totalWidth / 2 + CARD_WIDTH / 2;

        this.TOWER_TYPES.forEach((type, i) => {
            const card = this.createCardNode(type);
            container.addChild(card);
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
        // 恢复游戏
        if (this._isShowing) {
             this.gameManager.resumeGame();
        }

        if (this._rootNode) {
            this._rootNode.destroy();
            this._rootNode = null;
        }
        this._isShowing = false;
        this._currentPadNode = null;
    }

    private createTitle(root: Node): void {
        const titleNode = new Node('Title');
        titleNode.layer = UI_LAYER;
        titleNode.addComponent(UITransform).setContentSize(600, 60);
        root.addChild(titleNode);

        const widget = titleNode.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = 100;

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.tower.select.title') || 'Select Tower';
        label.fontSize = 36;
        label.lineHeight = 40;
        label.color = new Color(255, 215, 0, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleNode.setPosition(0, 220, 0);
    }

    private createCardNode(buildingType: string): Node {
        const config = GameConfig.BUILDING.TYPES[buildingType as keyof typeof GameConfig.BUILDING.TYPES];
        if (!config) return new Node();

        const cardNode = new Node(`TowerCard_${buildingType}`);
        cardNode.layer = UI_LAYER;
        cardNode.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);

        // 颜色
        const themeColor = this.hexToColor(config.visual?.colorHex || '#FFFFFF');

        // 背景
        const bg = new Node('BG');
        bg.layer = UI_LAYER;
        bg.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
        cardNode.addChild(bg);

        const g = bg.addComponent(Graphics);
        g.fillColor = new Color(30, 30, 40, 240);
        g.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
        g.fill();
        g.strokeColor = themeColor;
        g.lineWidth = 3;
        g.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
        g.stroke();

        // 顶部色条
        g.fillColor = themeColor;
        g.roundRect(-CARD_WIDTH / 2, CARD_HEIGHT / 2 - 60, CARD_WIDTH, 60, CARD_CORNER_RADIUS);
        g.fill();
        g.rect(-CARD_WIDTH / 2, CARD_HEIGHT / 2 - 60, CARD_WIDTH, 30); // Fill bottom corners of top bar
        g.fill(); // Re-fill to ensure sharp cutoff if needed, but roundRect top is fine. 
        // Actually to make top rounded and bottom flat for the header bar:
        // Easier to just draw header.
        
        // 名称
        const nameNode = new Node('Name');
        nameNode.layer = UI_LAYER;
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 20, 50);
        cardNode.addChild(nameNode);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(config.nameKey) || buildingType;
        nameLabel.fontSize = 24;
        nameLabel.lineHeight = 30;
        nameLabel.color = Color.WHITE;
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameNode.setPosition(0, CARD_HEIGHT / 2 - 30, 0);

        // 描述
        const descNode = new Node('Desc');
        descNode.layer = UI_LAYER;
        descNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 30, 100);
        cardNode.addChild(descNode);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = Localization.instance.t(config.descriptionKey) || '';
        descLabel.fontSize = 16;
        descLabel.lineHeight = 20;
        descLabel.color = new Color(200, 200, 200, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.TOP;
        descLabel.overflow = Label.Overflow.SHRINK;
        descLabel.enableWrapText = true;
        descNode.setPosition(0, 40, 0);

        // 属性预览 (简略)
        const statsNode = new Node('Stats');
        statsNode.layer = UI_LAYER;
        statsNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 20, 80);
        cardNode.addChild(statsNode);
        const statsLabel = statsNode.addComponent(Label);
        
        const statsConfig = config as any;
        let statsText = '';
        if (statsConfig.stats) {
            statsText += `HP: ${statsConfig.stats.hp}\n`;
            if (statsConfig.stats.attackDamage) statsText += `DMG: ${statsConfig.stats.attackDamage}\n`;
            // if (statsConfig.stats.attackInterval) statsText += `SPD: ${statsConfig.stats.attackInterval}s\n`;
        }
        
        statsLabel.string = statsText;
        statsLabel.fontSize = 16;
        statsLabel.lineHeight = 22;
        statsLabel.color = new Color(240, 240, 240, 255);
        statsLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        statsNode.setPosition(0, -60, 0);

        // 点击事件
        cardNode.on(Node.EventType.TOUCH_END, () => {
            if (!this._isShowing || !this._currentPadNode) return;
            
            this.eventManager.emit(GameEvents.TOWER_SELECTED, {
                padNode: this._currentPadNode,
                buildingTypeId: buildingType
            });
            
            this.hideCards();
        });

        return cardNode;
    }

    private hexToColor(hex: string): Color {
        if (hex.startsWith('#')) hex = hex.substring(1);
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return new Color(r, g, b, 255);
        }
        return Color.WHITE;
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
