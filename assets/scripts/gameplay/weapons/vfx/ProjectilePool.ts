import { Node, MeshRenderer, primitives, utils, Material, Color } from 'cc';

/**
 * ProjectilePool — 轻量级代码节点池
 *
 * 与 PoolManager 不同，不依赖 Prefab，使用工厂函数按需创建节点。
 * 专为武器子弹/VFX 碎片等高频创建销毁的场景设计。
 *
 * 核心原则：战斗中绝不 new Node() 或 destroy()。
 */
export class ProjectilePool {
    private static _pools: Map<string, Node[]> = new Map();
    private static _factories: Map<string, () => Node> = new Map();
    private static _recycleCbs: Map<string, (node: Node) => void> = new Map();

    /**
     * 注册一个池（附带工厂函数）
     * @param key   池名称
     * @param factory 节点工厂
     * @param warmUp  预热数量
     */
    public static register(
        key: string,
        factory: () => Node,
        warmUp: number = 0,
        recycleCb?: (node: Node) => void
    ): void {
        if (!this._pools.has(key)) {
            this._pools.set(key, []);
        }
        this._factories.set(key, factory);
        if (recycleCb) {
            this._recycleCbs.set(key, recycleCb);
        }
        // 预热
        const pool = this._pools.get(key)!;
        for (let i = 0; i < warmUp; i++) {
            const node = factory();
            node.active = false;
            pool.push(node);
        }
    }

    /** 从池中取出节点，池空则用工厂创建 */
    public static get(key: string): Node | null {
        const pool = this._pools.get(key);
        if (pool && pool.length > 0) {
            const node = pool.pop()!;
            node.active = true;
            return node;
        }
        const factory = this._factories.get(key);
        if (factory) {
            const node = factory();
            node.active = true;
            return node;
        }
        return null;
    }

    /** 回收节点到池（不销毁，仅隐藏） */
    public static put(key: string, node: Node): void {
        if (!node.isValid) return;

        // Execute recycle callback if exists
        const cb = this._recycleCbs.get(key);
        if (cb) {
            cb(node);
        }

        node.active = false;
        node.removeFromParent();
        let pool = this._pools.get(key);
        if (!pool) {
            pool = [];
            this._pools.set(key, pool);
        }
        pool.push(node);
    }

    /** 延迟回收（用于有动画的VFX节点） */
    public static putDelayed(key: string, node: Node, delaySec: number): void {
        setTimeout(() => {
            if (node.isValid) {
                this.put(key, node);
            }
        }, delaySec * 1000);
    }

    /** 获取池大小 */
    public static size(key: string): number {
        return this._pools.get(key)?.length ?? 0;
    }

    /** 清空所有池 */
    public static clearAll(): void {
        this._pools.forEach(pool => {
            pool.forEach(n => {
                if (n.isValid) n.destroy();
            });
        });
        this._pools.clear();
        this._factories.clear();
        this._recycleCbs.clear();
    }
}
