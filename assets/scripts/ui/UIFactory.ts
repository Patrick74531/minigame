import {
    Node,
    UITransform,
    Color,
    ResolutionPolicy,
    Canvas,
    Camera,
    view,
    Widget,
    Graphics,
    Label,
    LabelOutline,
    LabelShadow,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    resources,
} from 'cc';
import { Joystick } from './Joystick';
import { Localization } from '../core/i18n/Localization';

/**
 * UI 工厂
 * 负责创建 UI 界面元素
 */
export class UIFactory {
    // UI_2D Layer
    private static readonly UI_LAYER = 33554432;
    private static readonly DESIGN_WIDTH = 1280;
    private static readonly DESIGN_HEIGHT = 720;

    public static createUICanvas(): Node {
        const node = new Node('UICanvas');
        node.layer = this.UI_LAYER;

        const canvas = node.addComponent(Canvas);
        const transform = node.addComponent(UITransform);
        view.setDesignResolutionSize(
            this.DESIGN_WIDTH,
            this.DESIGN_HEIGHT,
            // FIXED_HEIGHT: design height is always 720 design units, width scales
            // with viewport aspect ratio. This ensures top/bottom Widget anchors
            // always align to camera edges on all screen sizes (desktop & mobile).
            ResolutionPolicy.FIXED_HEIGHT
        );
        transform.setContentSize(this.DESIGN_WIDTH, this.DESIGN_HEIGHT);

        const widget = node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;

        const cameraNode = new Node('UICamera');
        cameraNode.layer = this.UI_LAYER;
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = this.DESIGN_HEIGHT * 0.5;
        camera.visibility = this.UI_LAYER;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        camera.priority = 100;

        node.addChild(cameraNode);
        canvas.cameraComponent = camera;

        return node;
    }

    public static createJoystick(parent: Node): Joystick {
        const joystickNode = new Node('JoystickArea');
        joystickNode.layer = this.UI_LAYER;
        parent.addChild(joystickNode);
        joystickNode
            .addComponent(UITransform)
            .setContentSize(this.DESIGN_WIDTH, this.DESIGN_HEIGHT);

        const widget = joystickNode.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;

        // Background (Ring)
        const bgNode = new Node('Background');
        bgNode.layer = this.UI_LAYER;
        joystickNode.addChild(bgNode);
        bgNode.active = false;
        bgNode.setPosition(0, 0, 0);

        const bgGraphics = bgNode.addComponent(Graphics);
        this.drawCircle(bgGraphics, new Color(100, 100, 100, 128), 70);

        // Stick (Dot)
        const stickNode = new Node('Stick');
        stickNode.layer = this.UI_LAYER;
        joystickNode.addChild(stickNode);
        stickNode.active = false;
        stickNode.setPosition(0, 0, 0);

        const stickGraphics = stickNode.addComponent(Graphics);
        this.drawCircle(stickGraphics, new Color(200, 200, 200, 200), 30);

        // Component
        const joystick = joystickNode.addComponent(Joystick);
        joystick.stick = stickNode;
        joystick.background = bgNode;
        joystick.maxRadius = 55;

        return joystick;
    }

    /**
     * 创建金币 + 錢石单行显示面板
     * Load icons from resources/icon/coins.webp and resources/icon/diamonds.webp
     */
    public static createCurrencyPanel(parent: Node): {
        coinsLabel: Label;
        diamondsLabel: Label;
        panelNode: Node;
    } {
        const panelW = 190;
        const panelH = 38;

        const panelNode = new Node('CurrencyPanel');
        panelNode.layer = this.UI_LAYER;
        parent.addChild(panelNode);
        panelNode.addComponent(UITransform).setContentSize(panelW, panelH);

        const bg = panelNode.addComponent(Graphics);
        bg.fillColor = new Color(10, 16, 32, 210);
        bg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
        bg.fill();
        bg.strokeColor = new Color(255, 200, 60, 110);
        bg.lineWidth = 1.5;
        bg.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
        bg.stroke();

        const iconSize = 24;
        const valW = 52;
        const gap = 4;
        const sectionGap = 10;
        const leftPad = 10;

        const coinIconX = -panelW / 2 + leftPad + iconSize / 2;
        const coinValX = coinIconX + iconSize / 2 + gap + valW / 2;
        const diamIconX = coinValX + valW / 2 + sectionGap + iconSize / 2;
        const diamValX = diamIconX + iconSize / 2 + gap + valW / 2;

        this._loadCurrencyIconSprite(panelNode, 'icon/coins', iconSize, coinIconX);
        const coinsLabel = this._currencyVal(
            panelNode, '0', new Color(255, 216, 95, 255), new Color(34, 16, 4, 255),
            valW, panelH, coinValX
        );
        this._loadCurrencyIconSprite(panelNode, 'icon/diamonds', iconSize, diamIconX);
        const diamondsLabel = this._currencyVal(
            panelNode, '0', new Color(100, 210, 255, 255), new Color(0, 40, 80, 255),
            valW, panelH, diamValX
        );

        return { coinsLabel, diamondsLabel, panelNode };
    }

    /**
     * Loads a webp icon from resources and applies it as a Sprite.
     * Falls back to nothing if the asset fails to load.
     */
    private static _loadCurrencyIconSprite(
        parent: Node,
        resourcePath: string,
        size: number,
        x: number
    ): void {
        const iconNode = new Node('CIcon');
        iconNode.layer = this.UI_LAYER;
        parent.addChild(iconNode);
        iconNode.addComponent(UITransform).setContentSize(size, size);
        iconNode.setPosition(x, 0, 0);
        const sprite = iconNode.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        // Try loading as SpriteFrame first, then ImageAsset fallback
        resources.load(resourcePath, SpriteFrame, (err, sf) => {
            if (!err && sf && iconNode.isValid) {
                sprite.spriteFrame = sf;
                return;
            }
            resources.load(resourcePath, Texture2D, (err2, tex) => {
                if (!err2 && tex && iconNode.isValid) {
                    const sf2 = new SpriteFrame();
                    sf2.texture = tex;
                    sprite.spriteFrame = sf2;
                    return;
                }
                // Final fallback: load as ImageAsset
                resources.load(resourcePath, ImageAsset, (err3, img) => {
                    if (!err3 && img && iconNode.isValid) {
                        const tex2 = new Texture2D();
                        tex2.image = img;
                        const sf3 = new SpriteFrame();
                        sf3.texture = tex2;
                        sprite.spriteFrame = sf3;
                    }
                });
            });
        });
    }

    private static _currencyVal(
        parent: Node,
        initial: string,
        color: Color,
        outlineColor: Color,
        w: number,
        h: number,
        x: number
    ): Label {
        const node = new Node('CVal');
        node.layer = this.UI_LAYER;
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(w, h);
        node.setPosition(x, 0, 0);
        const lbl = node.addComponent(Label);
        lbl.string = initial;
        lbl.fontSize = 20;
        lbl.isBold = true;
        lbl.color = color;
        lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
        lbl.verticalAlign = Label.VerticalAlign.CENTER;
        lbl.overflow = Label.Overflow.SHRINK;
        const outline = node.addComponent(LabelOutline);
        outline.color = outlineColor;
        outline.width = 2;
        return lbl;
    }

    /**
     * 创建金币计数 UI (legacy — use createCurrencyPanel instead)
     * @deprecated
     */
    public static createCoinDisplay(parent: Node): Label {
        const node = new Node('CoinDisplay');
        node.layer = this.UI_LAYER;
        parent.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(1, 1); // 锚点设为右上角
        transform.setContentSize(330, 62);

        const widget = node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignRight = true;
        widget.top = 16;
        widget.right = 186;

        const label = node.addComponent(Label);
        label.string = Localization.instance.t('ui.hud.coins', { count: 0 });
        label.fontSize = 44;
        label.lineHeight = 52;
        label.color = new Color(255, 216, 95, 255);
        label.horizontalAlign = Label.HorizontalAlign.RIGHT; // 右对齐
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = node.addComponent(LabelOutline);
        outline.color = new Color(34, 16, 4, 255);
        outline.width = 4;
        const shadow = node.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 190);
        shadow.offset.set(2, -2);
        shadow.blur = 2;

        return label;
    }

    /**
     * 创建通用 Label
     */
    public static createLabel(parent: Node, text: string = '', name: string = 'Label'): Label {
        const node = new Node(name);
        node.layer = this.UI_LAYER;
        parent.addChild(node);

        node.addComponent(UITransform);
        // 默认居中

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 34;
        label.lineHeight = 40;
        label.color = Color.WHITE;

        const outline = node.addComponent(LabelOutline);
        outline.color = new Color(10, 16, 26, 255);
        outline.width = 3;

        const shadow = node.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 175);
        shadow.offset.set(2, -1);
        shadow.blur = 2;

        return label;
    }

    public static createDesktopMoveHint(parent: Node): Label {
        const node = new Node('DesktopMoveHint');
        node.layer = this.UI_LAYER;
        parent.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0);
        transform.setContentSize(300, 34);

        const widget = node.addComponent(Widget);
        widget.isAlignHorizontalCenter = true;
        widget.isAlignBottom = true;
        widget.bottom = 8;

        const label = node.addComponent(Label);
        label.string = Localization.instance.t('ui.hud.desktopMoveHint');
        label.fontSize = 22;
        label.lineHeight = 26;
        label.color = new Color(224, 236, 252, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const outline = node.addComponent(LabelOutline);
        outline.color = new Color(10, 20, 32, 255);
        outline.width = 2;
        const shadow = node.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 156);
        shadow.offset.set(2, -1);
        shadow.blur = 1;

        return label;
    }

    private static drawCircle(graphics: Graphics, color: Color, radius: number): void {
        graphics.clear();
        graphics.fillColor = color;
        graphics.circle(0, 0, radius);
        graphics.fill();
    }
}
