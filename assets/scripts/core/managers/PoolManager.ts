import { Node, Prefab, instantiate, NodePool } from 'cc';
import { Singleton } from '../base/Singleton';

/**
 * 可池化接口
 * 从对象池获取和回收的对象应实现此接口
 */
export interface IPoolable {
    /** 从池中取出时调用 */
    onSpawn(): void;
    /** 回收到池中时调用 */
    onDespawn(): void;
}

/** 池配置 */
interface PoolConfig {
    pool: NodePool;
    prefab: Prefab;
    initialSize: number;
}

/**
 * 对象池管理器
 * 管理游戏对象的复用，避免频繁创建销毁带来的性能问题
 *
 * @example
 * // 注册预制体池
 * PoolManager.instance.registerPool('enemy_slime', slimePrefab, 20);
 *
 * // 获取对象
 * const enemy = PoolManager.instance.spawn('enemy_slime', parentNode);
 *
 * // 回收对象
 * PoolManager.instance.despawn('enemy_slime', enemy);
 */
export class PoolManager extends Singleton<PoolManager>() {
    private _pools: Map<string, PoolConfig> = new Map();

    /**
     * 注册对象池
     * @param poolName 池名称（唯一标识）
     * @param prefab 预制体
     * @param initialSize 初始预创建数量
     */
    public registerPool(poolName: string, prefab: Prefab, initialSize: number = 10): void {
        if (this._pools.has(poolName)) {
            console.warn(`[PoolManager] Pool "${poolName}" already exists, skipping registration`);
            return;
        }

        const pool = new NodePool();
        const config: PoolConfig = {
            pool,
            prefab,
            initialSize,
        };

        // 预创建对象
        for (let i = 0; i < initialSize; i++) {
            const node = instantiate(prefab);
            pool.put(node);
        }

        this._pools.set(poolName, config);
    }

    /**
     * 从池中获取对象
     * @param poolName 池名称
     * @param parent 父节点
     * @returns 节点实例，如果池不存在则返回 null
     */
    public spawn(poolName: string, parent?: Node): Node | null {
        const config = this._pools.get(poolName);
        if (!config) {
            console.error(`[PoolManager] Pool "${poolName}" not found`);
            return null;
        }

        let node: Node;

        if (config.pool.size() > 0) {
            node = config.pool.get()!;
        } else {
            // 池为空，创建新实例
            node = instantiate(config.prefab);
        }

        if (parent) {
            node.parent = parent;
        }

        // 调用 onSpawn 生命周期
        const poolable = node.getComponent('IPoolable') as unknown as IPoolable;
        if (poolable && typeof poolable.onSpawn === 'function') {
            poolable.onSpawn();
        }

        node.active = true;
        return node;
    }

    /**
     * 回收对象到池中
     * @param poolName 池名称
     * @param node 要回收的节点
     */
    public despawn(poolName: string, node: Node): void {
        const config = this._pools.get(poolName);
        if (!config) {
            console.error(`[PoolManager] Pool "${poolName}" not found, destroying node`);
            node.destroy();
            return;
        }

        // 调用 onDespawn 生命周期
        const poolable = node.getComponent('IPoolable') as unknown as IPoolable;
        if (poolable && typeof poolable.onDespawn === 'function') {
            poolable.onDespawn();
        }

        node.active = false;
        node.parent = null;
        config.pool.put(node);
    }

    /**
     * 获取池当前大小
     * @param poolName 池名称
     */
    public getPoolSize(poolName: string): number {
        return this._pools.get(poolName)?.pool.size() ?? 0;
    }

    /**
     * 清空指定池
     * @param poolName 池名称
     */
    public clearPool(poolName: string): void {
        const config = this._pools.get(poolName);
        if (config) {
            config.pool.clear();
        }
    }

    /**
     * 清空所有池
     */
    public clearAll(): void {
        this._pools.forEach(config => {
            config.pool.clear();
        });
        this._pools.clear();
    }

    /**
     * 预热池（创建更多对象）
     * @param poolName 池名称
     * @param count 额外创建数量
     */
    public warmUp(poolName: string, count: number): void {
        const config = this._pools.get(poolName);
        if (!config) {
            console.error(`[PoolManager] Pool "${poolName}" not found`);
            return;
        }

        for (let i = 0; i < count; i++) {
            const node = instantiate(config.prefab);
            config.pool.put(node);
        }
    }
}
