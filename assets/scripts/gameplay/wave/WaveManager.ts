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
import { clamp, indexOfMax, randomInt, randomRange, toFinite, toPositiveInt } from './WaveMath';
import { pickForecastEntry } from './WaveForecast';
import { getEdgePosition, resolveSpawnPortals, type SpawnPortalPoint } from './WaveSpawnPortals';
import {
    laneToForecastLane,
    resolveLanePortalRouting,
    ROUTE_LANE_SEQUENCE,
    type LaneDirection2D,
    type RouteLane,
} from './WaveLaneRouting';
import { LaneFogController } from './LaneFogController';
import type {
    ArchetypeRuntimeState,
    BossArchetypeConfig,
    BossEchoRuntimeState,
    BossEventConfig,
    CompositionTemplate,
    EnemyArchetypeConfig,
    InfiniteRandomizerConfig,
    PlannedSpawnEntry,
    RhythmPattern,
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
    private _bossUnlockedModelPaths: Set<string> = new Set();
    private _hasBossSpawnedAtLeastOnce: boolean = false;

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
        const bossCount = this.shouldTriggerBossWave(waveNumber) ? 1 : 0;
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
        const pos = this.resolveSpawnPositionByLane(spawnLane);
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
            this.unlockBossModelForRegularPool(archetype.modelPath);
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

    private resolveSpawnPositionByLane(lane: RouteLane): SpawnPortalPoint {
        const portalIndex = this._portalIndexByLane[lane];
        const portal = this._spawnPortals[portalIndex] ?? getEdgePosition();
        return this.samplePortalPosition(portal);
    }

    private samplePortalPosition(portal: SpawnPortalPoint): SpawnPortalPoint {
        const jitterRadius = GameConfig.WAVE.INFINITE.SPAWN_PORTALS?.JITTER_RADIUS ?? 0;
        if (jitterRadius <= 0) {
            return { x: portal.x, y: portal.y };
        }

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * jitterRadius;
        let x = portal.x + Math.cos(angle) * radius;
        let y = portal.y + Math.sin(angle) * radius;

        const base = this._baseNode;
        if (base && base.isValid) {
            const baseX = base.position.x;
            const baseY = base.position.z;
            const portalDx = portal.x - baseX;
            const portalDy = portal.y - baseY;
            const portalDist = Math.hypot(portalDx, portalDy);
            if (portalDist > 0.0001) {
                const nx = portalDx / portalDist;
                const ny = portalDy / portalDist;
                const candidateDx = x - baseX;
                const candidateDy = y - baseY;
                const candidateDist = Math.hypot(candidateDx, candidateDy);
                const minDist = Math.max(0, portalDist - jitterRadius * 0.2);
                if (candidateDist < minDist) {
                    x = baseX + nx * minDist;
                    y = baseY + ny * minDist;
                }
            }
        }

        const limits = GameConfig.MAP.LIMITS;
        return {
            x: Math.max(-limits.x, Math.min(limits.x, x)),
            y: Math.max(-limits.z, Math.min(limits.z, y)),
        };
    }

    private onBossKilled(_lane: RouteLane): void {
        if (this._nextUnlockLaneCursor < ROUTE_LANE_SEQUENCE.length) {
            const laneToUnlock = ROUTE_LANE_SEQUENCE[this._nextUnlockLaneCursor];
            if (laneToUnlock) {
                this.unlockLane(laneToUnlock);
                this._nextBossLaneCursor = this._nextUnlockLaneCursor;
                this._nextUnlockLaneCursor++;
            }
            return;
        }

        this._nextBossLaneCursor =
            (this._nextBossLaneCursor + 1) % Math.max(1, ROUTE_LANE_SEQUENCE.length);
    }

    private unlockLane(lane: RouteLane): void {
        if (this._unlockedLanes.has(lane)) return;
        this._unlockedLanes.add(lane);
        this._laneFogController.unlockLane(lane);
        this.eventManager.emit(GameEvents.LANE_UNLOCKED, { lane });
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
            this._nextBossWave = this.rollNextBossWave(1);
        } else {
            this._nextBossWave = Number.MAX_SAFE_INTEGER;
            for (const archetype of this._archetypes) {
                if (this.isBossModelPath(archetype.modelPath)) {
                    this._bossUnlockedModelPaths.add(this.normalizeModelPath(archetype.modelPath));
                }
            }
        }

        this._recentWaveTypes = [];
        this._recentCombos = [];
        this._recentTagRatios = [];
        this._bossEchoes = [];
        this._hasBossSpawnedAtLeastOnce = !this._bossEventConfig;
        if (this._bossEventConfig) {
            this._bossUnlockedModelPaths.clear();
        }
    }

    private buildWaveSpawnPlan(
        waveNumber: number,
        regularCount: number,
        eliteCount: number,
        bossCount: number
    ): WaveSpawnPlan {
        this.tickRuntimeCooldowns();
        this.pruneBossEchoes(waveNumber);

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
        const comboKey = this.toComboKey(selectedArchetypeIds);

        const compositionTemplate = this.selectCompositionTemplate();
        const rhythmTemplate = this.selectRhythmTemplate();

        const typeCounts = this.allocateTypeCounts(
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
        this.shuffleInPlace(archetypeSequence);

        const elitePositions = this.buildElitePositionSet(totalPool, eliteCount);
        const entries: PlannedSpawnEntry[] = new Array(archetypeSequence.length);
        for (let i = 0; i < archetypeSequence.length; i++) {
            entries[i] = {
                archetypeId: archetypeSequence[i],
                spawnType: elitePositions.has(i) ? 'elite' : 'regular',
                intervalMultiplier: 1,
            };
        }

        this.applyRhythm(entries, rhythmTemplate.pattern);
        this.updateWaveMemory(selectedArchetypeIds, comboKey);
        this.applyArchetypeSelectionState(selectedArchetypeIds, waveNumber);
        this.markTemplateCooldown(
            this._compositionTemplateState,
            compositionTemplate.id,
            compositionTemplate.cooldownWaves
        );
        this.markTemplateCooldown(
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
        const boss = this.selectBossArchetype(waveNumber);
        if (boss) {
            entries.push({
                archetypeId: boss.id,
                spawnType: 'boss',
                intervalMultiplier: 1,
            });
            this.applyBossEchoForWave(boss, waveNumber);
        }
        this._nextBossWave = this.rollNextBossWave(waveNumber + 1);

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

        let selected = this.weightedPickWithoutReplacement(pool, scores, pickCount);
        if (selected.length === 0) {
            selected = pool.slice(0, Math.min(pickCount, pool.length));
        }

        if (selected.length >= pickCount) {
            const comboKey = this.toComboKey(selected.map(item => item.id));
            if (forbiddenCombos.has(comboKey)) {
                const validCombos = this.enumerateValidCombos(pool, pickCount, forbiddenCombos);
                if (validCombos.length > 0) {
                    const picked = this.pickWeightedCombo(validCombos, scores);
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
        return (
            this._hasBossSpawnedAtLeastOnce ||
            this._bossUnlockedModelPaths.has(this.normalizeModelPath(archetype.modelPath))
        );
    }

    private unlockBossModelForRegularPool(modelPath: string): void {
        if (!this.isBossModelPath(modelPath)) return;
        this._hasBossSpawnedAtLeastOnce = true;
        this._bossUnlockedModelPaths.add(this.normalizeModelPath(modelPath));
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

        const bossEchoWeight = this.resolveBossEchoWeight(archetype.id, waveNumber);
        const raw =
            (baseWeight + bossEchoWeight) *
            freshFactor *
            balanceFactor *
            repeatPenalty *
            tagPenalty;
        return Math.max(this._randomizerConfig.MIN_WEIGHT_FLOOR, raw);
    }

    private weightedPickWithoutReplacement(
        source: EnemyArchetypeConfig[],
        scores: Map<string, number>,
        pickCount: number
    ): EnemyArchetypeConfig[] {
        const pool = source.slice();
        const result: EnemyArchetypeConfig[] = [];
        const targetCount = Math.min(pickCount, pool.length);
        for (let i = 0; i < targetCount; i++) {
            const picked = this.pickOneWeighted(pool, scores);
            if (!picked) break;
            result.push(picked);
            const idx = pool.indexOf(picked);
            if (idx >= 0) pool.splice(idx, 1);
        }
        return result;
    }

    private pickOneWeighted(
        pool: EnemyArchetypeConfig[],
        scores: Map<string, number>
    ): EnemyArchetypeConfig | null {
        if (pool.length === 0) return null;
        let total = 0;
        for (const item of pool) {
            total += Math.max(this._randomizerConfig.MIN_WEIGHT_FLOOR, scores.get(item.id) ?? 0);
        }
        if (!Number.isFinite(total) || total <= 0) {
            return pool[Math.floor(Math.random() * pool.length)] ?? null;
        }

        let cursor = Math.random() * total;
        for (const item of pool) {
            cursor -= Math.max(this._randomizerConfig.MIN_WEIGHT_FLOOR, scores.get(item.id) ?? 0);
            if (cursor <= 0) return item;
        }
        return pool[pool.length - 1] ?? null;
    }

    private enumerateValidCombos(
        pool: EnemyArchetypeConfig[],
        pickCount: number,
        forbidden: Set<string>
    ): EnemyArchetypeConfig[][] {
        if (pickCount <= 0 || pool.length < pickCount) return [];
        const results: EnemyArchetypeConfig[][] = [];
        const stack: EnemyArchetypeConfig[] = [];

        const dfs = (start: number): void => {
            if (stack.length === pickCount) {
                const comboKey = this.toComboKey(stack.map(item => item.id));
                if (!forbidden.has(comboKey)) {
                    results.push(stack.slice());
                }
                return;
            }
            for (let i = start; i < pool.length; i++) {
                stack.push(pool[i]);
                dfs(i + 1);
                stack.pop();
            }
        };

        dfs(0);
        return results;
    }

    private pickWeightedCombo(
        combos: EnemyArchetypeConfig[][],
        scores: Map<string, number>
    ): EnemyArchetypeConfig[] {
        if (combos.length === 0) return [];
        let total = 0;
        const comboWeights: number[] = new Array(combos.length);
        for (let i = 0; i < combos.length; i++) {
            let weight = 0;
            for (const item of combos[i]) {
                weight += scores.get(item.id) ?? this._randomizerConfig.MIN_WEIGHT_FLOOR;
            }
            weight = Math.max(this._randomizerConfig.MIN_WEIGHT_FLOOR, weight);
            comboWeights[i] = weight;
            total += weight;
        }
        if (!Number.isFinite(total) || total <= 0) {
            return combos[Math.floor(Math.random() * combos.length)] ?? [];
        }
        let cursor = Math.random() * total;
        for (let i = 0; i < combos.length; i++) {
            cursor -= comboWeights[i];
            if (cursor <= 0) return combos[i];
        }
        return combos[combos.length - 1] ?? [];
    }

    private selectCompositionTemplate(): CompositionTemplate {
        return this.selectTemplateWithCooldown(
            this._compositionTemplates,
            this._compositionTemplateState
        );
    }

    private selectRhythmTemplate(): RhythmTemplate {
        return this.selectTemplateWithCooldown(this._rhythmTemplates, this._rhythmTemplateState);
    }

    private selectTemplateWithCooldown<T extends { id: string; cooldownWaves: number }>(
        templates: T[],
        stateMap: Map<string, TemplateRuntimeState>
    ): T {
        const unlocked = templates.filter(tpl => (stateMap.get(tpl.id)?.cooldownRemain ?? 0) <= 0);
        if (unlocked.length > 0) {
            return unlocked[Math.floor(Math.random() * unlocked.length)] ?? templates[0];
        }

        return (
            templates
                .slice()
                .sort(
                    (a, b) =>
                        (stateMap.get(a.id)?.cooldownRemain ?? 0) -
                        (stateMap.get(b.id)?.cooldownRemain ?? 0)
                )[0] ?? templates[0]
        );
    }

    private allocateTypeCounts(total: number, shares: number[], typeCount: number): number[] {
        const resolvedTypeCount = Math.max(1, typeCount);
        if (total <= 0) return new Array(resolvedTypeCount).fill(0);
        const normalizedShares = this.normalizeShares(shares, resolvedTypeCount);

        const raw = normalizedShares.map(share => (total * share) / 100);
        const counts = raw.map(value => Math.floor(value));
        let assigned = counts.reduce((sum, value) => sum + value, 0);

        const fracOrder = raw
            .map((value, idx) => ({ idx, frac: value - Math.floor(value) }))
            .sort((a, b) => b.frac - a.frac);
        let cursor = 0;
        while (assigned < total && fracOrder.length > 0) {
            const idx = fracOrder[cursor % fracOrder.length].idx;
            counts[idx]++;
            assigned++;
            cursor++;
        }

        if (total >= resolvedTypeCount) {
            for (let i = 0; i < resolvedTypeCount; i++) {
                if (counts[i] <= 0) {
                    const donorIdx = indexOfMax(counts);
                    if (counts[donorIdx] > 1) {
                        counts[donorIdx]--;
                        counts[i]++;
                    }
                }
            }
        }

        return counts;
    }

    private normalizeShares(shares: number[], typeCount: number): number[] {
        if (typeCount <= 0) return [];
        const candidate = shares
            .slice(0, typeCount)
            .map(value => clamp(toFinite(value, 0), 0, 1000));
        while (candidate.length < typeCount) {
            candidate.push(100 / typeCount);
        }

        const sum = candidate.reduce((acc, value) => acc + value, 0);
        if (!Number.isFinite(sum) || sum <= 0) {
            const even = 100 / typeCount;
            return new Array(typeCount).fill(even);
        }
        return candidate.map(value => (value / sum) * 100);
    }

    private buildElitePositionSet(total: number, eliteCount: number): Set<number> {
        const result = new Set<number>();
        const safeTotal = Math.max(0, total);
        const safeElite = Math.max(0, Math.min(eliteCount, safeTotal));
        if (safeElite <= 0 || safeTotal <= 0) return result;

        for (let i = 0; i < safeElite; i++) {
            const pos = Math.floor(((i + 1) * safeTotal) / (safeElite + 1));
            result.add(clamp(pos, 0, Math.max(0, safeTotal - 1)));
        }
        return result;
    }

    private applyRhythm(entries: PlannedSpawnEntry[], pattern: RhythmPattern): void {
        if (entries.length <= 0) return;
        const last = Math.max(1, entries.length - 1);
        for (let i = 0; i < entries.length; i++) {
            const t = i / last;
            let m = 1;
            if (pattern === 'frontload') {
                m = 0.72 + 0.58 * t;
            } else if (pattern === 'backload') {
                m = 1.3 - 0.58 * t;
            } else if (pattern === 'pulse') {
                m = i % 4 === 0 || i % 4 === 1 ? 0.74 : 1.3;
            }
            entries[i].intervalMultiplier = clamp(m, 0.35, 2.4);
        }
    }

    private shouldTriggerBossWave(waveNumber: number): boolean {
        if (!this._bossEventConfig?.ENABLED) return false;
        return waveNumber >= this._nextBossWave;
    }

    private selectBossArchetype(waveNumber: number): BossArchetypeConfig | null {
        const bossCfg = this._bossEventConfig;
        if (!bossCfg || bossCfg.BOSS_ARCHETYPES.length === 0) return null;

        const unlocked = bossCfg.BOSS_ARCHETYPES.filter(item => {
            const state = this._bossState.get(item.id);
            return !state || state.cooldownRemain <= 0;
        });
        const pool = unlocked.length > 0 ? unlocked : bossCfg.BOSS_ARCHETYPES;
        if (pool.length === 0) return null;

        const idx = randomInt(0, Math.max(0, pool.length - 1));
        const picked = pool[idx] ?? pool[0];
        const bossState = this._bossState.get(picked.id);
        if (bossState) {
            bossState.cooldownRemain = Math.max(
                bossState.cooldownRemain,
                bossCfg.BOSS_COOLDOWN_WAVES
            );
        }
        void waveNumber;
        return picked;
    }

    private applyBossEchoForWave(boss: BossArchetypeConfig, waveNumber: number): void {
        const cfg = this._bossEventConfig;
        if (!cfg) return;
        const targetId = boss.echoTargetId;
        if (!targetId || !this._archetypeById.has(targetId)) return;

        const echoCfg = cfg.ECHO;
        const bonusDuration = randomInt(
            echoCfg.BONUS_DURATION_MIN,
            Math.max(echoCfg.BONUS_DURATION_MIN, echoCfg.BONUS_DURATION_MAX)
        );
        const bonusStart = waveNumber + Math.max(0, echoCfg.START_DELAY_WAVES);
        const bonusEnd = bonusStart + Math.max(0, bonusDuration - 1);
        const baseStart = bonusEnd + 1;
        const baseEnd = baseStart + Math.max(0, echoCfg.BASE_DURATION_WAVES - 1);

        this._bossEchoes.push({
            targetId,
            bonusStartWave: bonusStart,
            bonusEndWave: bonusEnd,
            bonusWeight: randomRange(echoCfg.BONUS_WEIGHT_MIN, echoCfg.BONUS_WEIGHT_MAX),
            baseStartWave: baseStart,
            baseEndWave: baseEnd,
            baseWeight: randomRange(echoCfg.BASE_WEIGHT_MIN, echoCfg.BASE_WEIGHT_MAX),
        });
    }

    private resolveBossEchoWeight(archetypeId: string, waveNumber: number): number {
        let bonus = 0;
        for (const echo of this._bossEchoes) {
            if (echo.targetId !== archetypeId) continue;
            if (waveNumber >= echo.bonusStartWave && waveNumber <= echo.bonusEndWave) {
                bonus += echo.bonusWeight;
                continue;
            }
            if (waveNumber >= echo.baseStartWave && waveNumber <= echo.baseEndWave) {
                bonus += echo.baseWeight;
            }
        }
        return bonus;
    }

    private pruneBossEchoes(waveNumber: number): void {
        this._bossEchoes = this._bossEchoes.filter(echo => waveNumber <= echo.baseEndWave);
    }

    private rollNextBossWave(fromWave: number): number {
        const cfg = this._bossEventConfig;
        if (!cfg) return Number.MAX_SAFE_INTEGER;
        const min = Math.max(1, cfg.INTERVAL_MIN_WAVES);
        const max = Math.max(min, cfg.INTERVAL_MAX_WAVES);
        return fromWave + randomInt(min, max);
    }

    private updateWaveMemory(selectedIds: string[], comboKey: string): void {
        this._recentWaveTypes.push(selectedIds.slice());
        if (this._recentWaveTypes.length > this._randomizerConfig.RECENT_WINDOW_WAVES) {
            this._recentWaveTypes.splice(
                0,
                this._recentWaveTypes.length - this._randomizerConfig.RECENT_WINDOW_WAVES
            );
        }

        this._recentCombos.push(comboKey);
        if (this._recentCombos.length > this._randomizerConfig.COMBO_MEMORY_WAVES) {
            this._recentCombos.splice(
                0,
                this._recentCombos.length - this._randomizerConfig.COMBO_MEMORY_WAVES
            );
        }

        const tagCounts: Record<string, number> = {};
        for (const id of selectedIds) {
            const archetype = this._archetypeById.get(id);
            if (!archetype) continue;
            for (const tag of archetype.tags) {
                tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
            }
        }
        const denom = Math.max(1, selectedIds.length);
        const tagRatios: Record<string, number> = {};
        for (const tag of Object.keys(tagCounts)) {
            tagRatios[tag] = tagCounts[tag] / denom;
        }
        this._recentTagRatios.push(tagRatios);
        if (this._recentTagRatios.length > this._randomizerConfig.RECENT_WINDOW_WAVES) {
            this._recentTagRatios.splice(
                0,
                this._recentTagRatios.length - this._randomizerConfig.RECENT_WINDOW_WAVES
            );
        }
    }

    private applyArchetypeSelectionState(selectedIds: string[], waveNumber: number): void {
        const picked = new Set(selectedIds);
        for (const archetype of this._archetypes) {
            const state = this._archetypeState.get(archetype.id);
            if (!state) continue;
            if (picked.has(archetype.id)) {
                state.cooldownRemain = Math.max(1, archetype.cooldownBase);
                state.lastSeenWave = waveNumber;
            }
        }
    }

    private tickRuntimeCooldowns(): void {
        for (const state of this._archetypeState.values()) {
            state.cooldownRemain = Math.max(0, state.cooldownRemain - 1);
        }
        for (const state of this._compositionTemplateState.values()) {
            state.cooldownRemain = Math.max(0, state.cooldownRemain - 1);
        }
        for (const state of this._rhythmTemplateState.values()) {
            state.cooldownRemain = Math.max(0, state.cooldownRemain - 1);
        }
        for (const state of this._bossState.values()) {
            state.cooldownRemain = Math.max(0, state.cooldownRemain - 1);
        }
    }

    private markTemplateCooldown(
        stateMap: Map<string, TemplateRuntimeState>,
        id: string,
        cooldown: number
    ): void {
        const state = stateMap.get(id);
        if (!state) return;
        state.cooldownRemain = Math.max(0, cooldown);
    }

    private resolveArchetypeById(id: string): EnemyArchetypeConfig | null {
        const found = this._archetypeById.get(id);
        if (found) return found;
        return this._archetypes[0] ?? null;
    }

    private toComboKey(ids: string[]): string {
        return ids.slice().sort().join('|');
    }

    private shuffleInPlace<T>(arr: T[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
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
