import { _decorator, Node, Color, MeshRenderer, primitives, utils, Material, Label, UITransform, Billboard, RenderRoot2D, Layers } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { BuildingRegistry, BuildingTypeConfig } from './BuildingRegistry';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';

const { ccclass, property } = _decorator;

/**
 * 建造点状态
 */
export enum BuildingPadState {
    WAITING,    // 等待金币
    BUILDING,   // 建造中
    COMPLETE    // 建造完成
}

/**
 * 建造点组件
 * 显示圆盘和所需金币数，检测英雄进入并收集金币
 */
@ccclass('BuildingPad')
export class BuildingPad extends BaseComponent {
    /** 建筑类型 ID */
    @property
    public buildingTypeId: string = 'barracks';

    /** 收集范围半径 */
    @property
    public collectRadius: number = 3.0; // 增大检测半径，更容易触发

    /** 每次收集金币数量 */
    @property
    public collectRate: number = 1;

    /** 收集间隔（秒） */
    @property
    public collectInterval: number = 0.1;

    // 内部状态
    private _config: BuildingTypeConfig | null = null;
    private _collectedCoins: number = 0;
    private _state: BuildingPadState = BuildingPadState.WAITING;
    private _collectTimer: number = 0;
    private _label: Label | null = null;
    private _heroInRange: boolean = false;
    private _heroNode: Node | null = null;
    private _padMaterial: Material | null = null;

    // === Getters ===

    public get state(): BuildingPadState {
        return this._state;
    }

    public get collectedCoins(): number {
        return this._collectedCoins;
    }

    public get requiredCoins(): number {
        return this._config?.cost ?? 0;
    }

    public get progress(): number {
        if (this.requiredCoins === 0) return 0;
        return this._collectedCoins / this.requiredCoins;
    }

    public get isComplete(): boolean {
        return this._collectedCoins >= this.requiredCoins;
    }

    public get buildingName(): string {
        return this._config?.name ?? '未知建筑';
    }

    // === 生命周期 ===

    protected initialize(): void {
        // 初始化逻辑保留为空，延迟到 start 执行，确保属性已被赋值
    }

    protected start(): void {
        console.log(`[BuildingPad] start() \u88ab\u8c03\u7528, buildingTypeId=${this.buildingTypeId}`);
        
        // 获取建筑配置
        const config = BuildingRegistry.instance.get(this.buildingTypeId);
        this._config = config ?? null;
        if (!this._config) {
            console.error(`[BuildingPad] \u672a\u627e\u5230\u5efa\u7b51\u7c7b\u578b: ${this.buildingTypeId}`);
            return;
        }

        // 创建视觉元素
        this.createVisuals();

        console.log(`[BuildingPad] 初始化: ${this._config.name}, 需要 ${this._config.cost} 金币`);
    }

    protected cleanup(): void {
        if (this._padMaterial) {
            this._padMaterial.destroy();
            this._padMaterial = null;
        }
    }

    /**
     * 创建视觉元素（圆盘和数字）
     */
    private createVisuals(): void {
        // 1. 创建建造点底座 (使用简单的 Box，与 BuildingFactory 相同的方式)
        const padNode = new Node('PadVisual');
        this.node.addChild(padNode);
        
        console.log(`[BuildingPad] 创建视觉节点: ${this._config?.name}`);
        
        // 添加 MeshRenderer
        const renderer = padNode.addComponent(MeshRenderer);
        
        // 使用 Box 而不是 Cylinder，确保可见
        // 使用 Box，调整为扁平状躺在地面上 (XZ 平面)
        // Y 轴是垂直高度，所以 height 应该很小
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1.2, height: 0.1, length: 1.2 })
        );

        // 创建材质（完全复制 BuildingFactory 的做法）
        this._padMaterial = new Material();
        this._padMaterial.initialize({ effectName: 'builtin-unlit' });
        // 亮黄色，确保明显
        this._padMaterial.setProperty('mainColor', new Color(255, 200, 0, 255)); 

        renderer.material = this._padMaterial;

        // 位置设置：稍微抬高 y 避免与地面 Z-fighting
        padNode.setPosition(0, 0.05, 0);
        
        console.log(`[BuildingPad] 视觉节点创建完成，位置: ${padNode.position.toString()}`);

        // 2. 创建数字标签 (使用 RenderRoot2D)
        const labelRoot = new Node('LabelRoot');
        this.node.addChild(labelRoot);
        
        // 关键1：添加 RenderRoot2D 组件
        labelRoot.addComponent(RenderRoot2D);
        
        // 关键2：添加 Billboard，确保始终面向摄像机
        labelRoot.addComponent(Billboard);
        
        // 创建 Label 节点
        const labelNode = new Node('CostLabel');
        labelRoot.addChild(labelNode);

        // 关键3：设置 Layer 为 DEFAULT (1)，这样主摄像机才能看到它！不要设为 UI_2D
        // Cocos Creator 3.x 默认 3D 场景层是 DEFAULT
        labelNode.layer = 1; // Layers.Enum.DEFAULT

        // 添加 UITransform
        const uiTransform = labelNode.addComponent(UITransform);
        uiTransform.setContentSize(400, 200); // 足够大的画布

        // 添加 Label
        this._label = labelNode.addComponent(Label);
        this._label.string = `${this.requiredCoins}`;
        this._label.fontSize = 80; 
        this._label.lineHeight = 80;
        this._label.color = new Color(0, 0, 0, 255); // 黑色字体
        this._label.isBold = true;
        this._label.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._label.verticalAlign = Label.VerticalAlign.CENTER;
        this._label.overflow = Label.Overflow.NONE;
        
        // 关键4：调整缩放。UI 单位是像素，3D 单位是米。
        // 0.01 缩放意味着 100px = 1米。
        labelRoot.setScale(0.015, 0.015, 0.015);
        
        // 抬高一点
        labelRoot.setPosition(0, 0.6, 0);
        
    }

    /**
     * 更新显示
     */
    private updateDisplay(): void {
        if (this._label) {
            const remaining = this.requiredCoins - this._collectedCoins;
            this._label.string = `${remaining}`;
            
            // 根据进度改变颜色
            if (this.progress >= 1) {
                this._label.color = new Color(0, 255, 0, 255); // 绿色
            } else if (this.progress >= 0.5) {
                this._label.color = new Color(255, 255, 0, 255); // 黄色
            } else {
                this._label.color = new Color(255, 215, 0, 255); // 金色
            }
        }
    }

    // === 公共方法 ===

    /**
     * 设置英雄节点引用（由 GameController 设置）
     */
    public setHeroNode(hero: Node): void {
        this._heroNode = hero;
    }

    /**
     * 检测英雄是否在范围内
     */
    public checkHeroInRange(): boolean {
        if (!this._heroNode || !this._heroNode.isValid) return false;

        const heroPos = this._heroNode.position;
        const padPos = this.node.position;
        const dx = heroPos.x - padPos.x;
        const dy = heroPos.y - padPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist < this.collectRadius;
    }

    /**
     * 尝试从英雄收集金币
     * @param heroCoins 英雄当前持有的金币数
     * @returns 实际收集的金币数
     */
    public tryCollectCoin(heroCoins: number): number {
        if (this._state !== BuildingPadState.WAITING) return 0;
        if (heroCoins <= 0) return 0;

        const needed = this.requiredCoins - this._collectedCoins;
        const toCollect = Math.min(this.collectRate, heroCoins, needed);

        if (toCollect > 0) {
            this._collectedCoins += toCollect;
            this.updateDisplay();

            // 检查是否建造完成
            if (this.isComplete) {
                this.onBuildComplete();
            }
        }

        return toCollect;
    }

    /**
     * 建造完成
     */
    private onBuildComplete(): void {
        this._state = BuildingPadState.COMPLETE;
        
        console.log(`[BuildingPad] 建造完成: ${this._config?.name}`);

        // 发送建造完成事件
        EventManager.instance.emit(GameEvents.BUILDING_CONSTRUCTED, {
            padNode: this.node,
            buildingTypeId: this.buildingTypeId,
            position: this.node.position.clone()
        });
    }

    /**
     * 重置建造点
     */
    public reset(): void {
        this._collectedCoins = 0;
        this._state = BuildingPadState.WAITING;
        this.updateDisplay();
    }
}
