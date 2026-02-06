import { Node, Vec3 } from 'cc';
import { WeaponType, WeaponLevelStats } from './WeaponTypes';

/**
 * WeaponBehavior 抽象基类
 * 每种武器类型实现自己的射击逻辑和弹道表现。
 *
 * NOTE: 新增武器时继承此类，并在 WeaponBehaviorFactory 中注册即可。
 */
export abstract class WeaponBehavior {
    public abstract readonly type: WeaponType;

    /**
     * 执行一次攻击
     * @param owner   武器持有者节点
     * @param target  目标节点
     * @param stats   当前等级属性
     * @param level   当前等级 (1-based)
     * @param parent  弹体的父节点容器
     */
    public abstract fire(
        owner: Node,
        target: Node,
        stats: WeaponLevelStats,
        level: number,
        parent: Node
    ): void;
}
