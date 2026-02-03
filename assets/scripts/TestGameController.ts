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
    input,
    Input,
    EventKeyboard,
    KeyCode,
} from 'cc';
import { GameManager } from './core/managers/GameManager';

const { ccclass, property } = _decorator;

// === 数据类型 ===

interface UnitData {
    hp: number;
    maxHp: number;
    speed: number;
    damage?: number;
    target?: Node | null;
    attackCooldown?: number;
    attackTimer?: number;
}

interface BuildingData {
    type: string;
    spawnTimer: number;
    spawnInterval: number;
}

interface CoinData {
    value: number;
    lifetime: number;
}

interface WaveData {
    waveNumber: number;
    enemyCount: number;
    spawnInterval: number;
    enemyHp: number;
    enemySpeed: number;
}

/**
 * 完整 MVP 控制器
 * 包含: 敌人、士兵、英雄、兵营、金币掉落、波次、建造系统
 */
@ccclass('TestGameController')
export class TestGameController extends Component {
    @property
    public maxWaves: number = 10;

    // === 内部状态 ===
    private _container: Node | null = null;
    private _enemies: Node[] = [];
    private _soldiers: Node[] = [];
    private _buildings: Node[] = [];
    private _coins: Node[] = [];
    private _base: Node | null = null;
    private _hero: Node | null = null;

    // 波次
    private _currentWave: number = 0;
    private _waveActive: boolean = false;
    private _enemiesSpawned: number = 0;
    private _enemySpawnTimer: number = 0;
    private _waveConfig: WaveData | null = null;

    // 更新计时器
    private _buildingTimer: number = 0;
    private _coinTimer: number = 0;

    // 建造模式
    private _buildMode: boolean = false;
    private _barracksCost: number = 50;

    // === 生命周期 ===

    protected onLoad(): void {
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║         KingShit MVP - 完整版 v2                 ║');
        console.log('╠══════════════════════════════════════════════════╣');
        console.log('║  🔴 红色=敌人  🔵 蓝色=士兵  🟡 金色=英雄        ║');
        console.log('║  🟢 绿色=兵营  🟣 紫色=基地  🟠 橙色=金币        ║');
        console.log('╠══════════════════════════════════════════════════╣');
        console.log('║  按 B 键建造兵营 (消耗 50 金币)                  ║');
        console.log('╚══════════════════════════════════════════════════╝');

        this._container = new Node('GameContainer');
        this.node.addChild(this._container);

        GameManager.instance.initialize();

        // 监听键盘
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    protected onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    }

    protected start(): void {
        GameManager.instance.startGame();

        this.createBase();
        this.createBarracks(-2.5, 1);
        this.createBarracks(2.5, 1);
        this.createHero();

        console.log(`[Game] 💰 初始金币: ${GameManager.instance.coins}`);

        this.scheduleOnce(() => {
            this.startWave(1);
        }, 2);
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        if (this._waveActive) {
            this.updateWaveSpawning(dt);
        }

        this._buildingTimer += dt;
        if (this._buildingTimer >= 0.5) {
            this._buildingTimer = 0;
            this.updateBuildings();
        }

        this._coinTimer += dt;
        if (this._coinTimer >= 0.1) {
            this._coinTimer = 0;
            this.updateCoins(0.1);
        }

        this.updateEnemies(dt);
        this.updateSoldiers(dt);
        this.updateHero(dt);
        this.checkCombat();
        this.checkWaveComplete();
    }

    // === 键盘处理 ===

    private onKeyDown(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.KEY_B) {
            this.tryBuildBarracks();
        }
    }

    private tryBuildBarracks(): void {
        if (GameManager.instance.coins < this._barracksCost) {
            console.log(
                `[Build] ❌ 金币不足! 需要 ${this._barracksCost}, 当前 ${GameManager.instance.coins}`
            );
            return;
        }

        // 随机位置建造
        const x = (Math.random() - 0.5) * 6;
        const y = (Math.random() - 0.5) * 4;

        GameManager.instance.addCoins(-this._barracksCost);
        this.createBarracks(x, y);
        console.log(`[Build] ✅ 建造兵营成功! 剩余金币: ${GameManager.instance.coins}`);
    }

    // === 英雄 ===

    private createHero(): void {
        if (!this._container) return;

        this._hero = this.createCube('Hero', new Color(255, 200, 50, 255)); // 金色
        this._hero.setPosition(0, -1.5, 0);
        this._hero.setScale(0.5, 0.5, 0.5);

        const data: UnitData = {
            hp: 200,
            maxHp: 200,
            speed: 3,
            damage: 30,
            target: null,
            attackCooldown: 0.5,
            attackTimer: 0,
        };
        (this._hero as any).data = data;

        this._container.addChild(this._hero);
        console.log('[Hero] ⭐ 英雄登场!');
    }

    private updateHero(dt: number): void {
        if (!this._hero || !this._hero.isValid) return;

        const data = (this._hero as any).data as UnitData;
        const target = this.findNearestEnemy(this._hero);
        data.target = target;

        if (!target) return;

        const pos = this._hero.position;
        const targetPos = target.position;
        const dx = targetPos.x - pos.x;
        const dy = targetPos.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 移动
        if (dist > 0.7) {
            this._hero.setPosition(
                pos.x + (dx / dist) * data.speed * dt,
                pos.y + (dy / dist) * data.speed * dt,
                0
            );
        }

        // 攻击
        data.attackTimer = (data.attackTimer || 0) + dt;
        if (dist < 0.8 && data.attackTimer >= (data.attackCooldown || 0.5)) {
            data.attackTimer = 0;
            this.heroAttack(target, data.damage || 30);
        }
    }

    private heroAttack(target: Node, damage: number): void {
        const targetData = (target as any).data as UnitData;
        targetData.hp -= damage;

        if (targetData.hp <= 0) {
            this.removeEnemies([target], true);
            console.log('[Hero] ⚔️ 英雄击杀!');
        }
    }

    // === 金币掉落 ===

    private spawnCoin(x: number, y: number, value: number): void {
        if (!this._container) return;

        const coin = this.createCube('Coin', new Color(255, 165, 0, 255)); // 橙色
        coin.setPosition(x, y, 0.3);
        coin.setScale(0.2, 0.2, 0.2);

        const data: CoinData = { value, lifetime: 0 };
        (coin as any).coinData = data;

        this._container.addChild(coin);
        this._coins.push(coin);
    }

    private updateCoins(dt: number): void {
        const toRemove: Node[] = [];

        for (const coin of this._coins) {
            if (!coin.isValid) continue;

            const data = (coin as any).coinData as CoinData;
            data.lifetime += dt;

            // 上下浮动动画
            const y = coin.position.y + Math.sin(data.lifetime * 5) * 0.02;
            coin.setPosition(coin.position.x, y, coin.position.z);

            // 2秒后自动收集
            if (data.lifetime >= 2) {
                GameManager.instance.addCoins(data.value);
                toRemove.push(coin);
            }
        }

        for (const coin of toRemove) {
            const idx = this._coins.indexOf(coin);
            if (idx !== -1) this._coins.splice(idx, 1);
            coin.destroy();
        }
    }

    // === 基地 ===

    private createBase(): void {
        if (!this._container) return;

        this._base = this.createCube('Base', new Color(150, 100, 200, 255));
        this._base.setPosition(0, 0, 0);
        this._base.setScale(0.8, 0.8, 0.8);

        const data: UnitData = { hp: 100, maxHp: 100, speed: 0 };
        (this._base as any).data = data;

        this._container.addChild(this._base);
    }

    // === 兵营 ===

    private createBarracks(x: number, y: number): void {
        if (!this._container) return;

        const building = this.createCube('Barracks', new Color(100, 180, 100, 255));
        building.setPosition(x, y, 0);
        building.setScale(0.45, 0.45, 0.45);

        const data: BuildingData = {
            type: 'barracks',
            spawnTimer: 0,
            spawnInterval: 4,
        };
        (building as any).buildingData = data;

        this._container.addChild(building);
        this._buildings.push(building);
    }

    private updateBuildings(): void {
        for (const building of this._buildings) {
            if (!building.isValid) continue;

            const data = (building as any).buildingData as BuildingData;
            if (data.type !== 'barracks') continue;

            data.spawnTimer += 0.5;
            if (data.spawnTimer >= data.spawnInterval) {
                data.spawnTimer = 0;
                if (this._soldiers.length < 15) {
                    this.spawnSoldier(building.position.x, building.position.y);
                }
            }
        }
    }

    // === 波次 ===

    private startWave(waveNumber: number): void {
        this._currentWave = waveNumber;
        this._waveActive = true;
        this._enemiesSpawned = 0;
        this._enemySpawnTimer = 0;

        this._waveConfig = {
            waveNumber,
            enemyCount: 5 + waveNumber * 2,
            spawnInterval: Math.max(0.8, 2.5 - waveNumber * 0.15),
            enemyHp: 20 + waveNumber * 10,
            enemySpeed: 1.2 + waveNumber * 0.1,
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

    // === 敌人 ===

    private spawnEnemy(): void {
        if (!this._container) return;

        const enemy = this.createCube('Enemy', new Color(220, 60, 60, 255));
        const pos = this.getEdgePosition();
        enemy.setPosition(pos.x, pos.y, 0);
        enemy.setScale(0.35, 0.35, 0.35);

        const data: UnitData = {
            hp: this._waveConfig?.enemyHp || 30,
            maxHp: this._waveConfig?.enemyHp || 30,
            speed: this._waveConfig?.enemySpeed || 1.5,
        };
        (enemy as any).data = data;

        this._container.addChild(enemy);
        this._enemies.push(enemy);
    }

    private updateEnemies(dt: number): void {
        const toRemove: Node[] = [];

        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            const data = (enemy as any).data as UnitData;
            const pos = enemy.position;
            const dist = pos.length();

            if (dist < 0.6) {
                toRemove.push(enemy);
                if (this._base) {
                    const baseData = (this._base as any).data as UnitData;
                    baseData.hp -= 10;
                    console.log(`[Base] ⚠️ HP: ${baseData.hp}/${baseData.maxHp}`);

                    if (baseData.hp <= 0) {
                        console.log('💀 游戏结束!');
                        GameManager.instance.pause();
                    }
                }
            } else {
                const dir = new Vec3(-pos.x / dist, -pos.y / dist, 0);
                enemy.setPosition(
                    pos.x + dir.x * data.speed * dt,
                    pos.y + dir.y * data.speed * dt,
                    0
                );
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
                    const value = 5 + Math.floor(Math.random() * 5);
                    this.spawnCoin(enemy.position.x, enemy.position.y, value);
                }
            }
            enemy.destroy();
        }
    }

    // === 士兵 ===

    private spawnSoldier(x: number, y: number): void {
        if (!this._container) return;

        const soldier = this.createCube('Soldier', new Color(60, 140, 220, 255));
        soldier.setPosition(x, y, 0);
        soldier.setScale(0.28, 0.28, 0.28);

        const data: UnitData = {
            hp: 50,
            maxHp: 50,
            speed: 2.5,
            damage: 15,
            target: null,
        };
        (soldier as any).data = data;

        this._container.addChild(soldier);
        this._soldiers.push(soldier);
    }

    private updateSoldiers(dt: number): void {
        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const data = (soldier as any).data as UnitData;
            const target = this.findNearestEnemy(soldier);
            data.target = target;

            if (!target) continue;

            const pos = soldier.position;
            const dx = target.position.x - pos.x;
            const dy = target.position.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.45) {
                soldier.setPosition(
                    pos.x + (dx / dist) * data.speed * dt,
                    pos.y + (dy / dist) * data.speed * dt,
                    0
                );
            }
        }
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

    // === 战斗 ===

    private checkCombat(): void {
        const killedEnemies: Node[] = [];

        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const data = (soldier as any).data as UnitData;
            const target = data.target;
            if (!target || !target.isValid) continue;

            const dx = target.position.x - soldier.position.x;
            const dy = target.position.y - soldier.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.5) {
                const targetData = (target as any).data as UnitData;
                targetData.hp -= data.damage || 15;

                if (targetData.hp <= 0 && !killedEnemies.includes(target)) {
                    killedEnemies.push(target);
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
