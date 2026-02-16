import { Node, Vec3 } from 'cc';
import { GameEvents } from '../../data/GameEvents';
import { UnitFactory } from '../units/UnitFactory';
import type { EnemyVisualVariant } from '../units/EnemyVisualTypes';
import { Unit, UnitType } from '../units/Unit';
import { GameConfig } from '../../data/GameConfig';
import { WaveService } from '../../core/managers/WaveService';
import { ServiceRegistry } from '../../core/managers/ServiceRegistry';
import { EventManager } from '../../core/managers/EventManager';
import {
    getFallbackArchetypes,
    normalizeBossEventConfig,
    normalizeCompositionTemplates,
    normalizeEnemyArchetypes,
    normalizeRhythmTemplates,
} from './WaveConfigParsers';
import { clamp, randomInt, toFinite, toPositiveInt } from './WaveMath';
import { pickForecastEntry } from './WaveForecast';
import { resolveSpawnPortals, type SpawnPortalPoint } from './WaveSpawnPortals';
import {
    laneToForecastLane,
    resolveLanePortalRouting,
    ROUTE_LANE_SEQUENCE,
    type LaneDirection2D,
    type RouteLane,
} from './WaveLaneRouting';
import { LaneFogController } from './LaneFogController';
import {
    resolveLaneUnlockFocusPosition,
    resolveLaneUnlockPadFocusPosition,
    resolveSpawnPositionByLane,
} from './WaveLaneCoordinator';
import {
    advanceBossLaneState,
    applyBossEchoForWave,
    pruneBossEchoes,
    resolveBossEchoWeight,
    rollNextBossWave,
    selectBossArchetype,
    shouldTriggerBossWave,
} from './WaveBossDirector';
import {
    allocateTypeCounts,
    applyRhythm,
    buildElitePositionSet,
    enumerateValidCombos,
    pickWeightedCombo,
    selectTemplateWithCooldown,
    shuffleInPlace,
    toComboKey,
    weightedPickWithoutReplacement,
} from './WaveSpawnPlanner';
import {
    applyArchetypeSelectionState,
    markTemplateCooldown,
    tickArchetypeCooldowns,
    tickTemplateCooldowns,
    updateWaveMemory,
} from './WaveRuntimeState';
import type {
    ArchetypeRuntimeState,
    BossEchoRuntimeState,
    BossEventConfig,
    CompositionTemplate,
    EnemyArchetypeConfig,
    InfiniteRandomizerConfig,
    PlannedSpawnEntry,
    RhythmTemplate,
    SpawnCombatProfile,
    SpawnType,
    TemplateRuntimeState,
    WaveConfig,
    WaveSpawnPlan,
} from './WaveTypes';
export type { WaveConfig } from './WaveTypes';

/**
 * 波次管理器（无限波模式）
 * 负责敌人波次的生成和管理
 *
 * NOTE: 当前由 GameController 驱动（无限波模式）。
 * 若需配置波次，可新增独立的配置波次管理器。
 */
export class WaveManager {
    private static _instance: WaveManager | null = null;
    private static readonly LANE_UNLOCK_WARNING_SECONDS: number = 2.4;
    private static readonly LANE_UNLOCK_FOCUS_INWARD: number = 8.5;
    private static readonly LOCKED_LANE_PAD_TYPES: ReadonlySet<string> = new Set([
        'tower',
        'frost_tower',
        'lightning_tower',
        'wall',
    ]);

    public static get instance(): WaveManager {
        if (!this._instance) {
            this._instance = new WaveManager();
        }
        return this._instance;
    }

    // === 状态 ===
    private _enemyContainer: Node | null = null;
    private _enemies: Node[] = [];
    private _currentWave: number = 0;
    private _waveActive: boolean = false;
    private _regularSpawned: number = 0;
    private _eliteSpawned: number = 0;
    private _bossSpawned: number = 0;
    private _enemySpawnTimer: number = 0;
    private _nextSpawnInterval: number = 0;
    private _waveConfig: WaveConfig | null = null;
    private _wavePlan: WaveSpawnPlan | null = null;
    private _waveSpawnCursor: number = 0;
    private _forcedFirstSpawnLane: RouteLane | null = null;
    private _spawnPortals: SpawnPortalPoint[] = [];
    private _waveVisualOffset: number = 0;
    private _portalIndexByLane: Record<RouteLane, number> = {
        top: 0,
        mid: 0,
        bottom: 0,
    };
    private _laneDirectionByLane: Record<RouteLane, LaneDirection2D> = {
        top: { x: 1, y: 0 },
        mid: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
        bottom: { x: 0, y: 1 },
    };
    private _unlockedLanes: Set<RouteLane> = new Set<RouteLane>(['mid']);
    private _nextUnlockLaneCursor: number = 1;
    private _nextBossLaneCursor: number = 0;
    private _pendingLaneUnlock: { lane: RouteLane; remainSeconds: number } | null = null;
    private _spawnedEnemyMeta: Map<Node, { spawnType: SpawnType; lane: RouteLane }> = new Map();
    private _laneFogController: LaneFogController = new LaneFogController();

    private _archetypes: EnemyArchetypeConfig[] = [];
    private _archetypeById: Map<string, EnemyArchetypeConfig> = new Map();
    private _archetypeState: Map<string, ArchetypeRuntimeState> = new Map();
    private _recentWaveTypes: string[][] = [];
    private _recentCombos: string[] = [];
    private _recentTagRatios: Array<Record<string, number>> = [];

    private _randomizerConfig: InfiniteRandomizerConfig = {
        PICK_TYPES_PER_WAVE: 3,
        COMBO_MEMORY_WAVES: 4,
        RECENT_TYPE_PENALTY_WAVES: 2,
        RECENT_TYPE_PENALTY: 0.42,
        RECENT_WINDOW_WAVES: 8,
        TAG_DOMINANCE_WINDOW_WAVES: 3,
        TAG_DOMINANCE_THRESHOLD: 0.62,
        TAG_DOMINANCE_PENALTY: 0.55,
        MIN_WEIGHT_FLOOR: 0.01,
    };
    private _compositionTemplates: CompositionTemplate[] = [];
    private _compositionTemplateState: Map<string, TemplateRuntimeState> = new Map();
    private _rhythmTemplates: RhythmTemplate[] = [];
    private _rhythmTemplateState: Map<string, TemplateRuntimeState> = new Map();

    private _bossEventConfig: BossEventConfig | null = null;
    private _bossState: Map<string, TemplateRuntimeState> = new Map();
    private _nextBossWave: number = 0;
    private _bossEchoes: BossEchoRuntimeState[] = [];
    private _bossUnlockedArchetypeIds: Set<string> = new Set();

    // === 初始化 ===

    private _baseNode: Node | null = null;
    public initialize(enemyContainer: Node, baseNode: Node): void {
        this._enemyContainer = enemyContainer;
        this._baseNode = baseNode;
        this._enemies = [];
        this._currentWave = 0;
        this._regularSpawned = 0;
        this._eliteSpawned = 0;
        this._bossSpawned = 0;
        this._enemySpawnTimer = 0;
        this._nextSpawnInterval = 0;
        this._waveConfig = null;
        this._wavePlan = null;
        this._waveSpawnCursor = 0;
        this._forcedFirstSpawnLane = null;
        this._spawnPortals = resolveSpawnPortals(
            baseNode?.position.x ?? GameConfig.MAP.BASE_SPAWN.x,
            baseNode?.position.z ?? GameConfig.MAP.BASE_SPAWN.z
        );
        const routing = resolveLanePortalRouting(
            baseNode?.position.x ?? GameConfig.MAP.BASE_SPAWN.x,
            baseNode?.position.z ?? GameConfig.MAP.BASE_SPAWN.z,
            this._spawnPortals
        );
        this._portalIndexByLane = routing.portalIndexByLane;
        this._laneDirectionByLane = routing.directionByLane;
        this._unlockedLanes.clear();
        this._unlockedLanes.add('mid');
        this._nextUnlockLaneCursor = 1;
        this._nextBossLaneCursor = 0;
        this._pendingLaneUnlock = null;
        this._spawnedEnemyMeta.clear();
        this._laneFogController.initialize(
            baseNode,
            this._portalIndexByLane,
            this._spawnPortals,
            this._laneDirectionByLane,
            this._unlockedLanes
        );
        this.loadInfiniteRandomizerConfig();

        // Listen for AOE impacts
        this.eventManager.on(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
        this.eventManager.on(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this.eventManager.on(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        ServiceRegistry.register('EnemyProvider', {
            getEnemies: () => this._enemies,
        });
        this.waveService.registerProvider({
            id: 'infinite',
            priority: 0,
            getSnapshot: () => ({
                currentWave: this._currentWave,
                enemiesAlive: this._enemies.length,
            }),
        });

        console.log('[WaveManager] 初始化完成 (Infinite Mode)');
    }

    private onUnitDied(data: { unitType: string; node?: Node }): void {
        if (data.unitType !== UnitType.ENEMY || !data.node) return;
        const meta = this._spawnedEnemyMeta.get(data.node);
        if (meta?.spawnType === 'boss') {
            this.onBossKilled(meta.lane);
        }
        this._spawnedEnemyMeta.delete(data.node);
        this.removeEnemy(data.node);
    }

    private onEnemyReachedBase(data: { enemy?: Node }): void {
        if (!data?.enemy) return;
        this._spawnedEnemyMeta.delete(data.enemy);
        this.removeEnemy(data.enemy);
    }

    private onApplyAoE(data: {
        center: any;
        radius: number;
        damage: number;
        slowPercent: number;
        slowDuration: number;
        effectType?: 'frost_rain' | 'glitch_interference' | 'generic';
    }): void {
        const radiusSqr = data.radius * data.radius;
        const center = data.center;

        // Iterate all active enemies
        for (const enemy of this._enemies) {
            if (!enemy.isValid) continue;

            // Check distance
            const dx = enemy.position.x - center.x;
            const dz = enemy.position.z - center.z;
            const distSqr = dx * dx + dz * dz;

            if (distSqr <= radiusSqr) {
                const u = enemy.getComponent(Unit);

                if (u && u.isAlive) {
                    u.takeDamage(data.damage);
                    if (data.slowPercent > 0) {
                        u.applySlow(data.slowPercent, data.slowDuration);
                    }
                }
            }
        }
        // console.log removed for performance — AOE fires frequently
    }

    // === 公共接口 ===

    public get enemies(): Node[] {
        return this._enemies;
    }

    public get currentWave(): number {
        return this._currentWave;
    }

    public get isWaveActive(): boolean {
        return this._waveActive;
    }

    /**
     * 开始新波次
     */
    public startWave(waveNumber: number): void {
        this._currentWave = waveNumber;
        this._waveActive = true;
        this._regularSpawned = 0;
        this._eliteSpawned = 0;
        this._bossSpawned = 0;
        this._enemySpawnTimer = 0;
        this._nextSpawnInterval = 0;
        this._waveConfig = null;
        this._wavePlan = null;
        this._waveSpawnCursor = 0;
        this._forcedFirstSpawnLane = null;
        this._waveVisualOffset = waveNumber % 2;

        // Difficulty scaling from centralized config
        const infinite = GameConfig.WAVE.INFINITE;
        const waveIndex = waveNumber - 1;
        const countStepBonus =
            Math.floor(waveIndex / infinite.COUNT_GROWTH_STEP_WAVES) *
            infinite.COUNT_GROWTH_STEP_BONUS;
        const regularCountBase = Math.max(
            1,
            Math.round(infinite.BASE_COUNT + waveIndex * infinite.COUNT_PER_WAVE + countStepBonus)
        );
        const eliteCountBase = this.getEliteCountForWave(waveNumber);
        const bossCount = shouldTriggerBossWave(
            waveNumber,
            this._bossEventConfig,
            this._nextBossWave
        )
            ? 1
            : 0;
        const isBossWave = bossCount > 0;
        const adjustedRegularCount = isBossWave ? 0 : regularCountBase;
        const adjustedEliteCount = isBossWave ? 0 : eliteCountBase;
        const hpMult = infinite.BASE_HP_MULT + waveIndex * infinite.HP_MULT_PER_WAVE;
        const atkMult = infinite.BASE_ATTACK_MULT + waveIndex * infinite.ATTACK_MULT_PER_WAVE;
        const speedMult = Math.min(
            infinite.MAX_SPEED_MULT,
            infinite.BASE_SPEED_MULT + waveIndex * infinite.SPEED_MULT_PER_WAVE
        );

        const wavePlan = this.buildWaveSpawnPlan(
            waveNumber,
            adjustedRegularCount,
            adjustedEliteCount,
            bossCount
        );
        const totalEnemyCount = wavePlan.entries.length;

        this._waveConfig = {
            waveNumber,
            regularCount: adjustedRegularCount,
            eliteCount: adjustedEliteCount,
            bossCount,
            enemyCount: totalEnemyCount,
            spawnInterval: Math.max(
                infinite.MIN_SPAWN_INTERVAL,
                infinite.BASE_SPAWN_INTERVAL - waveIndex * infinite.SPAWN_INTERVAL_DECAY_PER_WAVE
            ),
            hpMultiplier: hpMult,
            speedMultiplier: speedMult,
            attackMultiplier: atkMult,
        };

        this._wavePlan = wavePlan;
        this._waveSpawnCursor = 0;
        if (wavePlan.entries.length > 0) {
            this._nextSpawnInterval =
                this._waveConfig.spawnInterval *
                clamp(wavePlan.entries[0].intervalMultiplier, 0.35, 2.4);
        } else {
            this._nextSpawnInterval = this._waveConfig.spawnInterval;
        }

        const waveConfig = this._waveConfig;

        console.log('═══════════════════════════════════════');
        console.log(
            `🌊 第 ${waveNumber} 波! 敌人: ${waveConfig.enemyCount} ` +
                `(普通:${waveConfig.regularCount} 精英:${waveConfig.eliteCount} Boss:${waveConfig.bossCount})`
        );
        console.log(
            `[WaveManager] 组合=${wavePlan.comboKey} 模板=${wavePlan.compositionTemplateId} ` +
                `节奏=${wavePlan.rhythmTemplateId}`
        );
        console.log('═══════════════════════════════════════');

        this.emitWaveForecast(waveNumber, wavePlan);

        this.eventManager.emit(GameEvents.WAVE_START, {
            wave: waveNumber,
            waveIndex: waveNumber - 1,
            enemyCount: waveConfig.enemyCount,
        });
    }

    /**
     * 每帧更新波次生成
     */
    public update(dt: number): void {
        this.tickPendingLaneUnlock(dt);
        this._laneFogController.tick(dt);
        if (!this._waveActive || !this._waveConfig) return;
        const waveConfig = this._waveConfig;

        if (!this._wavePlan || this._wavePlan.entries.length === 0) {
            this._waveActive = false;
            return;
        }

        this._enemySpawnTimer += dt;

        while (this._waveSpawnCursor < this._wavePlan.entries.length) {
            const nextInterval =
                this._nextSpawnInterval > 0 ? this._nextSpawnInterval : waveConfig.spawnInterval;
            if (this._enemySpawnTimer < nextInterval) {
                break;
            }

            this._enemySpawnTimer -= nextInterval;
            const entry = this._wavePlan.entries[this._waveSpawnCursor];
            this.spawnPlannedEnemy(entry);

            if (entry.spawnType === 'boss') {
                this._bossSpawned++;
            } else if (entry.spawnType === 'elite') {
                this._eliteSpawned++;
            } else {
                this._regularSpawned++;
            }

            this._waveSpawnCursor++;
            if (this._waveSpawnCursor < this._wavePlan.entries.length) {
                this._nextSpawnInterval =
                    waveConfig.spawnInterval *
                    clamp(
                        this._wavePlan.entries[this._waveSpawnCursor].intervalMultiplier,
                        0.35,
                        2.4
                    );
            }
        }

        if (this.totalSpawned >= waveConfig.enemyCount) {
            this._waveActive = false;
        }
    }

    /**
     * 检查波次是否完成
     */
    public checkWaveComplete(onComplete: (bonus: number) => void): void {
        if (this._waveActive || this._enemies.length > 0 || !this._waveConfig) return;

        const bonusBase = GameConfig.WAVE.INFINITE.BONUS_PER_WAVE;
        const bonusGrowth = GameConfig.WAVE.INFINITE.BONUS_GROWTH_PER_WAVE;
        const waveBonus = bonusBase + (this._currentWave - 1) * bonusGrowth;
        const eliteBonus = this._waveConfig.eliteCount * Math.floor(bonusBase * 0.75);
        const bonus = waveBonus + eliteBonus;
        console.log(`✅ 第 ${this._currentWave} 波完成! +${bonus} 金币`);

        this.eventManager.emit(GameEvents.WAVE_COMPLETE, {
            wave: this._currentWave,
            waveIndex: this._currentWave - 1,
            bonus,
        });

        this._waveConfig = null;
        onComplete(bonus);
    }

    /**
     * 是否还有更多波次
     */
    public hasMoreWaves(): boolean {
        return true; // Infinite
    }

    /**
     * 移除敌人（死亡或到达基地）
     */
    public removeEnemy(enemy: Node): void {
        const idx = this._enemies.indexOf(enemy);
        if (idx !== -1) {
            this._enemies.splice(idx, 1);
        }
        this._spawnedEnemyMeta.delete(enemy);
    }

    // === 私有方法 ===

    private spawnPlannedEnemy(entry: PlannedSpawnEntry): void {
        if (!this._enemyContainer) return;
        const waveConfig = this._waveConfig;
        if (!waveConfig) return;

        const archetype = this.resolveArchetypeById(entry.archetypeId);
        if (!archetype) return;

        const visualVariant = this.resolveEnemyVisualVariant(this.totalSpawned);
        const spawnLane = this.resolveSpawnLane(entry.spawnType);
        const pos = resolveSpawnPositionByLane({
            lane: spawnLane,
            portalIndexByLane: this._portalIndexByLane,
            spawnPortals: this._spawnPortals,
            jitterRadius: GameConfig.WAVE.INFINITE.SPAWN_PORTALS?.JITTER_RADIUS ?? 0,
            limits: GameConfig.MAP.LIMITS,
            baseNode: this._baseNode,
        });
        const spawnCombat = this.resolveSpawnCombatProfile(entry.spawnType);
        const power = clamp(archetype.power, 0.5, 3.0);
        const powerHpMultiplier = 0.65 + power * 0.85;
        const powerAttackMultiplier = 0.72 + power * 0.78;
        const powerSpeedMultiplier = 0.85 + power * 0.2;
        const visualScale = this.resolveSpawnVisualScale(archetype, entry.spawnType);

        const enemy = UnitFactory.createEnemy(
            this._enemyContainer,
            pos.x,
            pos.y,
            this._baseNode ? this._baseNode.position : new Vec3(0, 0, 0), // Base Position
            {
                hpMultiplier:
                    waveConfig.hpMultiplier * spawnCombat.hpMultiplier * powerHpMultiplier,
                speedMultiplier:
                    waveConfig.speedMultiplier * spawnCombat.speedMultiplier * powerSpeedMultiplier,
                attackMultiplier:
                    waveConfig.attackMultiplier *
                    spawnCombat.attackMultiplier *
                    powerAttackMultiplier,
                isElite: spawnCombat.isElite,
                scaleMultiplier: spawnCombat.scaleMultiplier,
                coinDropMultiplier: spawnCombat.coinDropMultiplier,
                visualVariant,
                attackType: archetype.attackType,
                modelPath: archetype.modelPath,
                visualScale,
            }
        );
        this._enemies.push(enemy);
        this._spawnedEnemyMeta.set(enemy, { spawnType: entry.spawnType, lane: spawnLane });

        if (entry.spawnType === 'boss') {
            this.unlockBossArchetypeForRegularPool(entry.archetypeId, archetype.modelPath);
            this.eventManager.emit(GameEvents.BOSS_INTRO, {
                bossNode: enemy,
                archetypeId: entry.archetypeId,
                modelPath: archetype.modelPath,
                lane: spawnLane,
            });
        }

        // Notify centralized systems (e.g., CombatSystem) about new enemy
        this.eventManager.emit(GameEvents.UNIT_SPAWNED, {
            unitType: 'enemy',
            node: enemy,
        });
    }

    private resolveEnemyVisualVariant(spawnIndex: number): EnemyVisualVariant {
        return ((spawnIndex + this._waveVisualOffset) & 1) === 0 ? 'robot' : 'robovacuum';
    }

    private emitWaveForecast(waveNumber: number, wavePlan: WaveSpawnPlan): void {
        const entry = pickForecastEntry(wavePlan);
        if (!entry) return;

        const lane = this.resolveForecastLane(entry.spawnType);
        this._forcedFirstSpawnLane = lane;

        this.eventManager.emit(GameEvents.WAVE_FORECAST, {
            wave: waveNumber,
            archetypeId: entry.archetypeId,
            lane: laneToForecastLane(lane),
            spawnType: entry.spawnType,
        });
    }

    private resolveSpawnLane(spawnType: SpawnType): RouteLane {
        if (this._waveSpawnCursor === 0 && this._forcedFirstSpawnLane) {
            const lane = this._forcedFirstSpawnLane;
            this._forcedFirstSpawnLane = null;
            return lane;
        }

        if (spawnType === 'boss') {
            return this.getCurrentBossLane();
        }
        return this.pickRandomUnlockedLane();
    }

    private resolveForecastLane(spawnType: SpawnType): RouteLane {
        if (spawnType === 'boss') {
            return this.getCurrentBossLane();
        }
        return this.pickRandomUnlockedLane();
    }

    private getCurrentBossLane(): RouteLane {
        return ROUTE_LANE_SEQUENCE[this._nextBossLaneCursor] ?? 'mid';
    }

    private pickRandomUnlockedLane(): RouteLane {
        const lanes = ROUTE_LANE_SEQUENCE.filter(lane => this._unlockedLanes.has(lane));
        if (lanes.length <= 0) return 'mid';
        const idx = randomInt(0, Math.max(0, lanes.length - 1));
        return lanes[idx] ?? 'mid';
    }

    private onBossKilled(_lane: RouteLane): void {
        const nextState = advanceBossLaneState({
            nextUnlockLaneCursor: this._nextUnlockLaneCursor,
            nextBossLaneCursor: this._nextBossLaneCursor,
            routeLaneSequence: ROUTE_LANE_SEQUENCE,
        });
        this._nextUnlockLaneCursor = nextState.nextUnlockLaneCursor;
        this._nextBossLaneCursor = nextState.nextBossLaneCursor;
        if (nextState.laneToUnlock) {
            this.scheduleLaneUnlock(nextState.laneToUnlock);
        }
    }

    private unlockLane(lane: RouteLane): void {
        if (this._unlockedLanes.has(lane)) return;
        this._unlockedLanes.add(lane);
        this._laneFogController.unlockLane(lane);
        this.eventManager.emit(GameEvents.LANE_UNLOCKED, { lane });
    }

    private scheduleLaneUnlock(lane: RouteLane): void {
        if (this._unlockedLanes.has(lane)) return;
        const remainSeconds = WaveManager.LANE_UNLOCK_WARNING_SECONDS;
        this._pendingLaneUnlock = { lane, remainSeconds };
        const pads =
            (GameConfig.BUILDING.PADS as ReadonlyArray<{
                type: string;
                x: number;
                z: number;
            }>) ?? [];
        const basePosition = {
            x: this._baseNode?.position.x ?? GameConfig.MAP.BASE_SPAWN.x,
            z: this._baseNode?.position.z ?? GameConfig.MAP.BASE_SPAWN.z,
        };
        this.eventManager.emit(GameEvents.LANE_UNLOCK_IMMINENT, {
            lane,
            focusPosition: resolveLaneUnlockFocusPosition({
                lane,
                portalIndexByLane: this._portalIndexByLane,
                spawnPortals: this._spawnPortals,
                laneDirectionByLane: this._laneDirectionByLane,
                limits: GameConfig.MAP.LIMITS,
                inward: WaveManager.LANE_UNLOCK_FOCUS_INWARD,
                heroY: GameConfig.PHYSICS.HERO_Y,
            }),
            padFocusPosition: resolveLaneUnlockPadFocusPosition({
                lane,
                pads,
                lockedLanePadTypes: WaveManager.LOCKED_LANE_PAD_TYPES,
                limits: GameConfig.MAP.LIMITS,
                basePosition,
                heroY: GameConfig.PHYSICS.HERO_Y,
            }),
            remainSeconds,
        });
    }

    private tickPendingLaneUnlock(dt: number): void {
        if (!this._pendingLaneUnlock) return;
        this._pendingLaneUnlock.remainSeconds -= Math.max(0, dt);
        if (this._pendingLaneUnlock.remainSeconds > 0) return;

        const laneToUnlock = this._pendingLaneUnlock.lane;
        this._pendingLaneUnlock = null;
        this.unlockLane(laneToUnlock);
    }

    private resolveSpawnCombatProfile(spawnType: SpawnType): SpawnCombatProfile {
        const elite = GameConfig.ENEMY.ELITE;
        if (spawnType === 'boss') {
            const combat = this._bossEventConfig?.COMBAT;
            return {
                hpMultiplier: clamp(toFinite(combat?.BOSS_HP_MULTIPLIER, 14), 1, 40),
                attackMultiplier: clamp(toFinite(combat?.BOSS_ATTACK_MULTIPLIER, 3.2), 1, 20),
                speedMultiplier: clamp(toFinite(combat?.BOSS_SPEED_MULTIPLIER, 1), 0.4, 3),
                scaleMultiplier: clamp(toFinite(combat?.BOSS_SCALE_MULTIPLIER, 1.75), 1, 8),
                coinDropMultiplier: clamp(
                    toFinite(combat?.BOSS_COIN_MULTIPLIER, 6),
                    elite.COIN_DROP_MULTIPLIER,
                    30
                ),
                isElite: true,
            };
        }
        if (spawnType === 'elite') {
            return {
                hpMultiplier: elite.HP_MULTIPLIER,
                attackMultiplier: elite.ATTACK_MULTIPLIER,
                speedMultiplier: elite.SPEED_MULTIPLIER,
                scaleMultiplier: elite.SCALE_MULTIPLIER,
                coinDropMultiplier: elite.COIN_DROP_MULTIPLIER,
                isElite: true,
            };
        }
        return {
            hpMultiplier: 1,
            attackMultiplier: 1,
            speedMultiplier: 1,
            scaleMultiplier: 1,
            coinDropMultiplier: 1,
            isElite: false,
        };
    }

    private resolveSpawnVisualScale(
        archetype: EnemyArchetypeConfig,
        spawnType: SpawnType
    ): number | undefined {
        const visualScale = archetype.visualScale;
        if (typeof visualScale !== 'number' || !Number.isFinite(visualScale)) {
            return undefined;
        }
        if (spawnType === 'boss') {
            return visualScale;
        }
        if (!this.isBossModelPath(archetype.modelPath)) {
            return visualScale;
        }
        const ratio = clamp(
            toFinite(this._bossEventConfig?.COMBAT.MINION_SCALE_RATIO, 0.6),
            0.2,
            1
        );
        return clamp(visualScale * ratio, 0.2, 8);
    }

    private get totalSpawned(): number {
        return this._regularSpawned + this._eliteSpawned + this._bossSpawned;
    }

    private getEliteCountForWave(waveNumber: number): number {
        const elite = GameConfig.WAVE.INFINITE.ELITE;
        if (waveNumber < elite.START_WAVE) return 0;
        if ((waveNumber - elite.START_WAVE) % elite.INTERVAL !== 0) return 0;

        const growthSteps = Math.floor(
            (waveNumber - elite.START_WAVE) / elite.COUNT_GROWTH_STEP_WAVES
        );
        return Math.min(elite.MAX_COUNT, elite.BASE_COUNT + growthSteps);
    }

    private loadInfiniteRandomizerConfig(): void {
        const infinite = GameConfig.WAVE.INFINITE as typeof GameConfig.WAVE.INFINITE & {
            RANDOMIZER?: Partial<InfiniteRandomizerConfig>;
            ENEMY_ARCHETYPES?: unknown;
            COMPOSITION_TEMPLATES?: unknown;
            RHYTHM_TEMPLATES?: unknown;
            BOSS_EVENT?: unknown;
        };

        const randomizer = infinite.RANDOMIZER;
        if (randomizer) {
            this._randomizerConfig = {
                PICK_TYPES_PER_WAVE: toPositiveInt(
                    randomizer.PICK_TYPES_PER_WAVE,
                    this._randomizerConfig.PICK_TYPES_PER_WAVE
                ),
                COMBO_MEMORY_WAVES: toPositiveInt(
                    randomizer.COMBO_MEMORY_WAVES,
                    this._randomizerConfig.COMBO_MEMORY_WAVES
                ),
                RECENT_TYPE_PENALTY_WAVES: toPositiveInt(
                    randomizer.RECENT_TYPE_PENALTY_WAVES,
                    this._randomizerConfig.RECENT_TYPE_PENALTY_WAVES
                ),
                RECENT_TYPE_PENALTY: clamp(
                    toFinite(
                        randomizer.RECENT_TYPE_PENALTY,
                        this._randomizerConfig.RECENT_TYPE_PENALTY
                    ),
                    0.05,
                    1
                ),
                RECENT_WINDOW_WAVES: toPositiveInt(
                    randomizer.RECENT_WINDOW_WAVES,
                    this._randomizerConfig.RECENT_WINDOW_WAVES
                ),
                TAG_DOMINANCE_WINDOW_WAVES: toPositiveInt(
                    randomizer.TAG_DOMINANCE_WINDOW_WAVES,
                    this._randomizerConfig.TAG_DOMINANCE_WINDOW_WAVES
                ),
                TAG_DOMINANCE_THRESHOLD: clamp(
                    toFinite(
                        randomizer.TAG_DOMINANCE_THRESHOLD,
                        this._randomizerConfig.TAG_DOMINANCE_THRESHOLD
                    ),
                    0.1,
                    1
                ),
                TAG_DOMINANCE_PENALTY: clamp(
                    toFinite(
                        randomizer.TAG_DOMINANCE_PENALTY,
                        this._randomizerConfig.TAG_DOMINANCE_PENALTY
                    ),
                    0.05,
                    1
                ),
                MIN_WEIGHT_FLOOR: clamp(
                    toFinite(randomizer.MIN_WEIGHT_FLOOR, this._randomizerConfig.MIN_WEIGHT_FLOOR),
                    0.0001,
                    1
                ),
            };
        }

        this._archetypes = normalizeEnemyArchetypes(infinite.ENEMY_ARCHETYPES);
        if (this._archetypes.length === 0) {
            this._archetypes = getFallbackArchetypes();
        }

        this._archetypeById.clear();
        this._archetypeState.clear();
        for (const archetype of this._archetypes) {
            this._archetypeById.set(archetype.id, archetype);
            this._archetypeState.set(archetype.id, {
                cooldownRemain: 0,
                lastSeenWave: 0,
            });
        }

        this._compositionTemplates = normalizeCompositionTemplates(infinite.COMPOSITION_TEMPLATES);
        if (this._compositionTemplates.length === 0) {
            this._compositionTemplates = [
                { id: 'ratio_55_30_15', shares: [55, 30, 15], cooldownWaves: 1 },
                { id: 'ratio_45_35_20', shares: [45, 35, 20], cooldownWaves: 1 },
            ];
        }
        this._compositionTemplateState.clear();
        for (const tpl of this._compositionTemplates) {
            this._compositionTemplateState.set(tpl.id, { cooldownRemain: 0 });
        }

        this._rhythmTemplates = normalizeRhythmTemplates(infinite.RHYTHM_TEMPLATES);
        if (this._rhythmTemplates.length === 0) {
            this._rhythmTemplates = [{ id: 'steady', pattern: 'steady', cooldownWaves: 0 }];
        }
        this._rhythmTemplateState.clear();
        for (const tpl of this._rhythmTemplates) {
            this._rhythmTemplateState.set(tpl.id, { cooldownRemain: 0 });
        }

        this._bossEventConfig = normalizeBossEventConfig(infinite.BOSS_EVENT);
        this._bossState.clear();
        if (this._bossEventConfig) {
            for (const boss of this._bossEventConfig.BOSS_ARCHETYPES) {
                this._bossState.set(boss.id, { cooldownRemain: 0 });
                this._archetypeById.set(boss.id, boss);
                if (!this._archetypeState.has(boss.id)) {
                    this._archetypes.push(boss);
                    this._archetypeState.set(boss.id, {
                        cooldownRemain: 0,
                        lastSeenWave: 0,
                    });
                }
            }
            this._nextBossWave = rollNextBossWave(1, this._bossEventConfig);
        } else {
            this._nextBossWave = Number.MAX_SAFE_INTEGER;
        }

        this._recentWaveTypes = [];
        this._recentCombos = [];
        this._recentTagRatios = [];
        this._bossEchoes = [];
        this._bossUnlockedArchetypeIds.clear();
        if (this._bossEventConfig) {
            return;
        }
        for (const archetype of this._archetypes) {
            if (this.isBossModelPath(archetype.modelPath)) {
                this._bossUnlockedArchetypeIds.add(archetype.id);
            }
        }
    }

    private buildWaveSpawnPlan(
        waveNumber: number,
        regularCount: number,
        eliteCount: number,
        bossCount: number
    ): WaveSpawnPlan {
        tickArchetypeCooldowns(this._archetypeState);
        tickTemplateCooldowns(this._compositionTemplateState);
        tickTemplateCooldowns(this._rhythmTemplateState);
        tickTemplateCooldowns(this._bossState);
        this._bossEchoes = pruneBossEchoes(this._bossEchoes, waveNumber);

        if (bossCount > 0 && this._bossEventConfig?.BOSS_ONLY_WAVE !== false) {
            return this.buildBossOnlyWaveSpawnPlan(waveNumber);
        }

        return this.buildRegularWaveSpawnPlan(waveNumber, regularCount, eliteCount);
    }

    private buildRegularWaveSpawnPlan(
        waveNumber: number,
        regularCount: number,
        eliteCount: number
    ): WaveSpawnPlan {
        const regularPool = this.getRegularPoolArchetypes();
        const poolSize = Math.max(1, regularPool.length);

        const totalPool = Math.max(0, regularCount + eliteCount);
        const pickCount = Math.max(
            1,
            Math.min(this._randomizerConfig.PICK_TYPES_PER_WAVE, poolSize)
        );
        const selectedArchetypeIds = this.selectArchetypesForWave(waveNumber, pickCount);
        const comboKey = toComboKey(selectedArchetypeIds);

        const compositionTemplate = this.selectCompositionTemplate();
        const rhythmTemplate = this.selectRhythmTemplate();

        const typeCounts = allocateTypeCounts(
            totalPool,
            compositionTemplate.shares,
            selectedArchetypeIds.length
        );

        const archetypeSequence: string[] = [];
        for (let i = 0; i < selectedArchetypeIds.length; i++) {
            const count = typeCounts[i] ?? 0;
            for (let c = 0; c < count; c++) {
                archetypeSequence.push(selectedArchetypeIds[i]);
            }
        }
        shuffleInPlace(archetypeSequence);

        const elitePositions = buildElitePositionSet(totalPool, eliteCount);
        const entries: PlannedSpawnEntry[] = new Array(archetypeSequence.length);
        for (let i = 0; i < archetypeSequence.length; i++) {
            entries[i] = {
                archetypeId: archetypeSequence[i],
                spawnType: elitePositions.has(i) ? 'elite' : 'regular',
                intervalMultiplier: 1,
            };
        }

        applyRhythm(entries, rhythmTemplate.pattern);
        updateWaveMemory({
            selectedIds: selectedArchetypeIds,
            comboKey,
            recentWaveTypes: this._recentWaveTypes,
            recentCombos: this._recentCombos,
            recentTagRatios: this._recentTagRatios,
            recentWindowWaves: this._randomizerConfig.RECENT_WINDOW_WAVES,
            comboMemoryWaves: this._randomizerConfig.COMBO_MEMORY_WAVES,
            archetypeById: this._archetypeById,
        });
        applyArchetypeSelectionState({
            selectedIds: selectedArchetypeIds,
            waveNumber,
            archetypes: this._archetypes,
            archetypeState: this._archetypeState,
        });
        markTemplateCooldown(
            this._compositionTemplateState,
            compositionTemplate.id,
            compositionTemplate.cooldownWaves
        );
        markTemplateCooldown(
            this._rhythmTemplateState,
            rhythmTemplate.id,
            rhythmTemplate.cooldownWaves
        );

        return {
            entries,
            selectedArchetypeIds,
            compositionTemplateId: compositionTemplate.id,
            rhythmTemplateId: rhythmTemplate.id,
            comboKey,
        };
    }

    private buildBossOnlyWaveSpawnPlan(waveNumber: number): WaveSpawnPlan {
        const entries: PlannedSpawnEntry[] = [];
        const boss = selectBossArchetype({
            bossEventConfig: this._bossEventConfig,
            bossState: this._bossState,
        });
        if (boss) {
            entries.push({
                archetypeId: boss.id,
                spawnType: 'boss',
                intervalMultiplier: 1,
            });
            applyBossEchoForWave({
                boss,
                waveNumber,
                bossEventConfig: this._bossEventConfig,
                archetypeById: this._archetypeById,
                bossEchoes: this._bossEchoes,
            });
        }
        this._nextBossWave = rollNextBossWave(waveNumber + 1, this._bossEventConfig);

        return {
            entries,
            selectedArchetypeIds: boss ? [boss.id] : [],
            compositionTemplateId: 'boss_only',
            rhythmTemplateId: 'boss_only',
            comboKey: boss ? `boss|${boss.id}` : 'boss|none',
        };
    }

    private selectArchetypesForWave(waveNumber: number, pickCount: number): string[] {
        if (this._archetypes.length === 0 || pickCount <= 0) return [];

        const forbiddenCombos = new Set(
            this._recentCombos.slice(-this._randomizerConfig.COMBO_MEMORY_WAVES)
        );

        const pool = this.resolveArchetypeCandidates(pickCount);
        if (pool.length === 0) {
            const fallback = this.getRegularPoolArchetypes()[0] ?? this._archetypes[0];
            return fallback ? [fallback.id] : [];
        }

        const scores = new Map<string, number>();
        for (const archetype of pool) {
            scores.set(archetype.id, this.computeArchetypeScore(archetype, waveNumber));
        }

        let selected = weightedPickWithoutReplacement(
            pool,
            scores,
            pickCount,
            this._randomizerConfig.MIN_WEIGHT_FLOOR
        );
        if (selected.length === 0) {
            selected = pool.slice(0, Math.min(pickCount, pool.length));
        }

        if (selected.length >= pickCount) {
            const comboKey = toComboKey(selected.map(item => item.id));
            if (forbiddenCombos.has(comboKey)) {
                const validCombos = enumerateValidCombos(pool, pickCount, forbiddenCombos);
                if (validCombos.length > 0) {
                    const picked = pickWeightedCombo(
                        validCombos,
                        scores,
                        this._randomizerConfig.MIN_WEIGHT_FLOOR
                    );
                    if (picked.length > 0) {
                        selected = picked;
                    }
                }
            }
        }

        return selected.map(item => item.id);
    }

    private resolveArchetypeCandidates(pickCount: number): EnemyArchetypeConfig[] {
        const regularPool = this.getRegularPoolArchetypes();
        if (regularPool.length === 0) return [];

        const unlocked = regularPool.filter(archetype => {
            const state = this._archetypeState.get(archetype.id);
            return !state || state.cooldownRemain <= 0;
        });
        if (unlocked.length >= pickCount) {
            return unlocked;
        }

        const locked = regularPool
            .filter(archetype => !unlocked.includes(archetype))
            .sort((a, b) => {
                const aCd = this._archetypeState.get(a.id)?.cooldownRemain ?? 0;
                const bCd = this._archetypeState.get(b.id)?.cooldownRemain ?? 0;
                return aCd - bCd;
            });

        const merged = unlocked.slice();
        for (const archetype of locked) {
            if (merged.length >= pickCount) break;
            merged.push(archetype);
        }
        return merged;
    }

    private getRegularPoolArchetypes(): EnemyArchetypeConfig[] {
        const allowed = this._archetypes.filter(archetype =>
            this.canArchetypeEnterRegularPool(archetype)
        );
        if (allowed.length > 0) return allowed;

        const nonBoss = this._archetypes.filter(
            archetype => !this.isBossModelPath(archetype.modelPath)
        );
        if (nonBoss.length > 0) return nonBoss;

        return this._archetypes.slice();
    }

    private canArchetypeEnterRegularPool(archetype: EnemyArchetypeConfig): boolean {
        if (!this.isBossModelPath(archetype.modelPath)) return true;
        if (!this._bossEventConfig) return true;
        return this._bossUnlockedArchetypeIds.has(archetype.id);
    }

    private unlockBossArchetypeForRegularPool(archetypeId: string, modelPath: string): void {
        if (!this.isBossModelPath(modelPath)) return;
        this._bossUnlockedArchetypeIds.add(archetypeId);
    }

    private isBossModelPath(modelPath: string): boolean {
        return this.normalizeModelPath(modelPath).indexOf('boss/') === 0;
    }

    private normalizeModelPath(modelPath: string): string {
        return modelPath.trim().toLowerCase();
    }

    private computeArchetypeScore(archetype: EnemyArchetypeConfig, waveNumber: number): number {
        const baseWeight = clamp(archetype.baseWeight, 0.001, 1000);
        const state = this._archetypeState.get(archetype.id);
        const age = state ? Math.max(1, waveNumber - state.lastSeenWave) : waveNumber;
        const freshFactor = 0.75 + clamp(age, 0, 10) * 0.08;

        let appearCountRecent = 0;
        const recentWindow = this._recentWaveTypes.slice(
            -this._randomizerConfig.RECENT_WINDOW_WAVES
        );
        for (const waveTypes of recentWindow) {
            if (waveTypes.includes(archetype.id)) appearCountRecent++;
        }
        const balanceFactor = 1 / (1 + appearCountRecent * 0.35);

        let repeatPenalty = 1;
        const repeatWindow = this._recentWaveTypes.slice(
            -this._randomizerConfig.RECENT_TYPE_PENALTY_WAVES
        );
        for (const waveTypes of repeatWindow) {
            if (waveTypes.includes(archetype.id)) {
                repeatPenalty = Math.min(repeatPenalty, this._randomizerConfig.RECENT_TYPE_PENALTY);
            }
        }

        let tagPenalty = 1;
        const recentTagRatios = this._recentTagRatios.slice(
            -this._randomizerConfig.TAG_DOMINANCE_WINDOW_WAVES
        );
        for (const tag of archetype.tags) {
            let dominanceHits = 0;
            for (const ratioRecord of recentTagRatios) {
                const ratio = ratioRecord[tag] ?? 0;
                if (ratio >= this._randomizerConfig.TAG_DOMINANCE_THRESHOLD) {
                    dominanceHits++;
                }
            }
            if (dominanceHits >= recentTagRatios.length && recentTagRatios.length > 0) {
                tagPenalty *= this._randomizerConfig.TAG_DOMINANCE_PENALTY;
            }
        }

        const bossEchoWeight = resolveBossEchoWeight(archetype.id, waveNumber, this._bossEchoes);
        const raw =
            (baseWeight + bossEchoWeight) *
            freshFactor *
            balanceFactor *
            repeatPenalty *
            tagPenalty;
        return Math.max(this._randomizerConfig.MIN_WEIGHT_FLOOR, raw);
    }

    private selectCompositionTemplate(): CompositionTemplate {
        return selectTemplateWithCooldown(
            this._compositionTemplates,
            this._compositionTemplateState
        );
    }

    private selectRhythmTemplate(): RhythmTemplate {
        return selectTemplateWithCooldown(this._rhythmTemplates, this._rhythmTemplateState);
    }

    private resolveArchetypeById(id: string): EnemyArchetypeConfig | null {
        const found = this._archetypeById.get(id);
        if (found) return found;
        return this._archetypes[0] ?? null;
    }

    /**
     * 清理
     */
    public cleanup(): void {
        this.eventManager.off(GameEvents.APPLY_AOE_EFFECT, this.onApplyAoE, this);
        this.eventManager.off(GameEvents.UNIT_DIED, this.onUnitDied, this);
        this.eventManager.off(GameEvents.ENEMY_REACHED_BASE, this.onEnemyReachedBase, this);
        this.waveService.unregisterProvider('infinite');
        this._enemies = [];
        this._wavePlan = null;
        this._waveSpawnCursor = 0;
        this._forcedFirstSpawnLane = null;
        this._waveConfig = null;
        this._waveActive = false;
        this._pendingLaneUnlock = null;
        this._spawnedEnemyMeta.clear();
        this._laneFogController.cleanup();
    }

    private get eventManager(): EventManager {
        return ServiceRegistry.get<EventManager>('EventManager') ?? EventManager.instance;
    }

    private get waveService(): WaveService {
        return ServiceRegistry.get<WaveService>('WaveService') ?? WaveService.instance;
    }
}
