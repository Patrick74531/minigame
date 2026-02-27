import { Node, Vec3 } from 'cc';

/**
 * 英雄查询提供者接口
 * SoloRuntime 和 CoopRuntime 各自实现
 */
export interface IHeroProvider {
    /** 本地玩家控制的 hero */
    getLocalHero(): Node | null;
    /** 所有存活的 hero 节点 */
    getAllHeroes(): Node[];
    /** 距离 pos 最近的存活 hero */
    getNearestHero(pos: Vec3): Node | null;
}

/**
 * 游戏运行时接口
 * 定义单人/双人模式的统一抽象
 */
export interface IGameRuntime {
    readonly mode: 'solo' | 'coop';
    readonly heroProvider: IHeroProvider;

    /** 初始化运行时（在 SpawnBootstrap 之后调用） */
    initialize(): void;
    /** 清理运行时（场景卸载时调用） */
    cleanup(): void;
}
