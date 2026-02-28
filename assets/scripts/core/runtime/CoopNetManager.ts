/**
 * CoopNetManager
 * 客户端侧 Devvit Realtime 封装层。
 * - 连接/断开 Realtime channel
 * - 通过 HTTP POST 发送消息到服务端（Devvit Realtime 是单向：server→client）
 * - 接收服务端广播消息并分发给监听者
 * - V2: 高频位置消息不参与 seq 链路（最新值优先），低频事件保持有序
 * - V2: 自动从 window.__DEVVIT_REALTIME__ 注入适配器
 * - V2: 服务器权威时钟同步 (RTT + offset)
 * - V2: 断线自动 fallback /sync，恢复后回切 Realtime
 * - V2: RTT/抖动/时钟偏移监控日志
 */
import { COOP_REALTIME_V2, CoopRealtimeConfig } from './CoopRealtimeConfig';

// ─── Message types (mirrors server definitions) ────────────────────────────────

// ─── Build state snapshot (host-authoritative building) ─────────────────────

export interface BuildStatePadSnapshot {
    padId: string;
    buildingTypeId: string;
    level: number;
    hpRatio: number;
    nextUpgradeCost: number;
    collectedCoins: number;
    state: 'waiting' | 'building' | 'upgrading' | 'selecting' | 'complete';
}

export interface BuildStateSnapshot {
    version: number;
    sharedCoins: number;
    pads: BuildStatePadSnapshot[];
}

export interface CoopMatchState {
    matchId: string;
    postId: string;
    status: 'waiting' | 'playing' | 'finished';
    createdAt: number;
    players: CoopPlayerSlot[];
    teamXp: number;
    teamLevel: number;
    sharedCoins: number;
    waveNumber: number;
    waveStartAt: number | null;
    seq: number;
    buildState?: BuildStateSnapshot;
}

export interface CoopPlayerSlot {
    playerId: string;
    slot: 0 | 1;
    connected: boolean;
    lastHeartbeat: number;
    heroState: {
        position: { x: number; z: number };
        hp: number;
        maxHp: number;
        level: number;
    };
    weapons: { type: string; level: number }[];
    activeWeaponType: string | null;
}

/** Client → Server action types (sent via HTTP POST) */
export type ClientAction =
    | { type: 'INPUT'; dx: number; dz: number; t: number }
    | {
          type: 'COIN_DEPOSIT';
          padId: string;
          amount: number;
          clientSeq: number;
          padFilled?: boolean;
          eventType?: string;
      }
    | {
          type: 'TOWER_DECISION';
          padId: string;
          buildingTypeId: string;
      }
    | { type: 'COIN_PICKUP'; x: number; z: number }
    | { type: 'WEAPON_PICK'; weaponId: string }
    | { type: 'HEARTBEAT'; t: number }
    | { type: 'DISCONNECT' }
    | { type: 'PAUSE_REQUEST' }
    | { type: 'RESUME_REQUEST' }
    | { type: 'MATCH_OVER'; victory: boolean }
    | { type: 'BUILD_STATE_SYNC'; snapshot: BuildStateSnapshot }
    | { type: 'CLOCK_SYNC_REQUEST'; clientTime: number }
    | { type: 'WAVE_ADVANCE'; waveIndex: number };

/** Server → Client broadcast message types */
export type ServerMessage =
    | { type: 'MATCH_STATE'; state: CoopMatchState }
    | { type: 'PLAYER_INPUT'; playerId: string; dx: number; dz: number; t: number }
    | {
          type: 'COIN_DEPOSITED';
          padId: string;
          playerId: string;
          amount: number;
          remaining: number;
          seq: number;
      }
    | { type: 'DECISION_OWNER'; padId: string; playerId: string; eventType: string; seq: number }
    | {
          type: 'TOWER_DECIDED';
          padId: string;
          playerId: string;
          buildingTypeId: string;
          seq: number;
      }
    | { type: 'COIN_PICKED'; playerId: string; x: number; z: number; seq: number }
    | { type: 'WEAPON_ASSIGNED'; playerId: string; weaponId: string; seq: number }
    | { type: 'LEVEL_UP'; teamLevel: number; seq: number }
    | { type: 'PLAYER_DISCONNECTED'; playerId: string }
    | { type: 'PLAYER_RECONNECTED'; playerId: string; state: CoopPlayerSlot }
    | { type: 'GAME_PAUSE'; seq: number }
    | { type: 'GAME_RESUME'; seq: number }
    | { type: 'MATCH_OVER'; victory: boolean; seq: number }
    | { type: 'BUILD_STATE_SNAPSHOT'; snapshot: BuildStateSnapshot; seq: number }
    | { type: 'CLOCK_SYNC'; serverTime: number; clientTime: number; seq: number }
    | { type: 'WAVE_STARTED'; waveIndex: number; startAt: number; seq: number }
    | { type: 'PHASE_CHANGE'; phase: string; serverTime: number; seq: number };

export type CoopMessageListener = (msg: ServerMessage) => void;

/** API response types */
interface CreateMatchResponse {
    matchId: string;
    channel: string;
    selfPlayerId: string;
    state: CoopMatchState;
}

interface JoinMatchResponse {
    matchId: string;
    channel: string;
    selfPlayerId: string;
    state: CoopMatchState;
}

interface RejoinResponse {
    selfPlayerId?: string;
    state: CoopMatchState;
    missedActions: ServerMessage[];
}

interface SyncResponse {
    selfPlayerId?: string;
    state: CoopMatchState;
    missedActions: ServerMessage[];
}

interface MatchStateResponse {
    state: CoopMatchState;
}

interface ActionResponse {
    ok: boolean;
    seq: number;
}

/**
 * Injectable Realtime adapter.
 * The Devvit WebView bridge layer provides the concrete implementation
 * that calls `connectRealtime` from `@devvit/web/client`.
 */
export interface RealtimeAdapter {
    connect(opts: {
        channel: string;
        onConnect: () => void;
        onDisconnect: () => void;
        onMessage: (data: ServerMessage) => void;
    }): { disconnect(): Promise<void> };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = '/api/coop';
const API_TIMEOUT_MS = 8000;
const RECONNECT_INTERVAL_MS = 3000;
const RECONNECT_MAX_ATTEMPTS = 5;
const SEQ_BUFFER_TIMEOUT_MS = COOP_REALTIME_V2 ? CoopRealtimeConfig.SEQ_BUFFER_TIMEOUT_MS : 200;
const INPUT_AGGREGATE_INTERVAL_MS = COOP_REALTIME_V2
    ? CoopRealtimeConfig.INPUT_SEND_INTERVAL_MS
    : 100;
const HEARTBEAT_INTERVAL_MS = 15_000;
const SYNC_POLL_INTERVAL_MS = COOP_REALTIME_V2 ? CoopRealtimeConfig.FALLBACK_SYNC_INTERVAL_MS : 150;

// ─── Manager ───────────────────────────────────────────────────────────────────

export class CoopNetManager {
    private _matchId: string = '';
    private _channel: string = '';
    private _localPlayerId: string = '';
    private _isHost: boolean = false;
    private _anonPlayerId: string = CoopNetManager.resolveAnonymousPlayerId();
    private _lastSeq: number = 0;
    private _clientSeq: number = 0;

    // Realtime adapter (injected)
    private _realtimeAdapter: RealtimeAdapter | null = null;

    // Realtime connection (set when connected)
    private _realtimeConnection: { disconnect(): Promise<void> } | null = null;
    private _connected: boolean = false;
    private _useSyncPolling: boolean = false;

    // Listeners
    private _listeners: CoopMessageListener[] = [];

    // Seq-ordered buffer
    private _seqBuffer: ServerMessage[] = [];
    private _seqFlushTimer: ReturnType<typeof setTimeout> | null = null;

    // Reconnect state
    private _reconnectAttempts: number = 0;
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _disconnected: boolean = false;

    // Input aggregation
    private _pendingInput: { dx: number; dz: number; t: number } | null = null;
    private _inputTimer: ReturnType<typeof setInterval> | null = null;

    // Heartbeat
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    // Sync polling (fallback when realtime adapter is unavailable)
    private _syncTimer: ReturnType<typeof setInterval> | null = null;
    private _syncInFlight: boolean = false;
    private _lastStateSeq: number = -1;

    // V2: Realtime recovery timer (when fallback is active, periodically try reconnect)
    private _realtimeRecoveryTimer: ReturnType<typeof setInterval> | null = null;

    // V2: Server authoritative clock
    private _clockOffset: number = 0; // serverTime - localTime (ms)
    private _clockSyncTimer: ReturnType<typeof setInterval> | null = null;
    private _clockSyncPending: number = 0; // clientTime of last sync request

    // V2: RTT monitoring
    private _rttSamples: number[] = [];
    private _jitterSamples: number[] = [];
    private _monitorTimer: ReturnType<typeof setInterval> | null = null;
    private _resyncCount: number = 0;

    // ─── Public API ────────────────────────────────────────────────────────

    get matchId(): string {
        return this._matchId;
    }
    get channel(): string {
        return this._channel;
    }
    get localPlayerId(): string {
        return this._localPlayerId;
    }
    get isConnected(): boolean {
        return this._connected;
    }
    get isHost(): boolean {
        return this._isHost;
    }
    get isGuest(): boolean {
        return !this._isHost;
    }
    get lastSeq(): number {
        return this._lastSeq;
    }

    /** V2: Estimated server time (ms) */
    get serverNow(): number {
        return Date.now() + this._clockOffset;
    }

    /** V2: Current clock offset (serverTime - localTime, ms) */
    get clockOffset(): number {
        return this._clockOffset;
    }

    /** V2: Median RTT (ms) */
    get medianRtt(): number {
        if (this._rttSamples.length === 0) return 0;
        const sorted = [...this._rttSamples].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }

    /** V2: Is using realtime (not polling fallback) */
    get isUsingRealtime(): boolean {
        return !this._useSyncPolling && this._connected;
    }

    /** V2: Resync count */
    get resyncCount(): number {
        return this._resyncCount;
    }

    /**
     * Set the Realtime adapter. Must be called before connect().
     * The adapter is provided by the Devvit bridge layer.
     */
    setRealtimeAdapter(adapter: RealtimeAdapter): void {
        this._realtimeAdapter = adapter;
    }

    /**
     * Create a new match. Returns matchId + channel on success.
     */
    async createMatch(): Promise<CreateMatchResponse> {
        const res = await this.postApi<CreateMatchResponse>('/create-match', {});
        this._matchId = res.matchId;
        this._channel = res.channel;
        this._localPlayerId = res.selfPlayerId;
        this._isHost = true;
        this._lastSeq = res.state?.seq ?? 0;
        this._lastStateSeq = res.state?.seq ?? -1;
        return res;
    }

    /**
     * Join an existing match.
     */
    async joinMatch(matchId: string): Promise<CoopMatchState> {
        const res = await this.postApi<JoinMatchResponse>('/join-match', { matchId });
        this._matchId = res.matchId;
        this._channel = res.channel;
        this._localPlayerId = res.selfPlayerId;
        this._isHost = false;
        if (res.state) {
            this._lastSeq = res.state.seq ?? 0;
            this._lastStateSeq = res.state.seq ?? -1;
        }
        return res.state;
    }

    /**
     * Rejoin a match the current player already belongs to.
     * Useful when the room is created before entering gameplay scene.
     */
    async rejoinMatch(matchId: string): Promise<CoopMatchState> {
        this._matchId = matchId;
        this._channel = CoopNetManager.channelFromMatchId(matchId);

        const res = await this.postApi<RejoinResponse>('/rejoin', {
            matchId,
            lastSeq: this._lastSeq,
        });
        if (res.selfPlayerId) {
            this._localPlayerId = res.selfPlayerId;
        }
        if (res.state) {
            this._lastSeq = res.state.seq ?? this._lastSeq;
            this._lastStateSeq = res.state.seq ?? this._lastStateSeq;
        }
        if (res.missedActions) {
            for (const action of res.missedActions) {
                this.onServerMessage(action);
            }
        }
        return res.state;
    }

    /**
     * Fetch latest match state (used by host waiting for player #2).
     */
    async getMatchState(matchId?: string): Promise<CoopMatchState> {
        const targetMatchId = matchId ?? this._matchId;
        const res = await this.getApi<MatchStateResponse>('/match-state', {
            matchId: targetMatchId,
        });
        if (res.state) {
            this._lastStateSeq = res.state.seq ?? this._lastStateSeq;
            this._lastSeq = Math.max(this._lastSeq, res.state.seq ?? this._lastSeq);
        }
        return res.state;
    }

    /**
     * Connect to the Realtime channel for receiving server broadcasts.
     * Must be called after createMatch/joinMatch and setRealtimeAdapter.
     * V2: Auto-injects realtime adapter from window.__DEVVIT_REALTIME__ bridge.
     */
    async connect(playerId: string): Promise<void> {
        this._localPlayerId = playerId;
        this._disconnected = false;
        this._reconnectAttempts = 0;

        // V2: Auto-inject realtime adapter from bridge if not already set
        if (COOP_REALTIME_V2 && !this._realtimeAdapter) {
            this.autoInjectRealtimeAdapter();
        }

        this._useSyncPolling = !this._realtimeAdapter;

        if (this._useSyncPolling) {
            console.warn(
                '[CoopNetManager] No Realtime adapter available, using sync polling fallback'
            );
            this._connected = true;
            this.startSyncPolling();
            this.syncOnce().catch(() => {});
        } else {
            console.log('[CoopNetManager] Connecting via Realtime channel:', this._channel);
            this.connectRealtime();
        }
        this.startInputAggregation();
        this.startHeartbeat();

        // V2: Start clock sync and monitoring
        if (COOP_REALTIME_V2) {
            this.startClockSync();
            this.startMonitor();
        }
    }

    /**
     * V2: Auto-inject realtime adapter from the window.__DEVVIT_REALTIME__ bridge
     * that was loaded by realtime-bridge.js in the game HTML.
     */
    private autoInjectRealtimeAdapter(): void {
        if (typeof window === 'undefined') return;
        const bridge = (window as any).__DEVVIT_REALTIME__;
        if (!bridge || typeof bridge.connectRealtime !== 'function') {
            console.warn('[CoopNetManager] window.__DEVVIT_REALTIME__ not available');
            return;
        }

        const adapter: RealtimeAdapter = {
            connect(opts) {
                const conn = bridge.connectRealtime({
                    channel: opts.channel,
                    onConnect: () => opts.onConnect(),
                    onDisconnect: () => opts.onDisconnect(),
                    onMessage: (data: any) => opts.onMessage(data as ServerMessage),
                });
                return {
                    disconnect: () => conn.disconnect(),
                };
            },
        };

        this._realtimeAdapter = adapter;
        console.log('[CoopNetManager] Auto-injected Realtime adapter from bridge');
    }

    /**
     * Disconnect and clean up.
     */
    async disconnect(): Promise<void> {
        this._disconnected = true;
        this.stopTimers();

        // Notify server
        try {
            await this.sendAction({ type: 'DISCONNECT' });
        } catch {
            /* best-effort */
        }

        if (this._realtimeConnection) {
            try {
                await this._realtimeConnection.disconnect();
            } catch {
                /* ignore */
            }
            this._realtimeConnection = null;
        }
        this._connected = false;
        this._useSyncPolling = false;
        this._rttSamples.length = 0;
        this._jitterSamples.length = 0;
    }

    /**
     * Register a listener for server messages.
     */
    on(listener: CoopMessageListener): void {
        this._listeners.push(listener);
    }

    /**
     * Remove a listener.
     */
    off(listener: CoopMessageListener): void {
        const idx = this._listeners.indexOf(listener);
        if (idx >= 0) this._listeners.splice(idx, 1);
    }

    /**
     * Send a game action to the server (via HTTP POST).
     * Returns { ok, seq } on success.
     */
    async sendAction(action: ClientAction): Promise<ActionResponse> {
        return this.postApi<ActionResponse>('/action', {
            matchId: this._matchId,
            ...action,
        });
    }

    /**
     * Queue an input update (aggregated and sent at INPUT_AGGREGATE_INTERVAL_MS).
     */
    queueInput(dx: number, dz: number): void {
        this._pendingInput = { dx, dz, t: Date.now() };
    }

    /**
     * Generate a unique client-side sequence number (for idempotency).
     */
    nextClientSeq(): number {
        return ++this._clientSeq;
    }

    // ─── Realtime connection ───────────────────────────────────────────────

    private connectRealtime(): void {
        if (!this._channel || !this._realtimeAdapter) {
            console.warn('[CoopNetManager] No channel or adapter set, skipping connectRealtime');
            return;
        }

        // Disconnect existing connection before reconnecting
        if (this._realtimeConnection) {
            try {
                this._realtimeConnection.disconnect().catch(() => {});
            } catch {
                /* ignore */
            }
            this._realtimeConnection = null;
        }

        try {
            this._realtimeConnection = this._realtimeAdapter.connect({
                channel: this._channel,
                onConnect: () => {
                    console.log('[CoopNetManager] Realtime connected');
                    this._connected = true;
                    this._reconnectAttempts = 0;

                    // V2: If we were on sync fallback, switch back to realtime
                    if (COOP_REALTIME_V2 && this._useSyncPolling) {
                        console.log('[CoopNetManager] Realtime recovered, stopping sync polling');
                        this._useSyncPolling = false;
                        this.stopSyncPolling();
                        this.stopRealtimeRecovery();
                        // Rejoin to catch up on missed actions
                        this.postApi<RejoinResponse>('/rejoin', {
                            matchId: this._matchId,
                            lastSeq: this._lastSeq,
                        })
                            .then(res => {
                                if (res.missedActions) {
                                    for (const action of res.missedActions) {
                                        this.onServerMessage(action);
                                    }
                                }
                            })
                            .catch(() => {});
                    }
                },
                onDisconnect: () => {
                    console.warn('[CoopNetManager] Realtime disconnected');
                    this._connected = false;
                    if (!this._disconnected) {
                        this.scheduleReconnect();
                    }
                },
                onMessage: (msg: ServerMessage) => {
                    this.onServerMessage(msg);
                },
            });
        } catch (err) {
            console.warn('[CoopNetManager] connectRealtime failed:', err);
            this._useSyncPolling = true;
            this._connected = true;
            this.startSyncPolling();
            if (COOP_REALTIME_V2) {
                this.startRealtimeRecovery();
            }
        }
    }

    // ─── Reconnection ──────────────────────────────────────────────────────

    private scheduleReconnect(): void {
        if (this._disconnected) return;

        // V2: On realtime disconnect, immediately start sync polling as fallback
        // AND periodically try to reconnect realtime.
        if (COOP_REALTIME_V2 && this._realtimeAdapter) {
            if (!this._useSyncPolling) {
                console.warn(
                    '[CoopNetManager] Realtime disconnected, switching to sync polling fallback'
                );
                this._useSyncPolling = true;
                this._connected = true;
                this.startSyncPolling();
                this.startRealtimeRecovery();
                this._resyncCount++;
            }
            return;
        }

        if (this._useSyncPolling) {
            this._connected = true;
            this.startSyncPolling();
            return;
        }
        if (this._reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
            this.dispatch({ type: 'PLAYER_DISCONNECTED', playerId: this._localPlayerId });
            return;
        }

        this._reconnectAttempts++;
        this._reconnectTimer = setTimeout(async () => {
            try {
                this.connectRealtime();
                // Rejoin to get missed actions
                const res = await this.postApi<RejoinResponse>('/rejoin', {
                    matchId: this._matchId,
                    lastSeq: this._lastSeq,
                });
                if (res.selfPlayerId) {
                    this._localPlayerId = res.selfPlayerId;
                }
                if (res.missedActions) {
                    for (const action of res.missedActions) {
                        this.onServerMessage(action);
                    }
                }
                if (res.state) {
                    this._lastSeq = res.state.seq ?? this._lastSeq;
                }
            } catch {
                this.scheduleReconnect();
            }
        }, RECONNECT_INTERVAL_MS);
    }

    // V2: Periodically attempt to reconnect realtime while on sync fallback
    private startRealtimeRecovery(): void {
        this.stopRealtimeRecovery();
        this._realtimeRecoveryTimer = setInterval(() => {
            if (this._disconnected || !this._realtimeAdapter) return;
            if (!this._useSyncPolling) {
                this.stopRealtimeRecovery();
                return;
            }
            console.log('[CoopNetManager] Attempting realtime recovery...');
            this.connectRealtime();
        }, CoopRealtimeConfig.REALTIME_RECOVERY_CHECK_MS);
    }

    private stopRealtimeRecovery(): void {
        if (this._realtimeRecoveryTimer) {
            clearInterval(this._realtimeRecoveryTimer);
            this._realtimeRecoveryTimer = null;
        }
    }

    // ─── Message handling ──────────────────────────────────────────────────

    private onServerMessage(msg: ServerMessage): void {
        // V2: Handle clock sync response immediately (bypass seq)
        if (COOP_REALTIME_V2 && msg.type === 'CLOCK_SYNC') {
            this.handleClockSync(msg as any);
            return;
        }

        const msgSeq = (msg as { seq?: number }).seq;

        // Messages without seq (e.g. PLAYER_INPUT / PLAYER_DISCONNECTED) dispatch immediately.
        if (msgSeq === undefined) {
            this.dispatch(msg);
            return;
        }

        // Skip already-processed messages
        if (msgSeq <= this._lastSeq) return;

        // If next in order, dispatch directly
        if (msgSeq === this._lastSeq + 1) {
            this._lastSeq = msgSeq;
            this.dispatch(msg);
            this.flushSeqBuffer();
            return;
        }

        // Out of order — buffer and set flush timeout
        this._seqBuffer.push(msg);
        this._seqBuffer.sort((a, b) => (a as { seq: number }).seq - (b as { seq: number }).seq);

        if (!this._seqFlushTimer) {
            this._seqFlushTimer = setTimeout(() => {
                this._seqFlushTimer = null;
                this.forceFlushSeqBuffer();
            }, SEQ_BUFFER_TIMEOUT_MS);
        }
    }

    private flushSeqBuffer(): void {
        while (this._seqBuffer.length > 0) {
            const next = this._seqBuffer[0];
            const nextSeq = (next as { seq: number }).seq;
            if (nextSeq !== this._lastSeq + 1) break;
            this._seqBuffer.shift();
            this._lastSeq = nextSeq;
            this.dispatch(next);
        }
    }

    private forceFlushSeqBuffer(): void {
        // Force-apply all buffered messages in seq order
        this._seqBuffer.sort((a, b) => (a as { seq: number }).seq - (b as { seq: number }).seq);
        for (const msg of this._seqBuffer) {
            const msgSeq = (msg as { seq: number }).seq;
            if (msgSeq > this._lastSeq) {
                this._lastSeq = msgSeq;
                this.dispatch(msg);
            }
        }
        this._seqBuffer.length = 0;
    }

    private dispatch(msg: ServerMessage): void {
        for (const listener of this._listeners) {
            try {
                listener(msg);
            } catch (err) {
                console.error('[CoopNetManager] listener error:', err);
            }
        }
    }

    // ─── Input aggregation ─────────────────────────────────────────────────

    private startInputAggregation(): void {
        this.stopInputTimer();
        this._inputTimer = setInterval(() => {
            if (this._pendingInput && this._connected) {
                const input = this._pendingInput;
                this._pendingInput = null;
                this.sendAction({ type: 'INPUT', dx: input.dx, dz: input.dz, t: input.t }).catch(
                    () => {}
                );
            }
        }, INPUT_AGGREGATE_INTERVAL_MS);
    }

    private stopInputTimer(): void {
        if (this._inputTimer) {
            clearInterval(this._inputTimer);
            this._inputTimer = null;
        }
    }

    // ─── Heartbeat ─────────────────────────────────────────────────────────

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            if (this._connected) {
                this.sendAction({ type: 'HEARTBEAT', t: Date.now() }).catch(() => {});
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    // ─── Sync polling fallback ─────────────────────────────────────────────

    private startSyncPolling(): void {
        this.stopSyncPolling();
        this._syncTimer = setInterval(() => {
            if (!this._connected || this._disconnected) return;
            this.syncOnce().catch(() => {});
        }, SYNC_POLL_INTERVAL_MS);
    }

    private stopSyncPolling(): void {
        if (this._syncTimer) {
            clearInterval(this._syncTimer);
            this._syncTimer = null;
        }
    }

    private async syncOnce(): Promise<void> {
        if (this._syncInFlight) return;
        if (!this._matchId) return;
        this._syncInFlight = true;
        try {
            const res = await this.postApi<SyncResponse>('/sync', {
                matchId: this._matchId,
                lastSeq: this._lastSeq,
            });
            if (res.selfPlayerId) {
                this._localPlayerId = res.selfPlayerId;
            }
            if (res.state) {
                const stateSeq = res.state.seq ?? -1;
                // In sync-poll fallback, PLAYER_INPUT may be no-seq and won't appear in replay.
                // Always dispatch MATCH_STATE so remote hero positions can still update from state.players.
                if (this._useSyncPolling || stateSeq !== this._lastStateSeq) {
                    this._lastStateSeq = stateSeq;
                    this.dispatch({ type: 'MATCH_STATE', state: res.state });
                }
            }
            if (res.missedActions) {
                for (const msg of res.missedActions) {
                    this.onServerMessage(msg);
                }
            }
        } finally {
            this._syncInFlight = false;
        }
    }

    // ─── V2: Server authoritative clock ────────────────────────────────────

    private startClockSync(): void {
        this.stopClockSync();
        // Initial sync
        this.requestClockSync();
        this._clockSyncTimer = setInterval(() => {
            this.requestClockSync();
        }, CoopRealtimeConfig.CLOCK_SYNC_INTERVAL_MS);
    }

    private stopClockSync(): void {
        if (this._clockSyncTimer) {
            clearInterval(this._clockSyncTimer);
            this._clockSyncTimer = null;
        }
    }

    private requestClockSync(): void {
        if (!this._connected || !this._matchId) return;
        this._clockSyncPending = Date.now();
        this.sendAction({ type: 'CLOCK_SYNC_REQUEST', clientTime: this._clockSyncPending }).catch(
            () => {}
        );
    }

    private handleClockSync(msg: { serverTime: number; clientTime: number }): void {
        const now = Date.now();
        const rtt = now - msg.clientTime;
        const oneWay = rtt / 2;
        const newOffset = msg.serverTime + oneWay - now;

        // Track RTT sample
        this._rttSamples.push(rtt);
        if (this._rttSamples.length > CoopRealtimeConfig.MONITOR_RTT_SAMPLES) {
            this._rttSamples.shift();
        }

        // Track jitter
        if (this._rttSamples.length >= 2) {
            const prev = this._rttSamples[this._rttSamples.length - 2];
            this._jitterSamples.push(Math.abs(rtt - prev));
            if (this._jitterSamples.length > CoopRealtimeConfig.MONITOR_RTT_SAMPLES) {
                this._jitterSamples.shift();
            }
        }

        // Soft correction: blend towards new offset
        const drift = Math.abs(newOffset - this._clockOffset);
        if (drift > CoopRealtimeConfig.CLOCK_DRIFT_THRESHOLD_MS) {
            this._clockOffset +=
                (newOffset - this._clockOffset) * CoopRealtimeConfig.CLOCK_CORRECTION_RATE;
            this._resyncCount++;
        } else {
            this._clockOffset = newOffset;
        }
    }

    // ─── V2: Monitoring ───────────────────────────────────────────────────

    private startMonitor(): void {
        this.stopMonitor();
        this._monitorTimer = setInterval(() => {
            this.logMonitorStats();
        }, CoopRealtimeConfig.MONITOR_LOG_INTERVAL_MS);
    }

    private stopMonitor(): void {
        if (this._monitorTimer) {
            clearInterval(this._monitorTimer);
            this._monitorTimer = null;
        }
    }

    private logMonitorStats(): void {
        if (this._rttSamples.length === 0) return;
        const sorted = [...this._rttSamples].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const jitterAvg =
            this._jitterSamples.length > 0
                ? Math.round(
                      this._jitterSamples.reduce((a, b) => a + b, 0) / this._jitterSamples.length
                  )
                : 0;
        console.log(
            `[CoopNet-Monitor] RTT p50=${p50}ms p95=${p95}ms | jitter=${jitterAvg}ms | offset=${Math.round(this._clockOffset)}ms | resyncs=${this._resyncCount} | realtime=${!this._useSyncPolling} | seqBuf=${this._seqBuffer.length}`
        );
    }

    // ─── Cleanup ───────────────────────────────────────────────────────────

    private stopTimers(): void {
        this.stopInputTimer();
        this.stopHeartbeat();
        this.stopSyncPolling();
        this.stopRealtimeRecovery();
        this.stopClockSync();
        this.stopMonitor();
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._seqFlushTimer) {
            clearTimeout(this._seqFlushTimer);
            this._seqFlushTimer = null;
        }
    }

    // ─── HTTP helpers ──────────────────────────────────────────────────────

    private async postApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

        try {
            const res = await fetch(`${API_BASE}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-coop-player-id': this._anonPlayerId,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            return data as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async getApi<T>(path: string, query: Record<string, string>): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        try {
            const qs = new URLSearchParams(query).toString();
            const res = await fetch(`${API_BASE}${path}?${qs}`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'x-coop-player-id': this._anonPlayerId,
                },
                signal: controller.signal,
                cache: 'no-store',
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }
            return data as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    private static resolveAnonymousPlayerId(): string {
        if (typeof window === 'undefined') {
            return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        }
        try {
            const key = 'KS_COOP_PLAYER_SESSION_ID';
            const existing = window.sessionStorage?.getItem(key)?.trim();
            if (existing) return existing;
            const created = `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            window.sessionStorage?.setItem(key, created);
            return created;
        } catch {
            return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        }
    }

    private static channelFromMatchId(matchId: string): string {
        return `match-${matchId}`;
    }
}
