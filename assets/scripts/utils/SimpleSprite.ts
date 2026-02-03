import {
    _decorator,
    Component,
    Node,
    Sprite,
    Color,
    UITransform,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    resources,
    Graphics,
    Vec3,
} from 'cc';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 简单精灵生成器
 * 用于快速创建测试用的彩色方块精灵
 * 在编辑器中可预览
 */
@ccclass('SimpleSprite')
@executeInEditMode
export class SimpleSprite extends Component {
    @property
    public width: number = 50;

    @property
    public height: number = 50;

    @property
    public color: Color = new Color(255, 255, 255, 255);

    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this.createSprite();
    }

    protected onEnable(): void {
        this.createSprite();
    }

    /**
     * 创建彩色方块精灵
     */
    public createSprite(): void {
        // 确保有 UITransform
        let uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = this.node.addComponent(UITransform);
        }
        uiTransform.setContentSize(this.width, this.height);

        // 使用 Graphics 组件绘制
        let graphics = this.node.getComponent(Graphics);
        if (!graphics) {
            graphics = this.node.addComponent(Graphics);
        }
        this._graphics = graphics;

        // 绘制填充矩形
        graphics.clear();
        graphics.fillColor = this.color;
        graphics.rect(-this.width / 2, -this.height / 2, this.width, this.height);
        graphics.fill();
    }

    /**
     * 更新颜色
     */
    public setColor(color: Color): void {
        this.color = color;
        this.createSprite();
    }

    /**
     * 更新大小
     */
    public setSize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.createSprite();
    }
}

/**
 * 预设颜色
 */
export const SpriteColors = {
    ENEMY: new Color(220, 60, 60, 255), // 红色
    SOLDIER: new Color(60, 140, 220, 255), // 蓝色
    HERO: new Color(255, 200, 50, 255), // 金色
    COIN: new Color(255, 215, 0, 255), // 金黄色
    BUILDING: new Color(100, 180, 100, 255), // 绿色
    BASE: new Color(150, 100, 200, 255), // 紫色
};
