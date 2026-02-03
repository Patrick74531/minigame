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
} from 'cc';
import { GameManager } from './core/managers/GameManager';

const { ccclass, property } = _decorator;

/**
 * MVP 测试控制器 (无 Canvas 版本)
 * 只使用 3D 立方体，确保可见
 */
@ccclass('TestGameController')
export class TestGameController extends Component {
    @property
    public enemySpawnInterval: number = 2;

    @property
    public maxEnemies: number = 15;

    @property
    public soldierSpawnInterval: number = 3;

    @property
    public maxSoldiers: number = 5;

    private _enemyTimer: number = 0;
    private _soldierTimer: number = 0;
    private _enemies: Node[] = [];
    private _soldiers: Node[] = [];
    private _container: Node | null = null;

    protected onLoad(): void {
        console.log('╔════════════════════════════════════╗');
        console.log('║     KingShit MVP - 游戏启动        ║');
        console.log('╚════════════════════════════════════╝');

        this._container = new Node('GameContainer');
        this.node.addChild(this._container);

        GameManager.instance.initialize();
    }

    protected start(): void {
        GameManager.instance.startGame();
        console.log(`[Game] 💰 初始金币: ${GameManager.instance.coins}`);
        console.log('[Game] 🔴 红色 = 敌人 | 🔵 蓝色 = 士兵');

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
        if (this._soldierTimer >= this.soldierSpawnInterval && this._soldiers.length < this.maxSoldiers) {
            this._soldierTimer = 0;
            this.spawnSoldier();
        }

        this.updateEnemies(dt);
        this.updateSoldiers(dt);
        this.checkCombat();
    }

    // === 敌人 ===

    private spawnEnemy(): void {
        if (!this._container) return;

        const enemy = this.createCube('Enemy', new Color(220, 60, 60, 255));
        const pos = this.getEdgePosition();
        enemy.setPosition(pos.x, pos.y, 0);
        enemy.setScale(0.4, 0.4, 0.4);

        (enemy as any).hp = 30;
        (enemy as any).speed = 1.5 + Math.random() * 0.5;

        this._container.addChild(enemy);
        this._enemies.push(enemy);

        console.log(`[Enemy] 👾 敌人出现! (${this._enemies.length}只)`);
    }

    private updateEnemies(dt: number): void {
        const toRemove: Node[] = [];

        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            const pos = enemy.position;
            const dist = pos.length();
            const speed = (enemy as any).speed || 1.5;

            if (dist < 0.5) {
                toRemove.push(enemy);
                console.log('[Enemy] ⚠️ 敌人突破防线!');
            } else {
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
    }

    // === 士兵 ===

    private spawnSoldier(): void {
        if (!this._container) return;

        const soldier = this.createCube('Soldier', new Color(60, 140, 220, 255));
        soldier.setPosition(0, 0, 0);
        soldier.setScale(0.35, 0.35, 0.35);

        (soldier as any).damage = 10;
        (soldier as any).speed = 2.5;
        (soldier as any).target = null;

        this._container.addChild(soldier);
        this._soldiers.push(soldier);

        console.log(`[Soldier] 🛡️ 士兵出动! (${this._soldiers.length}个)`);
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

    // === 战斗 ===

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

    // === 工具 ===

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
}
