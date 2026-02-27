import { Node, Vec3 } from 'cc';
import type { IGameRuntime } from './IGameRuntime';
import { HeroQuery } from './HeroQuery';
import { PlayerContext } from './PlayerContext';
import { CoopHeroProvider } from './CoopHeroProvider';
import { PerPlayerWeaponManager } from './PerPlayerWeaponManager';
import { TeamLevelSystem } from './TeamLevelSystem';
import { CoopNetManager } from './CoopNetManager';
import type { ServerMessage, CoopMatchState } from './CoopNetManager';
import { WeaponType } from '../../gameplay/weapons/WeaponTypes';
import { DualCameraFollow } from '../camera/DualCameraFollow';
import { GameManager } from '../managers/GameManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { EventManager } from '../managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import type { BuildingPad } from '../../gameplay/buildings/BuildingPad';
import { BuildingPad as BuildingPadComponent } from '../../gameplay/buildings/BuildingPad';
import { Coin } from '../../gameplay/economy/Coin';

/**
 * CoopRuntime
 * 双人协作模式运行时。
 * - 管理两个 PlayerContext（本地 + 远程）
 * - 管理 CoopHeroProvider（HeroQuery 委托）
 * - 管理 TeamLevelSystem（共享经验）
 * - 管理 PerPlayerWeaponManager × 2（独立武器）
 * - 管理 CoopNetManager（网络通信）
 * - 监听服务端广播并同步远程英雄状态
 */
export class CoopRuntime implements IGameRuntime {
    public readonly mode = 'coop' as const;

    private _heroProvider: CoopHeroProvider;
    private _players: PlayerContext[] = [];
    private _weaponManagers: Map<string, PerPlayerWeaponManager> = new Map();
    private _teamLevelSystem: TeamLevelSystem;
    private _netManager: CoopNetManager;
    private _remoteTargetPositions: Map<string, { x: number; z: number; t: number }> = new Map();
    private _decisionOwnerByPad: Map<string, string> = new Map();
    // Cached bound handler to avoid bind leak on on/off
    private _boundOnServerMessage = this.onServerMessage.bind(this);
    private _boundOnLocalWeaponPicked = this.onLocalWeaponPicked.bind(this);
    private _boundOnLocalPadCoinDeposited = this.onLocalPadCoinDeposited.bind(this);
    private _boundOnLocalTowerSelected = this.onLocalTowerSelected.bind(this);
    private _boundOnLocalCoinPicked = this.onLocalCoinPicked.bind(this);

    get heroProvider(): CoopHeroProvider {
        return this._heroProvider;
    }

    get players(): readonly PlayerContext[] {
        return this._players;
    }

    get netManager(): CoopNetManager {
        return this._netManager;
    }

    get teamLevelSystem(): TeamLevelSystem {
        return this._teamLevelSystem;
    }

    constructor() {
        this._heroProvider = new CoopHeroProvider();
        this._teamLevelSystem = new TeamLevelSystem();
        this._netManager = new CoopNetManager();
    }

    // ─── IGameRuntime ──────────────────────────────────────────────────────

    initialize(): void {
        HeroQuery.setProvider(this._heroProvider);
        BuildingPadComponent.setCoopModeEnabled(true);
        this._netManager.on(this._boundOnServerMessage);
        this.eventManager.on(GameEvents.WEAPON_PICKED, this._boundOnLocalWeaponPicked, this);
        this.eventManager.on(
            GameEvents.COOP_PAD_COIN_DEPOSITED,
            this._boundOnLocalPadCoinDeposited,
            this
        );
        this.eventManager.on(GameEvents.TOWER_SELECTED, this._boundOnLocalTowerSelected, this);
        this.eventManager.on(GameEvents.COOP_COIN_PICKED, this._boundOnLocalCoinPicked, this);
    }

    cleanup(): void {
        HeroQuery.clear();
        BuildingPadComponent.setCoopModeEnabled(false);
        this._netManager.off(this._boundOnServerMessage);
        this.eventManager.off(GameEvents.WEAPON_PICKED, this._boundOnLocalWeaponPicked, this);
        this.eventManager.off(
            GameEvents.COOP_PAD_COIN_DEPOSITED,
            this._boundOnLocalPadCoinDeposited,
            this
        );
        this.eventManager.off(GameEvents.TOWER_SELECTED, this._boundOnLocalTowerSelected, this);
        this.eventManager.off(GameEvents.COOP_COIN_PICKED, this._boundOnLocalCoinPicked, this);
        this._netManager.disconnect().catch(() => {});
        this._teamLevelSystem.cleanup();
        DualCameraFollow.cleanup();

        for (const wm of this._weaponManagers.values()) {
            wm.cleanup();
        }
        this._weaponManagers.clear();
        this._players = [];
        this._remoteTargetPositions.clear();
        this._decisionOwnerByPad.clear();
    }

    // ─── Player management ─────────────────────────────────────────────────

    /**
     * Register a player context and its hero node.
     * Called after hero spawn for each player.
     */
    addPlayer(ctx: PlayerContext): void {
        this._players.push(ctx);
        this._heroProvider.setPlayers(this._players);

        // Create per-player weapon manager
        const wm = new PerPlayerWeaponManager(ctx.playerId);
        this._weaponManagers.set(ctx.playerId, wm);
    }

    /**
     * Initialize the team level system after both heroes are spawned.
     */
    initializeTeamLevel(): void {
        const heroNodes = this._players
            .map(p => p.heroNode)
            .filter((n): n is Node => n !== null && n.isValid);
        this._teamLevelSystem.initialize(heroNodes);
    }

    /**
     * Get weapon manager for a specific player.
     */
    getWeaponManager(playerId: string): PerPlayerWeaponManager | null {
        return this._weaponManagers.get(playerId) ?? null;
    }

    /**
     * Get the local player's weapon manager.
     */
    getLocalWeaponManager(): PerPlayerWeaponManager | null {
        const local = this._players.find(p => p.isLocal);
        return local ? this.getWeaponManager(local.playerId) : null;
    }

    /**
     * Called every frame from GameController.update(dt).
     * Drives remote hero interpolation and dual camera.
     */
    tick(dt: number): void {
        const local = this._players.find(p => p.isLocal && p.heroNode && p.heroNode.isValid);
        if (local?.heroNode) {
            const pos = local.heroNode.worldPosition;
            this._netManager.queueInput(pos.x, pos.z);
        }

        const LERP_SPEED = 8;
        for (const p of this._players) {
            if (p.isLocal || !p.heroNode || !p.heroNode.isValid) continue;
            const target = this._remoteTargetPositions.get(p.playerId);
            if (!target) continue;

            const pos = p.heroNode.position;
            const nx = pos.x + (target.x - pos.x) * LERP_SPEED * dt;
            const nz = pos.z + (target.z - pos.z) * LERP_SPEED * dt;
            p.heroNode.setPosition(new Vec3(nx, pos.y, nz));
        }
        DualCameraFollow.update();
    }

    // ─── Network message handler ───────────────────────────────────────────

    private onServerMessage(msg: ServerMessage): void {
        switch (msg.type) {
            case 'MATCH_STATE':
                this.handleMatchState(msg.state);
                break;
            case 'PLAYER_INPUT':
                this.handleRemoteInput(msg);
                break;
            case 'COIN_DEPOSITED':
                this.handleCoinDeposited(msg);
                break;
            case 'DECISION_OWNER':
                this.handleDecisionOwner(msg);
                break;
            case 'TOWER_DECIDED':
                this.handleTowerDecided(msg);
                break;
            case 'COIN_PICKED':
                this.handleCoinPicked(msg);
                break;
            case 'WEAPON_ASSIGNED':
                this.handleWeaponAssigned(msg);
                break;
            case 'LEVEL_UP':
                // TeamLevelSystem handles via events
                break;
            case 'PLAYER_DISCONNECTED':
                this.handlePlayerDisconnected(msg);
                break;
            case 'PLAYER_RECONNECTED':
                this.handlePlayerReconnected(msg);
                break;
            case 'GAME_PAUSE': {
                const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
                gm.pauseGame();
                break;
            }
            case 'GAME_RESUME': {
                const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
                gm.resumeGame();
                break;
            }
            case 'MATCH_OVER':
                // TODO: trigger game over flow
                break;
        }
    }

    private handleMatchState(state: CoopMatchState): void {
        // Full state sync — used on join and reconnect
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.setCoins(state.sharedCoins);
        // Restore team level if behind
        if (state.teamLevel > this._teamLevelSystem.level) {
            this._teamLevelSystem.restoreState(state.teamLevel, 0);
        }
    }

    private handleRemoteInput(msg: { playerId: string; dx: number; dz: number; t: number }): void {
        // Skip local player's own echoed input
        const local = this._players.find(p => p.isLocal);
        if (local && msg.playerId === local.playerId) return;

        const remote = this._players.find(p => p.playerId === msg.playerId);
        if (!remote || !remote.heroNode || !remote.heroNode.isValid) return;

        // dx/dz are absolute world-space target positions, not deltas.
        // Client sends hero.worldPosition as (dx, dz) for authoritative positioning.
        this._remoteTargetPositions.set(msg.playerId, {
            x: msg.dx,
            z: msg.dz,
            t: msg.t,
        });
    }

    private handleCoinDeposited(msg: { padId: string; playerId: string; amount: number }): void {
        if (!msg.padId || !Number.isFinite(msg.amount) || msg.amount <= 0) return;
        if (msg.playerId === this._netManager.localPlayerId) return;

        const pad = this.findPad(msg.padId);
        if (!pad) return;
        pad.applyNetworkCoinDeposit(msg.amount);
    }

    private handleDecisionOwner(msg: { padId: string; playerId: string }): void {
        if (!msg.padId || !msg.playerId) return;
        this._decisionOwnerByPad.set(msg.padId, msg.playerId);

        const pad = this.findPad(msg.padId);
        if (!pad) return;
        const localOwns = msg.playerId === this._netManager.localPlayerId;
        pad.applyDecisionOwner(localOwns);
    }

    private handleTowerDecided(msg: {
        padId: string;
        playerId: string;
        buildingTypeId: string;
    }): void {
        if (!msg.padId || !msg.buildingTypeId) return;
        if (msg.playerId === this._netManager.localPlayerId) return;

        const pad = this.findPad(msg.padId);
        if (!pad) return;

        this.eventManager.emit(GameEvents.TOWER_SELECTED, {
            padNode: pad.node,
            buildingTypeId: msg.buildingTypeId,
            source: 'remote',
        });
    }

    private handleCoinPicked(msg: { playerId: string; x: number; z: number }): void {
        if (msg.playerId === this._netManager.localPlayerId) return;
        Coin.consumeNearestAt(msg.x, msg.z, 1.6);
    }

    private handleWeaponAssigned(msg: { playerId: string; weaponId: string }): void {
        const wm = this._weaponManagers.get(msg.playerId);
        if (wm) {
            wm.addWeapon(msg.weaponId as WeaponType);
        }
    }

    private handlePlayerDisconnected(msg: { playerId: string }): void {
        const player = this._players.find(p => p.playerId === msg.playerId);
        if (player && player.heroNode && player.heroNode.isValid) {
            // Freeze remote hero visual (stop animation, show disconnect icon)
            // Detailed implementation in Phase 6
            console.warn(`[CoopRuntime] Player disconnected: ${msg.playerId}`);
        }
    }

    private handlePlayerReconnected(msg: { playerId: string }): void {
        const player = this._players.find(p => p.playerId === msg.playerId);
        if (player) {
            console.log(`[CoopRuntime] Player reconnected: ${msg.playerId}`);
        }
    }

    private onLocalWeaponPicked(data: { weaponId: string }): void {
        if (!data?.weaponId) return;
        this._netManager
            .sendAction({ type: 'WEAPON_PICK', weaponId: data.weaponId })
            .catch(() => {});
    }

    private onLocalPadCoinDeposited(data: {
        padId: string;
        amount: number;
        padFilled: boolean;
        eventType?: 'tower_select';
    }): void {
        if (!data?.padId || !Number.isFinite(data.amount) || data.amount <= 0) return;
        this._netManager
            .sendAction({
                type: 'COIN_DEPOSIT',
                padId: data.padId,
                amount: data.amount,
                clientSeq: this._netManager.nextClientSeq(),
                padFilled: !!data.padFilled,
                eventType: data.eventType,
            })
            .catch(() => {});
    }

    private onLocalTowerSelected(data: {
        padNode: Node;
        buildingTypeId: string;
        source?: 'local' | 'remote';
    }): void {
        if (!data?.padNode || !data?.buildingTypeId) return;
        if (data.source === 'remote') return;

        const pad = data.padNode.getComponent(BuildingPadComponent);
        const padId = pad?.coopPadId ?? '';
        if (!padId) return;

        const ownerId = this._decisionOwnerByPad.get(padId);
        if (ownerId && ownerId !== this._netManager.localPlayerId) {
            return;
        }

        this._netManager
            .sendAction({
                type: 'TOWER_DECISION',
                padId,
                buildingTypeId: data.buildingTypeId,
            })
            .catch(() => {});
    }

    private onLocalCoinPicked(data: { x: number; z: number }): void {
        if (!Number.isFinite(data?.x) || !Number.isFinite(data?.z)) return;
        this._netManager
            .sendAction({
                type: 'COIN_PICKUP',
                x: data.x,
                z: data.z,
            })
            .catch(() => {});
    }

    private findPad(padId: string): BuildingPad | null {
        if (!padId) return null;
        const manager =
            ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
        return manager.getPadByCoopPadId(padId);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
