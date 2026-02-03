import {
    _decorator,
    Component,
    Node,
    Vec3,
    Graphics,
    Color,
    UITransform,
    Canvas,
    Camera,
    Widget,
    view,
} from 'cc';
import { GameManager } from './core/managers/GameManager';

const { ccclass, property } = _decorator;

/**
 * 简化版 2D 测试控制器
 * 自动创建 Canvas 和 2D Camera，无需任何手动配置
 */
@ccclass('TestGameController')
export class TestGameController extends Component {
    @property
    public autoStart: boolean = true;

    @property
    public spawnInterval: number = 2;

    @property
    public maxEnemies: number = 10;

    private _spawnTimer: number = 0;
    private _enemyCount: number = 0;
    private _canvas: Node | null = null;
    private _enemyContainer: Node | null = null;

    protected onLoad(): void {
        console.log('[TestGame] ========== 游戏启动 ==========');

        // 创建 2D Canvas (这是 2D 渲染的关键!)
        this._canvas = this.createCanvas();

        // 创建敌人容器（在 Canvas 下）
        this._enemyContainer = new Node('EnemyContainer');
        this._canvas.addChild(this._enemyContainer);

        // 初始化游戏管理器
        GameManager.instance.initialize();

        console.log('[TestGame] Canvas 和容器创建完成');
    }

    protected start(): void {
        if (this.autoStart) {
            GameManager.instance.startGame();
            console.log(`[TestGame] 游戏开始! 初始金币: ${GameManager.instance.coins}`);
            console.log('[TestGame] 等待敌人生成...');
        }
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        this._spawnTimer += dt;
        if (this._spawnTimer >= this.spawnInterval && this._enemyCount < this.maxEnemies) {
            this._spawnTimer = 0;
            this.spawnTestEnemy();
        }
    }

    /**
     * 创建 2D Canvas (必需，否则 UI 元素不会显示)
     */
    private createCanvas(): Node {
        const canvasNode = new Node('GameCanvas');
        this.node.addChild(canvasNode);

        // 添加 Canvas 组件
        const canvas = canvasNode.addComponent(Canvas);

        // 添加 UITransform
        const uiTransform = canvasNode.addComponent(UITransform);
        const visibleSize = view.getVisibleSize();
        uiTransform.setContentSize(visibleSize.width, visibleSize.height);

        // 创建 2D 摄像机
        const cameraNode = new Node('Camera2D');
        canvasNode.addChild(cameraNode);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = visibleSize.height / 2;

        console.log(`[TestGame] Canvas 尺寸: ${visibleSize.width} x ${visibleSize.height}`);

        return canvasNode;
    }

    /**
     * 生成测试敌人（红色方块）
     */
    private spawnTestEnemy(): void {
        if (!this._enemyContainer) return;

        const enemy = new Node(`Enemy_${this._enemyCount}`);
        this._enemyContainer.addChild(enemy);

        // UITransform (设置大小)
        const uiTransform = enemy.addComponent(UITransform);
        uiTransform.setContentSize(50, 50);

        // Graphics (绘制红色方块)
        const graphics = enemy.addComponent(Graphics);
        graphics.fillColor = new Color(220, 60, 60, 255); // 红色
        graphics.rect(-25, -25, 50, 50);
        graphics.fill();

        // 设置随机边缘位置
        const pos = this.getRandomEdgePosition();
        enemy.setPosition(pos.x, pos.y, 0);

        this._enemyCount++;
        console.log(
            `[TestGame] 👾 敌人 #${this._enemyCount} 出现! 位置: (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`
        );

        // 移动到中心
        this.moveEnemyToCenter(enemy);
    }

    private getRandomEdgePosition(): { x: number; y: number } {
        const w = 400;
        const h = 300;
        const side = Math.floor(Math.random() * 4);

        switch (side) {
            case 0:
                return { x: Math.random() * w - w / 2, y: h / 2 + 40 };
            case 1:
                return { x: Math.random() * w - w / 2, y: -h / 2 - 40 };
            case 2:
                return { x: -w / 2 - 40, y: Math.random() * h - h / 2 };
            default:
                return { x: w / 2 + 40, y: Math.random() * h - h / 2 };
        }
    }

    private moveEnemyToCenter(enemy: Node): void {
        const speed = 80;
        let active = true;

        const moveUpdate = (dt: number) => {
            if (!active || !enemy.isValid) return;

            const pos = enemy.position;
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);

            if (dist < 30) {
                active = false;
                console.log(`[TestGame] 💰 敌人被击败! +5 金币`);
                GameManager.instance.addCoins(5);
                console.log(`[TestGame] 当前金币: ${GameManager.instance.coins}`);
                enemy.destroy();
                this._enemyCount--;
                return;
            }

            // 向中心移动
            const dirX = -pos.x / dist;
            const dirY = -pos.y / dist;
            enemy.setPosition(pos.x + dirX * speed * dt, pos.y + dirY * speed * dt, 0);
        };

        this.schedule(moveUpdate, 0);
    }
}
