import { Node } from 'cc';
import { ServiceRegistry } from './ServiceRegistry';

export type EnemyProvider = {
    getEnemies: () => Node[];
};

/**
 * EnemyQuery
 * 统一获取敌人列表的入口，避免直接依赖具体 WaveManager 实现
 */
export class EnemyQuery {
    public static getEnemies(): Node[] {
        const provider = ServiceRegistry.get<EnemyProvider>('EnemyProvider');
        if (provider && provider.getEnemies) {
            return provider.getEnemies();
        }

        const runtime =
            ServiceRegistry.get<{ enemies: Node[] }>('WaveRuntime') ??
            ServiceRegistry.get<{ enemies: Node[] }>('WaveManager');
        if (runtime && Array.isArray(runtime.enemies)) {
            return runtime.enemies;
        }

        return [];
    }
}
