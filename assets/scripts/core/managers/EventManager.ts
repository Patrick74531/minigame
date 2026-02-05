import { Singleton } from '../base/Singleton';
import { ServiceRegistry } from './ServiceRegistry';
import type { GameEventName, GameEventPayloads } from '../../data/GameEvents';

/** 事件回调函数类型 */
type EventCallback = (...args: any[]) => void;

// NOTE: Set to true only during development if you want stricter event payload checks.
const ENABLE_EVENT_VALIDATION = false;

/** 事件监听器信息 */
interface EventListener {
    callback: EventCallback;
    target: unknown;
    once: boolean;
}

/**
 * 事件管理器
 * 实现发布-订阅模式，用于解耦各模块之间的通信
 *
 * @example
 * // 监听事件
 * ServiceRegistry.get<EventManager>('EventManager')?.on('COIN_COLLECTED', this.onCoinCollected, this);
 *
 * // 发送事件
 * ServiceRegistry.get<EventManager>('EventManager')?.emit('COIN_COLLECTED', { amount: 10 });
 *
 * // 移除监听
 * ServiceRegistry.get<EventManager>('EventManager')?.off('COIN_COLLECTED', this.onCoinCollected, this);
 */
export class EventManager extends Singleton<EventManager>() {
    private _listeners: Map<string, EventListener[]> = new Map();

    /**
     * 注册事件监听
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param target 回调绑定的目标对象
     */
    public on<K extends GameEventName>(
        eventName: K,
        callback: (payload: GameEventPayloads[K]) => void,
        target?: unknown
    ): void;
    public on(eventName: string, callback: EventCallback, target?: unknown): void {
        this.addListener(eventName, callback, target, false);
    }

    /**
     * 注册一次性事件监听（触发后自动移除）
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param target 回调绑定的目标对象
     */
    public once<K extends GameEventName>(
        eventName: K,
        callback: (payload: GameEventPayloads[K]) => void,
        target?: unknown
    ): void;
    public once(eventName: string, callback: EventCallback, target?: unknown): void {
        this.addListener(eventName, callback, target, true);
    }

    /**
     * 移除事件监听
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param target 回调绑定的目标对象
     */
    public off<K extends GameEventName>(
        eventName: K,
        callback: (payload: GameEventPayloads[K]) => void,
        target?: unknown
    ): void;
    public off(eventName: string, callback: EventCallback, target?: unknown): void {
        const listeners = this._listeners.get(eventName);
        if (!listeners) return;

        const index = listeners.findIndex(
            listener => listener.callback === callback && listener.target === target
        );

        if (index !== -1) {
            listeners.splice(index, 1);
        }

        if (listeners.length === 0) {
            this._listeners.delete(eventName);
        }
    }

    /**
     * 移除目标对象的所有事件监听
     * 通常在组件销毁时调用
     * @param target 目标对象
     */
    public offAllByTarget(target: unknown): void {
        this._listeners.forEach((listeners, eventName) => {
            const filtered = listeners.filter(listener => listener.target !== target);
            if (filtered.length === 0) {
                this._listeners.delete(eventName);
            } else {
                this._listeners.set(eventName, filtered);
            }
        });
    }

    /**
     * 发送事件
     * @param eventName 事件名称
     * @param args 传递给回调的参数
     */
    public emit<K extends GameEventName>(eventName: K, payload?: GameEventPayloads[K]): void;
    public emit(eventName: string, ...args: unknown[]): void {
        if (ENABLE_EVENT_VALIDATION) {
            this.validatePayload(eventName, args);
        }
        const listeners = this._listeners.get(eventName);
        if (!listeners) return;

        // 复制数组以防在回调中修改
        const listenersCopy = [...listeners];
        const oneTimeListeners: EventListener[] = [];

        for (const listener of listenersCopy) {
            try {
                listener.callback.apply(listener.target, args);
            } catch (error) {
                console.error(`[EventManager] Error in event handler for "${eventName}":`, error);
            }

            if (listener.once) {
                oneTimeListeners.push(listener);
            }
        }

        // 移除一次性监听器
        for (const listener of oneTimeListeners) {
            this.off(eventName, listener.callback, listener.target);
        }
    }

    private validatePayload(eventName: string, args: unknown[]): void {
        // NOTE: Minimal dev-only checks. Keep runtime overhead low.
        if (args.length > 1) {
            console.warn(`[EventManager] Event "${eventName}" has multiple args; prefer a single payload object.`);
        }
    }

    /**
     * 检查事件是否有监听器
     * @param eventName 事件名称
     */
    public hasListeners(eventName: string): boolean {
        const listeners = this._listeners.get(eventName);
        return listeners !== undefined && listeners.length > 0;
    }

    /**
     * 清除所有事件监听
     */
    public clear(): void {
        this._listeners.clear();
    }

    private addListener(
        eventName: string,
        callback: EventCallback,
        target: unknown,
        once: boolean
    ): void {
        let listeners = this._listeners.get(eventName);
        if (!listeners) {
            listeners = [];
            this._listeners.set(eventName, listeners);
        }

        // 防止重复添加
        const exists = listeners.some(
            listener => listener.callback === callback && listener.target === target
        );

        if (!exists) {
            listeners.push({ callback, target, once });
        }
    }
}
