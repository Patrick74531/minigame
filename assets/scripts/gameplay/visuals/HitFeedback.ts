import { _decorator, Component, Color, Material, MeshRenderer, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('HitFeedback')
export class HitFeedback extends Component {
    @property
    public flashDuration: number = 0.1;

    @property
    public shakeIntensity: number = 0.4;

    @property
    public shakeDuration: number = 0.15;

    @property
    public flashColor: Color = new Color(255, 0, 0, 255);

    @property
    public punchScale: number = 0.16;

    @property
    public punchDuration: number = 0.12;

    private _hitFlashTimer: number = 0;
    private _isHitFlashing: boolean = false;
    private _originalMaterials: Map<MeshRenderer, Material[]> = new Map();
    private _meshRenderers: MeshRenderer[] = [];
    private _activeFlashColor: Color = new Color(255, 255, 255, 255);

    // micro-shake state
    private _shakeTimer: number = 0;
    private _shakeDur: number = 0;
    private _shakeStr: number = 0;
    private _origLocalPos: Vec3 = new Vec3();
    private _isShaking: boolean = false;

    // punch scale state
    private _isPunching: boolean = false;
    private _punchTimer: number = 0;
    private _punchDur: number = 0;
    private _punchAmp: number = 0;
    private _origLocalScale: Vec3 = new Vec3(1, 1, 1);

    protected start(): void {
        this.cacheMeshRenderers();
    }

    private cacheMeshRenderers(): void {
        // Find all renderers in this node and children
        this._meshRenderers = this.node.getComponentsInChildren(MeshRenderer);
        // Ensure _meshRenderers is populated if called dynamically
    }

    /**
     * Call this when the unit takes damage.
     */
    public playHitFeedback(microShake: boolean = true, intensity: number = 1): void {
        const amp = Math.max(0.4, Math.min(2.0, intensity));
        this.startHitFlash(amp);
        if (microShake) {
            this.startMicroShake(amp);
        }
        this.startPunch(amp);
    }

    private startMicroShake(intensity: number): void {
        const dur = Math.max(0.04, this.shakeDuration * (0.85 + intensity * 0.2));
        const str = Math.max(0.03, this.shakeIntensity * 0.3 * intensity);
        if (!this._isShaking) {
            this._origLocalPos.set(this.node.position);
        }
        this._isShaking = true;
        this._shakeTimer = 0;
        this._shakeDur = dur;
        this._shakeStr = str;
    }

    private startPunch(intensity: number): void {
        if (!this._isPunching) {
            this._origLocalScale.set(this.node.scale);
        }
        this._isPunching = true;
        this._punchTimer = 0;
        this._punchDur = Math.max(0.05, this.punchDuration);
        this._punchAmp = Math.max(0.03, this.punchScale * intensity);
    }

    private startHitFlash(intensity: number): void {
        this.cacheMeshRenderers(); // Refresh in case weapons/parts changed
        this._activeFlashColor = this.resolveBoostedFlashColor(intensity);

        if (!this._hitFlashTimer && this._meshRenderers.length > 0) {
            this._isHitFlashing = true;
            this._hitFlashTimer = this.flashDuration;

            for (const renderer of this._meshRenderers) {
                if (!renderer || !renderer.isValid) continue;

                if (!this._originalMaterials.has(renderer)) {
                    const validMats = renderer.sharedMaterials.filter(
                        m => m !== null
                    ) as Material[];
                    this._originalMaterials.set(renderer, validMats);
                }

                const matCount = renderer.sharedMaterials.length;
                for (let i = 0; i < matCount; i++) {
                    const origMat = renderer.sharedMaterials[i];
                    if (!origMat) continue;

                    // Create an instance of the current material to preserve passes (like skinning)
                    const flashMat = new Material();
                    flashMat.copy(origMat);

                    // Try setting common color properties to Red
                    if (flashMat.passes && flashMat.passes.length > 0) {
                        const pass = flashMat.passes[0];
                        if (pass.getHandle('albedo') !== 0) {
                            flashMat.setProperty('albedo', this._activeFlashColor);
                        } else if (pass.getHandle('mainColor') !== 0) {
                            flashMat.setProperty('mainColor', this._activeFlashColor);
                        } else if (pass.getHandle('baseColor') !== 0) {
                            flashMat.setProperty('baseColor', this._activeFlashColor);
                        }
                        if (pass.getHandle('emissive') !== 0) {
                            flashMat.setProperty('emissive', this.resolveEmissiveFlashColor(intensity));
                        }
                    }

                    renderer.setMaterial(flashMat, i);
                }
            }
        } else {
            // Extend the flash if hit again
            this._hitFlashTimer = this.flashDuration;
        }
    }

    private resolveBoostedFlashColor(intensity: number): Color {
        const boost = Math.min(72, Math.round(26 * intensity));
        const gbBoost = Math.max(0, Math.round(boost * 0.22));
        return new Color(
            Math.min(255, this.flashColor.r + boost),
            Math.min(255, this.flashColor.g + gbBoost),
            Math.min(255, this.flashColor.b + gbBoost),
            this.flashColor.a
        );
    }

    private resolveEmissiveFlashColor(intensity: number): Color {
        const scale = Math.max(0.12, Math.min(0.26, 0.12 + intensity * 0.08));
        return new Color(
            Math.round(this._activeFlashColor.r * scale),
            Math.round(this._activeFlashColor.g * scale),
            Math.round(this._activeFlashColor.b * scale),
            this._activeFlashColor.a
        );
    }

    protected update(dt: number): void {
        if (this._isHitFlashing) {
            this._hitFlashTimer -= dt;
            if (this._hitFlashTimer <= 0) {
                this._isHitFlashing = false;
                this._hitFlashTimer = 0;
                this.stopHitFlash();
            }
        }

        if (this._isShaking) {
            this._shakeTimer += dt;
            if (this._shakeTimer >= this._shakeDur) {
                this._isShaking = false;
                this.node.setPosition(this._origLocalPos);
            } else {
                const progress = this._shakeTimer / this._shakeDur;
                const decay = 1 - progress;
                const ox = (Math.random() - 0.5) * 2 * this._shakeStr * decay;
                const oz = (Math.random() - 0.5) * 2 * this._shakeStr * decay;
                this.node.setPosition(
                    this._origLocalPos.x + ox,
                    this._origLocalPos.y,
                    this._origLocalPos.z + oz
                );
            }
        }

        if (this._isPunching) {
            this._punchTimer += dt;
            if (this._punchTimer >= this._punchDur) {
                this._isPunching = false;
                this.node.setScale(this._origLocalScale);
            } else {
                const t = this._punchTimer / this._punchDur;
                const envelope = 1 - t;
                const pulse = Math.sin(t * Math.PI * 2.6) * envelope;
                const s = 1 + pulse * this._punchAmp;
                this.node.setScale(
                    this._origLocalScale.x * s,
                    this._origLocalScale.y * s,
                    this._origLocalScale.z * s
                );
            }
        }
    }

    private stopHitFlash(): void {
        for (const [renderer, originalMats] of this._originalMaterials.entries()) {
            if (renderer && renderer.isValid) {
                for (let i = 0; i < originalMats.length; i++) {
                    renderer.setMaterial(originalMats[i], i);
                }
            }
        }
        this._originalMaterials.clear();
    }

    protected onDestroy(): void {
        this.stopHitFlash();
        if (this._isShaking) {
            this._isShaking = false;
            this.node.setPosition(this._origLocalPos);
        }
        if (this._isPunching) {
            this._isPunching = false;
            this.node.setScale(this._origLocalScale);
        }
    }
}
