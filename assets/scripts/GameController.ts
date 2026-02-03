import { _decorator, Component, Node, Vec3, input, Input, EventKeyboard, KeyCode } from 'cc';
import { GameManager } from './core/managers/GameManager';
import { EventManager } from './core/managers/EventManager';
import { GameEvents } from './data/GameEvents';
import { GameConfig } from './data/GameConfig';
import { UnitFactory } from './gameplay/units/UnitFactory';
import { BuildingFactory } from './gameplay/buildings/BuildingFactory';
import { CoinFactory } from './gameplay/economy/CoinFactory';
import { Unit, UnitType, UnitState } from './gameplay/units/Unit';
import { Soldier } from './gameplay/units/Soldier';

const { ccclass, property } = _decorator;

interface WaveConfig {
    waveNumber: number;
    enemyCount: number;
    spawnInterval: number;
    hpMultiplier: number;
}

/**
 * 游戏主控制器 (模块化版本)
 * 职责: 协调各子系统，不包含具体业务逻辑
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

    // === 实体列表 ===
    private _enemies: Node[] = [];
    private _soldiers: Node[] = [];
    private _buildings: Node[] = [];
    private _coins: Node[] = [];
    private _base: Node | null = null;
    private _hero: Node | null = null;

    // === 波次状态 ===
    private _currentWave: number = 0;
    private _waveActive: boolean = false;
    private _enemiesSpawned: number = 0;
    private _enemySpawnTimer: number = 0;
    private _waveConfig: WaveConfig | null = null;

    // === 更新计时器 ===
    private _buildingTimer: number = 0;
    private _coinTimer: number = 0;
    private _combatTimer: number = 0;

    // === 建造成本 ===
    private _barracksCost: number = 50;

    // === 生命周期 ===

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - 模块化版本                    ║');
        console.log('╠════════════════════════════════════════════════════╣');
        console.log('║  🔴 红=敌人  🔵 蓝=士兵  🟡 金=英雄               ║');
        console.log('║  🟢 绿=兵营  🟣 紫=基地  🟠 橙=金币               ║');
        console.log('╠════════════════════════════════════════════════════╣');
        console.log('║  按 B 键建造兵营 (消耗 50 金币)                   ║');
        console.log('╚════════════════════════════════════════════════════╝');

        this.setupContainers();
        this.setupInput();

        GameManager.instance.initialize();
    }

    protected onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        EventManager.instance.offAllByTarget(this);
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
        this.scheduleOnce(() => this.startWave(1), 2);
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 波次生成
        if (this._waveActive) {
            this.updateWaveSpawning(dt);
        }

        // 建筑产兵 (每 0.5 秒检查一次)
        this._buildingTimer += dt;
        if (this._buildingTimer >= 0.5) {
            this._buildingTimer = 0;
            this.updateBuildingSpawn();
        }

        // 金币更新
        this._coinTimer += dt;
        if (this._coinTimer >= 0.1) {
            this._coinTimer = 0;
            this.updateCoins();
        }

        // 战斗检测 (每帧)
        this.updateEnemyMovement(dt);
        this.updateSoldierAI(dt);
        this.updateHeroAI(dt);

        // 战斗处理
        this._combatTimer += dt;
        if (this._combatTimer >= 0.1) {
            this._combatTimer = 0;
            this.processCombat();
        }

        this.checkWaveComplete();
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

    private setupInput(): void {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    private onKeyDown(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.KEY_B) {
            this.tryBuildBarracks();
        }
    }

    // === 建造 ===

    private tryBuildBarracks(): void {
        if (GameManager.instance.coins < this._barracksCost) {
            console.log(`[Build] ❌ 金币不足! 需要 ${this._barracksCost}`);
            return;
        }

        const x = (Math.random() - 0.5) * 6;
        const y = (Math.random() - 0.5) * 4;

        GameManager.instance.addCoins(-this._barracksCost);
        this._buildings.push(BuildingFactory.createBarracks(this._buildingContainer!, x, y));
        console.log(`[Build] ✅ 兵营建造完成! 剩余: ${GameManager.instance.coins}`);
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
                console.log(`[Barracks] 🛡️ 士兵出动! (${this._soldiers.length}/15)`);
            }

            (building as any).spawnData = data;
        }
    }

    // === 波次系统 ===

    private startWave(waveNumber: number): void {
        this._currentWave = waveNumber;
        this._waveActive = true;
        this._enemiesSpawned = 0;
        this._enemySpawnTimer = 0;

        this._waveConfig = {
            waveNumber,
            enemyCount: 5 + waveNumber * 2,
            spawnInterval: Math.max(0.8, 2.5 - waveNumber * 0.15),
            hpMultiplier: 1 + (waveNumber - 1) * 0.3,
        };

        console.log('═══════════════════════════════════════');
        console.log(`🌊 第 ${waveNumber} 波! 敌人: ${this._waveConfig.enemyCount}`);
        console.log('═══════════════════════════════════════');
    }

    private updateWaveSpawning(dt: number): void {
        if (!this._waveConfig) return;

        this._enemySpawnTimer += dt;
        if (
            this._enemySpawnTimer >= this._waveConfig.spawnInterval &&
            this._enemiesSpawned < this._waveConfig.enemyCount
        ) {
            this._enemySpawnTimer = 0;
            this.spawnEnemy();
            this._enemiesSpawned++;
        }

        if (this._enemiesSpawned >= this._waveConfig.enemyCount) {
            this._waveActive = false;
        }
    }

    private spawnEnemy(): void {
        const pos = this.getEdgePosition();
        const enemy = UnitFactory.createEnemy(
            this._enemyContainer!,
            pos.x,
            pos.y,
            this._waveConfig?.hpMultiplier || 1
        );
        this._enemies.push(enemy);
    }

    private checkWaveComplete(): void {
        if (this._waveActive || this._enemies.length > 0 || !this._waveConfig) return;

        const bonus = this._currentWave * 25;
        GameManager.instance.addCoins(bonus);
        console.log(`✅ 第 ${this._currentWave} 波完成! +${bonus} 金币`);

        this._waveConfig = null;

        if (this._currentWave < this.maxWaves) {
            this.scheduleOnce(() => this.startWave(this._currentWave + 1), 3);
        } else {
            console.log('🎉🎉🎉 通关! 🎉🎉🎉');
        }
    }

    // === 敌人移动 ===

    private updateEnemyMovement(dt: number): void {
        const toRemove: Node[] = [];

        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            const enemyComp = enemy.getComponent(Unit);
            if (!enemyComp || !enemyComp.isAlive) {
                toRemove.push(enemy);
                continue;
            }

            // 向基地移动
            const pos = enemy.position;
            const dist = pos.length();
            const speed = enemyComp.stats.moveSpeed / 60; // 转换为 3D 单位

            if (dist < 0.6) {
                toRemove.push(enemy);
                this.damageBase(10);
            } else {
                const dir = new Vec3(-pos.x / dist, -pos.y / dist, 0);
                enemy.setPosition(pos.x + dir.x * speed * dt, pos.y + dir.y * speed * dt, 0);
            }
        }

        for (const enemy of toRemove) {
            this.removeEnemy(enemy, false);
        }
    }

    private damageBase(damage: number): void {
        if (!this._base) return;

        const data = (this._base as any).baseData;
        if (!data) return;

        data.hp -= damage;
        console.log(`[Base] ⚠️ HP: ${data.hp}/${data.maxHp}`);

        if (data.hp <= 0) {
            console.log('💀 游戏结束!');
            GameManager.instance.pause();
        }
    }

    // === 士兵 AI ===

    private updateSoldierAI(dt: number): void {
        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const target = this.findNearestEnemy(soldier);
            if (!target) continue;

            const pos = soldier.position;
            const tpos = target.position;
            const dx = tpos.x - pos.x;
            const dy = tpos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.45) {
                const speed = 2.5;
                soldier.setPosition(
                    pos.x + (dx / dist) * speed * dt,
                    pos.y + (dy / dist) * speed * dt,
                    0
                );
            }

            (soldier as any).currentTarget = target;
        }
    }

    // === 英雄 AI ===

    private updateHeroAI(dt: number): void {
        if (!this._hero || !this._hero.isValid) return;

        const target = this.findNearestEnemy(this._hero);
        if (!target) return;

        const pos = this._hero.position;
        const tpos = target.position;
        const dx = tpos.x - pos.x;
        const dy = tpos.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.7) {
            const speed = 3;
            this._hero.setPosition(
                pos.x + (dx / dist) * speed * dt,
                pos.y + (dy / dist) * speed * dt,
                0
            );
        }

        (this._hero as any).currentTarget = target;
    }

    private findNearestEnemy(unit: Node): Node | null {
        let nearest: Node | null = null;
        let minDist = Infinity;

        for (const enemy of this._enemies) {
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
        const killedEnemies: Node[] = [];

        // 士兵攻击
        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;
            const target = (soldier as any).currentTarget;
            if (!target || !target.isValid) continue;

            const dist = this.getDistance(soldier, target);
            if (dist < 0.5) {
                this.dealDamage(target, 15, killedEnemies);
            }
        }

        // 英雄攻击
        if (this._hero && this._hero.isValid) {
            const target = (this._hero as any).currentTarget;
            if (target && target.isValid) {
                const dist = this.getDistance(this._hero, target);
                if (dist < 0.8) {
                    this.dealDamage(target, 30, killedEnemies);
                }
            }
        }

        // 处理死亡敌人
        for (const enemy of killedEnemies) {
            this.removeEnemy(enemy, true);
        }
    }

    private dealDamage(enemy: Node, damage: number, killedList: Node[]): void {
        const unit = enemy.getComponent(Unit);
        if (!unit) return;

        unit.takeDamage(damage);

        if (!unit.isAlive && !killedList.includes(enemy)) {
            killedList.push(enemy);
            console.log('[Combat] ⚔️ 击败敌人!');
        }
    }

    private getDistance(a: Node, b: Node): number {
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private removeEnemy(enemy: Node, giveReward: boolean): void {
        const idx = this._enemies.indexOf(enemy);
        if (idx !== -1) {
            this._enemies.splice(idx, 1);
            if (giveReward) {
                const value = 5 + Math.floor(Math.random() * 5);
                const coin = CoinFactory.createCoin(
                    this._coinContainer!,
                    enemy.position.x,
                    enemy.position.y,
                    value
                );
                this._coins.push(coin);
            }
        }
        enemy.destroy();
    }

    // === 金币更新 ===

    private updateCoins(): void {
        const toRemove: Node[] = [];

        for (const coin of this._coins) {
            if (!coin.isValid) continue;
            if (CoinFactory.updateCoin(coin, 0.1)) {
                toRemove.push(coin);
            }
        }

        for (const coin of toRemove) {
            const idx = this._coins.indexOf(coin);
            if (idx !== -1) this._coins.splice(idx, 1);
            coin.destroy();
        }
    }

    // === 工具方法 ===

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
