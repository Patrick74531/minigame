/**
 * 核心框架导出
 * 集中导出所有核心模块，简化导入路径
 *
 * @example
 * import { GameManager, EventManager, Singleton, MathUtils } from '../core';
 */

// 基类
export { Singleton, BaseComponent } from './base';

// 管理器
export {
    EventManager,
    PoolManager,
    GameManager,
    GameState,
    IPoolable,
    WaveManager,
    EffectManager,
    WaveService,
    CombatService,
    ServiceRegistry,
} from './managers';

// 工具
export { MathUtils } from './utils';
