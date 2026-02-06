# KingShit Architecture

> Goal: High maintainability, easy extension, minimal coupling.

## Overview

- **Entry**: `assets/scripts/GameController.ts` (assembly & orchestration only)
- **Core systems**: `assets/scripts/core/**`
- **Gameplay**: `assets/scripts/gameplay/**`
- **UI**: `assets/scripts/ui/**`
- **Data/config**: `assets/scripts/data/**`

## Key Rules (Extension Safe)

1. **GameController stays thin**  
   Only wire systems; do not add gameplay logic here.
2. **Events must be typed**  
   When adding/modifying events, update `assets/scripts/data/GameEvents.ts` payload map.
3. **Configuration first**  
   Tuning values and spawn layouts live in `assets/scripts/data/GameConfig.ts`.
4. **Pooling lifecycle**  
   Components that are pooled implement `onSpawn/onDespawn` and reset state.

## Current Cross-System Facades

- **ServiceRegistry**: `assets/scripts/core/managers/ServiceRegistry.ts` (global, long-lived services only)
- **WaveService**: `assets/scripts/core/managers/WaveService.ts` (read-only wave snapshot API for UI/analytics)
- **CombatService**: `assets/scripts/core/managers/CombatService.ts` (centralized combat provider entry used by `CombatSystem`)

## Known Alternatives (Documented)

- `gameplay/wave/WaveManager` (infinite mode)
- `gameplay/combat/CombatSystem` (centralized targeting, active)

## Roguelike Buff Card System

- **BuffCardService**: `assets/scripts/gameplay/roguelike/BuffCardService.ts` — card draw & effect application logic
- **BuffCardUI**: `assets/scripts/ui/BuffCardUI.ts` — 3-card selection overlay (pause → pick → resume)
- **Config**: `GameConfig.BUFF_CARDS` — card pool definitions (add new cards here)
- **Events**: `BASE_UPGRADE_READY` → triggers card draw; `BUFF_CARD_PICKED` → applies chosen card
- **Flow**: Base upgrade → emit `BASE_UPGRADE_READY` → BuffCardService draws 3 cards → BuffCardUI shows overlay → player picks → `BUFF_CARD_PICKED` → Hero.applyBuffCard() → resume game

## TODO Backlog (Non-Blocking)

- Building ownership tracking for spawned units
- Building destroy VFX
- Building role-to-enum mapping in factory
- Farm income logic
- Bullet hit particles
- VisualEffect pooling

## Recommended Extension Flow

1. Add data to `GameConfig` or registries.
2. Implement logic in gameplay/core modules.
3. Register providers (Wave/Combat) if required.
4. Use events for cross-module communication.

## Combat Targeting Flow (Active)

- **CombatSystem present**: centralized targeting assigns Soldier targets via `CombatService`.
- **CombatSystem absent**: Soldier performs a lightweight local scan as a safety fallback.
