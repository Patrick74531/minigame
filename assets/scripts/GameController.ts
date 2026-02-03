import { _decorator, Component, Node, Label } from 'cc';
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { WaveManager } from './core/managers/WaveManager';
import { HUDManager } from './ui/HUDManager';
import { GameEvents } from './data/GameEvents';
import { UnitFactory } from './gameplay/units/UnitFactory';
import { BuildingFactory } from './gameplay/buildings/BuildingFactory';
import { CoinFactory } from './gameplay/economy/CoinFactory';
import { Unit } from './gameplay/units/Unit';
import { Hero } from './gameplay/units/Hero';
import { UIFactory } from './ui/UIFactory';
import { Joystick } from './ui/Joystick';

const { ccclass, property } = _decorator;

/**
 * 游戏主控制器 (组件化版本)
 * 职责: 协调各子系统，不包含具体业务逻辑
 * 目标: ~150 行
 */
@ccclass('GameController')
export class GameController extends Component {
    @property
    public maxWaves: number = 10;

    // === 容器 ===
    private _container: Node | null = null;
    private _enemyContainer: Node | null = null;
    private _soldierContainer: Node | null = null;
    private _buildingContainer: Node | null = null;
    private _coinContainer: Node | null = null;
    private _uiCanvas: Node | null = null;

    // === 实体 ===
    private _soldiers: Node[] = [];
    private _buildings: Node[] = [];
    private _coins: Node[] = [];
    private _base: Node | null = null;
    private _hero: Node | null = null;
    private _joystick: Joystick | null = null;

    // === 计时器 ===
    private _buildingTimer: number = 0;
    private _combatTimer: number = 0;
    private _coinTimer: number = 0;

    // === 生命周期 ===

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - Modular Version               ║');
        console.log('╚════════════════════════════════════════════════════╝');

        this.setupContainers();
        this.setupUI();
        this.setupEventListeners();

        // 初始化 Managers
        GameManager.instance.initialize();
        WaveManager.instance.initialize(this._enemyContainer!, this.maxWaves);
        HUDManager.instance.initialize(this._uiCanvas!);
    }

    protected onDestroy(): void {
        EventManager.instance.offAllByTarget(this);
        WaveManager.instance.cleanup();
        HUDManager.instance.cleanup();
    }

    protected start(): void {
        GameManager.instance.startGame();

        // 创建初始实体
        this._base = BuildingFactory.createBase(this._buildingContainer!, 0, 0, 100);
        this._buildings.push(BuildingFactory.createBarracks(this._buildingContainer!, -2.5, 1));
        this._buildings.push(BuildingFactory.createBarracks(this._buildingContainer!, 2.5, 1));
        this._hero = UnitFactory.createHero(this._soldierContainer!, 0, -1.5);

        console.log(`[Game] 💰 初始金币: ${GameManager.instance.coins}`);

        // 开始第一波
        this.scheduleOnce(() => WaveManager.instance.startWave(1), 2);
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 输入处理
        this.processInput();

        // 波次生成
        WaveManager.instance.update(dt);

        // 敌人移动
        this.updateEnemyMovement(dt);

        // 士兵 AI
        this.updateSoldierAI(dt);

        // 战斗处理 (每 0.2 秒)
        this._combatTimer += dt;
        if (this._combatTimer >= 0.2) {
            this._combatTimer = 0;
            this.processCombat();
        }

        // 建筑产兵检查
        this._buildingTimer += dt;
        if (this._buildingTimer >= 0.5) {
            this._buildingTimer = 0;
            this.updateBuildingSpawn();
        }

        // 金币拾取检测
        this._coinTimer += dt;
        if (this._coinTimer >= 0.1) {
            this._coinTimer = 0;
            this.updateCoinPickup();
        }

        // 波次完成检查
        WaveManager.instance.checkWaveComplete((bonus) => {
            GameManager.instance.addCoins(bonus);
            if (WaveManager.instance.hasMoreWaves()) {
                const nextWave = WaveManager.instance.currentWave + 1;
                this.scheduleOnce(() => WaveManager.instance.startWave(nextWave), 3);
            } else {
                console.log('🎉🎉🎉 通关! 🎉🎉🎉');
            }
        });
    }

    // === 初始化 ===

    private setupContainers(): void {
        this._container = new Node('GameContainer');
        this.node.addChild(this._container);

        this._enemyContainer = new Node('Enemies');
        this._soldierContainer = new Node('Soldiers');
        this._buildingContainer = new Node('Buildings');
        this._coinContainer = new Node('Coins');

        this._container.addChild(this._enemyContainer);
        this._container.addChild(this._soldierContainer);
        this._container.addChild(this._buildingContainer);
        this._container.addChild(this._coinContainer);
    }

    private setupUI(): void {
        this._uiCanvas = UIFactory.createUICanvas();
        this.node.addChild(this._uiCanvas);
        this._joystick = UIFactory.createJoystick(this._uiCanvas);
    }

    private setupEventListeners(): void {
        // 直接在 update 中处理敌人移动和战斗，不需要事件监听
    }

    // === 输入处理 ===

    private processInput(): void {
        if (this._joystick && this._hero) {
            const heroComp = this._hero.getComponent(Hero);
            if (heroComp) {
                heroComp.setInput(this._joystick.inputVector);
            }
        }
    }

    // === 建筑产兵 ===

    private updateBuildingSpawn(): void {
        if (this._soldiers.length >= 15) return;

        for (const building of this._buildings) {
            if (!building.isValid || building.name !== 'Barracks') continue;

            const data = (building as any).spawnData || { timer: 0 };
            data.timer = (data.timer || 0) + 0.5;

            if (data.timer >= 4) {
                data.timer = 0;
                const soldier = UnitFactory.createSoldier(
                    this._soldierContainer!,
                    building.position.x,
                    building.position.y
                );
                this._soldiers.push(soldier);
            }

            (building as any).spawnData = data;
        }
    }

    // === 金币拾取 ===

    private updateCoinPickup(): void {
        if (!this._hero || !this._hero.isValid) return;
        const heroComp = this._hero.getComponent(Hero);
        if (!heroComp) return;

        const toRemove: Node[] = [];

        for (const coin of this._coins) {
            if (!coin.isValid) continue;

            const dist = this.getDistance(this._hero, coin);
            if (dist < 1.0) {
                heroComp.addCoin(coin);
                toRemove.push(coin);
                HUDManager.instance.updateCoinDisplay(heroComp.coinCount);
            }
        }

        for (const coin of toRemove) {
            const idx = this._coins.indexOf(coin);
            if (idx !== -1) this._coins.splice(idx, 1);
        }
    }

    // === 基地伤害 ===

    private damageBase(damage: number): void {
        if (!this._base) return;

        const data = (this._base as any).baseData;
        if (!data) return;

        data.hp -= damage;
        console.log(`[Base] ⚠️ HP: ${data.hp}/${data.maxHp}`);

        if (data.hp <= 0) {
            console.log('� 游戏结束!');
            GameManager.instance.pause();
        }
    }

    // === 工具方法 ===

    private getDistance(a: Node, b: Node): number {
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // === 敌人移动 ===

    private updateEnemyMovement(dt: number): void {
        const enemies = WaveManager.instance.enemies;
        const toRemove: Node[] = [];

        for (const enemy of enemies) {
            if (!enemy.isValid) continue;

            const pos = enemy.position;
            const dist = pos.length();
            const speed = 2.0;  // 更快的移动速度

            if (dist < 0.6) {
                toRemove.push(enemy);
                this.damageBase(10);
            } else {
                const dirX = -pos.x / dist;
                const dirY = -pos.y / dist;
                enemy.setPosition(pos.x + dirX * speed * dt, pos.y + dirY * speed * dt, 0);
            }
        }

        for (const enemy of toRemove) {
            WaveManager.instance.removeEnemy(enemy);
            enemy.destroy();
        }
    }

    // === 士兵 AI ===

    private updateSoldierAI(dt: number): void {
        const enemies = WaveManager.instance.enemies;

        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const target = this.findNearestEnemy(soldier, enemies);
            if (!target) continue;

            const pos = soldier.position;
            const tpos = target.position;
            const dx = tpos.x - pos.x;
            const dy = tpos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.45) {
                const speed = 3.0;  // 士兵更快
                soldier.setPosition(
                    pos.x + (dx / dist) * speed * dt,
                    pos.y + (dy / dist) * speed * dt,
                    0
                );
            }

            (soldier as any).currentTarget = target;
        }
    }

    private findNearestEnemy(unit: Node, enemies: Node[]): Node | null {
        let nearest: Node | null = null;
        let minDist = Infinity;

        for (const enemy of enemies) {
            if (!enemy.isValid) continue;
            const dx = enemy.position.x - unit.position.x;
            const dy = enemy.position.y - unit.position.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    // === 战斗处理 ===

    private processCombat(): void {
        const enemies = WaveManager.instance.enemies;
        const killedEnemies: Node[] = [];

        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;
            const target = (soldier as any).currentTarget;
            if (!target || !target.isValid) continue;

            const dist = this.getDistance(soldier, target);
            if (dist < 0.5) {
                this.dealDamage(target, 15, killedEnemies);
            }
        }

        if (this._hero && this._hero.isValid) {
            const target = this.findNearestEnemy(this._hero, enemies);
            if (target && target.isValid) {
                const dist = this.getDistance(this._hero, target);
                if (dist < 1.0) {
                    this.dealDamage(target, 30, killedEnemies);
                }
            }
        }

        for (const enemy of killedEnemies) {
            this.removeEnemy(enemy);
        }
    }

    private dealDamage(enemy: Node, damage: number, killedList: Node[]): void {
        const unit = enemy.getComponent(Unit);
        if (!unit) return;

        unit.takeDamage(damage);

        if (!unit.isAlive && !killedList.includes(enemy)) {
            killedList.push(enemy);
        }
    }

    private removeEnemy(enemy: Node): void {
        WaveManager.instance.removeEnemy(enemy);
        const value = 5 + Math.floor(Math.random() * 5);
        const coin = CoinFactory.createCoin(
            this._coinContainer!,
            enemy.position.x,
            enemy.position.y,
            value
        );
        this._coins.push(coin);
        enemy.destroy();
    }
}
