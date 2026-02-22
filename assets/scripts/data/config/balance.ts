export type BalancePresetId = 'casual' | 'standard' | 'hardcore';

export interface BalanceAssumptions {
    label: string;
    enemyCountScale: number;
    enemyPowerScale: number;
    enemySpeedScale: number;
    playerPowerScale: number;
    economyScale: number;
    upgradeCostScale: number;
    farmIncomeScale: number;
    heroGrowthScale: number;
    heroSkillScale: number;
}

export interface BalanceProfile {
    id: BalancePresetId;
    label: string;
    assumptions: BalanceAssumptions;
    economy: {
        initialCoins: number;
        enemyCoinDrop: number;
        enemyCoinDropVariance: number;
        waveBonusBase: number;
        waveBonusGrowth: number;
    };
    waveInfinite: {
        baseCount: number;
        countPerWave: number;
        countGrowthStepWaves: number;
        countGrowthStepBonus: number;
        hpMultPerWave: number;
        attackMultPerWave: number;
        speedMultPerWave: number;
        maxSpeedMult: number;
        baseSpawnInterval: number;
        spawnIntervalDecayPerWave: number;
        minSpawnInterval: number;
        spawnRange: number;
        bonusPerWave: number;
        bonusGrowthPerWave: number;
    };
    waveDirector: {
        spawnPortals: {
            openWave2: number;
            openWave3: number;
            edgeMargin: number;
            distanceFactor: number;
            jitterRadius: number;
        };
        elite: {
            startWave: number;
            interval: number;
            baseCount: number;
            countGrowthStepWaves: number;
            maxCount: number;
            spawnEvery: number;
        };
        randomizer: {
            pickTypesPerWave: number;
            comboMemoryWaves: number;
            recentTypePenaltyWaves: number;
            recentTypePenalty: number;
            recentWindowWaves: number;
            tagDominanceWindowWaves: number;
            tagDominanceThreshold: number;
            tagDominancePenalty: number;
            minWeightFloor: number;
        };
        bossEvent: {
            intervalMinWaves: number;
            intervalMaxWaves: number;
            bossCooldownWaves: number;
            bossOnlyWave: boolean;
            additionalEnemyCount: number;
            bossHpMultiplier: number;
            bossAttackMultiplier: number;
            bossSpeedMultiplier: number;
            bossScaleMultiplier: number;
            bossCoinMultiplier: number;
            minionScaleRatio: number;
            echo: {
                startDelayWaves: number;
                bonusWeightMin: number;
                bonusWeightMax: number;
                bonusDurationMin: number;
                bonusDurationMax: number;
                baseWeightMin: number;
                baseWeightMax: number;
                baseDurationWaves: number;
            };
        };
    };
    enemy: {
        moveSpeed: number;
        baseAttack: number;
        baseHp: number;
        attackInterval: number;
        attackRange: number;
        aggroRange: number;
        baseReachDamage: number;
        elite: {
            hpMultiplier: number;
            attackMultiplier: number;
            speedMultiplier: number;
            scaleMultiplier: number;
            coinDropMultiplier: number;
        };
        flyingRanged: {
            attackRange: number;
            aggroRange: number;
            projectileSpeed: number;
            projectileLifetime: number;
            projectileHitRadius: number;
            projectileSpawnOffsetY: number;
        };
    };
    building: {
        defaultCostMultiplier: number;
        costs: {
            barracks: number;
            base: number;
            tower: number;
            frostTower: number;
            lightningTower: number;
            farm: number;
            wall: number;
        };
        upgradeCostMultiplier: {
            barracks: number;
            tower: number;
            frostTower: number;
            lightningTower: number;
            farm: number;
            wall: number;
        };
        baseUpgrade: {
            startCost: number;
            costMultiplier: number;
            hpMultiplier: number;
            collectRadius: number;
            collectRate: number;
            collectInterval: number;
            soldierBatchBase: number;
            soldierBatchBonusPerLevel: number;
            soldierBatchMax: number;
            heroBuff: {
                hpMultiplier: number;
                attackMultiplier: number;
                attackIntervalMultiplier: number;
                moveSpeedMultiplier: number;
                attackRangeBonus: number;
                healPercent: number;
            };
        };
        barracks: {
            hp: number;
            spawnInterval: number;
            maxUnits: number;
            spawnBatchPerLevel: number;
            statMultiplier: number;
            spawnIntervalMultiplier: number;
            maxUnitsPerLevel: number;
        };
        tower: {
            hp: number;
            attackRange: number;
            attackDamage: number;
            attackInterval: number;
            statMultiplier: number;
            attackMultiplier: number;
            rangeMultiplier: number;
            intervalMultiplier: number;
            machineGun: {
                bulletSpawnY: number;
                bulletWidthBase: number;
                bulletLengthBase: number;
                bulletWidthPerLevel: number;
                bulletLengthPerLevel: number;
                bulletSpreadDeg: number;
                bulletMaxLifetime: number;
                burstBase: number;
                burstAngleStepDeg: number;
                modelNodeName: string;
                muzzleFallbackY: number;
                muzzleTopInset: number;
            };
        };
        frostTower: {
            hp: number;
            attackRange: number;
            attackDamage: number;
            attackInterval: number;
            bulletExplosionRadius: number;
            bulletSlowPercent: number;
            bulletSlowDuration: number;
            statMultiplier: number;
            attackMultiplier: number;
            rangeMultiplier: number;
            intervalMultiplier: number;
        };
        lightningTower: {
            hp: number;
            attackRange: number;
            attackDamage: number;
            attackInterval: number;
            chainCount: number;
            chainRange: number;
            statMultiplier: number;
            attackMultiplier: number;
            rangeMultiplier: number;
            intervalMultiplier: number;
            chainRangePerLevel: number;
        };
        farm: {
            hp: number;
            incomePerTick: number;
            incomeInterval: number;
            statMultiplier: number;
            incomeMultiplier: number;
            stack: {
                baseY: number;
                maxHeight: number;
                coinValue: number;
            };
        };
        spa: {
            hp: number;
            healRadius: number;
            healPercentPerSecond: number;
            healInterval: number;
            statMultiplier: number;
        };
        wall: {
            hp: number;
            tauntRange: number;
            statMultiplier: number;
        };
    };
    soldier: {
        moveSpeed: number;
        baseAttack: number;
        baseHp: number;
        attackInterval: number;
        attackRange: number;
        growth: {
            hpLinear: number;
            hpQuadratic: number;
            attackLinear: number;
            attackQuadratic: number;
            attackIntervalDecayPerLevel: number;
            attackIntervalMinMultiplier: number;
            attackRangeLinear: number;
            moveSpeedLinear: number;
            sizeLinear: number;
            sizeQuadratic: number;
            sizeMaxMultiplier: number;
        };
    };
    hero: {
        baseHp: number;
        baseAttack: number;
        attackInterval: number;
        attackRange: number;
        moveSpeed: number;
        critRate: number;
        critDamage: number;
    };
    heroLevel: {
        xpBase: number;
        xpGrowth: number;
        xpPerKill: number;
        xpPerEliteKill: number;
        growth: {
            maxHpMultiply: number;
            attackMultiply: number;
            critRateAdd: number;
            critDamageAdd: number;
            moveSpeedMultiply: number;
            attackRangeMultiply: number;
            attackIntervalMultiply: number;
        };
    };
    heroSkill: {
        weaponDamageMultiplier: number;
        weaponAttackIntervalMultiplier: number;
        weaponRangeMultiplier: number;
        weaponTypeDamageScale: {
            machineGun: number;
            flamethrower: number;
            cannon: number;
            glitchWave: number;
        };
        buffMultiplyScale: number;
        buffAddScale: number;
        buffRarityScale: {
            blue: number;
            purple: number;
            gold: number;
        };
    };
    analytics: {
        wave10EnemyCount: number;
        wave10EnemyHp: number;
        wave10EnemyAttack: number;
        wave10CoinBudget: number;
        suggestedHeroDps: number;
        wave10KillDistanceToBaseNormalized: number;
        wave10BreachRate: number;
        firstBreachWave: number;
        firstBaseCollapseWave: number;
        wave10RiskScore: number;
    };
}

export interface WaveBalanceSnapshot {
    wave: number;
    enemyCount: number;
    enemyHpMultiplier: number;
    enemyAttackMultiplier: number;
    enemySpeedMultiplier: number;
    enemyUnitHp: number;
    enemyUnitAttack: number;
    predictedCoinIncome: number;
    suggestedHeroDps: number;
}

export interface RouteBalanceSnapshot {
    wave: number;
    regularEnemyCount: number;
    eliteEnemyCount: number;
    totalEnemyCount: number;
    lanePathLength: number;
    enemyTravelSeconds: number;
    avgEnemyHp: number;
    avgEnemyAttack: number;
    effectiveLaneDps: number;
    focusDpsPerEnemy: number;
    damagePerEnemyOnRoute: number;
    killDistanceToBaseNormalized: number;
    breachRate: number;
    predictedBaseHpLoss: number;
    riskScore: number;
}

const BASE = {
    economy: {
        initialCoins: 40,
        enemyCoinDrop: 9,
        enemyCoinDropVariance: 0,
        waveBonusBase: 20,
        waveBonusGrowth: 4,
    },
    waveInfinite: {
        baseCount: 10,
        countPerWave: 3,
        countGrowthStepWaves: 3,
        countGrowthStepBonus: 4,
        hpMultPerWave: 0.36,
        attackMultPerWave: 0.11,
        speedMultPerWave: 0.015,
        maxSpeedMult: 1.55,
        baseSpawnInterval: 0.35,
        spawnIntervalDecayPerWave: 0.02,
        minSpawnInterval: 0.12,
        spawnRange: 8,
        bonusPerWave: 20,
        bonusGrowthPerWave: 4,
    },
    waveDirector: {
        spawnPortals: {
            openWave2: 4,
            openWave3: 8,
            edgeMargin: 4,
            distanceFactor: 0.96,
            jitterRadius: 0.85,
        },
        elite: {
            startWave: 3,
            interval: 2,
            baseCount: 1,
            countGrowthStepWaves: 4,
            maxCount: 6,
            spawnEvery: 4,
        },
        randomizer: {
            pickTypesPerWave: 3,
            comboMemoryWaves: 4,
            recentTypePenaltyWaves: 2,
            recentTypePenalty: 0.42,
            recentWindowWaves: 8,
            tagDominanceWindowWaves: 3,
            tagDominanceThreshold: 0.62,
            tagDominancePenalty: 0.55,
            minWeightFloor: 0.01,
        },
        bossEvent: {
            intervalMinWaves: 6,
            intervalMaxWaves: 8,
            bossCooldownWaves: 12,
            bossOnlyWave: true,
            additionalEnemyCount: 0,
            bossHpMultiplier: 24,
            bossAttackMultiplier: 3.1,
            bossSpeedMultiplier: 1,
            bossScaleMultiplier: 1.75,
            bossCoinMultiplier: 10,
            minionScaleRatio: 0.6,
            echo: {
                startDelayWaves: 2,
                bonusWeightMin: 0.05,
                bonusWeightMax: 0.1,
                bonusDurationMin: 3,
                bonusDurationMax: 5,
                baseWeightMin: 0.02,
                baseWeightMax: 0.04,
                baseDurationWaves: 12,
            },
        },
    },
    enemy: {
        moveSpeed: 2.5,
        baseAttack: 7,
        baseHp: 40,
        attackInterval: 1.2,
        attackRange: 0.85,
        aggroRange: 3.0,
        baseReachDamage: 10,
        elite: {
            hpMultiplier: 5.4,
            attackMultiplier: 1.3,
            speedMultiplier: 1.1,
            scaleMultiplier: 1.5,
            coinDropMultiplier: 3.0,
        },
        flyingRanged: {
            attackRange: 5.8,
            aggroRange: 8.0,
            projectileSpeed: 11,
            projectileLifetime: 2.2,
            projectileHitRadius: 0.42,
            projectileSpawnOffsetY: 0.9,
        },
    },
    building: {
        defaultCostMultiplier: 1.75,
        costs: {
            barracks: 65,
            base: 70,
            tower: 90,
            frostTower: 90,
            lightningTower: 90,
            farm: 80,
            wall: 21,
        },
        upgradeCostMultiplier: {
            barracks: 1.65,
            tower: 1.75,
            frostTower: 1.78,
            lightningTower: 1.8,
            farm: 1.68,
            wall: 1.6,
        },
        baseUpgrade: {
            startCost: 45,
            costMultiplier: 1.85,
            hpMultiplier: 1.92,
            collectRadius: 3.0,
            collectRate: 2,
            collectInterval: 0.1,
            soldierBatchBase: 1,
            soldierBatchBonusPerLevel: 1,
            soldierBatchMax: 5,
            heroBuff: {
                hpMultiplier: 1.12,
                attackMultiplier: 1.12,
                attackIntervalMultiplier: 0.97,
                moveSpeedMultiplier: 1.03,
                attackRangeBonus: 0.1,
                healPercent: 0.35,
            },
        },
        barracks: {
            hp: 240,
            spawnInterval: 4.5,
            maxUnits: 6,
            spawnBatchPerLevel: 2,
            statMultiplier: 1.22,
            spawnIntervalMultiplier: 0.92,
            maxUnitsPerLevel: 2,
        },
        tower: {
            hp: 390,
            attackRange: 12.5,
            attackDamage: 18,
            attackInterval: 0.36,
            statMultiplier: 1.24,
            attackMultiplier: 1.12,
            rangeMultiplier: 1.02,
            intervalMultiplier: 0.96,
            machineGun: {
                bulletSpawnY: 1.5,
                bulletWidthBase: 0.3,
                bulletLengthBase: 0.48,
                bulletWidthPerLevel: 0.03,
                bulletLengthPerLevel: 0.05,
                bulletSpreadDeg: 2.2,
                bulletMaxLifetime: 1.4,
                burstBase: 2,
                burstAngleStepDeg: 0.9,
                modelNodeName: 'RifleTowerModel',
                muzzleFallbackY: 1.9,
                muzzleTopInset: 0.12,
            },
        },
        frostTower: {
            hp: 360,
            attackRange: 10.5,
            attackDamage: 8,
            attackInterval: 0.9,
            bulletExplosionRadius: 2.8,
            bulletSlowPercent: 0.45,
            bulletSlowDuration: 2.2,
            statMultiplier: 1.22,
            attackMultiplier: 1.08,
            rangeMultiplier: 1.01,
            intervalMultiplier: 0.97,
        },
        lightningTower: {
            hp: 340,
            attackRange: 10.8,
            attackDamage: 26,
            attackInterval: 0.9,
            chainCount: 3,
            chainRange: 5.2,
            statMultiplier: 1.24,
            attackMultiplier: 1.1,
            rangeMultiplier: 1.01,
            intervalMultiplier: 0.96,
            chainRangePerLevel: 0.35,
        },
        farm: {
            hp: 210,
            incomePerTick: 3,
            incomeInterval: 4,
            statMultiplier: 1.22,
            incomeMultiplier: 1.35,
            stack: {
                baseY: 0.09,
                maxHeight: 12,
                coinValue: 2,
            },
        },
        spa: {
            hp: 1040,
            healRadius: 5,
            healPercentPerSecond: 0.1,
            healInterval: 1,
            statMultiplier: 1.24,
        },
        wall: {
            hp: 1450,
            tauntRange: 15,
            statMultiplier: 1.52,
        },
    },
    soldier: {
        moveSpeed: 3.8,
        baseAttack: 14,
        baseHp: 68,
        attackInterval: 0.9,
        attackRange: 1.65,
        growth: {
            hpLinear: 0.28,
            hpQuadratic: 0.022,
            attackLinear: 0.2,
            attackQuadratic: 0.03,
            attackIntervalDecayPerLevel: 0.06,
            attackIntervalMinMultiplier: 0.62,
            attackRangeLinear: 0.045,
            moveSpeedLinear: 0.04,
            sizeLinear: 0.14,
            sizeQuadratic: 0.018,
            sizeMaxMultiplier: 2.2,
        },
    },
    hero: {
        baseHp: 60,
        baseAttack: 12,
        attackInterval: 0.9,
        attackRange: 2.5,
        moveSpeed: 5.5,
        critRate: 0.05,
        critDamage: 1.5,
    },
    heroLevel: {
        xpBase: 20,
        xpGrowth: 1.18,
        xpPerKill: 5,
        xpPerEliteKill: 20,
        growth: {
            maxHpMultiply: 1.03,
            attackMultiply: 1.08,
            critRateAdd: 0.012,
            critDamageAdd: 0.06,
            moveSpeedMultiply: 1.015,
            attackRangeMultiply: 1.005,
            attackIntervalMultiply: 0.985,
        },
    },
    routeModel: {
        mapLimits: {
            x: 25,
            z: 25,
        },
        lanePolylinesNormalized: {
            top: [
                { x: 0.05, z: 0.95 },
                { x: 0.06, z: 0.92 },
                { x: 0.95, z: 0.92 },
            ],
            mid: [
                { x: 0.05, z: 0.95 },
                { x: 0.35, z: 0.65 },
                { x: 0.5, z: 0.5 },
                { x: 0.65, z: 0.35 },
                { x: 0.95, z: 0.05 },
            ],
            bottom: [
                { x: 0.05, z: 0.95 },
                { x: 0.08, z: 0.94 },
                { x: 0.08, z: 0.05 },
            ],
        },
        defenseAssumptions: {
            // 该模型用于平衡脚本的“路线结果评估”，不是运行时战斗代码。
            towerSlots: 12,
            frostTowerSlots: 4,
            lightningTowerSlots: 4,
            barracksCount: 1,
            towerFireUptime: 0.72,
            heroDpsUptime: 0.68,
            laneCoverageRatio: 0.62,
            controlSlowBonus: 0.22,
            pressureDivisorBase: 36,
            waveGrowthSoftCap: 45,
            baseHp: 100,
        },
    },
} as const;

const BALANCE_ASSUMPTIONS: Record<BalancePresetId, BalanceAssumptions> = {
    casual: {
        label: 'Casual / 轻松推图',
        enemyCountScale: 0.86,
        enemyPowerScale: 0.84,
        enemySpeedScale: 0.95,
        playerPowerScale: 1.14,
        economyScale: 1.22,
        upgradeCostScale: 0.88,
        farmIncomeScale: 1.3,
        heroGrowthScale: 1.12,
        heroSkillScale: 1.12,
    },
    standard: {
        label: 'Standard / 当前基线',
        enemyCountScale: 1,
        enemyPowerScale: 1,
        enemySpeedScale: 1,
        playerPowerScale: 1,
        economyScale: 1,
        upgradeCostScale: 1,
        farmIncomeScale: 1,
        heroGrowthScale: 1,
        heroSkillScale: 1,
    },
    hardcore: {
        label: 'Hardcore / 压力挑战',
        enemyCountScale: 1.2,
        enemyPowerScale: 1.24,
        enemySpeedScale: 1.08,
        playerPowerScale: 0.93,
        economyScale: 0.9,
        upgradeCostScale: 1.22,
        farmIncomeScale: 0.84,
        heroGrowthScale: 0.92,
        heroSkillScale: 0.9,
    },
};

function roundInt(value: number): number {
    return Math.max(1, Math.round(value));
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function scaleMultiply(base: number, assumptionScale: number, center = 1): number {
    return round2(center + (base - center) * assumptionScale);
}

const BUILDING_GROWTH_MARGIN_OVER_ENEMY_ATTACK = 0.03;

function ensureBuildingGrowthFloor(multiplier: number): number {
    const enemyAttackStep = Math.max(0, BASE.waveInfinite.attackMultPerWave);
    const floor = 1 + enemyAttackStep + BUILDING_GROWTH_MARGIN_OVER_ENEMY_ATTACK;
    return round2(Math.max(multiplier, floor));
}

type LanePoint = { x: number; z: number };

function laneNormalizedToWorld(point: LanePoint, limits: { x: number; z: number }): LanePoint {
    return {
        x: point.x * (limits.x * 2) - limits.x,
        z: (1 - point.z) * (limits.z * 2) - limits.z,
    };
}

function polylineLength(points: LanePoint[]): number {
    if (points.length <= 1) return 0;
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1].x - points[i].x;
        const dz = points[i + 1].z - points[i].z;
        length += Math.hypot(dx, dz);
    }
    return length;
}

function average(values: number[]): number {
    if (values.length <= 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveAverageLanePathLength(): number {
    const limits = BASE.routeModel.mapLimits;
    const normalized = BASE.routeModel.lanePolylinesNormalized;
    const lengths = [normalized.top, normalized.mid, normalized.bottom].map(line =>
        polylineLength(line.map(point => laneNormalizedToWorld(point, limits)))
    );
    return average(lengths);
}

function getEliteCountForWave(profile: BalanceProfile, waveNumber: number): number {
    const wave = Math.max(1, Math.floor(waveNumber));
    const elite = profile.waveDirector.elite;
    if (wave < elite.startWave) return 0;
    if ((wave - elite.startWave) % elite.interval !== 0) return 0;
    const growthSteps = Math.floor((wave - elite.startWave) / elite.countGrowthStepWaves);
    return Math.min(elite.maxCount, elite.baseCount + growthSteps);
}

function estimateRouteSnapshot(
    profile: BalanceProfile,
    waveNumber: number,
    pathLength: number
): RouteBalanceSnapshot {
    const wave = Math.max(1, Math.floor(waveNumber));
    const waveSnapshot = calculateWaveSnapshot(profile, wave);
    const regularEnemyCount = waveSnapshot.enemyCount;
    const eliteEnemyCount = getEliteCountForWave(profile, wave);
    const totalEnemyCount = regularEnemyCount + eliteEnemyCount;
    const eliteShare = totalEnemyCount > 0 ? eliteEnemyCount / totalEnemyCount : 0;
    const avgEnemyHp = Math.max(
        1,
        waveSnapshot.enemyUnitHp * (1 + eliteShare * (profile.enemy.elite.hpMultiplier - 1))
    );
    const avgEnemyAttack = Math.max(
        1,
        waveSnapshot.enemyUnitAttack * (1 + eliteShare * (profile.enemy.elite.attackMultiplier - 1))
    );

    const enemySpeed = Math.max(0.25, profile.enemy.moveSpeed * waveSnapshot.enemySpeedMultiplier);
    const enemyTravelSeconds = Math.max(0.5, pathLength / enemySpeed);

    const defense = BASE.routeModel.defenseAssumptions;
    const buildUp = clamp(0.35 + wave / 20, 0.35, 1.0);
    const towerSlots = defense.towerSlots * buildUp;
    const frostSlots = defense.frostTowerSlots * buildUp;
    const lightningSlots = defense.lightningTowerSlots * buildUp;
    const laneCoverage = clamp(
        defense.laneCoverageRatio * (0.94 + profile.assumptions.playerPowerScale * 0.06),
        0.35,
        0.95
    );
    const towerUptime = clamp(defense.towerFireUptime * laneCoverage, 0.2, 0.95);

    const towerDps =
        (profile.building.tower.attackDamage / profile.building.tower.attackInterval) * towerSlots;
    const frostDps =
        (profile.building.frostTower.attackDamage / profile.building.frostTower.attackInterval) *
        frostSlots;
    const lightningDps =
        (profile.building.lightningTower.attackDamage /
            profile.building.lightningTower.attackInterval) *
        lightningSlots;

    const soldierCount = Math.max(1, profile.building.barracks.maxUnits * defense.barracksCount);
    const soldierDps =
        (profile.soldier.baseAttack / Math.max(0.25, profile.soldier.attackInterval)) *
        soldierCount *
        0.55;
    const heroDps =
        (profile.hero.baseAttack / Math.max(0.2, profile.hero.attackInterval)) *
        defense.heroDpsUptime;

    const controlBonus =
        1 + defense.controlSlowBonus * profile.building.frostTower.bulletSlowPercent;
    const effectiveLaneDps =
        (towerDps + frostDps + lightningDps + soldierDps + heroDps) * towerUptime * controlBonus;

    const pressureIndex =
        totalEnemyCount / defense.pressureDivisorBase +
        avgEnemyAttack / 85 +
        wave / defense.waveGrowthSoftCap;
    const focusDpsPerEnemy = effectiveLaneDps / (1 + pressureIndex);
    const damagePerEnemyOnRoute = focusDpsPerEnemy * enemyTravelSeconds;
    const killProgress = damagePerEnemyOnRoute / avgEnemyHp;
    const killDistanceToBaseNormalized = clamp(1 - 1 / Math.max(0.001, killProgress), 0, 1);

    const rawBreach = clamp(1 - killProgress, 0, 1);
    const saturationPenalty = clamp((totalEnemyCount - 40) / 120, 0, 0.35);
    let breachRate = clamp(
        rawBreach + saturationPenalty * (1 - killDistanceToBaseNormalized),
        0,
        1
    );
    if (killProgress > 1.25) {
        breachRate *= 0.35;
    }

    const predictedBaseHpLoss = round2(
        totalEnemyCount * breachRate * profile.enemy.baseReachDamage
    );
    const riskScore = round2(
        clamp(breachRate * 70 + (1 - killDistanceToBaseNormalized) * 30, 0, 100)
    );

    return {
        wave,
        regularEnemyCount,
        eliteEnemyCount,
        totalEnemyCount,
        lanePathLength: round2(pathLength),
        enemyTravelSeconds: round2(enemyTravelSeconds),
        avgEnemyHp: roundInt(avgEnemyHp),
        avgEnemyAttack: roundInt(avgEnemyAttack),
        effectiveLaneDps: round2(effectiveLaneDps),
        focusDpsPerEnemy: round2(focusDpsPerEnemy),
        damagePerEnemyOnRoute: round2(damagePerEnemyOnRoute),
        killDistanceToBaseNormalized: round2(killDistanceToBaseNormalized),
        breachRate: round2(breachRate),
        predictedBaseHpLoss,
        riskScore,
    };
}

function buildProfile(id: BalancePresetId, assumptions: BalanceAssumptions): BalanceProfile {
    const costFactor = assumptions.upgradeCostScale / assumptions.economyScale;

    const profile: BalanceProfile = {
        id,
        label: assumptions.label,
        assumptions,
        economy: {
            initialCoins: roundInt(BASE.economy.initialCoins * assumptions.economyScale),
            enemyCoinDrop: roundInt(BASE.economy.enemyCoinDrop * assumptions.economyScale),
            enemyCoinDropVariance: roundInt(
                BASE.economy.enemyCoinDropVariance * (0.7 + assumptions.economyScale * 0.3)
            ),
            waveBonusBase: roundInt(BASE.economy.waveBonusBase * assumptions.economyScale),
            waveBonusGrowth: roundInt(BASE.economy.waveBonusGrowth * assumptions.economyScale),
        },
        waveInfinite: {
            baseCount: roundInt(BASE.waveInfinite.baseCount * assumptions.enemyCountScale),
            countPerWave: roundInt(BASE.waveInfinite.countPerWave * assumptions.enemyCountScale),
            countGrowthStepWaves: BASE.waveInfinite.countGrowthStepWaves,
            countGrowthStepBonus: roundInt(
                BASE.waveInfinite.countGrowthStepBonus * assumptions.enemyCountScale
            ),
            hpMultPerWave: round2(BASE.waveInfinite.hpMultPerWave * assumptions.enemyPowerScale),
            attackMultPerWave: round2(
                BASE.waveInfinite.attackMultPerWave * assumptions.enemyPowerScale
            ),
            speedMultPerWave: round2(
                BASE.waveInfinite.speedMultPerWave * assumptions.enemySpeedScale
            ),
            maxSpeedMult: round2(
                BASE.waveInfinite.maxSpeedMult * (0.92 + assumptions.enemySpeedScale * 0.08)
            ),
            baseSpawnInterval: round2(
                BASE.waveInfinite.baseSpawnInterval / (0.85 + assumptions.enemyCountScale * 0.15)
            ),
            spawnIntervalDecayPerWave: round2(
                BASE.waveInfinite.spawnIntervalDecayPerWave * assumptions.enemyCountScale
            ),
            minSpawnInterval: round2(
                BASE.waveInfinite.minSpawnInterval / (0.9 + assumptions.enemyCountScale * 0.1)
            ),
            spawnRange: BASE.waveInfinite.spawnRange,
            bonusPerWave: roundInt(BASE.waveInfinite.bonusPerWave * assumptions.economyScale),
            bonusGrowthPerWave: roundInt(
                BASE.waveInfinite.bonusGrowthPerWave * assumptions.economyScale
            ),
        },
        waveDirector: {
            spawnPortals: {
                openWave2: BASE.waveDirector.spawnPortals.openWave2,
                openWave3: BASE.waveDirector.spawnPortals.openWave3,
                edgeMargin: BASE.waveDirector.spawnPortals.edgeMargin,
                distanceFactor: BASE.waveDirector.spawnPortals.distanceFactor,
                jitterRadius: BASE.waveDirector.spawnPortals.jitterRadius,
            },
            elite: {
                startWave: BASE.waveDirector.elite.startWave,
                interval: BASE.waveDirector.elite.interval,
                baseCount: Math.max(1, Math.round(BASE.waveDirector.elite.baseCount)),
                countGrowthStepWaves: BASE.waveDirector.elite.countGrowthStepWaves,
                maxCount: Math.max(
                    1,
                    Math.round(
                        BASE.waveDirector.elite.maxCount *
                            (0.92 + assumptions.enemyCountScale * 0.08)
                    )
                ),
                spawnEvery: BASE.waveDirector.elite.spawnEvery,
            },
            randomizer: { ...BASE.waveDirector.randomizer },
            bossEvent: {
                intervalMinWaves: BASE.waveDirector.bossEvent.intervalMinWaves,
                intervalMaxWaves: BASE.waveDirector.bossEvent.intervalMaxWaves,
                bossCooldownWaves: BASE.waveDirector.bossEvent.bossCooldownWaves,
                bossOnlyWave: BASE.waveDirector.bossEvent.bossOnlyWave,
                additionalEnemyCount: Math.max(
                    0,
                    Math.round(
                        BASE.waveDirector.bossEvent.additionalEnemyCount *
                            assumptions.enemyCountScale
                    )
                ),
                bossHpMultiplier: round2(
                    BASE.waveDirector.bossEvent.bossHpMultiplier * assumptions.enemyPowerScale
                ),
                bossAttackMultiplier: round2(
                    BASE.waveDirector.bossEvent.bossAttackMultiplier * assumptions.enemyPowerScale
                ),
                bossSpeedMultiplier: round2(
                    BASE.waveDirector.bossEvent.bossSpeedMultiplier * assumptions.enemySpeedScale
                ),
                bossScaleMultiplier: BASE.waveDirector.bossEvent.bossScaleMultiplier,
                bossCoinMultiplier: round2(
                    BASE.waveDirector.bossEvent.bossCoinMultiplier * assumptions.economyScale
                ),
                minionScaleRatio: BASE.waveDirector.bossEvent.minionScaleRatio,
                echo: { ...BASE.waveDirector.bossEvent.echo },
            },
        },
        enemy: {
            moveSpeed: round2(BASE.enemy.moveSpeed * assumptions.enemySpeedScale),
            baseAttack: roundInt(BASE.enemy.baseAttack * assumptions.enemyPowerScale),
            baseHp: roundInt(BASE.enemy.baseHp * assumptions.enemyPowerScale),
            attackInterval: round2(
                BASE.enemy.attackInterval / (0.95 + assumptions.enemyPowerScale * 0.05)
            ),
            attackRange: round2(
                BASE.enemy.attackRange * (0.95 + assumptions.enemySpeedScale * 0.05)
            ),
            aggroRange: round2(BASE.enemy.aggroRange * (0.96 + assumptions.enemySpeedScale * 0.04)),
            baseReachDamage: roundInt(BASE.enemy.baseReachDamage * assumptions.enemyPowerScale),
            elite: {
                hpMultiplier: scaleMultiply(
                    BASE.enemy.elite.hpMultiplier,
                    assumptions.enemyPowerScale
                ),
                attackMultiplier: scaleMultiply(
                    BASE.enemy.elite.attackMultiplier,
                    assumptions.enemyPowerScale
                ),
                speedMultiplier: scaleMultiply(
                    BASE.enemy.elite.speedMultiplier,
                    assumptions.enemySpeedScale
                ),
                scaleMultiplier: BASE.enemy.elite.scaleMultiplier,
                coinDropMultiplier: scaleMultiply(
                    BASE.enemy.elite.coinDropMultiplier,
                    assumptions.economyScale
                ),
            },
            flyingRanged: { ...BASE.enemy.flyingRanged },
        },
        building: {
            defaultCostMultiplier: round2(
                1 + (BASE.building.defaultCostMultiplier - 1) * assumptions.upgradeCostScale
            ),
            costs: {
                barracks: roundInt(BASE.building.costs.barracks * costFactor),
                base: roundInt(BASE.building.costs.base * costFactor),
                tower: roundInt(BASE.building.costs.tower * costFactor),
                frostTower: roundInt(BASE.building.costs.frostTower * costFactor),
                lightningTower: roundInt(BASE.building.costs.lightningTower * costFactor),
                farm: roundInt(BASE.building.costs.farm * costFactor),
                wall: roundInt(BASE.building.costs.wall * costFactor),
            },
            upgradeCostMultiplier: {
                barracks: round2(
                    1 +
                        (BASE.building.upgradeCostMultiplier.barracks - 1) *
                            assumptions.upgradeCostScale
                ),
                tower: round2(
                    1 +
                        (BASE.building.upgradeCostMultiplier.tower - 1) *
                            assumptions.upgradeCostScale
                ),
                frostTower: round2(
                    1 +
                        (BASE.building.upgradeCostMultiplier.frostTower - 1) *
                            assumptions.upgradeCostScale
                ),
                lightningTower: round2(
                    1 +
                        (BASE.building.upgradeCostMultiplier.lightningTower - 1) *
                            assumptions.upgradeCostScale
                ),
                farm: round2(
                    1 +
                        (BASE.building.upgradeCostMultiplier.farm - 1) *
                            assumptions.upgradeCostScale
                ),
                wall: round2(
                    1 +
                        (BASE.building.upgradeCostMultiplier.wall - 1) *
                            assumptions.upgradeCostScale
                ),
            },
            baseUpgrade: {
                startCost: roundInt(BASE.building.baseUpgrade.startCost * costFactor),
                costMultiplier: round2(
                    1 +
                        (BASE.building.baseUpgrade.costMultiplier - 1) *
                            assumptions.upgradeCostScale
                ),
                hpMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 +
                            (BASE.building.baseUpgrade.hpMultiplier - 1) *
                                (0.94 + assumptions.playerPowerScale * 0.06)
                    )
                ),
                collectRadius: round2(
                    BASE.building.baseUpgrade.collectRadius *
                        (0.96 + assumptions.playerPowerScale * 0.04)
                ),
                collectRate: roundInt(
                    BASE.building.baseUpgrade.collectRate * (0.9 + assumptions.economyScale * 0.1)
                ),
                collectInterval: round2(
                    BASE.building.baseUpgrade.collectInterval /
                        (0.95 + assumptions.economyScale * 0.05)
                ),
                soldierBatchBase: BASE.building.baseUpgrade.soldierBatchBase,
                soldierBatchBonusPerLevel: BASE.building.baseUpgrade.soldierBatchBonusPerLevel,
                soldierBatchMax: roundInt(
                    BASE.building.baseUpgrade.soldierBatchMax *
                        (0.88 + assumptions.playerPowerScale * 0.12)
                ),
                heroBuff: {
                    hpMultiplier: round2(
                        1 +
                            (BASE.building.baseUpgrade.heroBuff.hpMultiplier - 1) *
                                assumptions.playerPowerScale
                    ),
                    attackMultiplier: round2(
                        1 +
                            (BASE.building.baseUpgrade.heroBuff.attackMultiplier - 1) *
                                assumptions.playerPowerScale
                    ),
                    attackIntervalMultiplier: round2(
                        1 -
                            (1 - BASE.building.baseUpgrade.heroBuff.attackIntervalMultiplier) *
                                assumptions.playerPowerScale
                    ),
                    moveSpeedMultiplier: round2(
                        1 +
                            (BASE.building.baseUpgrade.heroBuff.moveSpeedMultiplier - 1) *
                                assumptions.playerPowerScale
                    ),
                    attackRangeBonus: round2(
                        BASE.building.baseUpgrade.heroBuff.attackRangeBonus *
                            assumptions.playerPowerScale
                    ),
                    healPercent: round2(
                        clamp(
                            BASE.building.baseUpgrade.heroBuff.healPercent *
                                assumptions.playerPowerScale,
                            0.1,
                            0.8
                        )
                    ),
                },
            },
            barracks: {
                hp: roundInt(BASE.building.barracks.hp * assumptions.playerPowerScale),
                spawnInterval: round2(
                    BASE.building.barracks.spawnInterval /
                        (0.9 + assumptions.playerPowerScale * 0.1)
                ),
                maxUnits: roundInt(BASE.building.barracks.maxUnits * assumptions.playerPowerScale),
                spawnBatchPerLevel: roundInt(
                    BASE.building.barracks.spawnBatchPerLevel *
                        (0.9 + assumptions.playerPowerScale * 0.1)
                ),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 +
                            (BASE.building.barracks.statMultiplier - 1) *
                                assumptions.playerPowerScale
                    )
                ),
                spawnIntervalMultiplier: round2(
                    1 -
                        (1 - BASE.building.barracks.spawnIntervalMultiplier) *
                            assumptions.playerPowerScale
                ),
                maxUnitsPerLevel: Math.max(1, Math.round(BASE.building.barracks.maxUnitsPerLevel)),
            },
            tower: {
                hp: roundInt(BASE.building.tower.hp * assumptions.playerPowerScale),
                attackRange: round2(BASE.building.tower.attackRange * assumptions.playerPowerScale),
                attackDamage: roundInt(
                    BASE.building.tower.attackDamage * assumptions.playerPowerScale
                ),
                attackInterval: round2(
                    BASE.building.tower.attackInterval /
                        (0.92 + assumptions.playerPowerScale * 0.08)
                ),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 + (BASE.building.tower.statMultiplier - 1) * assumptions.playerPowerScale
                    )
                ),
                attackMultiplier: round2(
                    1 + (BASE.building.tower.attackMultiplier - 1) * assumptions.playerPowerScale
                ),
                rangeMultiplier: round2(
                    1 + (BASE.building.tower.rangeMultiplier - 1) * assumptions.playerPowerScale
                ),
                intervalMultiplier: round2(
                    1 - (1 - BASE.building.tower.intervalMultiplier) * assumptions.playerPowerScale
                ),
                machineGun: { ...BASE.building.tower.machineGun },
            },
            frostTower: {
                hp: roundInt(BASE.building.frostTower.hp * assumptions.playerPowerScale),
                attackRange: round2(
                    BASE.building.frostTower.attackRange * assumptions.playerPowerScale
                ),
                attackDamage: roundInt(
                    BASE.building.frostTower.attackDamage * assumptions.playerPowerScale
                ),
                attackInterval: round2(
                    BASE.building.frostTower.attackInterval /
                        (0.95 + assumptions.playerPowerScale * 0.05)
                ),
                bulletExplosionRadius: round2(
                    BASE.building.frostTower.bulletExplosionRadius * assumptions.playerPowerScale
                ),
                bulletSlowPercent: round2(
                    clamp(
                        BASE.building.frostTower.bulletSlowPercent * assumptions.playerPowerScale,
                        0.15,
                        0.75
                    )
                ),
                bulletSlowDuration: round2(
                    BASE.building.frostTower.bulletSlowDuration * assumptions.playerPowerScale
                ),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 +
                            (BASE.building.frostTower.statMultiplier - 1) *
                                assumptions.playerPowerScale
                    )
                ),
                attackMultiplier: round2(
                    1 +
                        (BASE.building.frostTower.attackMultiplier - 1) *
                            assumptions.playerPowerScale
                ),
                rangeMultiplier: round2(
                    1 +
                        (BASE.building.frostTower.rangeMultiplier - 1) *
                            assumptions.playerPowerScale
                ),
                intervalMultiplier: round2(
                    1 -
                        (1 - BASE.building.frostTower.intervalMultiplier) *
                            assumptions.playerPowerScale
                ),
            },
            lightningTower: {
                hp: roundInt(BASE.building.lightningTower.hp * assumptions.playerPowerScale),
                attackRange: round2(
                    BASE.building.lightningTower.attackRange * assumptions.playerPowerScale
                ),
                attackDamage: roundInt(
                    BASE.building.lightningTower.attackDamage * assumptions.playerPowerScale
                ),
                attackInterval: round2(
                    BASE.building.lightningTower.attackInterval /
                        (0.95 + assumptions.playerPowerScale * 0.05)
                ),
                chainCount: roundInt(
                    BASE.building.lightningTower.chainCount *
                        (0.9 + assumptions.playerPowerScale * 0.1)
                ),
                chainRange: round2(
                    BASE.building.lightningTower.chainRange * assumptions.playerPowerScale
                ),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 +
                            (BASE.building.lightningTower.statMultiplier - 1) *
                                assumptions.playerPowerScale
                    )
                ),
                attackMultiplier: round2(
                    1 +
                        (BASE.building.lightningTower.attackMultiplier - 1) *
                            assumptions.playerPowerScale
                ),
                rangeMultiplier: round2(
                    1 +
                        (BASE.building.lightningTower.rangeMultiplier - 1) *
                            assumptions.playerPowerScale
                ),
                intervalMultiplier: round2(
                    1 -
                        (1 - BASE.building.lightningTower.intervalMultiplier) *
                            assumptions.playerPowerScale
                ),
                chainRangePerLevel: round2(
                    BASE.building.lightningTower.chainRangePerLevel * assumptions.playerPowerScale
                ),
            },
            farm: {
                hp: roundInt(BASE.building.farm.hp),
                incomePerTick: roundInt(
                    BASE.building.farm.incomePerTick *
                        assumptions.economyScale *
                        assumptions.farmIncomeScale
                ),
                incomeInterval: round2(
                    BASE.building.farm.incomeInterval /
                        (0.9 + assumptions.farmIncomeScale * assumptions.economyScale * 0.1)
                ),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 + (BASE.building.farm.statMultiplier - 1) * assumptions.playerPowerScale
                    )
                ),
                incomeMultiplier: round2(
                    1 + (BASE.building.farm.incomeMultiplier - 1) * assumptions.farmIncomeScale
                ),
                stack: { ...BASE.building.farm.stack },
            },
            spa: {
                hp: roundInt(BASE.building.spa.hp * assumptions.playerPowerScale),
                healRadius: round2(
                    BASE.building.spa.healRadius * (0.95 + assumptions.playerPowerScale * 0.05)
                ),
                healPercentPerSecond: round2(
                    BASE.building.spa.healPercentPerSecond * assumptions.playerPowerScale
                ),
                healInterval: round2(
                    BASE.building.spa.healInterval / (0.95 + assumptions.playerPowerScale * 0.05)
                ),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 + (BASE.building.spa.statMultiplier - 1) * assumptions.playerPowerScale
                    )
                ),
            },
            wall: {
                hp: roundInt(BASE.building.wall.hp * assumptions.playerPowerScale),
                tauntRange: round2(BASE.building.wall.tauntRange),
                statMultiplier: ensureBuildingGrowthFloor(
                    round2(
                        1 + (BASE.building.wall.statMultiplier - 1) * assumptions.playerPowerScale
                    )
                ),
            },
        },
        soldier: {
            moveSpeed: round2(BASE.soldier.moveSpeed * assumptions.playerPowerScale),
            baseAttack: roundInt(BASE.soldier.baseAttack * assumptions.playerPowerScale),
            baseHp: roundInt(BASE.soldier.baseHp * assumptions.playerPowerScale),
            attackInterval: round2(
                BASE.soldier.attackInterval / (0.94 + assumptions.playerPowerScale * 0.06)
            ),
            attackRange: round2(BASE.soldier.attackRange * assumptions.playerPowerScale),
            growth: {
                hpLinear: round2(BASE.soldier.growth.hpLinear * assumptions.playerPowerScale),
                hpQuadratic: round2(BASE.soldier.growth.hpQuadratic * assumptions.playerPowerScale),
                attackLinear: round2(
                    BASE.soldier.growth.attackLinear * assumptions.playerPowerScale
                ),
                attackQuadratic: round2(
                    BASE.soldier.growth.attackQuadratic * assumptions.playerPowerScale
                ),
                attackIntervalDecayPerLevel: round2(
                    BASE.soldier.growth.attackIntervalDecayPerLevel * assumptions.playerPowerScale
                ),
                attackIntervalMinMultiplier: round2(
                    1 -
                        (1 - BASE.soldier.growth.attackIntervalMinMultiplier) *
                            assumptions.playerPowerScale
                ),
                attackRangeLinear: round2(
                    BASE.soldier.growth.attackRangeLinear * assumptions.playerPowerScale
                ),
                moveSpeedLinear: round2(
                    BASE.soldier.growth.moveSpeedLinear * assumptions.playerPowerScale
                ),
                sizeLinear: BASE.soldier.growth.sizeLinear,
                sizeQuadratic: BASE.soldier.growth.sizeQuadratic,
                sizeMaxMultiplier: BASE.soldier.growth.sizeMaxMultiplier,
            },
        },
        hero: {
            baseHp: roundInt(BASE.hero.baseHp * assumptions.playerPowerScale),
            baseAttack: roundInt(BASE.hero.baseAttack * assumptions.playerPowerScale),
            attackInterval: round2(
                BASE.hero.attackInterval / (0.94 + assumptions.playerPowerScale * 0.06)
            ),
            attackRange: round2(BASE.hero.attackRange * assumptions.playerPowerScale),
            moveSpeed: round2(BASE.hero.moveSpeed * assumptions.playerPowerScale),
            critRate: round2(clamp(BASE.hero.critRate * assumptions.playerPowerScale, 0.01, 0.5)),
            critDamage: round2(BASE.hero.critDamage * assumptions.playerPowerScale),
        },
        heroLevel: {
            xpBase: roundInt(BASE.heroLevel.xpBase * assumptions.enemyPowerScale),
            xpGrowth: round2(scaleMultiply(BASE.heroLevel.xpGrowth, assumptions.enemyPowerScale)),
            xpPerKill: roundInt(BASE.heroLevel.xpPerKill * assumptions.economyScale),
            xpPerEliteKill: roundInt(BASE.heroLevel.xpPerEliteKill * assumptions.economyScale),
            growth: {
                maxHpMultiply: round2(
                    scaleMultiply(BASE.heroLevel.growth.maxHpMultiply, assumptions.heroGrowthScale)
                ),
                attackMultiply: round2(
                    scaleMultiply(BASE.heroLevel.growth.attackMultiply, assumptions.heroGrowthScale)
                ),
                critRateAdd: round2(
                    BASE.heroLevel.growth.critRateAdd * assumptions.heroGrowthScale
                ),
                critDamageAdd: round2(
                    BASE.heroLevel.growth.critDamageAdd * assumptions.heroGrowthScale
                ),
                moveSpeedMultiply: round2(
                    scaleMultiply(
                        BASE.heroLevel.growth.moveSpeedMultiply,
                        assumptions.heroGrowthScale
                    )
                ),
                attackRangeMultiply: round2(
                    scaleMultiply(
                        BASE.heroLevel.growth.attackRangeMultiply,
                        assumptions.heroGrowthScale
                    )
                ),
                attackIntervalMultiply: round2(
                    1 -
                        (1 - BASE.heroLevel.growth.attackIntervalMultiply) *
                            assumptions.heroGrowthScale
                ),
            },
        },
        heroSkill: {
            weaponDamageMultiplier: round2(assumptions.heroSkillScale),
            weaponAttackIntervalMultiplier: round2(1 - (assumptions.heroSkillScale - 1) * 0.35),
            weaponRangeMultiplier: round2(1 + (assumptions.heroSkillScale - 1) * 0.22),
            weaponTypeDamageScale: {
                machineGun: round2(assumptions.heroSkillScale),
                flamethrower: round2(assumptions.heroSkillScale),
                cannon: round2(assumptions.heroSkillScale),
                glitchWave: round2(assumptions.heroSkillScale),
            },
            buffMultiplyScale: round2(assumptions.heroSkillScale),
            buffAddScale: round2(assumptions.heroSkillScale),
            buffRarityScale: {
                blue: round2(0.95 + assumptions.heroSkillScale * 0.05),
                purple: round2(0.9 + assumptions.heroSkillScale * 0.1),
                gold: round2(0.85 + assumptions.heroSkillScale * 0.15),
            },
        },
        analytics: {
            wave10EnemyCount: 0,
            wave10EnemyHp: 0,
            wave10EnemyAttack: 0,
            wave10CoinBudget: 0,
            suggestedHeroDps: 0,
            wave10KillDistanceToBaseNormalized: 0,
            wave10BreachRate: 0,
            firstBreachWave: 0,
            firstBaseCollapseWave: 0,
            wave10RiskScore: 0,
        },
    };

    const waveIdx = 9;
    const wave10Count =
        profile.waveInfinite.baseCount +
        waveIdx * profile.waveInfinite.countPerWave +
        Math.floor(waveIdx / profile.waveInfinite.countGrowthStepWaves) *
            profile.waveInfinite.countGrowthStepBonus;
    const wave10HpMultiplier = 1 + waveIdx * profile.waveInfinite.hpMultPerWave;
    const wave10AttackMultiplier = 1 + waveIdx * profile.waveInfinite.attackMultPerWave;
    const wave10EnemyHp = roundInt(profile.enemy.baseHp * wave10HpMultiplier);
    const wave10EnemyAttack = roundInt(profile.enemy.baseAttack * wave10AttackMultiplier);
    const wave10CoinBudget =
        roundInt(profile.economy.enemyCoinDrop * wave10Count * 0.28) +
        profile.waveInfinite.bonusPerWave +
        waveIdx * profile.waveInfinite.bonusGrowthPerWave;

    profile.analytics.wave10EnemyCount = wave10Count;
    profile.analytics.wave10EnemyHp = wave10EnemyHp;
    profile.analytics.wave10EnemyAttack = wave10EnemyAttack;
    profile.analytics.wave10CoinBudget = wave10CoinBudget;
    profile.analytics.suggestedHeroDps = roundInt((wave10EnemyHp * wave10Count) / 65);

    const lanePathLength = resolveAverageLanePathLength();
    const wave10Route = estimateRouteSnapshot(profile, 10, lanePathLength);
    profile.analytics.wave10KillDistanceToBaseNormalized = wave10Route.killDistanceToBaseNormalized;
    profile.analytics.wave10BreachRate = wave10Route.breachRate;
    profile.analytics.wave10RiskScore = wave10Route.riskScore;

    let firstBreachWave = 0;
    let firstBaseCollapseWave = 0;
    let predictedBaseHp = BASE.routeModel.defenseAssumptions.baseHp;
    for (let wave = 1; wave <= 60; wave++) {
        const route = estimateRouteSnapshot(profile, wave, lanePathLength);
        if (firstBreachWave === 0 && route.breachRate >= 0.05) {
            firstBreachWave = wave;
        }
        predictedBaseHp -= route.predictedBaseHpLoss;
        if (firstBaseCollapseWave === 0 && predictedBaseHp <= 0) {
            firstBaseCollapseWave = wave;
            break;
        }
    }
    profile.analytics.firstBreachWave = firstBreachWave;
    profile.analytics.firstBaseCollapseWave = firstBaseCollapseWave;

    return profile;
}

export function calculateWaveSnapshot(
    profile: BalanceProfile,
    waveNumber: number
): WaveBalanceSnapshot {
    const wave = Math.max(1, Math.floor(waveNumber));
    const waveIndex = wave - 1;

    const enemyCount =
        profile.waveInfinite.baseCount +
        waveIndex * profile.waveInfinite.countPerWave +
        Math.floor(waveIndex / profile.waveInfinite.countGrowthStepWaves) *
            profile.waveInfinite.countGrowthStepBonus;

    const enemyHpMultiplier = 1 + waveIndex * profile.waveInfinite.hpMultPerWave;
    const enemyAttackMultiplier = 1 + waveIndex * profile.waveInfinite.attackMultPerWave;
    const enemySpeedMultiplier = Math.min(
        profile.waveInfinite.maxSpeedMult,
        1 + waveIndex * profile.waveInfinite.speedMultPerWave
    );

    const enemyUnitHp = roundInt(profile.enemy.baseHp * enemyHpMultiplier);
    const enemyUnitAttack = roundInt(profile.enemy.baseAttack * enemyAttackMultiplier);

    const predictedCoinIncome =
        roundInt(profile.economy.enemyCoinDrop * enemyCount * 0.28) +
        profile.waveInfinite.bonusPerWave +
        waveIndex * profile.waveInfinite.bonusGrowthPerWave;

    return {
        wave,
        enemyCount,
        enemyHpMultiplier: round2(enemyHpMultiplier),
        enemyAttackMultiplier: round2(enemyAttackMultiplier),
        enemySpeedMultiplier: round2(enemySpeedMultiplier),
        enemyUnitHp,
        enemyUnitAttack,
        predictedCoinIncome,
        suggestedHeroDps: roundInt((enemyUnitHp * enemyCount) / 65),
    };
}

export function calculateRouteBalanceSnapshot(
    profile: BalanceProfile,
    waveNumber: number
): RouteBalanceSnapshot {
    return estimateRouteSnapshot(profile, waveNumber, resolveAverageLanePathLength());
}

export function buildRouteRiskTimeline(
    profile: BalanceProfile,
    startWave: number = 1,
    endWave: number = 30
): RouteBalanceSnapshot[] {
    const from = Math.max(1, Math.floor(startWave));
    const to = Math.max(from, Math.floor(endWave));
    const pathLength = resolveAverageLanePathLength();
    const timeline: RouteBalanceSnapshot[] = [];
    for (let wave = from; wave <= to; wave++) {
        timeline.push(estimateRouteSnapshot(profile, wave, pathLength));
    }
    return timeline;
}

export function buildBalanceSchemeSummary(waveNumber: number = 10) {
    return BALANCE_SCHEMES.map(profile => ({
        id: profile.id,
        label: profile.label,
        assumptions: profile.assumptions,
        snapshot: calculateWaveSnapshot(profile, waveNumber),
        routeSnapshot: calculateRouteBalanceSnapshot(profile, waveNumber),
    }));
}

export const BALANCE_PROFILES: Record<BalancePresetId, BalanceProfile> = {
    casual: buildProfile('casual', BALANCE_ASSUMPTIONS.casual),
    standard: buildProfile('standard', BALANCE_ASSUMPTIONS.standard),
    hardcore: buildProfile('hardcore', BALANCE_ASSUMPTIONS.hardcore),
};

/**
 * 切换平衡方案入口：casual | standard | hardcore
 */
export const ACTIVE_BALANCE_PRESET: BalancePresetId = 'standard';

/** 运行时生效的平衡配置（供各配置文件统一读取） */
export const BALANCE = BALANCE_PROFILES[ACTIVE_BALANCE_PRESET];

/** 便于在调试面板或日志里直接展示的方案快照 */
export const BALANCE_SCHEMES = [
    BALANCE_PROFILES.casual,
    BALANCE_PROFILES.standard,
    BALANCE_PROFILES.hardcore,
] as const;
