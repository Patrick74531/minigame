import { AnimationComponent, Node, Prefab, Vec3, instantiate, resources, tween } from 'cc';

/** WrapMode.Loop 在 CC3 运行时 tree-shake 后可能为 undefined，直接用数值 2 */
const WRAP_MODE_LOOP = 2;

/**
 * 旋风斩特效 — 使用从"炫酷技能管理器"迁移的 skill0.prefab 及 daoguang_skill_2.anim
 */
export class WhirlwindSlashEffect {
    private static readonly PREFAB_PATH = 'effects/whirlwind_anim/prefab/skill0';
    private static _prefabCache: Prefab | null = null;
    private static _loading = false;
    private static _pending: Array<{ parent: Node; position: Vec3; radius: number }> = [];
    private static _pendingPersistent: Array<{
        payload: { parent: Node; position: Vec3; radius: number };
        cb: (node: Node) => void;
    }> = [];

    /** 单次播放后自动销毁（备用） */
    public static play(payload: { parent: Node; position: Vec3; radius: number }): void {
        if (this._prefabCache) {
            this._spawnOneShot(payload);
            return;
        }
        this._pending.push(payload);
        this._ensureLoaded();
    }

    /**
     * 创建持续存在的特效节点，动画设为循环，由调用方负责销毁。
     * 若 prefab 尚未加载，将在加载完成后通过 cb 回调返回节点。
     */
    public static spawnPersistent(
        payload: { parent: Node; position: Vec3; radius: number },
        cb: (node: Node) => void
    ): void {
        if (this._prefabCache) {
            cb(this._spawnPersistentNow(payload));
            return;
        }
        this._pendingPersistent.push({ payload, cb });
        this._ensureLoaded();
    }

    private static _ensureLoaded(): void {
        if (this._loading) return;
        this._loading = true;
        resources.load(this.PREFAB_PATH, Prefab, (err, prefab) => {
            this._loading = false;
            if (err || !prefab) {
                this._pending.length = 0;
                this._pendingPersistent.length = 0;
                return;
            }
            this._prefabCache = prefab;
            const shots = this._pending.splice(0);
            for (const p of shots) this._spawnOneShot(p);
            const persists = this._pendingPersistent.splice(0);
            for (const { payload, cb } of persists) cb(this._spawnPersistentNow(payload));
        });
    }

    private static _spawnOneShot(payload: { parent: Node; position: Vec3; radius: number }): void {
        if (!this._prefabCache) return;
        const container = this._buildContainer(payload);
        const anim = this._getAnim(container);
        let duration = 2.0;
        if (anim) {
            anim.play();
            if (anim.defaultClip) duration = Math.max(0.5, anim.defaultClip.duration);
        }
        tween(container)
            .delay(duration + 0.1)
            .call(() => {
                if (container.isValid) container.destroy();
            })
            .start();
    }

    private static _spawnPersistentNow(payload: {
        parent: Node;
        position: Vec3;
        radius: number;
    }): Node {
        const container = this._buildContainer(payload);
        const anim = this._getAnim(container);
        if (anim && anim.defaultClip) {
            const state = anim.getState(anim.defaultClip.name);
            if (state) state.wrapMode = WRAP_MODE_LOOP;
            anim.play();
        }
        return container;
    }

    private static _buildContainer(payload: {
        parent: Node;
        position: Vec3;
        radius: number;
    }): Node {
        const container = new Node('WhirlwindSlash');
        payload.parent.addChild(container);
        container.setWorldPosition(payload.position);
        const scale = Math.max(0.4, payload.radius * 0.28);
        container.setScale(scale, scale, scale);
        const effectNode = instantiate(this._prefabCache!);
        container.addChild(effectNode);
        return container;
    }

    private static _getAnim(container: Node): AnimationComponent | null {
        const child = container.children[0];
        if (!child) return null;
        return (
            child.getComponent(AnimationComponent) ??
            child.getComponentInChildren(AnimationComponent)
        );
    }
}
