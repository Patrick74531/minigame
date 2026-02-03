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

// === 数据类型 ===

interface UnitData {
    hp: number;
    speed: number;
    damage?: number;
    target?: Node | null;
}

interface BuildingData {
    type: string;
    spawnTimer: number;
    spawnInterval: number;
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
 * 包含: 敌人、士兵、兵营建筑、波次系统、基地
 */
@ccclass('TestGameController')
export class TestGameController extends Component {
    // === 波次配置 ===
    @property
    public startingWave: number = 1;

    @property
    public maxWaves: number = 10;

    // === 内部状态 ===
    private _container: Node | null = null;
    private _enemies: Node[] = [];
    private _soldiers: Node[] = [];
    private _buildings: Node[] = [];
    private _base: Node | null = null;

    // 波次系统
    private _currentWave: number = 0;
    private _waveActive: boolean = false;
    private _enemiesSpawned: number = 0;
    private _enemySpawnTimer: number = 0;
    private _waveConfig: WaveData | null = null;

    // 建筑产兵
    private _buildingUpdateTimer: number = 0;

    // === 生命周期 ===

    protected onLoad(): void {
        console.log('╔════════════════════════════════════════════╗');
        console.log('║       KingShit MVP - 完整版启动            ║');
        console.log('╠════════════════════════════════════════════╣');
        console.log('║  🔴 红色 = 敌人    🟢 绿色 = 兵营          ║');
        console.log('║  🔵 蓝色 = 士兵    🟣 紫色 = 基地          ║');
        console.log('╚════════════════════════════════════════════╝');

        this._container = new Node('GameContainer');
        this.node.addChild(this._container);

        GameManager.instance.initialize();
    }

    protected start(): void {
        GameManager.instance.startGame();

        // 创建基地 (紫色，玩家需要保护的核心)
        this.createBase();

        // 创建初始兵营
        this.createBarracks(-2, 0);
        this.createBarracks(2, 0);

        console.log(`[Game] 💰 初始金币: ${GameManager.instance.coins}`);
        console.log('[Game] 🏰 基地和兵营已创建');

        // 开始第一波
        this.scheduleOnce(() => {
            this.startWave(this.startingWave);
        }, 2);
    }

    protected update(dt: number): void {
        if (!GameManager.instance.isPlaying) return;

        // 更新波次
        if (this._waveActive) {
            this.updateWaveSpawning(dt);
        }

        // 更新建筑 (产兵)
        this._buildingUpdateTimer += dt;
        if (this._buildingUpdateTimer >= 0.5) {
            this._buildingUpdateTimer = 0;
            this.updateBuildings();
        }

        // 更新单位
        this.updateEnemies(dt);
        this.updateSoldiers(dt);
        this.checkCombat();
        this.checkWaveComplete();
    }

    // === 基地 ===

    private createBase(): void {
        if (!this._container) return;

        this._base = this.createCube('Base', new Color(150, 100, 200, 255)); // 紫色
        this._base.setPosition(0, 0, 0);
        this._base.setScale(0.8, 0.8, 0.8);

        const data: UnitData = { hp: 100, speed: 0 };
        (this._base as any).data = data;

        this._container.addChild(this._base);
    }

    // === 兵营建筑 ===

    private createBarracks(x: number, y: number): void {
        if (!this._container) return;

        const building = this.createCube('Barracks', new Color(100, 180, 100, 255)); // 绿色
        building.setPosition(x, y, 0);
        building.setScale(0.5, 0.5, 0.5);

        const data: BuildingData = {
            type: 'barracks',
            spawnTimer: 0,
            spawnInterval: 4, // 每4秒产一个兵
        };
        (building as any).buildingData = data;

        this._container.addChild(building);
        this._buildings.push(building);

        console.log(`[Building] 🏠 兵营建造完成 (${x}, ${y})`);
    }

    private updateBuildings(): void {
        for (const building of this._buildings) {
            if (!building.isValid) continue;

            const data = (building as any).buildingData as BuildingData;
            if (!data || data.type !== 'barracks') continue;

            data.spawnTimer += 0.5;
            if (data.spawnTimer >= data.spawnInterval) {
                data.spawnTimer = 0;
                this.spawnSoldier(building.position.x, building.position.y);
            }
        }
    }

    // === 波次系统 ===

    private startWave(waveNumber: number): void {
        this._currentWave = waveNumber;
        this._waveActive = true;
        this._enemiesSpawned = 0;
        this._enemySpawnTimer = 0;

        // 计算波次配置 (难度递增)
        this._waveConfig = {
            waveNumber,
            enemyCount: 5 + waveNumber * 2, // 7, 9, 11...
            spawnInterval: Math.max(1, 2.5 - waveNumber * 0.1), // 越来越快
            enemyHp: 20 + waveNumber * 10, // 30, 40, 50...
            enemySpeed: 1.2 + waveNumber * 0.1, // 越来越快
        };

        console.log('═══════════════════════════════════════');
        console.log(`🌊 第 ${waveNumber} 波开始!`);
        console.log(`   👾 敌人数量: ${this._waveConfig.enemyCount}`);
        console.log(`   ❤️ 敌人血量: ${this._waveConfig.enemyHp}`);
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

        // 所有敌人已生成，停止生成
        if (this._enemiesSpawned >= this._waveConfig.enemyCount) {
            this._waveActive = false;
        }
    }

    private checkWaveComplete(): void {
        if (this._waveActive) return;
        if (this._enemies.length > 0) return;
        if (!this._waveConfig) return;

        // 波次完成
        const bonus = this._currentWave * 20;
        GameManager.instance.addCoins(bonus);

        console.log('═══════════════════════════════════════');
        console.log(`✅ 第 ${this._currentWave} 波完成!`);
        console.log(`   🎁 波次奖励: +${bonus} 金币`);
        console.log(`   💰 当前金币: ${GameManager.instance.coins}`);
        console.log('═══════════════════════════════════════');

        this._waveConfig = null;

        // 下一波
        if (this._currentWave < this.maxWaves) {
            this.scheduleOnce(() => {
                this.startWave(this._currentWave + 1);
            }, 3);
        } else {
            console.log('🎉🎉🎉 恭喜通关! 🎉🎉🎉');
            GameManager.instance.pause();
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
                // 攻击基地
                toRemove.push(enemy);
                if (this._base) {
                    const baseData = (this._base as any).data as UnitData;
                    baseData.hp -= 10;
                    console.log(`[Base] ⚠️ 基地受到攻击! 剩余HP: ${baseData.hp}`);

                    if (baseData.hp <= 0) {
                        console.log('💀💀💀 游戏结束 - 基地被摧毁! 💀💀💀');
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
                    const reward = 5 + Math.floor(Math.random() * 5);
                    GameManager.instance.addCoins(reward);
                    console.log(`[Game] 💰 +${reward} 金币`);
                }
            }
            enemy.destroy();
        }
    }

    // === 士兵 ===

    private spawnSoldier(x: number, y: number): void {
        if (!this._container) return;

        // 限制士兵最大数量
        if (this._soldiers.length >= 10) return;

        const soldier = this.createCube('Soldier', new Color(60, 140, 220, 255));
        soldier.setPosition(x, y, 0);
        soldier.setScale(0.3, 0.3, 0.3);

        const data: UnitData = {
            hp: 50,
            speed: 2.5,
            damage: 15,
            target: null,
        };
        (soldier as any).data = data;

        this._container.addChild(soldier);
        this._soldiers.push(soldier);

        console.log(`[Soldier] 🛡️ 士兵出动! (${this._soldiers.length}/10)`);
    }

    private updateSoldiers(dt: number): void {
        for (const soldier of this._soldiers) {
            if (!soldier.isValid) continue;

            const data = (soldier as any).data as UnitData;
            const target = this.findNearestEnemy(soldier);
            data.target = target;

            if (!target) continue;

            const pos = soldier.position;
            const targetPos = target.position;
            const dx = targetPos.x - pos.x;
            const dy = targetPos.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.5) {
                soldier.setPosition(
                    pos.x + (dx / dist) * data.speed * dt,
                    pos.y + (dy / dist) * data.speed * dt,
                    0
                );
            }
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
                    console.log('[Combat] ⚔️ 击败敌人!');
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
