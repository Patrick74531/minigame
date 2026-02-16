import {
    _decorator,
    Component,
    SkeletalAnimation,
    Node,
    resources,
    Prefab,
    instantiate,
    MeshRenderer,
    primitives,
    utils,
    Color,
    Material,
    tween,
    Tween,
    Vec3,
} from 'cc';
import { Enemy } from '../units/Enemy';
import { UnitState } from '../units/Unit';

const { ccclass, property } = _decorator;

@ccclass('EnemyFlyingAnimator')
export class EnemyFlyingAnimator extends Component {
    @property
    public modelPath: string = '';

    @property
    public visualScale: number = 4.5;

    @property
    public yOffset: number = 0.5;

    @property
    public rotationY: number = 180; // Model moving backwards, rotate 180

    @property
    public runAnimSpeed: number = 1.0;

    @property
    public attackAnimSpeed: number = 1.0;

    @property
    public animationSource: string = 'enemies/boss/Robot_Animations'; // Shared animations moved to boss folder

    private _enemy: Enemy | null = null;
    private _model: Node | null = null;
    private _anim: SkeletalAnimation | null = null;

    // Tween animation support (for Tank)
    private _useTween: boolean = false;
    private _baseScale: Vec3 = new Vec3();

    private _clipIdle: string = '';
    private _clipMove: string = '';
    private _clipAttack: string = '';

    private _currentState: number = -1;

    protected start(): void {
        this._enemy = this.node.getComponent(Enemy);

        // Hide the default debug cube (Red) created by UnitFactory
        const defaultMesh = this.node.getComponent(MeshRenderer);
        if (defaultMesh) {
            defaultMesh.enabled = false;
        }

        console.log(`[EnemyFlyingAnimator] Starting load for: ${this.modelPath}`);
        this.loadModel();
    }

    private loadModel(): void {
        resources.load(this.modelPath, Prefab, (err, prefab) => {
            const owner = this.node as Node | null;
            if (!owner || !owner.isValid) return;
            if (err) {
                console.warn(
                    `[EnemyFlyingAnimator] Failed to load at ${this.modelPath}, trying nested path...`
                );
                // Retry with nested path (common GLTF import quirk)
                const nestedPath = `${this.modelPath}/${this.modelPath.split('/').pop()}`;
                resources.load(nestedPath, Prefab, (err2, prefab2) => {
                    const retryOwner = this.node as Node | null;
                    if (!retryOwner || !retryOwner.isValid) return;
                    if (err2) {
                        console.error(
                            `[EnemyFlyingAnimator] Failed to load model at ${nestedPath}:`,
                            err2
                        );
                        this.createFallback();
                        return;
                    }
                    this.onModelLoaded(prefab2);
                });
                return;
            }
            this.onModelLoaded(prefab);
        });
    }

    private onModelLoaded(prefab: Prefab): void {
        console.log(`[EnemyFlyingAnimator] Successfully loaded model.`);
        const owner = this.node as Node | null;
        if (!owner || !owner.isValid) return;

        this._model = instantiate(prefab);
        this.applyShadowSettingsRecursive(this._model);
        owner.addChild(this._model);

        this._model.setPosition(0, this.yOffset, 0);
        this._model.setScale(this.visualScale, this.visualScale, this.visualScale);
        this._model.setRotationFromEuler(0, this.rotationY, 0);

        this._baseScale.set(this.visualScale, this.visualScale, this.visualScale);

        // Get/Add SkeletalAnimation
        this._anim = this._model.getComponent(SkeletalAnimation);
        if (!this._anim) {
            const anims = this._model.getComponentsInChildren(SkeletalAnimation);
            if (anims.length > 0) {
                this._anim = anims[0];
            }
        }

        if (this._anim) {
            this.detectClips();
            this.updateAnimation(true);
        } else {
            // No skeleton found (e.g. Tank)
            console.warn(
                '[EnemyFlyingAnimator] No SkeletalAnimation found on loaded model. Using Tween fallback.'
            );
            this._useTween = true;
            this.updateAnimation(true);
        }
    }

    private applyShadowSettingsRecursive(root: Node): void {
        const renderers = root.getComponentsInChildren(MeshRenderer);
        for (const renderer of renderers) {
            renderer.shadowCastingMode = 1;
            renderer.receiveShadow = true;
        }
    }

    private detectClips(): void {
        if (!this._anim) return;

        const clips = this._anim.clips;
        if (!clips || clips.length === 0) {
            console.warn('[EnemyFlyingAnimator] No clips in SkeletalAnimation.');
            return;
        }

        const find = (keywords: string[]): string => {
            for (const clip of clips) {
                if (!clip) continue;
                const name = clip.name.toLowerCase();
                for (const k of keywords) {
                    if (name.includes(k)) return clip.name;
                }
            }
            return '';
        };

        this._clipIdle = find(['idle', 'stay', 'stand']);
        this._clipMove = find(['fly', 'run', 'walk', 'move']);
        this._clipAttack = find(['attack', 'shoot', 'fire', 'hit', 'melee']);

        // Fallbacks
        if (!this._clipIdle && clips.length > 0) this._clipIdle = clips[0]?.name ?? '';
        if (!this._clipMove) this._clipMove = this._clipIdle;
        if (!this._clipAttack) this._clipAttack = this._clipMove;
    }

    protected update(_dt: number): void {
        if (!this._enemy || !this._model) return;

        const state = this._enemy.state;
        if (state !== this._currentState) {
            this._currentState = state;
            this.updateAnimation();
        }
    }

    private updateAnimation(force: boolean = false): void {
        if (this._useTween) {
            this.playTweenAnimation(this._currentState);
            return;
        }

        if (!this._anim) return;

        let clipName = this._clipIdle;
        let speed = 1.0;

        if (this._currentState === UnitState.MOVING) {
            clipName = this._clipMove;
            speed = this.runAnimSpeed;
        } else if (this._currentState === UnitState.ATTACKING) {
            clipName = this._clipAttack;
            speed = this.attackAnimSpeed;
        }

        if (clipName) {
            const state = this._anim.getState(clipName);
            if (state && state.isPlaying && !force) return;

            this._anim.crossFade(clipName, 0.2);

            const newState = this._anim.getState(clipName);
            if (newState) {
                newState.speed = speed;
            }
        }
    }

    private playTweenAnimation(state: number): void {
        if (!this._model) return;

        // Stop existing tweens
        // Tween.stopAllByTarget(this._model); // Stop causing conflicts?
        // Reset scale?
        // Only reset if switching states?

        switch (state) {
            case UnitState.ATTACKING: // Attack
                this.playAttackTween();
                break;
            case UnitState.MOVING: // Move
                // Ensure scale is reset
                // this._model.setScale(this._baseScale);
                break;
            default:
                break;
        }
    }

    private playAttackTween(): void {
        if (!this._model) return;

        // Similar to Tower.ts shoot animation
        const squashScale = new Vec3(
            this._baseScale.x * 1.15,
            this._baseScale.y * 0.82,
            this._baseScale.z * 1.15
        );

        Tween.stopAllByTarget(this._model);
        this._model.setScale(this._baseScale);

        tween(this._model)
            .to(0.05, { scale: squashScale }, { easing: 'elasticIn' })
            .to(0.2, { scale: this._baseScale }, { easing: 'backOut' })
            .start();
    }

    private createFallback(): void {
        const owner = this.node as Node | null;
        if (!owner || !owner.isValid) return;
        const fallback = new Node('FallbackCube');
        const mr = fallback.addComponent(MeshRenderer);
        mr.mesh = utils.createMesh(primitives.box({ width: 0.5, height: 0.5, length: 0.5 }));
        const mat = new Material();
        mat.initialize({
            effectName: 'builtin-standard',
            technique: 0,
        });
        mat.setProperty('mainColor', new Color(0, 0, 255, 255)); // Blue for load failure
        mr.material = mat;

        owner.addChild(fallback);
        fallback.setPosition(0, 0.5, 0);
        console.warn('[EnemyFlyingAnimator] Created Fallback Cube due to load failure.');
    }
}
