import {
    _decorator,
    Component,
    Node,
    Vec3,
    MeshRenderer,
    primitives,
    utils,
    Material,
    Color,
    Label,
    Canvas,
    UITransform,
    Widget,
    view,
    Camera,
} from 'cc';
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { GameEvents } from './data/GameEvents';

const { ccclass, property } = _decorator;

/**
 * 完整 MVP 测试控制器
 * 包含敌人、士兵、战斗、HUD
 */
@ccclass('TestGameController')
export class TestGameController extends Component {
    // === 配置 ===
    @property
    public enemySpawnInterval: number = 2;

    @property
    public maxEnemies: number = 15;

    @property
    public soldierSpawnInterval: number = 3;

    @property
    public maxSoldiers: number = 5;

    // === 内部状态 ===
    private _enemyTimer: number = 0;
    private _soldierTimer: number = 0;
    private _enemies: Node[] = [];
    private _soldiers: Node[] = [];
    private _container: Node | null = null;

    // HUD
    private _hudCanvas: Node | null = null;
    private _coinLabel: Label | null = null;
    private _waveLabel: Label | null = null;
    private _enemyLabel: Label | null = null;

    // === 生命周期 ===

    protected onLoad(): void {
        console.log('╔════════════════════════════════════╗');
        console.log('║     KingShit MVP - 游戏启动        ║');
        console.log('╚════════════════════════════════════╝');

        this._container = new Node('GameContainer');
        this.node.addChild(this._container);

        GameManager.instance.initialize();
        this.createHUD();
        this.registerEvents();
    }

    protected start(): void {
        GameManager.instance.startGame();
        console.log(`[Game] 初始金币: ${GameManager.instance.coins}`);

        // 立即生成第一个敌人和士兵
        this.spawnEnemy();
        this.spawnSoldier();
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 生成敌人
        this._enemyTimer += dt;
        if (this._enemyTimer >= this.enemySpawnInterval && this._enemies.length < this.maxEnemies) {
            this._enemyTimer = 0;
            this.spawnEnemy();
        }

        // 生成士兵
        this._soldierTimer += dt;
        if (
            this._soldierTimer >= this.soldierSpawnInterval &&
            this._soldiers.length < this.maxSoldiers
        ) {
            this._soldierTimer = 0;
            this.spawnSoldier();
        }

        // 更新单位
        this.updateEnemies(dt);
        this.updateSoldiers(dt);
        this.checkCombat();
    }

    protected onDestroy(): void {
        EventManager.instance.offAllByTarget(this);
    }

    // === HUD ===

    private createHUD(): void {
        // 创建 Canvas
        this._hudCanvas = new Node('HUDCanvas');
        this.node.addChild(this._hudCanvas);

        const canvas = this._hudCanvas.addComponent(Canvas);
        const canvasTransform = this._hudCanvas.addComponent(UITransform);
        const size = view.getVisibleSize();
        canvasTransform.setContentSize(size.width, size.height);

        // 创建 2D 摄像机
        const camNode = new Node('HUDCamera');
        this._hudCanvas.addChild(camNode);
        const cam = camNode.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = size.height / 2;
        cam.priority = 1;

        // 创建标签容器
        const labelContainer = new Node('Labels');
        this._hudCanvas.addChild(labelContainer);
        const lcTransform = labelContainer.addComponent(UITransform);
        lcTransform.setContentSize(size.width, size.height);

        // 金币标签
        this._coinLabel = this.createLabel('💰 100', -size.width / 2 + 100, size.height / 2 - 30);
        labelContainer.addChild(this._coinLabel.node);

        // 波次标签
        this._waveLabel = this.createLabel('🌊 Wave 1', 0, size.height / 2 - 30);
        labelContainer.addChild(this._waveLabel.node);

        // 敌人数量标签
        this._enemyLabel = this.createLabel('👾 0', size.width / 2 - 100, size.height / 2 - 30);
        labelContainer.addChild(this._enemyLabel.node);

        this.updateHUD();
    }

    private createLabel(text: string, x: number, y: number): Label {
        const node = new Node('Label');
        const transform = node.addComponent(UITransform);
        transform.setContentSize(200, 40);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 24;
        label.color = new Color(255, 255, 255, 255);

        node.setPosition(x, y, 0);
        return label;
    }

    private updateHUD(): void {
        if (this._coinLabel) {
            this._coinLabel.string = `💰 ${GameManager.instance.coins}`;
        }
        if (this._enemyLabel) {
            this._enemyLabel.string = `👾 ${this._enemies.length}`;
        }
    }

    private registerEvents(): void {
        EventManager.instance.on(GameEvents.COIN_CHANGED, this.updateHUD, this);
    }

    // === 敌人系统 ===

    private spawnEnemy(): void {
        if (!this._container) return;

        const enemy = this.createCube('Enemy', new Color(220, 60, 60, 255)); // 红色
        const pos = this.getEdgePosition();
        enemy.setPosition(pos.x, pos.y, 0);
        enemy.setScale(0.4, 0.4, 0.4);

        // 添加生命值数据
        (enemy as any).hp = 30;
        (enemy as any).speed = 1.5 + Math.random() * 0.5;

        this._container.addChild(enemy);
        this._enemies.push(enemy);

        console.log(`[Enemy] 👾 敌人出现! 总数: ${this._enemies.length}`);
        this.updateHUD();
    }

    private updateEnemies(dt: number): void {
        const toRemove: Node[] = [];

        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            const pos = enemy.position;
            const dist = pos.length();
            const speed = (enemy as any).speed || 1.5;

            if (dist < 0.5) {
                // 敌人到达基地，游戏损失生命
                toRemove.push(enemy);
                console.log('[Enemy] ⚠️ 敌人突破防线!');
            } else {
                // 向中心移动
                const dir = new Vec3(-pos.x / dist, -pos.y / dist, 0);
                enemy.setPosition(pos.x + dir.x * speed * dt, pos.y + dir.y * speed * dt, 0);
            }
        }

        this.removeEnemies(toRemove, false);
    }

    private removeEnemies(enemies: Node[], giveReward: boolean): void {
        for (const enemy of enemies) {
            const idx = this._enemies.indexOf(enemy);
            if (idx !== -1) {
                this._enemies.splice(idx, 1);
                if (giveReward) {
                    const reward = 5 + Math.floor(Math.random() * 5);
                    GameManager.instance.addCoins(reward);
                    console.log(`[Game] 💰 +${reward} 金币! 总计: ${GameManager.instance.coins}`);
                }
            }
            enemy.destroy();
        }
        this.updateHUD();
    }

    // === 士兵系统 ===

    private spawnSoldier(): void {
        if (!this._container) return;

        const soldier = this.createCube('Soldier', new Color(60, 140, 220, 255)); // 蓝色
        soldier.setPosition(0, 0, 0);
        soldier.setScale(0.35, 0.35, 0.35);

        // 添加数据
        (soldier as any).damage = 10;
        (soldier as any).speed = 2.5;
        (soldier as any).target = null;

        this._container.addChild(soldier);
        this._soldiers.push(soldier);

        console.log(`[Soldier] 🛡️ 士兵出动! 总数: ${this._soldiers.length}`);
    }

    private updateSoldiers(dt: number): void {
        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const target = this.findNearestEnemy(soldier);
            if (!target) continue;

            const pos = soldier.position;
            const targetPos = target.position;
            const dx = targetPos.x - pos.x;
            const dy = targetPos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const speed = (soldier as any).speed || 2.5;

            if (dist > 0.6) {
                // 移向目标
                soldier.setPosition(
                    pos.x + (dx / dist) * speed * dt,
                    pos.y + (dy / dist) * speed * dt,
                    0
                );
            }

            (soldier as any).target = target;
        }
    }

    private findNearestEnemy(soldier: Node): Node | null {
        let nearest: Node | null = null;
        let minDist = Infinity;

        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;
            const dx = enemy.position.x - soldier.position.x;
            const dy = enemy.position.y - soldier.position.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }

        return nearest;
    }

    // === 战斗系统 ===

    private checkCombat(): void {
        const killedEnemies: Node[] = [];

        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const target = (soldier as any).target as Node;
            if (!target || !target.isValid) continue;

            const dx = target.position.x - soldier.position.x;
            const dy = target.position.y - soldier.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.6) {
                // 攻击敌人
                const damage = (soldier as any).damage || 10;
                (target as any).hp -= damage;

                if ((target as any).hp <= 0 && !killedEnemies.includes(target)) {
                    killedEnemies.push(target);
                    console.log('[Combat] ⚔️ 敌人被击败!');
                }
            }
        }

        this.removeEnemies(killedEnemies, true);
    }

    // === 工具方法 ===

    private createCube(name: string, color: Color): Node {
        const node = new Node(name);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1, height: 1, length: 1 })
        );

        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', color);
        renderer.material = material;

        return node;
    }

    private getEdgePosition(): { x: number; y: number } {
        const range = 6;
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
}
