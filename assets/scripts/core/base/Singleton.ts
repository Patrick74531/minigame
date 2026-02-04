/**
 * 单例基类
 * 所有管理器类应继承此类以实现单例模式
 *
 * @example
 * class AudioManager extends Singleton<AudioManager>() {
 *     public playSound() { ... }
 * }
 * // 使用: AudioManager.instance.playSound()
 */
export function Singleton<T>() {
    class SingletonClass {
        private static _instance: T | null = null;

        public static get instance(): T {
            if (!this._instance) {
                this._instance = new (this as unknown as new () => T)();
            }
            return this._instance;
        }

        /**
         * 销毁单例实例
         * 用于场景切换或热更新时重置状态
         */
        public static destroyInstance(): void {
            this._instance = null;
        }

        /**
         * 检查单例是否已创建
         */
        public static hasInstance(): boolean {
            return this._instance !== null;
        }
    }

    return SingletonClass;
}
