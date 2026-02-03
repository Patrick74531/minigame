import {
    _decorator,
    Component,
    Node,
    Vec3,
    SpriteRenderer,
    Color,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    resources,
    MeshRenderer,
    primitives,
    utils,
    Material,
    gfx,
} from 'cc';
import { GameManager } from './core/managers/GameManager';

const { ccclass, property } = _decorator;

/**
 * 测试控制器 - 使用 3D 方块作为测试对象
 * 不需要 Canvas，直接在 3D 场景中渲染可见
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
    private _container: Node | null = null;
    private _enemies: Node[] = [];

    protected onLoad(): void {
        console.log('========================================');
        console.log('[TestGame] 游戏启动!');
        console.log('========================================');

        // 创建容器
        this._container = new Node('Container');
        this.node.addChild(this._container);

        // 初始化游戏管理器
        GameManager.instance.initialize();
    }

    protected start(): void {
        if (this.autoStart) {
            GameManager.instance.startGame();
            console.log(`[TestGame] 初始金币: ${GameManager.instance.coins}`);

            // 立即生成第一个敌人
            this.spawnTestEnemy();
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

        // 更新所有敌人的移动
        this.updateEnemies(dt);
    }

    /**
     * 生成测试敌人（使用 3D Cube）
     */
    private spawnTestEnemy(): void {
        if (!this._container) return;

        // 创建 3D 立方体
        const enemy = new Node(`Enemy_${this._enemyCount}`);
        this._container.addChild(enemy);

        // 添加 MeshRenderer 并使用内置立方体
        const renderer = enemy.addComponent(MeshRenderer);

        // 使用内置的 box primitive
        renderer.mesh = utils.MeshUtils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));

        // 设置材质颜色为红色
        const material = new Material();
        material.initialize({
            effectName: 'builtin-unlit',
            defines: {},
            states: {},
        });
        material.setProperty('mainColor', new Color(220, 60, 60, 255));
        renderer.material = material;

        // 设置位置 (在 3D 空间中)
        const pos = this.getRandomEdgePosition();
        enemy.setPosition(pos.x, pos.y, 0);
        enemy.setScale(0.5, 0.5, 0.5);

        this._enemies.push(enemy);
        this._enemyCount++;

        console.log(`[TestGame] 👾 敌人 #${this._enemyCount} 出现!`);
    }

    private getRandomEdgePosition(): { x: number; y: number } {
        // 在 3D 空间中，使用较小的范围
        const range = 5;
        const side = Math.floor(Math.random() * 4);

        switch (side) {
            case 0:
                return { x: Math.random() * range * 2 - range, y: range + 1 };
            case 1:
                return { x: Math.random() * range * 2 - range, y: -range - 1 };
            case 2:
                return { x: -range - 1, y: Math.random() * range * 2 - range };
            default:
                return { x: range + 1, y: Math.random() * range * 2 - range };
        }
    }

    private updateEnemies(dt: number): void {
        const speed = 2;
        const toRemove: Node[] = [];

        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            const pos = enemy.position;
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);

            if (dist < 0.5) {
                // 到达中心
                toRemove.push(enemy);
                console.log(`[TestGame] 💰 敌人被击败! +5 金币`);
                GameManager.instance.addCoins(5);
                console.log(`[TestGame] 当前金币: ${GameManager.instance.coins}`);
            } else {
                // 向中心移动
                const dirX = -pos.x / dist;
                const dirY = -pos.y / dist;
                enemy.setPosition(pos.x + dirX * speed * dt, pos.y + dirY * speed * dt, 0);
            }
        }

        // 移除到达中心的敌人
        for (const enemy of toRemove) {
            const idx = this._enemies.indexOf(enemy);
            if (idx !== -1) {
                this._enemies.splice(idx, 1);
                this._enemyCount--;
            }
            enemy.destroy();
        }
    }
}
