import { AnimationComponent, Node, Prefab, Vec3, instantiate, resources, tween } from 'cc';

/**
 * 旋风斩特效 — 使用从"炫酷技能管理器"迁移的 skill0.prefab 及 daoguang_skill_2.anim
 * 替换信号干扰器(GlitchWave)的命中视觉效果
 */
export class WhirlwindSlashEffect {
    private static readonly PREFAB_PATH = 'effects/whirlwind_anim/prefab/skill0';
    private static _prefabCache: Prefab | null = null;
    private static _loading = false;
    private static _pending: Array<{ parent: Node; position: Vec3; radius: number }> = [];

    public static play(payload: { parent: Node; position: Vec3; radius: number }): void {
        if (this._prefabCache) {
            this._spawn(payload);
            return;
        }
        this._pending.push(payload);
        if (this._loading) return;
        this._loading = true;
        resources.load(this.PREFAB_PATH, Prefab, (err, prefab) => {
            this._loading = false;
            if (err || !prefab) {
                this._pending.length = 0;
                return;
            }
            this._prefabCache = prefab;
            const queue = this._pending.splice(0);
            for (const p of queue) {
                this._spawn(p);
            }
        });
    }

    private static _spawn(payload: { parent: Node; position: Vec3; radius: number }): void {
        if (!this._prefabCache) return;

        const container = new Node('WhirlwindSlash');
        payload.parent.addChild(container);
        container.setWorldPosition(payload.position);

        // 按 waveRadius 缩放（原库 scale=1 对应约 4 单位半径）
        const scale = Math.max(0.4, payload.radius * 0.28);
        container.setScale(scale, scale, scale);

        const effectNode = instantiate(this._prefabCache);
        container.addChild(effectNode);

        // 查找 AnimationComponent 并播放（原库通过 AnimationComponent.play() 驱动动画）
        let anim =
            effectNode.getComponent(AnimationComponent) ??
            effectNode.getComponentInChildren(AnimationComponent);
        let duration = 2.0; // 与 skill.json time 字段一致
        if (anim) {
            anim.play();
            if (anim.defaultClip) duration = Math.max(0.5, anim.defaultClip.duration);
        }

        // 单一销毁路径：只用 tween，避免双重销毁
        tween(container)
            .delay(duration + 0.1)
            .call(() => {
                if (container.isValid) container.destroy();
            })
            .start();
    }
}
