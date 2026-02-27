/**
 * CoopBuildAuthority
 * 轻量级静态权限检查器，用于房主权威建造模式。
 * 无任何 import，避免循环依赖。任何模块均可安全引用。
 *
 * - 单人模式下 canBuild 始终为 true。
 * - 双人模式下，仅房主（host）可建造。
 */
export class CoopBuildAuthority {
    private static _enabled: boolean = false;
    private static _isHost: boolean = true;

    /** 本地玩家是否可以执行建造相关动作（拾取金币、投币、选塔、建造） */
    static get canBuild(): boolean {
        return !this._enabled || this._isHost;
    }

    /** 双人模式是否已激活 */
    static get isCoopMode(): boolean {
        return this._enabled;
    }

    /** 本地玩家是否为房主（单人模式视为 true） */
    static get isHost(): boolean {
        return !this._enabled || this._isHost;
    }

    /** 本地玩家是否为房客 */
    static get isGuest(): boolean {
        return this._enabled && !this._isHost;
    }

    /** 由 CoopRuntime 在确定房主身份后调用 */
    static setCoopMode(enabled: boolean, isHost: boolean): void {
        this._enabled = enabled;
        this._isHost = isHost;
    }

    /** 场景卸载时重置 */
    static reset(): void {
        this._enabled = false;
        this._isHost = true;
    }
}
