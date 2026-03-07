import { Node, Vec3, resources, Prefab, instantiate } from 'cc';
import { MeshRenderer, primitives, utils, Material, Color, Tween, tween } from 'cc';
import { Singleton } from '../../core/base/Singleton';
import { EventManager } from '../../core/managers/EventManager';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { GameEvents } from '../../data/GameEvents';

const CHEST_COLLECT_RADIUS = 0.7;
const CHEST_FLOAT_SPEED = 2.0;
const CHEST_FLOAT_AMPLITUDE = 0.3;

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
    private _pendingChestDrops: Vec3[] = [];

    public initialize(coinContainer: Node, heroNode: Node | null): void {
        this._coinContainer = coinContainer;
        this._heroNode = heroNode;
        this._activeChests = [];
        this._pendingChestDrops = [];
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
        this._pendingChestDrops = [];
        this._coinContainer = null;
        this._heroNode = null;
    }

    // === 每帧更新（由 GameController 调用） ===

    public update(_dt: number): void {
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
        if (this.isTikTokRuntime()) {
            this.spawnChest(data.position, true);
            return;
        }
        if (this._chestPrefab) {
            this.spawnChest(data.position);
            return;
        }

        // 首次未加载完成时先排队，避免直接显示 fallback 方块。
        this._pendingChestDrops.push(new Vec3(data.position.x, data.position.y, data.position.z));
        if (!this._isLoading) {
            this.loadChestPrefab();
        }
    }

    private spawnChest(pos: Vec3, forceFallback: boolean = false): void {
        let node: Node;
        if (!forceFallback && this._chestPrefab) {
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
        if (this.isTikTokRuntime()) return;
        this._isLoading = true;
        const candidates = ['property/Chest', 'property/Chest/Chest'];
        this.tryLoadPrefab(candidates, 0);
    }

    private tryLoadPrefab(candidates: string[], index: number): void {
        if (index >= candidates.length) {
            this._isLoading = false;
            this.flushPendingChests(true);
            return;
        }
        resources.load(candidates[index], Prefab, (err, prefab) => {
            if (!err && prefab) {
                this._chestPrefab = prefab;
                this._isLoading = false;
                this.flushPendingChests(false);
                return;
            }
            console.warn(
                `[ChestDropManager] Failed to load chest prefab at "${candidates[index]}":`,
                err
            );
            this.tryLoadPrefab(candidates, index + 1);
        });
    }

    private flushPendingChests(forceFallback: boolean): void {
        if (this._pendingChestDrops.length === 0 || !this._coinContainer) return;
        const pending = this._pendingChestDrops.splice(0, this._pendingChestDrops.length);
        for (const pos of pending) {
            this.spawnChest(pos, forceFallback);
        }
    }

    private isTikTokRuntime(): boolean {
        const g = globalThis as unknown as { __GVR_PLATFORM__?: unknown; tt?: unknown };
        return g.__GVR_PLATFORM__ === 'tiktok' || typeof g.tt !== 'undefined';
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
