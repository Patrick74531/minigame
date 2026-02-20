import { _decorator, Component, Color, Material, MeshRenderer } from 'cc';
import { ScreenShake } from '../weapons/vfx/ScreenShake';

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

    private _hitFlashTimer: number = 0;
    private _isHitFlashing: boolean = false;
    private _originalMaterials: Map<MeshRenderer, Material[]> = new Map();
    private _flashMaterial: Material | null = null;
    private _meshRenderers: MeshRenderer[] = [];

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
    public playHitFeedback(): void {
        this.startHitFlash();
    }

    private startHitFlash(): void {
        this.cacheMeshRenderers(); // Refresh in case weapons/parts changed

        if (!this._hitFlashTimer && this._meshRenderers.length > 0) {
            this._isHitFlashing = true;
            this._hitFlashTimer = this.flashDuration;

            for (const renderer of this._meshRenderers) {
                if (!renderer || !renderer.isValid) continue;

                if (!this._originalMaterials.has(renderer)) {
                    const validMats = renderer.sharedMaterials.filter(m => m !== null) as Material[];
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
                            flashMat.setProperty('albedo', this.flashColor);
                        } else if (pass.getHandle('mainColor') !== 0) {
                            flashMat.setProperty('mainColor', this.flashColor);
                        } else if (pass.getHandle('baseColor') !== 0) {
                            flashMat.setProperty('baseColor', this.flashColor);
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

    protected update(dt: number): void {
        if (!this._isHitFlashing) return;

        this._hitFlashTimer -= dt;
        if (this._hitFlashTimer <= 0) {
            this._isHitFlashing = false;
            this._hitFlashTimer = 0;
            this.stopHitFlash();
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
    }
}

