import { Node, Vec3, resources, Prefab, instantiate } from 'cc';
import { MeshRenderer, primitives, utils, Material, Color, Tween, tween } from 'cc';
import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';

const CHEST_COLLECT_RADIUS = 2.0;
const CHEST_MAGNET_RANGE = 5.0;
const CHEST_MAGNET_SPEED = 12;
const CHEST_FLOAT_SPEED = 2.0;
const CHEST_FLOAT_AMPLITUDE = 0.3;

// 复用临时向量，避免每帧 GC
const _tmpDir = new Vec3();
const _tmpPos = new Vec3();

/**
 * ChestDropManager
 * 监听 BOSS_CHEST_DROP 事件，在Boss死亡位置生成宝箱。
 * 宝箱被英雄拾取后发出 BOSS_CHEST_PICKED 事件。
 */
export class ChestDropManager extends Singleton<ChestDropManager>() {
    private _coinContainer: Node | null = null;
    private _heroNode: Node | null = null;
    private _chestPrefab: Prefab | null = null;
    private _isLoading: boolean = false;
    private _activeChests: Node[] = [];
    /** 已进入磁吸阶段的宝箱集合（停掉浮动 tween） */
    private _magnetized: WeakSet<Node> = new WeakSet();

    public initialize(coinContainer: Node, heroNode: Node | null): void {
        this._coinContainer = coinContainer;
        this._heroNode = heroNode;
        this._activeChests = [];
        this._magnetized = new WeakSet();
        this.loadChestPrefab();
        this.eventManager.on(GameEvents.BOSS_CHEST_DROP, this.onBossChestDrop, this);
    }

    public setHeroNode(heroNode: Node | null): void {
        this._heroNode = heroNode;
    }

    public cleanup(): void {
        this.eventManager.off(GameEvents.BOSS_CHEST_DROP, this.onBossChestDrop, this);
        for (const chest of this._activeChests) {
            if (chest && chest.isValid) {
                Tween.stopAllByTarget(chest);
                chest.destroy();
            }
        }
        this._activeChests = [];
        this._magnetized = new WeakSet();
        this._coinContainer = null;
        this._heroNode = null;
    }

    // === 每帧更新（由 GameController 调用） ===

    public update(dt: number): void {
        if (!this._heroNode || !this._heroNode.isValid) return;
        if (this._activeChests.length === 0) return;

        const heroPos = this._heroNode.worldPosition;
        for (let i = this._activeChests.length - 1; i >= 0; i--) {
            const chest = this._activeChests[i];
            if (!chest || !chest.isValid) {
                this._activeChests.splice(i, 1);
                continue;
            }

            const chestPos = chest.worldPosition;
            const dist = Vec3.distance(heroPos, chestPos);

            if (dist < CHEST_COLLECT_RADIUS) {
                this.collectChest(chest, i);
                continue;
            }

            if (dist < CHEST_MAGNET_RANGE) {
                // 首次进入磁吸范围时停掉浮动 tween，避免位置冲突
                if (!this._magnetized.has(chest)) {
                    Tween.stopAllByTarget(chest);
                    this._magnetized.add(chest);
                }
                Vec3.subtract(_tmpDir, heroPos, chestPos);
                _tmpDir.y = 0;
                _tmpDir.normalize();
                _tmpDir.multiplyScalar(CHEST_MAGNET_SPEED * dt);
                Vec3.add(_tmpPos, chestPos, _tmpDir);
                _tmpPos.y = chestPos.y;
                chest.setWorldPosition(_tmpPos);
            }
        }
    }

    // === 内部 ===

    private collectChest(chest: Node, index: number): void {
        this._activeChests.splice(index, 1);
        Tween.stopAllByTarget(chest);
        chest.destroy();
        this.eventManager.emit(GameEvents.BOSS_CHEST_PICKED);
    }

    private onBossChestDrop(data: { position: Vec3 }): void {
        if (!this._coinContainer) return;
        this.spawnChest(data.position);
    }

    private spawnChest(pos: Vec3): void {
        let node: Node;
        if (this._chestPrefab) {
            node = instantiate(this._chestPrefab);
            node.setScale(1.8, 1.8, 1.8);
        } else {
            node = this.createFallbackChest();
        }

        const spawnY = pos.y + 0.5;
        node.setPosition(pos.x, spawnY, pos.z);
        this._coinContainer!.addChild(node);

        // 浮动动画
        tween(node)
            .repeatForever(
                tween(node)
                    .to(
                        1.0 / CHEST_FLOAT_SPEED,
                        { position: new Vec3(pos.x, spawnY + CHEST_FLOAT_AMPLITUDE, pos.z) },
                        { easing: 'sineInOut' }
                    )
                    .to(
                        1.0 / CHEST_FLOAT_SPEED,
                        { position: new Vec3(pos.x, spawnY - CHEST_FLOAT_AMPLITUDE, pos.z) },
                        { easing: 'sineInOut' }
                    )
            )
            .start();

        this._activeChests.push(node);
    }

    private createFallbackChest(): Node {
        const node = new Node('BossChest');
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = utils.MeshUtils.createMesh(
            primitives.box({ width: 1.2, height: 0.9, length: 0.8 })
        );
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', new Color(218, 165, 32, 255));
        renderer.material = material;
        node.setScale(2.4, 2.4, 2.4);
        return node;
    }

    private loadChestPrefab(): void {
        if (this._isLoading || this._chestPrefab) return;
        this._isLoading = true;
        const candidates = ['property/Chest', 'property/Chest/Chest'];
        this.tryLoadPrefab(candidates, 0);
    }

    private tryLoadPrefab(candidates: string[], index: number): void {
        if (index >= candidates.length) {
            this._isLoading = false;
            return;
        }
        resources.load(candidates[index], Prefab, (err, prefab) => {
            if (!err && prefab) {
                this._chestPrefab = prefab;
                this._isLoading = false;
                return;
            }
            this.tryLoadPrefab(candidates, index + 1);
        });
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
