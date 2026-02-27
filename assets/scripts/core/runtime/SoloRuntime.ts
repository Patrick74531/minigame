import { Node, Vec3 } from 'cc';
import type { IGameRuntime, IHeroProvider } from './IGameRuntime';
import { HeroQuery } from './HeroQuery';
import { GameManager } from '../managers/GameManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';

/**
 * SoloHeroProvider
 * 单人模式下的 hero 提供者，直接委托给 GameManager.hero。
 * 行为与改造前完全一致。
 */
class SoloHeroProvider implements IHeroProvider {
    getLocalHero(): Node | null {
        return this.gm.hero;
    }

    getAllHeroes(): Node[] {
        const h = this.getLocalHero();
        return h && h.isValid ? [h] : [];
    }

    getNearestHero(_pos: Vec3): Node | null {
        return this.getLocalHero();
    }

    private get gm(): GameManager {
        return ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
    }
}

/**
 * SoloRuntime
 * 单人模式运行时。包装现有逻辑，零行为变更。
 */
export class SoloRuntime implements IGameRuntime {
    public readonly mode = 'solo' as const;
    public readonly heroProvider: IHeroProvider;

    constructor() {
        this.heroProvider = new SoloHeroProvider();
    }

    initialize(): void {
        HeroQuery.setProvider(this.heroProvider);
    }

    cleanup(): void {
        HeroQuery.clear();
    }
}
