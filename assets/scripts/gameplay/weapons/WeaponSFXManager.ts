import { AudioClip, AudioSource, Node, director, resources } from 'cc';
import { WeaponType } from './WeaponTypes';
import { AudioSettingsManager } from '../../core/managers/AudioSettingsManager';

type WeaponSfxKey = 'fire' | 'gun' | 'laser' | 'disturb';
type LoopSfxKey = 'fire' | 'gun';

/**
 * WeaponSFXManager
 *
 * 统一管理武器音效：
 * - 循环类：喷火器 fire、机枪 gun
 * - 单发类：加农炮 laser、模拟回声 disturb
 *
 * 设计目标：
 * 1) 将音效逻辑从武器行为中解耦
 * 2) 支持后续新增武器音效（映射+资源路径即可）
 * 3) 避免循环音效在切武器/丢失目标时残留
 */
export class WeaponSFXManager {
    private static readonly CLIP_PATHS: Record<WeaponSfxKey, string> = {
        fire: 'sound/fire',
        gun: 'sound/gun',
        laser: 'sound/laser',
        disturb: 'sound/disturb',
    };

    private static readonly LOOP_WEAPON_MAP: Partial<Record<WeaponType, LoopSfxKey>> = {
        [WeaponType.FLAMETHROWER]: 'fire',
        [WeaponType.MACHINE_GUN]: 'gun',
    };

    private static readonly ONESHOT_WEAPON_MAP: Partial<Record<WeaponType, WeaponSfxKey>> = {
        [WeaponType.CANNON]: 'laser',
        [WeaponType.GLITCH_WAVE]: 'disturb',
    };

    private static readonly VOLUMES: Record<WeaponSfxKey, number> = {
        fire: 0.65,
        gun: 0.72,
        laser: 0.88,
        disturb: 0.82,
    };

    private static _rootNode: Node | null = null;
    private static _sources: Partial<Record<WeaponSfxKey, AudioSource>> = {};
    private static _clips: Partial<Record<WeaponSfxKey, AudioClip>> = {};
    private static _loading: Set<WeaponSfxKey> = new Set();

    // 循环播放采用“按 owner 引用计数”，避免残留与抢停
    private static _ownerLoopKey: Map<string, LoopSfxKey> = new Map();
    private static _loopRefCount: Record<LoopSfxKey, number> = {
        fire: 0,
        gun: 0,
    };

    // 单发音效在未加载时先记账，加载完成后补播
    private static _pendingOneShot: Record<WeaponSfxKey, number> = {
        fire: 0,
        gun: 0,
        laser: 0,
        disturb: 0,
    };

    public static initialize(parent?: Node): void {
        this._ensureRoot(parent);
        this._ensureAllSources();
        this.refreshVolumes();
        this._preloadAllClips();
    }

    public static refreshVolumes(): void {
        const keys: WeaponSfxKey[] = ['fire', 'gun', 'laser', 'disturb'];
        for (const key of keys) {
            const source = this._sources[key];
            if (!source || !source.isValid) continue;
            source.volume = this.resolveEffectiveVolume(key);
        }
    }

    public static cleanup(): void {
        this.stopAllLoops();

        const keys: WeaponSfxKey[] = ['fire', 'gun', 'laser', 'disturb'];
        for (const key of keys) {
            const src = this._sources[key];
            if (src && src.isValid) {
                src.stop();
                src.clip = null;
            }
        }

        this._sources = {};
        this._clips = {};
        this._loading.clear();

        this._pendingOneShot.fire = 0;
        this._pendingOneShot.gun = 0;
        this._pendingOneShot.laser = 0;
        this._pendingOneShot.disturb = 0;

        if (this._rootNode && this._rootNode.isValid) {
            this._rootNode.destroy();
        }
        this._rootNode = null;
    }

    /**
     * 根据“当前武器 + 是否在攻击状态”同步循环音效。
     * - 喷火器攻击中 -> fire loop
     * - 机枪攻击中   -> gun loop
     * - 其他情况     -> 关闭 owner 当前 loop
     */
    public static syncLoopState(
        owner: Node,
        activeWeaponType: WeaponType | null,
        isAttacking: boolean
    ): void {
        if (!owner || !owner.isValid) return;
        this._ensureRoot();

        const desiredKey =
            activeWeaponType && isAttacking
                ? (this.LOOP_WEAPON_MAP[activeWeaponType] ?? null)
                : null;

        const ownerId = owner.uuid;
        const currentKey = this._ownerLoopKey.get(ownerId) ?? null;

        if (currentKey === desiredKey) {
            return;
        }

        if (currentKey) {
            this._detachOwnerLoop(ownerId, currentKey);
        }

        if (desiredKey) {
            this._attachOwnerLoop(ownerId, desiredKey);
        }
    }

    public static stopAllLoops(owner?: Node): void {
        if (owner) {
            const ownerId = owner.uuid;
            const key = this._ownerLoopKey.get(ownerId);
            if (!key) return;
            this._detachOwnerLoop(ownerId, key);
            return;
        }

        // 全量清理（场景退出 / 系统销毁）
        const entries = Array.from(this._ownerLoopKey.entries());
        for (const [ownerId, key] of entries) {
            this._detachOwnerLoop(ownerId, key);
        }
    }

    /** 按武器类型播放单发音效（加农炮/模拟回声）。 */
    public static playAttackOneShot(weaponType: WeaponType): void {
        const key = this.ONESHOT_WEAPON_MAP[weaponType];
        if (!key) return;
        this.playOneShot(key);
    }

    public static playOneShot(key: WeaponSfxKey): void {
        this._ensureRoot();
        const source = this._getOrCreateSource(key);
        const clip = this._clips[key];

        if (source && clip) {
            source.volume = this.resolveEffectiveVolume(key);
            source.playOneShot(clip, 1);
            return;
        }

        this._pendingOneShot[key] += 1;
        this._ensureClipLoaded(key);
    }

    private static _ensureRoot(parent?: Node): void {
        if (this._rootNode && this._rootNode.isValid) return;

        const attachParent = parent ?? director.getScene();
        if (!attachParent) return;

        const node = new Node('WeaponSFXRoot');
        attachParent.addChild(node);
        this._rootNode = node;
    }

    private static _ensureAllSources(): void {
        this._getOrCreateSource('fire');
        this._getOrCreateSource('gun');
        this._getOrCreateSource('laser');
        this._getOrCreateSource('disturb');
    }

    private static _getOrCreateSource(key: WeaponSfxKey): AudioSource | null {
        const cached = this._sources[key];
        if (cached && cached.isValid) return cached;

        this._ensureRoot();
        if (!this._rootNode || !this._rootNode.isValid) return null;

        const sourceNode = new Node(`WeaponSFX_${key}`);
        this._rootNode.addChild(sourceNode);

        const source = sourceNode.addComponent(AudioSource);
        source.playOnAwake = false;
        source.loop = false;
        source.volume = this.resolveEffectiveVolume(key);

        this._sources[key] = source;
        return source;
    }

    private static _preloadAllClips(): void {
        const keys: WeaponSfxKey[] = ['fire', 'gun', 'laser', 'disturb'];
        for (const key of keys) {
            this._ensureClipLoaded(key);
        }
    }

    private static _ensureClipLoaded(key: WeaponSfxKey): void {
        if (this._clips[key] || this._loading.has(key)) return;

        this._loading.add(key);
        resources.load(this.CLIP_PATHS[key], AudioClip, (err, clip) => {
            this._loading.delete(key);
            if (err || !clip) {
                console.warn(`[WeaponSFX] Failed to load clip: ${key}`, err);
                return;
            }

            this._clips[key] = clip;
            const source = this._getOrCreateSource(key);
            if (source && source.isValid) {
                source.clip = clip;
            }

            // 加载完成后：
            // 1) 如果是循环音效且当前有引用，立即开始播放
            if (key === 'fire' || key === 'gun') {
                if (this._loopRefCount[key] > 0) {
                    this._ensureLoopPlaying(key);
                }
            }

            // 2) 补播 pending 单发
            const pending = this._pendingOneShot[key];
            if (pending > 0 && source && source.isValid) {
                this._pendingOneShot[key] = 0;
                for (let i = 0; i < pending; i++) {
                    source.playOneShot(clip, 1);
                }
            }
        });
    }

    private static _attachOwnerLoop(ownerId: string, key: LoopSfxKey): void {
        this._ownerLoopKey.set(ownerId, key);
        this._loopRefCount[key] += 1;
        this._ensureLoopPlaying(key);
    }

    private static _detachOwnerLoop(ownerId: string, key: LoopSfxKey): void {
        const current = this._ownerLoopKey.get(ownerId);
        if (current !== key) return;

        this._ownerLoopKey.delete(ownerId);
        this._loopRefCount[key] = Math.max(0, this._loopRefCount[key] - 1);

        if (this._loopRefCount[key] <= 0) {
            const source = this._getOrCreateSource(key);
            if (source && source.isValid) {
                source.stop();
            }
        }
    }

    private static _ensureLoopPlaying(key: LoopSfxKey): void {
        const source = this._getOrCreateSource(key);
        const clip = this._clips[key];
        if (!source) return;

        source.loop = true;
        source.volume = this.resolveEffectiveVolume(key);

        if (!clip) {
            this._ensureClipLoaded(key);
            return;
        }

        source.clip = clip;
        source.play();
    }

    private static resolveEffectiveVolume(key: WeaponSfxKey): number {
        const globalSfx = AudioSettingsManager.instance.sfxVolume;
        return Math.max(0, Math.min(1, this.VOLUMES[key] * globalSfx));
    }
}
