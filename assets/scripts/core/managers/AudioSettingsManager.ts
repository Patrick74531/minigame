import { AudioClip, AudioSource, Node, director, resources } from 'cc';

const STORAGE_KEY_BGM = 'kingshit.audio.bgm';
const STORAGE_KEY_SFX = 'kingshit.audio.sfx';
const DEFAULT_BGM_VOLUME = 0.3;
const DEFAULT_SFX_VOLUME = 0.3;

/**
 * AudioSettingsManager
 *
 * - 管理背景音乐（BGM）播放
 * - 管理并持久化 BGM / SFX 音量
 */
export class AudioSettingsManager {
    private static _instance: AudioSettingsManager | null = null;

    public static get instance(): AudioSettingsManager {
        if (!this._instance) {
            this._instance = new AudioSettingsManager();
        }
        return this._instance;
    }

    private _bgmVolume: number = DEFAULT_BGM_VOLUME;
    private _sfxVolume: number = DEFAULT_SFX_VOLUME;

    private _rootNode: Node | null = null;
    private _bgmSource: AudioSource | null = null;
    private _bgmClip: AudioClip | null = null;
    private _loadingBgm: boolean = false;

    private constructor() {
        this.loadPersistedVolumes();
    }

    public initialize(parent?: Node): void {
        this.ensureRoot(parent);
        this.ensureBgmSource();
        this.applyBgmVolume();
        this.ensureBgmClipLoaded();
    }

    public cleanup(): void {
        if (this._bgmSource && this._bgmSource.isValid) {
            this._bgmSource.stop();
            this._bgmSource.clip = null;
        }

        if (this._rootNode && this._rootNode.isValid) {
            this._rootNode.destroy();
        }

        this._rootNode = null;
        this._bgmSource = null;
        this._bgmClip = null;
        this._loadingBgm = false;
    }

    public get bgmVolume(): number {
        return this._bgmVolume;
    }

    public get sfxVolume(): number {
        return this._sfxVolume;
    }

    public setBgmVolume(value: number): void {
        this._bgmVolume = this.clampVolume(value);
        this.saveVolume(STORAGE_KEY_BGM, this._bgmVolume);
        this.applyBgmVolume();
    }

    public setSfxVolume(value: number): void {
        this._sfxVolume = this.clampVolume(value);
        this.saveVolume(STORAGE_KEY_SFX, this._sfxVolume);
    }

    private ensureRoot(parent?: Node): void {
        if (this._rootNode && this._rootNode.isValid) return;

        const attachParent = parent ?? director.getScene();
        if (!attachParent) return;

        const root = new Node('AudioSettingsRoot');
        attachParent.addChild(root);
        this._rootNode = root;
    }

    private ensureBgmSource(): AudioSource | null {
        const cached = this._bgmSource;
        if (cached && cached.isValid) return cached;

        this.ensureRoot();
        if (!this._rootNode || !this._rootNode.isValid) return null;

        const bgmNode = new Node('BGMSource');
        this._rootNode.addChild(bgmNode);

        const source = bgmNode.addComponent(AudioSource);
        source.playOnAwake = false;
        source.loop = true;
        source.volume = this._bgmVolume;

        this._bgmSource = source;
        return source;
    }

    private ensureBgmClipLoaded(): void {
        if (this._bgmClip) {
            this.bindAndPlayBgm();
            return;
        }
        if (this._loadingBgm) return;

        this._loadingBgm = true;
        resources.load('sound/bgmusic', AudioClip, (err, clip) => {
            this._loadingBgm = false;
            if (err || !clip) {
                console.warn('[AudioSettings] Failed to load BGM clip: sound/bgmusic', err);
                return;
            }

            this._bgmClip = clip;
            this.bindAndPlayBgm();
        });
    }

    private bindAndPlayBgm(): void {
        const source = this.ensureBgmSource();
        if (!source || !source.isValid || !this._bgmClip) return;

        source.clip = this._bgmClip;
        source.loop = true;
        this.applyBgmVolume();

        if (!source.playing) {
            source.play();
        }
    }

    private applyBgmVolume(): void {
        if (this._bgmSource && this._bgmSource.isValid) {
            this._bgmSource.volume = this._bgmVolume;
        }
    }

    private loadPersistedVolumes(): void {
        this._bgmVolume = this.readVolume(STORAGE_KEY_BGM, DEFAULT_BGM_VOLUME);
        this._sfxVolume = this.readVolume(STORAGE_KEY_SFX, DEFAULT_SFX_VOLUME);
    }

    private readVolume(key: string, fallback: number): number {
        const storage = this.resolveStorage();
        if (!storage) return fallback;

        try {
            const raw = storage.getItem(key);
            if (raw === null) return fallback;
            const value = Number(raw);
            if (!Number.isFinite(value)) return fallback;
            return this.clampVolume(value);
        } catch {
            return fallback;
        }
    }

    private saveVolume(key: string, value: number): void {
        const storage = this.resolveStorage();
        if (!storage) return;

        try {
            storage.setItem(key, `${this.clampVolume(value)}`);
        } catch {
            // ignore persistence errors in restricted environments
        }
    }

    private resolveStorage(): Storage | null {
        try {
            const maybeStorage = (globalThis as { localStorage?: Storage }).localStorage;
            return maybeStorage ?? null;
        } catch {
            return null;
        }
    }

    private clampVolume(value: number): number {
        if (!Number.isFinite(value)) return DEFAULT_SFX_VOLUME;
        return Math.max(0, Math.min(1, value));
    }
}
