# 双人协作模式架构方案

基于对现有 Cocos Creator + Devvit Web 项目的深度代码审计，设计低耦合、不影响单人模式的双人实时协作模式。

---

## 目录

1. [架构方案（分层图 + 模块职责 + 数据流）](#1-架构方案)
2. [冲突点清单](#2-冲突点清单)
3. [冲突避免方案](#3-冲突避免方案)
4. [渐进式改造计划](#4-渐进式改造计划)
5. [数据模型与事件模型](#5-数据模型与事件模型)
6. [API 与 Realtime 方案](#6-api-与-realtime-方案)
7. [测试与验收清单](#7-测试与验收清单)
8. [MVP 范围与延后项](#8-mvp-范围与延后项)

---

## 1. 架构方案

### 1.1 分层总览

```
┌──────────────────────────────────────────────────────────────┐
│                      入口路由层                               │
│   GameController  ──▶  GameModeRouter                        │
│                        ├─ 'solo'  → SoloRuntime              │
│                        └─ 'coop'  → CoopRuntime              │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│                    运行时接口层 (IGameRuntime)                 │
│  ┌─────────────┐                    ┌──────────────┐         │
│  │ SoloRuntime  │                    │ CoopRuntime  │         │
│  │ (现有逻辑    │                    │ (新增，双人)  │         │
│  │  包装零改动) │                    │              │         │
│  └─────────────┘                    └──────────────┘         │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│                    共享核心层 (不含玩家态)                      │
│  MapGenerator / WaveManager / BuildingManager / CombatSystem │
│  CoinDropManager / EffectManager / AudioSettingsManager      │
│  GameConfig / EventManager / PoolManager / CameraRig         │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│                    Devvit 服务层                               │
│  Hono Server (api.ts + coop-routes.ts)                       │
│  Redis (matchState / playerState / arbitration)              │
│  Realtime (connectRealtime ↔ realtime.send)                  │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 关键新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| `IGameRuntime` | `assets/scripts/core/runtime/IGameRuntime.ts` | 运行时接口：定义 hero 查询、输入路由、武器管理、存档等抽象方法 |
| `SoloRuntime` | `assets/scripts/core/runtime/SoloRuntime.ts` | 单人实现：包装现有逻辑，零行为变更 |
| `CoopRuntime` | `assets/scripts/core/runtime/CoopRuntime.ts` | 双人实现：管理两个 PlayerContext、Realtime 通道、仲裁逻辑 |
| `PlayerContext` | `assets/scripts/core/runtime/PlayerContext.ts` | 玩家上下文：持有 heroNode、weaponManager、inputAdapter、UI 绑定 |
| `CoopNetManager` | `assets/scripts/core/runtime/CoopNetManager.ts` | 封装 Devvit Realtime 连接、消息序列化、断线重连、消息队列 |
| `HeroQuery` | `assets/scripts/core/runtime/HeroQuery.ts` | 替代 `gm.hero` 的查询接口：`getLocalHero()` / `getAllHeroes()` / `getNearestHero(pos)` |
| `CoopArbitrator` | `devvit/src/server/routes/coop.ts` | 服务端仲裁路由：房间管理、投币裁决、选择权归属 |
| `CoopSaveManager` | `assets/scripts/core/managers/CoopSaveManager.ts` | 双人存档：独立 key `gvr.save.coop`，含 matchId + 双玩家状态 |

### 1.3 数据流

```
[玩家A输入] ──▶ PlayerContextA.inputAdapter ──▶ HeroA.setInput()
                                                  │
                                                  ▼
                                         CoopNetManager.sendInput()
                                                  │
                                           Devvit Realtime
                                                  │
                                                  ▼
[玩家B客户端] ◀── CoopNetManager.onMessage() ◀── Server broadcast
                     │
                     ▼
              RemoteHeroB.applyRemoteInput()  (插值/预测)

[投币事件] ──▶ CoopNetManager.sendCoinDeposit(padId, playerId, seq)
                     │
              Devvit Server (仲裁)
                     │
                     ▼
              broadcast: { event: 'COIN_DEPOSITED', padId, playerId, seq, isLastCoin }
              broadcast: { event: 'DECISION_OWNER', padId, playerId }  // 最后一枚硬币
```

---

## 2. 冲突点清单

| # | 冲突点 | 严重级别 | 触发条件 | 影响面 |
|---|--------|---------|---------|--------|
| C1 | **全局单 Hero 引用** (`GameManager.hero`) | 🔴 严重 | 任何需要查询 hero 的系统 | Enemy.scanForTargets / Coin.HeroNode / ItemEffectExecutor / CameraRig / SpawnBootstrap / BuildingPad / HeroLevelSystem / 30+ 引用点 |
| C2 | **输入系统仅单目标** (`PlayerInputAdapter._hero`) | 🔴 严重 | 双人需要两套独立输入 | PlayerInputAdapter / Joystick |
| C3 | **武器系统全局单背包** (`HeroWeaponManager` 单例) | 🔴 严重 | 双人各自武器选择 | HeroWeaponManager / WeaponSelectUI / WeaponBarUI / AirdropService / Hero.performAttack |
| C4 | **经验系统绑定单 hero** (`HeroLevelSystem` 单例) | 🟡 中等 | 团队经验需分发给双英雄 | HeroLevelSystem / GameEvents.HERO_LEVEL_UP |
| C5 | **金币磁吸和建造点单 hero** (`Coin.HeroNode` 静态 / `BuildingPad._heroRef`) | 🔴 严重 | 并发拾取/投币互相覆盖 | Coin / BuildingPad / Hero.addCoin / Hero.removeCoin |
| C6 | **事件载荷无 playerId/matchId** | 🟡 中等 | 多人事件串线 | GameEvents 全部 30 种事件 |
| C7 | **HUD/相机/UI 为单人视图** | 🟡 中等 | 双人需要各自武器栏 / 分屏或跟随 | HUDManager / WeaponBarUI / BuffCardUI / CameraFollow |
| C8 | **存档 key 与结构为单人** | 🟢 低 | 单双模式串档 | GameSaveManager (`gvr.save`) |
| C9 | **全局单例污染** (`Singleton<T>` 基类) | 🔴 严重 | ServiceRegistry/单例 持有玩家态 | GameManager / HeroWeaponManager / HeroLevelSystem / BuffCardService / AirdropService |
| C10 | **pause/resume 并发** (`_pauseRequestCount`) | 🟡 中等 | 双人 UI 同时触发暂停 | GameManager.pauseGame/resumeGame |

---

## 3. 冲突避免方案

### C1: 全局单 Hero 引用

**策略**: 引入 `HeroQuery` 适配层，单人模式下返回唯一 hero，双人模式下按语境返回。

```typescript
// assets/scripts/core/runtime/HeroQuery.ts
export class HeroQuery {
    private static _provider: IHeroProvider | null = null;

    static setProvider(p: IHeroProvider) { this._provider = p; }

    /** 单人兼容：返回 "主" hero（单人=唯一，双人=本地玩家） */
    static getLocalHero(): Node | null {
        return this._provider?.getLocalHero() ?? null;
    }
    /** 所有 hero 节点（供 Enemy.scanForTargets 等需要遍历的场景） */
    static getAllHeroes(): Node[] {
        return this._provider?.getAllHeroes() ?? [];
    }
    /** 最近的 hero（供 Coin 磁吸、Enemy 索敌） */
    static getNearestHero(pos: Vec3): Node | null {
        return this._provider?.getNearestHero(pos) ?? null;
    }
}

// SoloRuntime 实现：
class SoloHeroProvider implements IHeroProvider {
    getLocalHero() { return GameManager.instance.hero; }
    getAllHeroes() { const h = this.getLocalHero(); return h ? [h] : []; }
    getNearestHero(_pos: Vec3) { return this.getLocalHero(); }
}
```

**改动范围**:
- `GameManager.hero` 保留不动（SoloRuntime 继续写入）
- `Enemy.scanForTargets` 中 `this.gameManager.hero` → `HeroQuery.getNearestHero(myPos)`
- `Coin.HeroNode` 静态引用 → `Coin.update` 中改用 `HeroQuery.getNearestHero(myPos)`
- `ItemEffectExecutor.heroInvincible` → `HeroQuery.getLocalHero()`

**对单人影响**: SoloHeroProvider 完全等价于现有 `gm.hero`，行为零变更。
**回滚**: 删除 HeroQuery.setProvider 调用即回退到直接引用。

### C2: 输入系统仅单目标

**策略**: `PlayerInputAdapter` 已通过 `setTarget(hero, joystick)` 注入目标，天然支持多实例。双人模式创建两个 `PlayerInputAdapter`（本地 + 远程代理）。

```typescript
// CoopRuntime 中：
const localInput = container.addComponent(PlayerInputAdapter);
localInput.setTarget(localHero, joystick);

// 远程玩家不需要本地 InputAdapter，通过网络消息驱动
const remoteHero = remoteHeroNode.getComponent(Hero);
// CoopNetManager.onRemoteInput → remoteHero.setInput(remoteVec)
```

**对单人影响**: 零。PlayerInputAdapter 不改动。

### C3: 武器系统全局单背包

**策略**: 将 `HeroWeaponManager` 从单例改为"可多实例"——但不动现有单例路径。

```typescript
// 新增: PerPlayerWeaponManager (非单例，per PlayerContext)
export class PerPlayerWeaponManager {
    private _inventory: Map<WeaponType, WeaponInstance> = new Map();
    private _activeWeaponType: WeaponType | null = null;
    // ... 与 HeroWeaponManager 相同的 addWeapon/switchWeapon 逻辑
    // 但事件 emit 附带 playerId
}

// SoloRuntime: 继续使用 HeroWeaponManager.instance（不动）
// CoopRuntime: 每个 PlayerContext 持有独立的 PerPlayerWeaponManager
```

**对单人影响**: 零。HeroWeaponManager 单例保持不变。

### C4: 经验系统绑定单 hero

**策略**: 双人模式下，`HeroLevelSystem` 改为"团队经验池"模式。

```typescript
// CoopRuntime 初始化时：
// 创建一个 TeamLevelSystem，监听 UNIT_DIED 后 addXp
// 升级时 emit HERO_LEVEL_UP 两次（各自的 heroNode）
// SoloRuntime: 继续使用 HeroLevelSystem.instance（不动）
```

**对单人影响**: 零。

### C5: 金币磁吸和建造点

**策略**:
- `Coin.update` 中的 `Coin.HeroNode` → `HeroQuery.getNearestHero(myPos)`：金币被最近的英雄磁吸。
- `BuildingPad.onTriggerEnter/Exit`: 已通过物理触发检测 Hero 组件，天然支持多 Hero 进入。
- **投币仲裁**: 谁投最后一枚硬币的裁决走服务端（见 §6）。

```typescript
// BuildingPad.update 修改（双人模式下）：
// 当两个 hero 都在 pad 区域内时，都可以投币
// 每次投币通过 CoopNetManager 发送到服务端
// 服务端记录 seq，判断 lastCoin 归属
```

**对单人影响**: `Coin.HeroNode` → `HeroQuery.getNearestHero` 是行为等价替换。

### C6: 事件载荷增加上下文

**策略**: 定义 `EventContext` 类型，关键事件 payload 扩展可选字段。

```typescript
export interface EventContext {
    matchId?: string;
    playerId?: string;
    source?: 'local' | 'remote' | 'server';
    timestamp?: number;
    seq?: number;
}

// GameEvents payload 扩展（向后兼容，全部为 optional）
// 例如 WEAPON_PICKED: { weaponId: string; ctx?: EventContext }
// 单人模式下 ctx 为 undefined，所有现有处理器不受影响
```

**对单人影响**: 仅 TypeScript 类型扩展，现有处理器不读取 `ctx` 字段，零影响。

### C7: HUD/相机/UI

**策略**:
- **相机**: 双人模式使用 `DualCameraFollow`（取两 hero 中点 + 动态 zoom），单人不变。
- **武器栏**: 双人本地玩家看自己的武器栏（`WeaponBarUI` 绑定到 `PlayerContext.weaponManager`）。
- **HUD**: 金币/波次/基地 HP 为共享数据，正常显示；武器栏/经验条为玩家态，按 `PlayerContext` 绑定。

**对单人影响**: 零。HUDManager 和所有模块保持不变。

### C8: 存档分离

**策略**: 存档 key 加模式前缀。

```typescript
// 单人: 'gvr.save'（不动）
// 双人: 'gvr.save.coop.{matchId}'
// CoopSaveManager 独立类，不复用 GameSaveManager
```

**对单人影响**: 零。GameSaveManager 不修改。

### C9: 全局单例污染

**策略**: 玩家态服务（WeaponManager / LevelSystem）双人模式下不走单例，改为 `PlayerContext` 持有实例。共享态服务（GameManager / WaveManager / BuildingManager）继续走单例，但清除其中的 `hero` 引用依赖。

| 服务 | 类型 | 单人路径 | 双人路径 |
|------|------|---------|---------|
| GameManager | 共享态 | 单例 (不动) | 单例 (不动) |
| EventManager | 共享态 | 单例 (不动) | 单例 (不动) |
| WaveManager | 共享态 | 单例 (不动) | 单例 (不动) |
| BuildingManager | 共享态 | 单例 (不动) | 单例 (不动) |
| HeroWeaponManager | 玩家态 | 单例 (不动) | PerPlayerWeaponManager × 2 |
| HeroLevelSystem | 玩家态 | 单例 (不动) | TeamLevelSystem (共享池) |
| AirdropService | 共享态 | 单例 (不动) | CoopAirdropService (双选) |
| BuffCardService | 共享态 | 单例 (不动) | 单例 (不动，卡牌效果全局) |
| GameSaveManager | 模式态 | 单例 (不动) | CoopSaveManager (独立) |

**对单人影响**: 零。所有单例继续走现有路径。

### C10: pause/resume 并发

**策略**: 双人模式下，暂停由**主机玩家**或**服务端**决定，不允许客户端单方面暂停（boss 演出除外，演出暂停由本地 Runtime 统一控制）。

```typescript
// CoopRuntime 中：
// pauseGame/resumeGame 由 CoopRuntime 统一路由
// 本地 UI 暂停按钮 → 发送请求到服务端 → 服务端广播 PAUSE
// 本地收到广播后执行 gameManager.pauseGame()
```

**对单人影响**: 零。GameManager.pauseGame 不变。

---

## 4. 渐进式改造计划

### Phase 0: 基础设施层（绝不触碰单人核心路径）

**目标**: 搭建运行时接口、HeroQuery 适配层、事件上下文扩展。

**修改文件**:
- 新增 `assets/scripts/core/runtime/IGameRuntime.ts`
- 新增 `assets/scripts/core/runtime/SoloRuntime.ts`
- 新增 `assets/scripts/core/runtime/HeroQuery.ts`
- 新增 `assets/scripts/core/runtime/PlayerContext.ts`
- 修改 `GameEvents.ts`: 扩展 `EventContext` 可选字段

**对单人影响**: 零。仅新增文件 + 类型扩展。
**回滚**: 删除新文件。

### Phase 1: Hero 引用解耦

**目标**: 将 `gm.hero` / `Coin.HeroNode` 硬引用替换为 `HeroQuery` 间接查询。

**修改文件**:
- `Enemy.ts` → `scanForTargets` 使用 `HeroQuery.getNearestHero`
- `Coin.ts` → `update` 使用 `HeroQuery.getNearestHero`
- `ItemEffectExecutor.ts` → 使用 `HeroQuery.getLocalHero`
- `SpawnBootstrap.ts` → 设置 `HeroQuery.setProvider(SoloHeroProvider)`
- `GameManager.ts` → `hero` 属性保留，SoloHeroProvider 读取它

**对单人影响评估**: `HeroQuery.getNearestHero` 在 SoloHeroProvider 下等价于 `gm.hero`。行为不变。
**验证**: 运行单人完整一局，确认敌人索敌/金币磁吸/道具使用正常。
**回滚**: 恢复直接引用。

### Phase 2: 双人网络层

**目标**: 搭建 Devvit Realtime 通信基础和服务端仲裁路由。

**修改/新增文件**:
- 新增 `assets/scripts/core/runtime/CoopNetManager.ts`
- 新增 `devvit/src/server/routes/coop.ts`
- 修改 `devvit/src/server/index.ts`: 挂载 coop 路由
- 修改 `devvit/devvit.json`: 添加 `realtime: true` 权限

**对单人影响**: 零。仅新增代码和服务端路由。
**回滚**: 删除 coop 路由。

### Phase 3: CoopRuntime 核心实现

**目标**: 实现双人 Runtime，包括双 Hero 创建、双输入、远程同步。

**修改/新增文件**:
- 新增 `assets/scripts/core/runtime/CoopRuntime.ts`
- 新增 `assets/scripts/core/runtime/CoopHeroProvider.ts`
- 新增 `assets/scripts/core/runtime/PerPlayerWeaponManager.ts`
- 新增 `assets/scripts/core/runtime/TeamLevelSystem.ts`
- 修改 `GameController.ts`: 根据模式选择 Runtime（`if coop → CoopRuntime`，else → SoloRuntime）
- 新增 `assets/scripts/core/runtime/CoopStartFlow.ts`

**对单人影响评估**: GameController 唯一改动是入口添加一个 if 分支，else 分支完全走现有逻辑。
**回滚**: 删除 if 分支。

### Phase 4: 双人 UI 和相机

**目标**: 双人武器栏、共享 HUD、双人相机。

**新增文件**:
- `assets/scripts/ui/CoopWeaponBarUI.ts`
- `assets/scripts/core/camera/DualCameraFollow.ts`
- `assets/scripts/ui/hud/HUDCoopModule.ts`

**对单人影响**: 零。纯新增。

### Phase 5: 仲裁与投币决策权

**目标**: 服务端实现"最后一枚硬币决策权"逻辑。

**修改文件**:
- `devvit/src/server/routes/coop.ts`: 添加投币仲裁端点
- `BuildingPad.ts`: 双人模式下投币走网络（通过 Runtime 注入的 adapter）

**对单人影响**: BuildingPad 改动通过 `runtime.isCoopMode` 分支隔离。
**回滚**: 删除分支。

### Phase 6: 存档、匹配大厅、Polish

**目标**: 双人存档、房间匹配 UI、断线重连。

**新增文件**:
- `assets/scripts/core/managers/CoopSaveManager.ts`
- `assets/scripts/ui/home/CoopLobbyPage.ts`

**对单人影响**: 零。

---

## 5. 数据模型与事件模型

### 5.1 核心数据模型

```typescript
/** 对局状态（服务端权威） */
interface MatchState {
    matchId: string;           // UUID
    postId: string;            // Reddit post ID
    status: 'waiting' | 'playing' | 'finished';
    createdAt: number;
    players: PlayerSlot[];     // 最多 2
    teamXp: number;
    teamLevel: number;
    sharedCoins: number;       // 共享金币池（GameManager.coins 的服务端镜像）
    waveNumber: number;
    buildingDecisions: BuildingDecision[];
    seq: number;               // 全局递增序列号
}

interface PlayerSlot {
    playerId: string;          // Reddit username
    slot: 0 | 1;
    connected: boolean;
    lastHeartbeat: number;
    heroState: {
        position: { x: number; z: number };
        hp: number;
        maxHp: number;
        level: number;
    };
    weapons: WeaponSaveState[];
    activeWeaponType: string | null;
}

interface BuildingDecision {
    padId: string;
    decisionOwnerId: string;   // 获得选择权的 playerId
    resolvedAt: number;
    seq: number;
}
```

### 5.2 网络消息类型

```typescript
/** 客户端 → 服务端 */
type ClientMessage =
    | { type: 'JOIN_MATCH'; matchId: string; playerId: string }
    | { type: 'INPUT'; dx: number; dz: number; seq: number; t: number }
    | { type: 'COIN_DEPOSIT'; padId: string; amount: number; seq: number; t: number }
    | { type: 'WEAPON_PICK'; weaponId: string; seq: number }
    | { type: 'BUFF_PICK'; cardId: string; seq: number }
    | { type: 'HEARTBEAT'; t: number }
    | { type: 'PAUSE_REQUEST' }
    | { type: 'ITEM_USE'; itemId: string; seq: number };

/** 服务端 → 客户端（广播） */
type ServerMessage =
    | { type: 'MATCH_STATE'; state: MatchState }
    | { type: 'PLAYER_INPUT'; playerId: string; dx: number; dz: number; seq: number; t: number }
    | { type: 'COIN_DEPOSITED'; padId: string; playerId: string; amount: number; remaining: number; seq: number }
    | { type: 'DECISION_OWNER'; padId: string; playerId: string; eventType: 'tower_select' | 'buff_card'; seq: number }
    | { type: 'WEAPON_ASSIGNED'; playerId: string; weaponId: string; seq: number }
    | { type: 'LEVEL_UP'; teamLevel: number; seq: number }
    | { type: 'PLAYER_DISCONNECTED'; playerId: string }
    | { type: 'PLAYER_RECONNECTED'; playerId: string; state: PlayerSlot }
    | { type: 'GAME_PAUSE'; seq: number }
    | { type: 'GAME_RESUME'; seq: number }
    | { type: 'MATCH_OVER'; victory: boolean; seq: number };
```

### 5.3 幂等键与仲裁规则

| 事件 | 幂等键 | 仲裁规则 |
|------|--------|---------|
| COIN_DEPOSIT | `{matchId}:{padId}:{seq}` | 服务端按 seq 去重；同 seq 只处理首条 |
| DECISION_OWNER | `{matchId}:{padId}:{eventType}` | 最后一枚硬币的 playerId 获得决策权；tie-break: 更早 timestamp → 更小 playerId 字典序 |
| WEAPON_PICK | `{matchId}:{playerId}:{seq}` | 各自独立，无冲突 |
| BUFF_PICK | `{matchId}:{seq}` | 决策权 owner 的选择生效 |
| ITEM_USE | `{matchId}:{playerId}:{seq}` | 幂等执行，重复 seq 忽略 |

**tie-break 确定性规则**:
1. 优先比较 `serverReceiveTimestamp`（服务端收到消息的时间）
2. 若 timestamp 相同（< 1ms），按 `playerId` 字典序升序

---

## 6. API 与 Realtime 方案

### 6.1 通信架构

```
┌───────────┐   connectRealtime    ┌─────────────────┐   realtime.send   ┌───────────┐
│ Client A  │ ◀═══════════════════▶│  Devvit Server  │◀═══════════════▶  │ Client B  │
│ (WebView) │   channel:           │  (Hono + Redis) │   channel:        │ (WebView) │
│           │   'match-{matchId}'  │                 │   'match-{matchId}'│           │
└───────────┘                      └─────────────────┘                    └───────────┘
     │                                     │
     │  POST /api/coop/create-match        │
     │  POST /api/coop/join-match          │
     │  POST /api/coop/action   ───────────┘
     │  GET  /api/coop/match-state
```

**不使用自建 WebSocket**。全部走 Devvit Realtime（`@devvit/web/client` 的 `connectRealtime` + `@devvit/web/server` 的 `realtime.send`）。

### 6.2 房间管理

```typescript
// POST /api/coop/create-match
// → 生成 matchId, 存入 Redis, 返回 { matchId, channel }
// → 创建者自动加入 slot 0

// POST /api/coop/join-match  { matchId }
// → 验证 match 存在且 status=waiting
// → 加入 slot 1
// → 广播 MATCH_STATE 给两个客户端
// → 双方开始游戏

// Redis keys:
// match:{matchId}          → JSON(MatchState)
// match:{matchId}:actions  → Sorted Set (seq → action JSON) 用于重放
```

### 6.3 状态同步策略

**权威模型**: 服务端权威仲裁 + 客户端预测。

| 状态类型 | 权威方 | 同步方式 |
|---------|-------|---------|
| hero 位置/输入 | 各客户端本地权威 | 广播 INPUT 消息，对方客户端插值 |
| 金币池 | 服务端权威 | COIN_DEPOSITED 广播确认 |
| 波次进度 | 主机客户端（slot 0） | 广播 WAVE_START / WAVE_COMPLETE |
| 建筑建造 | 服务端仲裁 | DECISION_OWNER 确认后本地执行 |
| 武器选择 | 各自客户端 | WEAPON_ASSIGNED 广播 |
| 团队经验 | 主机客户端 | LEVEL_UP 广播 |
| 暂停/恢复 | 服务端权威 | GAME_PAUSE / GAME_RESUME 广播 |

### 6.4 断线重连

```typescript
// CoopNetManager 内部：
// 1. connectRealtime 的 onDisconnect 触发后：
//    - 标记 _disconnected = true
//    - 启动重连计时器（3s 间隔，最多 5 次）
//    - 本地 HUD 显示"连接中..."
//
// 2. 重连成功后：
//    - POST /api/coop/rejoin { matchId, playerId, lastSeq }
//    - 服务端返回 { state: MatchState, missedActions: Action[] }
//    - 客户端按 seq 顺序重放 missedActions
//    - 同步完成后恢复正常游戏
//
// 3. 重连失败（5 次后）：
//    - 显示"连接断开"弹窗
//    - 提供"重试"/"退出"选项
//
// 4. 对方断线：
//    - 收到 PLAYER_DISCONNECTED
//    - 对方 hero 暂停动画，显示断线图标
//    - 30s 后若未重连，游戏继续（AI 接管或 solo 模式降级）
```

### 6.5 延迟补偿

- **hero 移动**: 纯客户端本地权威，不做服务端校验（信任客户端）。对方 hero 使用 150ms 插值平滑。
- **金币投入**: 客户端乐观预测（本地先扣除 hero 金币），服务端确认后对方客户端同步。若服务端拒绝（如 pad 已满），客户端回滚。
- **武器选择**: 各自独立，无需补偿。

### 6.6 Devvit Realtime 限制与权衡

| 约束 | 影响 | 缓解措施 |
|------|------|---------|
| 消息无保序保证 | 乱序到达 | 每条消息带 `seq`，客户端按 seq 排序 buffer，超时 200ms 强制应用 |
| 无 P2P，必须经服务端 | 延迟偏高 (~100-300ms) | hero 移动用客户端权威+插值，不走服务端验证 |
| channel 名不能含 `:` | - | 使用 `match-{matchId}` 格式 |
| 单向：客户端只能接收 | 客户端发消息必须走 HTTP POST | 高频输入聚合：每 100ms 打包一次 INPUT 发 POST，服务端转发 |

**关键权衡**: Devvit Realtime 是**单向**的（服务端 → 客户端），客户端发消息需要走 HTTP API。这意味着：
- 输入同步不能每帧发送（太多 HTTP 请求），需要聚合（100ms 间隔）
- 适合"低频高价值"消息（投币、武器选择、暂停）
- hero 移动的实时感依赖客户端本地权威 + 对方客户端插值

---

## 7. 测试与验收清单

### 7.1 单人回归用例（全部必须通过）

| # | 用例 | 验证方法 |
|---|------|---------|
| S1 | 默认入口进入单人模式 | 启动游戏 → 确认 HomePage 显示 → 点击开始 → 单人游戏正常 |
| S2 | 敌人正常索敌 hero | 观察 enemy 追踪 hero，不卡死/不忽略 |
| S3 | 金币磁吸正常 | 击杀 enemy → 金币飞向 hero |
| S4 | 建造点投币正常 | hero 携带金币进入 pad → 自动投币 → 建造完成 |
| S5 | 武器选择和切换 | 空投选择武器 → 武器栏显示 → 切换正常 |
| S6 | 经验和升级 | 击杀足够敌人 → 升级 → VFX 播放 |
| S7 | 存档和继续 | 打到 wave 5 → 切后台 → 重进 → 继续游戏 |
| S8 | Boss 演出 | boss 出场 → 相机移动 → 暂停 → 返回 |
| S9 | 暂停/恢复 | 设置面板暂停 → 恢复 → 游戏正常 |
| S10 | 游戏结束和重启 | 基地被摧毁 → Game Over → 重启 |
| S11 | 道具使用 | boss 宝箱 → 选择道具 → 使用 → 效果正确 |
| S12 | Reddit 部署后功能 | 部署到 r/granny_vs_robot_dev → 完整一局 |

### 7.2 双人核心用例

| # | 用例 | 验证方法 |
|---|------|---------|
| D1 | 双人匹配 | 玩家 A 创建房间 → 玩家 B 加入 → 双方看到对方 hero |
| D2 | 双人独立移动 | A 和 B 各自移动，互不干扰，对方看到平滑移动 |
| D3 | 并发投币 | A 和 B 同时向同一 pad 投币 → 服务端正确累加 → 最后一枚决定决策权 |
| D4 | 独立选武器 | A 选机枪，B 选火焰 → 各自武器栏正确 → 各自攻击使用自己的武器 |
| D5 | 共享经验 | 任一方击杀 → 双方同时升级 |
| D6 | 共享金币池 | A 拾取金币 → 全局金币增加 → B 的 HUD 同步更新 |
| D7 | 同时建造不同建筑 | A 在 pad1 投币，B 在 pad2 投币 → 互不干扰 |
| D8 | 选择权裁决 | A 投最后一枚到 tower pad → A 看到选择 UI → B 不看到 |

### 7.3 压力与异常用例

| # | 用例 | 验证方法 |
|---|------|---------|
| E1 | 延迟模拟 | 人为加 500ms 延迟 → hero 移动仍可玩 → 投币仍正确裁决 |
| E2 | 乱序消息 | 模拟消息乱序到达 → seq 排序 → 状态一致 |
| E3 | 重复消息 | 同 seq 消息发两次 → 幂等处理 → 不重复执行 |
| E4 | 断线重连 | B 断线 → A 继续游戏 → B 重连 → 状态同步 |
| E5 | 断线超时 | B 断线 30s+ → A 进入 solo 降级模式 |
| E6 | 同时暂停 | A 和 B 同时点暂停 → 只暂停一次 → 任一方恢复 |

---

## 8. MVP 范围与延后项

### MVP（最小可上线版本）

| 功能 | 范围 |
|------|------|
| Phase 0-1 | HeroQuery 适配层 + SoloRuntime 包装 |
| Phase 2 | Devvit Realtime 基础 + 服务端房间管理 |
| Phase 3 | CoopRuntime：双 hero、双输入、远程同步 |
| 共享经验 | 团队经验池，双方同时升级 |
| 共享金币 | 金币拾取 → 全局池，双方 HUD 同步 |
| 投币决策权 | 服务端仲裁"最后一枚硬币" |
| 独立武器 | 各自武器背包和武器栏 |
| 断线处理 | 基本断线提示 + 重连 |

**MVP 不含（延后项）**:

| 延后功能 | 原因 |
|---------|------|
| 双人存档/继续 | 复杂度高，MVP 先不支持中途存档 |
| 分屏/小地图 | UI 复杂度高，先用中点相机 |
| AI 接管断线玩家 | 需要 hero AI 系统，延后 |
| 双人 buff 卡牌选择 | MVP 先共享决策权 owner 选择 |
| 双人道具分配 | MVP 先共享使用 |
| 匹配大厅/邀请码 | MVP 先简单房间号匹配 |
| 反作弊 | MVP 先信任客户端 |
| 观战模式 | 后续功能 |

---

## 附录：绝不触碰的单人核心路径文件

以下文件在整个改造过程中**不做行为性修改**（仅允许添加 optional 字段 / import 新类型）：

- `GameManager.ts` — 保留 `hero` 属性、金币/暂停逻辑不变
- `HeroWeaponManager.ts` — 单例路径不变
- `HeroLevelSystem.ts` — 单例路径不变
- `BuffCardService.ts` — 不变
- `AirdropService.ts` — 不变
- `WaveManager.ts` — 不变
- `WaveLoop.ts` — 不变
- `GameSaveManager.ts` — 不变
- `HUDManager.ts` — 不变
- `HomePage.ts` — 仅新增"双人模式"按钮入口
- `GameStartFlow.ts` — SoloRuntime 走原有路径
- `PlayerInputAdapter.ts` — 不变

仅以下文件需要**微改**（添加 HeroQuery 间接查询，行为等价）：
- `Enemy.ts` — `scanForTargets` 中 `gm.hero` → `HeroQuery.getNearestHero`
- `Coin.ts` — `update` 中 `Coin.HeroNode` → `HeroQuery.getNearestHero`
- `ItemEffectExecutor.ts` — `gm.hero` → `HeroQuery.getLocalHero`
- `SpawnBootstrap.ts` — 初始化 HeroQuery.setProvider
