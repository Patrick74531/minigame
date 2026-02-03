import { _decorator, Node, Color, MeshRenderer, primitives, utils, Material, Label, UITransform, Billboard, RenderRoot2D, Layers, BoxCollider, ITriggerEvent, Vec3, RigidBody } from 'cc';
import { BaseComponent } from '../../core/base/BaseComponent';
import { BuildingRegistry, BuildingTypeConfig } from './BuildingRegistry';
import { EventManager } from '../../core/managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { HUDManager } from '../../ui/HUDManager';
import { Hero } from '../units/Hero';

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

    // === Physics Implementation ===

    // Flag to track hero presence
    private _heroInArea: boolean = false;
    private _heroRef: Hero | null = null;

    protected start(): void {
        this.setupPhysics();

        // Previous start logic
        console.log(`[BuildingPad] start() \u88ab\u8c03\u7528, buildingTypeId=${this.buildingTypeId}`);
        const config = BuildingRegistry.instance.get(this.buildingTypeId);
        this._config = config ?? null;
        if (!this._config) {
            console.error(`[BuildingPad] \u672a\u627e\u5230\u5efa\u7b51\u7c7b\u578b: ${this.buildingTypeId}`);
            return;
        }

        this.createVisuals();
        console.log(`[BuildingPad] 初始化: ${this._config.name}, 需要 ${this._config.cost} 金币`);
    }

    private setupPhysics(): void {
        // Add RigidBody (Static) - Required for consistent Trigger events in some engines
        let rb = this.node.getComponent(RigidBody);
        if (!rb) {
            rb = this.node.addComponent(RigidBody);
            rb.type = RigidBody.Type.STATIC;
        }

        let col = this.node.getComponent(BoxCollider);
        if (!col) {
            col = this.node.addComponent(BoxCollider);
        }
        
        // Force update properties even if component existed (e.g. from Prefab)
        col.isTrigger = true;
        // Tall box to catch Hero jumping or slight Y offsets
        col.center = new Vec3(0, 2.5, 0); 
        col.size = new Vec3(this.collectRadius, 5.0, this.collectRadius);
        
        col.setGroup(1 << 2); // BUILDING_PAD
        col.setMask(1 << 0); // Collide with HERO
        
        col.on('onTriggerEnter', this.onTriggerEnter, this);
        col.on('onTriggerExit', this.onTriggerExit, this);
        
        console.log(`[BuildingPad] Physics Setup Complete. Collider Size: ${col.size}, Trigger: ${col.isTrigger}`);
    }

    /**
     * Physics Event: Player enters pad
     */
    private onTriggerEnter(event: ITriggerEvent): void {
        const otherNode = event.otherCollider.node;
        console.log(`[BuildingPad] OnTriggerEnter: this=${this.node.name}, other=${otherNode.name}, group=${event.otherCollider.getGroup()}`);
        console.log(`[BuildingPad] Scale: ${this.node.getWorldScale()}`);

        let hero = otherNode.getComponent(Hero);
        if (!hero) {
            // Fallback for circular dependency issues
            console.warn('[BuildingPad] Hero class check failed, trying string "Hero"');
            hero = otherNode.getComponent('Hero') as Hero;
        }

        if (hero) {
            console.log('[BuildingPad] Hero Component Found!');
            this._heroInArea = true;
            this._heroRef = hero;
            
            // Show Info - Use imported HUDManager directly
            if (HUDManager.instance) {
                 HUDManager.instance.showBuildingInfo(
                    this.buildingName,
                    this.requiredCoins,
                    this.collectedCoins
                );
            }
        } else {
            console.log('[BuildingPad] Not a Hero component');
        }
    }

    /**
     * Physics Event: Player exits pad
     */
    private onTriggerExit(event: ITriggerEvent): void {
        const otherNode = event.otherCollider.node;
        const hero = otherNode.getComponent(Hero);
        if (hero) {
            this._heroInArea = false;
            this._heroRef = null;
            
            // Hide Info
            if (HUDManager.instance) {
                HUDManager.instance.hideBuildingInfo();
            }
        }
    }

    /**
     * Standard Update Loop for Interaction
     */
    protected update(dt: number): void {
        if (this._heroInArea && this._heroRef && this._state === BuildingPadState.WAITING) {
            // Check if hero still valid
            if (!this._heroRef.node || !this._heroRef.node.isValid) {
                this._heroInArea = false;
                this._heroRef = null;
                return;
            }

            // Perform Collection (throttled by collect timer or frame)
            if (this._heroRef.coinCount > 0) {
                 const collected = this.tryCollectCoin(this._heroRef.coinCount);
                 if (collected > 0) {
                      this._heroRef.removeCoin(collected);
                      
                      // Update HUD periodically or on change
                      if (HUDManager.instance) {
                          HUDManager.instance.updateCoinDisplay(this._heroRef.coinCount);
                      }
                 }
            }
        }
    }

    // Removed checkHeroInRange (Logic moved to Physics Trigger)

    /**
     * 创建视觉元素（圆盘和数字）
     */
    private createVisuals(): void {
        const padNode = new Node('PadVisual');
        this.node.addChild(padNode);
        
        const renderer = padNode.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1.2, height: 0.1, length: 1.2 })
        );

        this._padMaterial = new Material();
        this._padMaterial.initialize({ effectName: 'builtin-unlit' });
        this._padMaterial.setProperty('mainColor', new Color(255, 200, 0, 255)); 

        renderer.material = this._padMaterial;
        padNode.setPosition(0, 0.05, 0);

        const labelRoot = new Node('LabelRoot');
        this.node.addChild(labelRoot);
        labelRoot.addComponent(RenderRoot2D);
        labelRoot.addComponent(Billboard);
        
        const labelNode = new Node('CostLabel');
        labelRoot.addChild(labelNode);
        labelNode.layer = 1;

        const uiTransform = labelNode.addComponent(UITransform);
        uiTransform.setContentSize(400, 200);

        this._label = labelNode.addComponent(Label);
        this._label.string = `${this.requiredCoins}`;
        this._label.fontSize = 80; 
        this._label.lineHeight = 80;
        this._label.color = new Color(0, 0, 0, 255);
        this._label.isBold = true;
        this._label.horizontalAlign = Label.HorizontalAlign.CENTER;
        this._label.verticalAlign = Label.VerticalAlign.CENTER;

        labelRoot.setScale(0.015, 0.015, 0.015);
        labelRoot.setPosition(0, 0.6, 0);
    }

    private updateDisplay(): void {
        if (this._label) {
            const remaining = this.requiredCoins - this._collectedCoins;
            this._label.string = `${remaining}`;
            
            if (this.progress >= 1) {
                this._label.color = new Color(0, 255, 0, 255);
            } else if (this.progress >= 0.5) {
                this._label.color = new Color(255, 255, 0, 255);
            } else {
                this._label.color = new Color(255, 215, 0, 255);
            }
        }
    }

    public setHeroNode(hero: Node): void {
        this._heroNode = hero;
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
