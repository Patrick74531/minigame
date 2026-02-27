import { Node, UITransform, Color, Widget, Graphics, Label } from 'cc';
import { Singleton } from '../core/base/Singleton';
import { EventManager } from '../core/managers/EventManager';
import { ServiceRegistry } from '../core/managers/ServiceRegistry';
import { GameEvents } from '../data/GameEvents';
import { Localization } from '../core/i18n/Localization';
import { GameConfig } from '../data/GameConfig';
import { GameManager } from '../core/managers/GameManager';
import { SelectionCardTheme } from './SelectionCardTheme';
import { CoopBuildAuthority } from '../core/runtime/CoopBuildAuthority';

const UI_LAYER = 33554432;

const CARD_WIDTH = 258;
const CARD_HEIGHT = 360;
const CARD_GAP = 34;

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
        // Guest in coop mode cannot select towers
        if (CoopBuildAuthority.isGuest) return;
        this._currentPadNode = data.padNode;
        this.showCards();
    }

    public showCards(): void {
        if (!this._uiCanvas || this._isShowing) return;
        this._isShowing = true;
        const viewport = this.getViewportSize();

        // 暂停游戏
        this.gameManager.pauseGame();

        // 创建根节点（全屏遮罩）
        this._rootNode = new Node('TowerSelectRoot');
        this._rootNode.layer = UI_LAYER;
        this._uiCanvas.addChild(this._rootNode);

        const rootTransform = this._rootNode.addComponent(UITransform);
        rootTransform.setContentSize(viewport.width, viewport.height);

        const widget = this._rootNode.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;

        // 半透明遮罩
        const maskNode = new Node('Mask');
        maskNode.layer = UI_LAYER;
        this._rootNode.addChild(maskNode);
        const maskTransform = maskNode.addComponent(UITransform);
        maskTransform.setContentSize(viewport.width, viewport.height);
        const maskWidget = maskNode.addComponent(Widget);
        maskWidget.isAlignTop =
            maskWidget.isAlignBottom =
            maskWidget.isAlignLeft =
            maskWidget.isAlignRight =
                true;
        maskWidget.top = maskWidget.bottom = maskWidget.left = maskWidget.right = 0;
        const maskG = maskNode.addComponent(Graphics);
        SelectionCardTheme.drawOverlayMask(maskG, viewport.width, viewport.height);

        // 点击遮罩关闭（可选，但通常强制选择）
        // maskNode.on(Node.EventType.TOUCH_END, () => this.hideCards());

        // 标题
        this.createTitle(this._rootNode, viewport.width, viewport.height);

        // 卡牌容器
        const container = new Node('CardContainer');
        container.layer = UI_LAYER;
        this._rootNode.addChild(container);

        // 动态缩放适配
        const totalWidth =
            this.TOWER_TYPES.length * CARD_WIDTH + (this.TOWER_TYPES.length - 1) * CARD_GAP;
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
            SelectionCardTheme.playCardReveal(card, i);
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

    private createTitle(root: Node, viewportWidth: number, viewportHeight: number): void {
        const titleNode = new Node('Title');
        titleNode.layer = UI_LAYER;
        titleNode
            .addComponent(UITransform)
            .setContentSize(
                Math.round(Math.max(420, Math.min(880, viewportWidth * 0.72))),
                Math.round(Math.max(64, Math.min(90, viewportHeight * 0.11)))
            );
        root.addChild(titleNode);

        const widget = titleNode.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignHorizontalCenter = true;
        widget.top = Math.round(Math.max(30, Math.min(120, viewportHeight * 0.14)));

        const label = titleNode.addComponent(Label);
        label.string = Localization.instance.t('ui.tower.select.title') || 'Select Tower';
        label.overflow = Label.Overflow.SHRINK;
        SelectionCardTheme.applyLabelTheme(label, {
            fontSize: 48,
            lineHeight: 54,
            color: new Color(255, 214, 92, 255),
            bold: true,
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(52, 26, 6, 255),
            outlineWidth: 5,
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

    private getViewportSize(): { width: number; height: number } {
        const size = this._uiCanvas?.getComponent(UITransform)?.contentSize;
        return {
            width: Math.max(480, Math.round(size?.width ?? 1280)),
            height: Math.max(320, Math.round(size?.height ?? 720)),
        };
    }

    private createCardNode(buildingType: string): Node {
        const config =
            GameConfig.BUILDING.TYPES[buildingType as keyof typeof GameConfig.BUILDING.TYPES];
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
        SelectionCardTheme.drawCardBackground(g, CARD_WIDTH, CARD_HEIGHT, themeColor, 78);

        // 名称
        const nameNode = new Node('Name');
        nameNode.layer = UI_LAYER;
        nameNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 30, 56);
        cardNode.addChild(nameNode);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = Localization.instance.t(config.nameKey) || buildingType;
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

        SelectionCardTheme.createBadge(
            cardNode,
            this.getTowerTag(buildingType),
            SelectionCardTheme.blendColor(themeColor, new Color(255, 224, 146, 255), 0.3),
            { w: 108, h: 30 },
            { x: 0, y: CARD_HEIGHT / 2 - 88 },
            new Color(176, 255, 206, 255)
        );

        // 描述
        const descNode = new Node('Desc');
        descNode.layer = UI_LAYER;
        descNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 30, 108);
        cardNode.addChild(descNode);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = Localization.instance.t(config.descriptionKey) || '';
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
        descLabel.enableWrapText = true;
        descNode.setPosition(0, 32, 0);

        // 属性预览 (简略)
        const statsNode = new Node('Stats');
        statsNode.layer = UI_LAYER;
        statsNode.addComponent(UITransform).setContentSize(CARD_WIDTH - 24, 118);
        cardNode.addChild(statsNode);
        const statsLabel = statsNode.addComponent(Label);

        const statsConfig = config as any;
        let statsText = '';
        if (statsConfig.stats) {
            statsText += `HP: ${statsConfig.stats.hp}\n`;
            if (statsConfig.stats.attackDamage)
                statsText += `DMG: ${statsConfig.stats.attackDamage}\n`;
            if (statsConfig.stats.attackRange)
                statsText += `RANGE: ${Math.round(statsConfig.stats.attackRange)}\n`;
            // if (statsConfig.stats.attackInterval) statsText += `SPD: ${statsConfig.stats.attackInterval}s\n`;
        }

        statsLabel.string = statsText;
        SelectionCardTheme.applyLabelTheme(statsLabel, {
            fontSize: 19,
            lineHeight: 26,
            color: new Color(236, 244, 255, 255),
            hAlign: Label.HorizontalAlign.CENTER,
            vAlign: Label.VerticalAlign.CENTER,
            outlineColor: new Color(10, 22, 38, 255),
            outlineWidth: 2,
        });
        statsNode.setPosition(0, -88, 0);

        // 点击事件
        SelectionCardTheme.bindCardClick(cardNode, () => {
            if (!this._isShowing || !this._currentPadNode) return;

            this.eventManager.emit(GameEvents.TOWER_SELECTED, {
                padNode: this._currentPadNode,
                buildingTypeId: buildingType,
                source: 'local',
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

    private getTowerTag(typeId: string): string {
        if (typeId === 'frost_tower') return Localization.instance.t('ui.tower.tag.frost');
        if (typeId === 'lightning_tower') return Localization.instance.t('ui.tower.tag.lightning');
        return Localization.instance.t('ui.tower.tag.machine_gun');
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get gameManager(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}
