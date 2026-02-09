import { Node, Vec3 } from 'cc';
import { ensureEffectModulesRegistered } from './runtime/EffectModuleRegistry';
import { EffectRuntime } from './runtime/EffectRuntime';

/**
 * EffectFactory (Facade)
 * 对外保持稳定 API；内部通过 Runtime + 模块注册分发。
 */
export class EffectFactory {
    public static createFrostExplosion(parent: Node, position: Vec3, radius: number): void {
        ensureEffectModulesRegistered();
        EffectRuntime.play('frostExplosion', { parent, position, radius });
    }

    public static createLightningBolt(parent: Node, startPos: Vec3, endPos: Vec3): void {
        ensureEffectModulesRegistered();
        EffectRuntime.play('lightningBolt', { parent, startPos, endPos });
    }
}
