import { Node } from 'cc';
import type { IGameRuntime } from './IGameRuntime';
import { HeroQuery } from './HeroQuery';
import { PlayerContext } from './PlayerContext';
import { CoopHeroProvider } from './CoopHeroProvider';
import { PerPlayerWeaponManager } from './PerPlayerWeaponManager';
import { TeamLevelSystem } from './TeamLevelSystem';
import { CoopNetManager } from './CoopNetManager';
import { COOP_REALTIME_V2, CoopRealtimeConfig } from './CoopRealtimeConfig';
import type {
    ServerMessage,
    CoopMatchState,
    BuildStateSnapshot,
    BuildStatePadSnapshot,
} from './CoopNetManager';
import { CoopBuildAuthority } from './CoopBuildAuthority';
import { WeaponType } from '../../gameplay/weapons/WeaponTypes';
import { DualCameraFollow } from '../camera/DualCameraFollow';
import { GameManager } from '../managers/GameManager';
import { ServiceRegistry } from '../managers/ServiceRegistry';
import { EventManager } from '../managers/EventManager';
import { GameEvents } from '../../data/GameEvents';
import { BuildingManager } from '../../gameplay/buildings/BuildingManager';
import { BuildingPadState } from '../../gameplay/buildings/BuildingPad';
import type { BuildingPad } from '../../gameplay/buildings/BuildingPad';
import { BuildingPad as BuildingPadComponent } from '../../gameplay/buildings/BuildingPad';
import { Coin } from '../../gameplay/economy/Coin';
import { WaveLoop } from '../../gameplay/wave/WaveLoop';

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
const BUILD_SYNC_INTERVAL_MS = 2500;

export class CoopRuntime implements IGameRuntime {
    public readonly mode = 'coop' as const;

    private _heroProvider: CoopHeroProvider;
    private _players: PlayerContext[] = [];
    private _weaponManagers: Map<string, PerPlayerWeaponManager> = new Map();
    private _teamLevelSystem: TeamLevelSystem;
    private _netManager: CoopNetManager;
    private _remoteTargetPositions: Map<string, { x: number; z: number; t: number }> = new Map();
    private _decisionOwnerByPad: Map<string, string> = new Map();
    private _isHost: boolean = true;
    private _buildSyncTimer: ReturnType<typeof setInterval> | null = null;
    private _buildStateVersion: number = 0;
    private _lastAppliedBuildVersion: number = -1;
    private _matchStateSynced: boolean = false;
    private _remoteVelocities: Map<string, { vx: number; vz: number }> = new Map();
    private _waveLoop: WaveLoop | null = null;
    private _lastAuthoritativeWave: number = 0;
    private _pendingAuthoritativeWaveStart: { waveIndex: number; startAt: number } | null = null;
    // Cached bound handler to avoid bind leak on on/off
    private _boundOnServerMessage = this.onServerMessage.bind(this);
    private _boundOnLocalWeaponPicked = this.onLocalWeaponPicked.bind(this);
    private _boundOnLocalPadCoinDeposited = this.onLocalPadCoinDeposited.bind(this);
    private _boundOnLocalTowerSelected = this.onLocalTowerSelected.bind(this);
    private _boundOnLocalCoinPicked = this.onLocalCoinPicked.bind(this);
    private _boundOnBuildingConstructed = this.onBuildingConstructedSync.bind(this);
    private _boundOnLocalGameOver = this.onLocalGameOver.bind(this);
    private _boundOnLocalWaveStart = this.onLocalWaveStart.bind(this);

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

    get isHost(): boolean {
        return this._isHost;
    }

    get isGuest(): boolean {
        return !this._isHost;
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
        // Building-related event listeners — always registered so host path works.
        // Guest-side guards are in the handler methods and in BuildingPad/Hero/TowerSelectUI.
        this.eventManager.on(
            GameEvents.COOP_PAD_COIN_DEPOSITED,
            this._boundOnLocalPadCoinDeposited,
            this
        );
        this.eventManager.on(GameEvents.TOWER_SELECTED, this._boundOnLocalTowerSelected, this);
        this.eventManager.on(GameEvents.COOP_COIN_PICKED, this._boundOnLocalCoinPicked, this);
        this.eventManager.on(
            GameEvents.BUILDING_CONSTRUCTED,
            this._boundOnBuildingConstructed,
            this
        );
        this.eventManager.on(GameEvents.GAME_OVER, this._boundOnLocalGameOver, this);
        this.eventManager.on(GameEvents.WAVE_START, this._boundOnLocalWaveStart, this);
    }

    /**
     * 设定本地玩家的房主/房客身份。
     * 必须在 initialize() 之后、游戏开始之前调用。
     */
    setHostMode(isHost: boolean): void {
        this._isHost = isHost;
        CoopBuildAuthority.setCoopMode(true, isHost);
        BuildingPadComponent.setCoopHostEnabled(!isHost ? false : true);
        this._waveLoop?.setExternalAuthority(!isHost);
        if (isHost) {
            this.startBuildStateSync();
        }
        // Signal boot.js to NOT reload on tab-switch while coop is active
        if (typeof window !== 'undefined') {
            (window as any).__KS_COOP_ACTIVE__ = true;
        }
    }

    bindWaveLoop(waveLoop: WaveLoop | null): void {
        this._waveLoop = waveLoop;
        this._waveLoop?.setExternalAuthority(!this._isHost);
        if (this._waveLoop && this._pendingAuthoritativeWaveStart) {
            const pending = this._pendingAuthoritativeWaveStart;
            this._pendingAuthoritativeWaveStart = null;
            this.handleWaveStarted({ ...pending, seq: this._netManager.lastSeq });
        }
    }

    cleanup(): void {
        HeroQuery.clear();
        BuildingPadComponent.setCoopModeEnabled(false);
        BuildingPadComponent.setCoopHostEnabled(true);
        CoopBuildAuthority.reset();
        this.stopBuildStateSync();
        this._netManager.off(this._boundOnServerMessage);
        this.eventManager.off(GameEvents.WEAPON_PICKED, this._boundOnLocalWeaponPicked, this);
        this.eventManager.off(
            GameEvents.COOP_PAD_COIN_DEPOSITED,
            this._boundOnLocalPadCoinDeposited,
            this
        );
        this.eventManager.off(GameEvents.TOWER_SELECTED, this._boundOnLocalTowerSelected, this);
        this.eventManager.off(GameEvents.COOP_COIN_PICKED, this._boundOnLocalCoinPicked, this);
        this.eventManager.off(
            GameEvents.BUILDING_CONSTRUCTED,
            this._boundOnBuildingConstructed,
            this
        );
        this.eventManager.off(GameEvents.GAME_OVER, this._boundOnLocalGameOver, this);
        this.eventManager.off(GameEvents.WAVE_START, this._boundOnLocalWaveStart, this);
        this._netManager.disconnect().catch(() => {});
        this._teamLevelSystem.cleanup();
        DualCameraFollow.cleanup();

        for (const wm of this._weaponManagers.values()) {
            wm.cleanup();
        }
        this._weaponManagers.clear();
        this._players = [];
        this._remoteTargetPositions.clear();
        this._remoteVelocities.clear();
        this._decisionOwnerByPad.clear();
        this._waveLoop = null;
        this._lastAuthoritativeWave = 0;
        this._pendingAuthoritativeWaveStart = null;
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

        // Smooth remote hero interpolation with velocity-based dead-reckoning.
        // Uses exponential smoothing to eliminate teleport/flashing artifacts.
        // V2: Tuned for lower latency with realtime channel.
        const SMOOTH_SPEED = COOP_REALTIME_V2 ? CoopRealtimeConfig.INTERP_SMOOTH_SPEED : 10;
        const PREDICT_AHEAD = COOP_REALTIME_V2 ? CoopRealtimeConfig.INTERP_PREDICT_AHEAD : 0.08;
        const SNAP_DIST_SQ = COOP_REALTIME_V2 ? CoopRealtimeConfig.INTERP_SNAP_DIST_SQ : 400;
        for (const p of this._players) {
            if (p.isLocal || !p.heroNode || !p.heroNode.isValid) continue;
            const target = this._remoteTargetPositions.get(p.playerId);
            if (!target) continue;

            const vel = this._remoteVelocities.get(p.playerId);
            // Predict target position using velocity
            let goalX = target.x;
            let goalZ = target.z;
            if (vel) {
                goalX += vel.vx * PREDICT_AHEAD;
                goalZ += vel.vz * PREDICT_AHEAD;
            }

            const pos = p.heroNode.position;
            const dx = goalX - pos.x;
            const dz = goalZ - pos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq > SNAP_DIST_SQ) {
                // Teleport if very far (reconnect scenario)
                p.heroNode.setPosition(target.x, pos.y, target.z);
            } else if (distSq > 0.0001) {
                // Exponential smoothing: smooth convergence without overshoot
                const factor = 1 - Math.exp(-SMOOTH_SPEED * dt);
                const nx = pos.x + dx * factor;
                const nz = pos.z + dz * factor;
                p.heroNode.setPosition(nx, pos.y, nz);
            }
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
                // V2: In coop mode, GAME_PAUSE from server is ignored.
                // GameManager.pauseGame() is already guarded, but skip dispatch entirely.
                if (!COOP_REALTIME_V2) {
                    const gm =
                        ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
                    gm.pauseGame();
                }
                break;
            }
            case 'GAME_RESUME': {
                // V2: In coop mode, GAME_RESUME from server is ignored.
                if (!COOP_REALTIME_V2) {
                    const gm =
                        ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
                    gm.resumeGame();
                }
                break;
            }
            case 'CLOCK_SYNC':
            case 'PHASE_CHANGE':
                // These are handled by CoopNetManager directly (clock sync)
                // or could be dispatched to WaveManager in the future.
                break;
            case 'WAVE_STARTED':
                this.handleWaveStarted(msg);
                break;
            case 'BUILD_STATE_SNAPSHOT':
                this.handleBuildStateSnapshot(msg);
                break;
            case 'MATCH_OVER': {
                if (!this._isHost) {
                    const gm =
                        ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
                    if (gm.isPlaying) gm.gameOver(false);
                }
                break;
            }
        }
    }

    private handleMatchState(state: CoopMatchState): void {
        // Only apply economy sync on initial join — not during ongoing sync
        // polling, which would flash the HUD to stale server values.
        if (!this._matchStateSynced) {
            this._matchStateSynced = true;
            const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
            gm.setCoins(state.sharedCoins);
        }
        // Restore team level if behind
        if (state.teamLevel > this._teamLevelSystem.level) {
            this._teamLevelSystem.restoreState(state.teamLevel, 0);
        }

        // Fallback path: when realtime is unavailable, use match-state player positions
        // to keep remote hero movement and animation alive.
        const localPlayerId = this._netManager.localPlayerId;
        const now = Date.now();
        for (const slot of state.players) {
            if (!slot?.playerId || slot.playerId === localPlayerId) continue;
            const x = slot.heroState?.position?.x;
            const z = slot.heroState?.position?.z;
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;

            const prev = this._remoteTargetPositions.get(slot.playerId);
            if (prev) {
                const dtSec = (now - prev.t) / 1000;
                if (dtSec > 0.02 && dtSec < 2) {
                    this._remoteVelocities.set(slot.playerId, {
                        vx: (x - prev.x) / dtSec,
                        vz: (z - prev.z) / dtSec,
                    });
                }
            }
            this._remoteTargetPositions.set(slot.playerId, { x, z, t: now });
        }

        // Guest follows host-authoritative wave timeline.
        if (!this._isHost && state.waveStartAt && state.waveNumber > 0) {
            this.handleWaveStarted({
                waveIndex: state.waveNumber,
                startAt: state.waveStartAt,
                seq: state.seq,
            });
        }
    }

    private handleRemoteInput(msg: { playerId: string; dx: number; dz: number; t: number }): void {
        // Skip local player's own echoed input
        const local = this._players.find(p => p.isLocal);
        if (local && msg.playerId === local.playerId) return;

        const remote = this._players.find(p => p.playerId === msg.playerId);
        if (!remote || !remote.heroNode || !remote.heroNode.isValid) return;

        // Compute velocity from consecutive positions for dead-reckoning
        const prev = this._remoteTargetPositions.get(msg.playerId);
        if (prev) {
            const dtSec = (msg.t - prev.t) / 1000;
            if (dtSec > 0.02 && dtSec < 2) {
                this._remoteVelocities.set(msg.playerId, {
                    vx: (msg.dx - prev.x) / dtSec,
                    vz: (msg.dz - prev.z) / dtSec,
                });
            }
        }

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
        if (!this._isHost) return;
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
        if (!this._isHost) return;
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

    private onLocalGameOver(): void {
        if (!this._isHost) return;
        this._netManager.sendAction({ type: 'MATCH_OVER', victory: false }).catch(() => {});
    }

    private onLocalCoinPicked(data: { x: number; z: number }): void {
        if (!this._isHost) return;
        if (!Number.isFinite(data?.x) || !Number.isFinite(data?.z)) return;
        this._netManager
            .sendAction({
                type: 'COIN_PICKUP',
                x: data.x,
                z: data.z,
            })
            .catch(() => {});
    }

    private onLocalWaveStart(data: { wave?: number; waveIndex?: number }): void {
        if (!this._isHost) return;
        const waveNumber = Math.max(1, Math.floor(data.wave ?? data.waveIndex ?? 1));
        this._netManager.sendAction({ type: 'WAVE_ADVANCE', waveIndex: waveNumber }).catch(() => {});
    }

    private findPad(padId: string): BuildingPad | null {
        if (!padId) return null;
        const manager =
            ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
        return manager.getPadByCoopPadId(padId);
    }

    // ─── Host-authoritative build state sync ────────────────────────────────

    private startBuildStateSync(): void {
        this.stopBuildStateSync();
        this._buildSyncTimer = setInterval(() => {
            this.sendBuildStateSnapshot();
        }, BUILD_SYNC_INTERVAL_MS);
    }

    private stopBuildStateSync(): void {
        if (this._buildSyncTimer) {
            clearInterval(this._buildSyncTimer);
            this._buildSyncTimer = null;
        }
    }

    /** Host: send after building events for fast guest sync */
    private onBuildingConstructedSync(): void {
        if (!this._isHost) return;
        // Short delay to let BuildingManager finish creating the building
        setTimeout(() => this.sendBuildStateSnapshot(), 200);
    }

    private sendBuildStateSnapshot(): void {
        if (!this._isHost) return;
        const manager =
            ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;

        const pads: BuildStatePadSnapshot[] = [];
        for (const pad of manager.pads) {
            if (!pad || !pad.node || !pad.node.isValid) continue;
            const building = pad.getAssociatedBuilding();
            pads.push({
                padId: pad.coopPadId,
                buildingTypeId: building?.buildingTypeId ?? pad.buildingTypeId,
                level: building?.level ?? 0,
                hpRatio: building
                    ? Math.max(0, building.currentHp / Math.max(1, building.maxHp))
                    : 0,
                nextUpgradeCost: pad.nextUpgradeCost,
                collectedCoins: pad.collectedCoins,
                state: this.mapPadState(pad.state),
            });
        }

        this._buildStateVersion += 1;
        const snapshot: BuildStateSnapshot = {
            version: this._buildStateVersion,
            sharedCoins: gm.coins,
            pads,
        };

        this._netManager
            .sendAction({
                type: 'BUILD_STATE_SYNC',
                snapshot,
            })
            .catch(() => {});
    }

    private mapPadState(
        state: BuildingPadState
    ): 'waiting' | 'building' | 'upgrading' | 'selecting' | 'complete' {
        switch (state) {
            case BuildingPadState.WAITING:
                return 'waiting';
            case BuildingPadState.BUILDING:
                return 'building';
            case BuildingPadState.UPGRADING:
                return 'upgrading';
            case BuildingPadState.SELECTING:
                return 'selecting';
            case BuildingPadState.COMPLETE:
                return 'complete';
            default:
                return 'waiting';
        }
    }

    /** Guest: apply authoritative build state snapshot from host */
    private handleBuildStateSnapshot(msg: { snapshot: BuildStateSnapshot; seq: number }): void {
        // Host ignores its own snapshot echoes
        if (this._isHost) return;
        if (!msg.snapshot || typeof msg.snapshot.version !== 'number') return;
        if (msg.snapshot.version <= this._lastAppliedBuildVersion) return;
        this._lastAppliedBuildVersion = msg.snapshot.version;

        const manager =
            ServiceRegistry.get<BuildingManager>('BuildingManager') ?? BuildingManager.instance;
        manager.applyAuthoritativeSnapshot(msg.snapshot);

        // Also sync shared coins
        const gm = ServiceRegistry.get<GameManager>('GameManager') ?? GameManager.instance;
        gm.setCoins(msg.snapshot.sharedCoins);
    }

    private handleWaveStarted(msg: { waveIndex: number; startAt: number; seq: number }): void {
        if (this._isHost) {
            this._lastAuthoritativeWave = Math.max(this._lastAuthoritativeWave, msg.waveIndex);
            return;
        }
        if (!Number.isFinite(msg.waveIndex) || msg.waveIndex < 1) return;
        if (!this._waveLoop) {
            this._pendingAuthoritativeWaveStart = {
                waveIndex: msg.waveIndex,
                startAt: msg.startAt,
            };
            return;
        }
        if (msg.waveIndex <= this._lastAuthoritativeWave) return;

        this._lastAuthoritativeWave = msg.waveIndex;
        const delaySeconds = Math.max(0, (msg.startAt - this._netManager.serverNow) / 1000);
        this._waveLoop.scheduleExternalWaveStart(msg.waveIndex, delaySeconds);
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }
}
