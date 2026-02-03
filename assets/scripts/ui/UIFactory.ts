import {
    _decorator,
    Node,
    UITransform,
    Color,
    ResolutionPolicy,
    Canvas,
    Camera,
    view,
    Widget,
    Graphics,
    Layers,
    Vec3,
    Label,
    Font,
} from 'cc';
import { Joystick } from './Joystick';

/**
 * UI 工厂
 * 负责创建 UI 界面元素
 */
export class UIFactory {
    
    // UI_2D Layer
    private static readonly UI_LAYER = 33554432;

    public static createUICanvas(): Node {
        const node = new Node('UICanvas');
        node.layer = this.UI_LAYER;
        
        const canvas = node.addComponent(Canvas);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(1280, 720); // 必须设置尺寸，否则 Widget 子节点无法对齐
        node.addComponent(Widget);

        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.FIXED_HEIGHT);

        const cameraNode = new Node('UICamera');
        cameraNode.layer = this.UI_LAYER;
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = 360;
        camera.visibility = this.UI_LAYER;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        camera.priority = 100;

        node.addChild(cameraNode);
        canvas.cameraComponent = camera;

        return node;
    }

    public static createJoystick(parent: Node): Joystick {
        // Joystick Node 作为一个全屏容器
        const joystickNode = new Node('JoystickArea');
        joystickNode.layer = this.UI_LAYER;
        parent.addChild(joystickNode);

        // 使用 Widget 撑满全屏
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

        const bgGraphics = bgNode.addComponent(Graphics);
        this.drawCircle(bgGraphics, new Color(100, 100, 100, 128), 100);

        // Stick (Dot)
        const stickNode = new Node('Stick');
        stickNode.layer = this.UI_LAYER;
        joystickNode.addChild(stickNode);

        const stickGraphics = stickNode.addComponent(Graphics);
        this.drawCircle(stickGraphics, new Color(200, 200, 200, 200), 40);

        // Component
        const joystick = joystickNode.addComponent(Joystick);
        joystick.stick = stickNode;
        joystick.background = bgNode;
        joystick.maxRadius = 80;

        const transform = joystickNode.addComponent(UITransform); // 必须有 UITransform

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
        
        const widget = node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignRight = true;
        widget.top = 50;
        widget.right = 150;

        const label = node.addComponent(Label);
        label.string = "Coins: 0";
        label.fontSize = 40;
        label.lineHeight = 50;
        label.color = new Color(255, 215, 0, 255); // 金色
        label.horizontalAlign = Label.HorizontalAlign.RIGHT; // 右对齐

        return label;
    }

    private static drawCircle(graphics: Graphics, color: Color, radius: number): void {
        graphics.clear();
        graphics.fillColor = color;
        graphics.circle(0, 0, radius);
        graphics.fill();
    }
}
