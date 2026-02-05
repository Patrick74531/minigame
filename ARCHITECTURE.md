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
3. **Wave access is read-only via WaveService**  
   UI reads wave snapshots from `assets/scripts/core/managers/WaveService.ts`.
4. **Combat access via CombatService**  
   New combat logic should register as provider rather than creating a new global.
5. **Configuration first**  
   Tuning values and spawn layouts live in `assets/scripts/data/GameConfig.ts`.
6. **Pooling lifecycle**  
   Components that are pooled implement `onSpawn/onDespawn` and reset state.

## Current Cross-System Facades
- **WaveService**: Snapshot provider for UI and other systems
- **CombatService**: Access point for active combat provider
- **ServiceRegistry**: Central registry for global services

## Known Alternatives (Documented)
- `gameplay/wave/WaveManager` (infinite mode) vs `gameplay/wave/WaveConfigManager` (config mode)
  - `core/managers/WaveManager` is a re-export for legacy imports.

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
