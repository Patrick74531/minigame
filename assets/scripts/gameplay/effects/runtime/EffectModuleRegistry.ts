import { FrostExplosionEffect } from '../modules/FrostExplosionEffect';
import { GooseExplosionEffect } from '../modules/GooseExplosionEffect';
import { GlitchInterferenceEffect } from '../modules/GlitchInterferenceEffect';
import { LightningBoltEffect } from '../modules/LightningBoltEffect';
import { EffectRuntime } from './EffectRuntime';

let _registered = false;

export function ensureEffectModulesRegistered(): void {
    if (_registered) return;
    _registered = true;

    EffectRuntime.register('gooseExplosion', GooseExplosionEffect.play.bind(GooseExplosionEffect));
    EffectRuntime.register('frostExplosion', FrostExplosionEffect.play.bind(FrostExplosionEffect));
    EffectRuntime.register(
        'frostCastSpray',
        FrostExplosionEffect.playCastSpray.bind(FrostExplosionEffect)
    );
    EffectRuntime.register(
        'glitchInterference',
        GlitchInterferenceEffect.play.bind(GlitchInterferenceEffect)
    );
    EffectRuntime.register('lightningBolt', LightningBoltEffect.play.bind(LightningBoltEffect));
}
