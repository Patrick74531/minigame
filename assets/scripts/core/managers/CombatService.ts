/**
 * CombatService
 * 统一战斗系统入口的注册与获取，避免直接依赖某个 Combat 实现。
 *
 * NOTE: CombatSystem 会注册为默认 CombatProvider（集中式索敌）。
 * 这里仅提供“注册/查询”的薄层。
 */
export interface CombatProvider {
    registerEnemy?(enemy: unknown): void;
    unregisterEnemy?(enemy: unknown): void;
    registerSoldier?(soldier: unknown): void;
    unregisterSoldier?(soldier: unknown): void;
    findEnemyInRange?(position: { x: number; y?: number; z?: number }, range: number): unknown | null;
}

export class CombatService {
    private static _provider: CombatProvider | null = null;

    public static setProvider(provider: CombatProvider | null): void {
        this._provider = provider;
    }

    public static get provider(): CombatProvider | null {
        return this._provider;
    }
}
