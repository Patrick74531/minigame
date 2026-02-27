import { Node, Vec3 } from 'cc';
import type { IHeroProvider } from './IGameRuntime';
import type { PlayerContext } from './PlayerContext';

/**
 * CoopHeroProvider
 * 双人模式下的 IHeroProvider 实现。
 * 持有两个 PlayerContext，根据 isLocal 标记返回本地/远程英雄。
 */
export class CoopHeroProvider implements IHeroProvider {
    private _players: PlayerContext[] = [];

    setPlayers(players: PlayerContext[]): void {
        this._players = players;
    }

    getLocalHero(): Node | null {
        for (const p of this._players) {
            if (p.isLocal && p.heroNode && p.heroNode.isValid) {
                return p.heroNode;
            }
        }
        return null;
    }

    getAllHeroes(): Node[] {
        const result: Node[] = [];
        for (const p of this._players) {
            if (p.heroNode && p.heroNode.isValid) {
                result.push(p.heroNode);
            }
        }
        return result;
    }

    getNearestHero(pos: Vec3): Node | null {
        let best: Node | null = null;
        let bestDistSq = Number.POSITIVE_INFINITY;

        for (const p of this._players) {
            const h = p.heroNode;
            if (!h || !h.isValid) continue;
            const dx = h.position.x - pos.x;
            const dz = h.position.z - pos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = h;
            }
        }
        return best;
    }

    /**
     * 获取指定玩家的 hero 节点
     */
    getHeroByPlayerId(playerId: string): Node | null {
        const p = this._players.find(ctx => ctx.playerId === playerId);
        return p?.heroNode && p.heroNode.isValid ? p.heroNode : null;
    }
}
