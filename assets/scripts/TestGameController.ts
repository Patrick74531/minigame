import {
    _decorator,
    Component,
    Node,
    instantiate,
    Prefab,
    Vec2,
    Vec3,
    Graphics,
    Color,
    UITransform,
    Canvas,
    Camera,
} from 'cc';
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { PoolManager } from './core/managers/PoolManager';
import { WaveManager } from './gameplay/wave/WaveManager';
import { GameEvents } from './data/GameEvents';
import { GameConfig } from './data/GameConfig';

const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 简化版测试控制器
 * 不需要任何预制体，直接用代码生成测试对象
 * 适合新手快速验证框架是否工作
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
    private _enemyContainer: Node | null = null;

    protected onLoad(): void {
        console.log('[TestGameController] onLoad - 初始化游戏...');

        // 创建敌人容器
        this._enemyContainer = new Node('EnemyContainer');
        this.node.addChild(this._enemyContainer);

        // 初始化管理器
        GameManager.instance.initialize();

        console.log('[TestGameController] 游戏初始化完成！');
    }

    protected start(): void {
        if (this.autoStart) {
            console.log('[TestGameController] 自动开始游戏...');
            GameManager.instance.startGame();
            console.log(`[TestGameController] 初始金币: ${GameManager.instance.coins}`);
        }
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 定时生成敌人
        this._spawnTimer += dt;
        if (this._spawnTimer >= this.spawnInterval && this._enemyCount < this.maxEnemies) {
            this._spawnTimer = 0;
            this.spawnTestEnemy();
        }
    }

    /**
     * 生成测试敌人（红色方块）
     */
    private spawnTestEnemy(): void {
        if (!this._enemyContainer) return;

        // 创建敌人节点
        const enemy = new Node(`Enemy_${this._enemyCount}`);
        this._enemyContainer.addChild(enemy);

        // 添加 UITransform
        const uiTransform = enemy.addComponent(UITransform);
        uiTransform.setContentSize(40, 40);

        // 添加 Graphics 绘制红色方块
        const graphics = enemy.addComponent(Graphics);
        graphics.fillColor = new Color(220, 60, 60, 255);
        graphics.rect(-20, -20, 40, 40);
        graphics.fill();

        // 设置随机位置（屏幕边缘）
        const pos = this.getRandomEdgePosition();
        enemy.setPosition(pos.x, pos.y, 0);

        this._enemyCount++;
        console.log(
            `[TestGameController] 生成敌人 #${this._enemyCount} 在位置 (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`
        );

        // 让敌人移动到中心
        this.moveEnemyToCenter(enemy);
    }

    /**
     * 获取屏幕边缘的随机位置
     */
    private getRandomEdgePosition(): Vec2 {
        const screenW = 480;
        const screenH = 320;
        const side = Math.floor(Math.random() * 4);

        switch (side) {
            case 0:
                return new Vec2(Math.random() * screenW - screenW / 2, screenH / 2 + 30);
            case 1:
                return new Vec2(Math.random() * screenW - screenW / 2, -screenH / 2 - 30);
            case 2:
                return new Vec2(-screenW / 2 - 30, Math.random() * screenH - screenH / 2);
            default:
                return new Vec2(screenW / 2 + 30, Math.random() * screenH - screenH / 2);
        }
    }

    /**
     * 移动敌人到中心
     */
    private moveEnemyToCenter(enemy: Node): void {
        const speed = 50;

        const moveUpdate = (dt: number) => {
            if (!enemy.isValid) return;

            const pos = enemy.position;
            const dir = new Vec3(-pos.x, -pos.y, 0).normalize();
            const dist = pos.length();

            if (dist < 30) {
                // 到达中心，模拟死亡
                console.log(`[TestGameController] 敌人到达中心，获得金币!`);
                GameManager.instance.addCoins(5);
                console.log(`[TestGameController] 当前金币: ${GameManager.instance.coins}`);
                enemy.destroy();
                this._enemyCount--;
                return;
            }

            enemy.setPosition(pos.x + dir.x * speed * dt, pos.y + dir.y * speed * dt, 0);
        };

        // 使用 schedule 实现移动
        this.schedule(moveUpdate, 0);
    }
}
