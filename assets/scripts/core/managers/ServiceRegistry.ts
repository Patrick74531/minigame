/**
 * ServiceRegistry
 * 统一管理全局服务入口，减少模块之间的硬耦合依赖。
 *
 * NOTE: 仅用于“全局服务/管理器”注册，不要用于短生命周期对象。
 * 新增服务时请保证注册时机在其 initialize 之后（如果有）。
 */
export class ServiceRegistry {
    private static _services: Map<string, unknown> = new Map();

    public static register<T>(key: string, service: T): void {
        this._services.set(key, service);
    }

    public static get<T>(key: string): T | null {
        return (this._services.get(key) as T) ?? null;
    }

    public static has(key: string): boolean {
        return this._services.has(key);
    }

    public static clear(): void {
        this._services.clear();
    }
}
