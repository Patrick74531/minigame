import { Component } from 'cc';

/**
 * 组件基类
 * 提供通用的生命周期方法和辅助功能
 * 所有游戏组件应继承此类
 */
export abstract class BaseComponent extends Component {
    /** 组件是否已初始化 */
    protected _initialized: boolean = false;

    /** 组件是否处于激活状态 */
    protected _isActive: boolean = true;

    /**
     * 初始化方法，子类重写此方法进行初始化
     * 在 onLoad 中自动调用
     */
    protected abstract initialize(): void;

    /**
     * 清理方法，子类重写此方法进行资源释放
     * 在 onDestroy 中自动调用
     */
    protected cleanup(): void {
        // 子类重写
    }

    protected onLoad(): void {
        if (!this._initialized) {
            this.initialize();
            this._initialized = true;
        }
    }

    protected onDestroy(): void {
        this.cleanup();
        this._initialized = false;
    }

    protected onEnable(): void {
        this._isActive = true;
    }

    protected onDisable(): void {
        this._isActive = false;
    }

    /**
     * 安全的延时调用
     * @param callback 回调函数
     * @param delay 延时秒数
     * @returns unschedule 用的 key
     */
    protected delayCall(callback: () => void, delay: number): void {
        this.scheduleOnce(callback, delay);
    }

    /**
     * 取消当前节点的所有调度
     */
    protected cancelAllDelays(): void {
        this.unscheduleAllCallbacks();
    }
}
