# Level 3 Redesign Plan

Restructures L3 into three vertically stacked zones with staged progression that mirrors L2's watering-can flow.

## Zones (bottom → top)

1. **MPS** (moving platform section) — 4 platform levels (rows), each with `MPS_PER_ROW = 2` moving platforms (configurable).
2. **SS** (sprout section) — hanging vines (current sparse layout).
3. **TP** (top platform) — where dragon + princess wait, plus the volcano + green seed + purple seed (same as L2).

## Stage flow

```
Stage A: Clear MPS monkeys
  - 1 monkey per pl (4 total). No sprouts grown yet.
  - Kill all 4 → unlock Stage B.

Stage B: Sprouts grow
  - Sprouts start growing (existing rules).
  - TP has TP_MONKEYS_BASE = 2 monkeys (+1 per L3 iteration).
  - TP monkeys patrol TP and the top of each sprout; throw apples at MC.
  - When MC is in SS, Jump button → Swing button. Bat swing reflects apple.
  - Reflected apple kills monkey it hits.
  - Kill all SS/TP monkeys → green watering can spawns on random platform.

Stage C: Green can → green seed
  - Same as L2. Grow green sprout → grey rock spits out on random platform.

Stage D: Rock → volcano
  - Same as L2. Closes volcano.
  - Then: full monkey wave — max monkeys (per iteration) respawn in MPS and SS;
    killed monkeys respawn in 3–5s in same zone.
  - Random purple monkey: 1 in SS, 1 in MPS at a time.

Stage E: Kill both purple monkeys
  - Purple watering can spawns on random platform.
  - Take to purple seed → purple sprout grows to TP.
  - Climb up → touch princess → dragon escapes → MC follows (same as L2 ending).
```

## Configurable constants (new, in `level3/params.ts`)

- `MPS_PER_ROW = 2`
- `TP_MONKEYS_BASE = 2`
- `TP_MONKEY_SPEED_SCALE_PER_ITER = 0.10`
- `APPLE_SPEED_SCALE_PER_ITER = 0.10`
- `RESPAWN_MIN_MS = 3000`, `RESPAWN_MAX_MS = 5000`
- `BAT_SWING_FRAMES`, `BAT_REACH_PX`

## Technical sketch

- **`level3/movingPlatforms.ts`**: replace per-row count derivation with `MPS_PER_ROW`. Drop `getL3RowCounts` usage for MPS rows.
- **`level3/stage.ts`** (new): finite-state machine `'mps' | 'sproutsGrowing' | 'green' | 'rock' | 'wave' | 'purple' | 'climb' | 'ending'` with transition triggers.
- **`level3/topMonkeys.ts`** (new): TP monkey AI — patrol TP, walk onto sprout tops, throw apples downward toward MC.
- **`level3/apples.ts`** (new): apple projectile (gravity arc), collision with MC, collision with bat hitbox → reverse velocity, collision with monkey → kill.
- **`level3/bat.ts`** (new): swing state machine, hitbox in front of MC for N frames.
- **`CavemanVsDragonGame.tsx`**:
  - Detect `mc.zone = 'mps' | 'ss' | 'tp'` from y.
  - When `zone === 'ss'`, jump button label → "Swing" and triggers `bat.startSwing()` instead of jump.
  - Hook L2 watering-can/seed/rock pipeline; reuse existing L2 helpers — only change spawn-zone selection (random moving OR static platform).
  - Stage transitions drive monkey spawning + sprout-growth gate.
- **Sprouts gating**: `sprouts.update()` only runs growth when `stage !== 'mps'`.
- **Respawn timers**: per-zone queues, 3–5s random delay, capped at `maxMonkeysForIter`.

## Out of scope / reuses from L2

- Watering can rendering, seed visuals, volcano close animation, princess/dragon ending — reuse L2 implementations as-is.

## Open questions

- Should TP monkeys also walk down sprouts to attack, or only stand on TP/sprout-tops and throw? (Plan assumes: stand on TP + sprout-tops only.)
- Bat swing cooldown? (Plan: ~20 frames swing window, ~10 frame cooldown — tunable.)
- Purple monkey spawn timing? (Plan: random one-shot during Stage D wave; 1 in SS + 1 in MPS simultaneously.)

Confirm and I'll implement in this order: params + stage FSM → MPS count change → TP monkeys + apples → bat swing + zone-aware jump button → green/rock/purple progression → respawn waves.