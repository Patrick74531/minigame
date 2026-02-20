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
            // Avoid letterboxing on mobile webviews while preserving aspect ratio.
            // NO_BORDER crops overflow instead of stretching UI elements.
            ResolutionPolicy.NO_BORDER
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
     * 创建金币计数 UI
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
