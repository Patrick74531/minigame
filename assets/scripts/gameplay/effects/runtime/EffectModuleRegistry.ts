import { FrostExplosionEffect } from '../modules/FrostExplosionEffect';
import { LightningBoltEffect } from '../modules/LightningBoltEffect';
import { EffectRuntime } from './EffectRuntime';

let _registered = false;

export function ensureEffectModulesRegistered(): void {
    if (_registered) return;
    _registered = true;

    EffectRuntime.register('frostExplosion', FrostExplosionEffect.play.bind(FrostExplosionEffect));
    EffectRuntime.register(
        'frostCastSpray',
        FrostExplosionEffect.playCastSpray.bind(FrostExplosionEffect)
    );
    EffectRuntime.register('lightningBolt', LightningBoltEffect.play.bind(LightningBoltEffect));
}
