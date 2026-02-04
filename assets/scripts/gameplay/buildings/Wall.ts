import { _decorator, Vec3, Color, MeshRenderer, Component, BoxCollider } from 'cc';
import { Building } from './Building';
import { GameEvents } from '../../data/GameEvents';
import { EventManager } from '../../core/managers/EventManager';

const { ccclass, property } = _decorator;

/**
 * Wall Building
 * Blocks enemies, has high HP, becomes passable when destroyed.
 */
@ccclass('Wall')
export class Wall extends Building {

    // Visual state for broken wall
    private _originalScale: Vec3 = new Vec3();
    private _isBroken: boolean = false;

    protected start(): void {
        // Store original scale
        this.node.getScale(this._originalScale);
    }

    protected onDestroyed(): void {
        if (this._isBroken) return;
        this._isBroken = true;

        console.log('[Wall] Destroyed! Breached!');

        // 1. Emit Event
        EventManager.instance.emit(GameEvents.BUILDING_DESTROYED, {
            buildingId: this.node.uuid,
        });

        // 2. Disable Collider (Make passable)
        const collider = this.node.getComponent(BoxCollider);
        if (collider) {
            collider.enabled = false;
        }

        // 3. Visual Change (Broken State)
        // Flatten it
        this.node.setScale(this._originalScale.x, this._originalScale.y * 0.2, this._originalScale.z);
        
        // Change color to gray if possible
        const meshRenderer = this.node.getComponentInChildren(MeshRenderer) || this.node.getComponent(MeshRenderer);
        if (meshRenderer && meshRenderer.material) {
             // Note: In a real scenario, we might want to swap material or texture.
             // For now, assuming material has `mainColor` property or we just rely on scale.
             meshRenderer.material.setProperty('mainColor', new Color(100, 100, 100, 255));
        }
        
        // Do NOT set active = false, so it remains visible as rubble
    }
}
