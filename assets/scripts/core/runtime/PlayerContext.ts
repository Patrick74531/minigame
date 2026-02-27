import { Node } from 'cc';

/**
 * PlayerContext
 * 持有单个玩家的运行时状态引用。
 * 单人模式下只有一个 PlayerContext；双人模式下每人一个。
 */
export class PlayerContext {
    public readonly playerId: string;
    public readonly slot: 0 | 1;
    public heroNode: Node | null = null;
    public isLocal: boolean;

    constructor(playerId: string, slot: 0 | 1, isLocal: boolean) {
        this.playerId = playerId;
        this.slot = slot;
        this.isLocal = isLocal;
    }
}
