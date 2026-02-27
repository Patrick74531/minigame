import { Node, Vec3 } from 'cc';
import type { IHeroProvider } from './IGameRuntime';

/**
 * HeroQuery
 * 全局静态适配层，替代 GameManager.hero 硬引用。
 * SoloRuntime 设置 SoloHeroProvider，CoopRuntime 设置 CoopHeroProvider。
 * 未设置 provider 时安全降级为空结果。
 */
export class HeroQuery {
    private static _provider: IHeroProvider | null = null;

    /** 设置当前运行时的 hero 提供者 */
    static setProvider(p: IHeroProvider | null): void {
        this._provider = p;
    }

    /** 本地玩家控制的 hero（单人=唯一，双人=本地玩家） */
    static getLocalHero(): Node | null {
        return this._provider?.getLocalHero() ?? null;
    }

    /** 所有存活 hero 节点（供 Enemy.scanForTargets 等遍历场景） */
    static getAllHeroes(): Node[] {
        return this._provider?.getAllHeroes() ?? [];
    }

    /** 距离 pos 最近的存活 hero（供 Coin 磁吸、Enemy 索敌） */
    static getNearestHero(pos: Vec3): Node | null {
        return this._provider?.getNearestHero(pos) ?? null;
    }

    /** 清理（场景卸载时调用） */
    static clear(): void {
        this._provider = null;
    }
}
