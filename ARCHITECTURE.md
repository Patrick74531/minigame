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
- None (keep cross-module calls explicit and simple for now).

## Known Alternatives (Documented)
- `gameplay/wave/WaveManager` (infinite mode)

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
