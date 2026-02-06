import { WeaponType } from './WeaponTypes';
import { WeaponBehavior } from './WeaponBehavior';
import { MachineGunBehavior } from './behaviors/MachineGunBehavior';
import { FlamethrowerBehavior } from './behaviors/FlamethrowerBehavior';
import { CannonBehavior } from './behaviors/CannonBehavior';
import { GlitchWaveBehavior } from './behaviors/GlitchWaveBehavior';

/**
 * WeaponBehaviorFactory
 * 注册并提供各武器类型的行为实例。
 *
 * NOTE: 新增武器时只需在 _behaviors 中注册即可。
 */
export class WeaponBehaviorFactory {
    private static _behaviors: Map<WeaponType, WeaponBehavior> = new Map();

    public static initialize(): void {
        this._behaviors.set(WeaponType.MACHINE_GUN, new MachineGunBehavior());
        this._behaviors.set(WeaponType.FLAMETHROWER, new FlamethrowerBehavior());
        this._behaviors.set(WeaponType.CANNON, new CannonBehavior());
        this._behaviors.set(WeaponType.GLITCH_WAVE, new GlitchWaveBehavior());
    }

    public static get(type: WeaponType): WeaponBehavior | null {
        return this._behaviors.get(type) ?? null;
    }
}
