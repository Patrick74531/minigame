import { Vec2, Vec3 } from 'cc';

/**
 * 数学工具函数
 */
export const MathUtils = {
    /**
     * 限制值在范围内
     */
    clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    },

    /**
     * 线性插值
     */
    lerp(a: number, b: number, t: number): number {
        return a + (b - a) * this.clamp(t, 0, 1);
    },

    /**
     * 计算两点距离
     */
    distance(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * 计算两点距离的平方（避免开方，用于比较）
     */
    distanceSquared(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    },

    /**
     * 角度转弧度
     */
    deg2Rad(degrees: number): number {
        return degrees * (Math.PI / 180);
    },

    /**
     * 弧度转角度
     */
    rad2Deg(radians: number): number {
        return radians * (180 / Math.PI);
    },

    /**
     * 随机范围内的整数
     */
    randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * 随机范围内的浮点数
     */
    randomFloat(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    },

    /**
     * 从数组中随机选择一个元素
     */
    randomElement<T>(array: T[]): T | undefined {
        if (array.length === 0) return undefined;
        return array[Math.floor(Math.random() * array.length)];
    },

    /**
     * 计算从 a 指向 b 的方向向量（单位向量）
     */
    direction(from: Vec2 | Vec3, to: Vec2 | Vec3): Vec2 {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length === 0) return new Vec2(0, 0);
        return new Vec2(dx / length, dy / length);
    },

    /**
     * 计算从 a 指向 b 的角度（度）
     */
    angle(from: Vec2 | Vec3, to: Vec2 | Vec3): number {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return this.rad2Deg(Math.atan2(dy, dx));
    },
};
