# Level 4 — Dragon Boss Fight

A self-contained Popeye-style boss level. All code lives in `src/components/game/level4/` and never imports from level1/2/3 internals (only shared `constants.ts` for canvas size and the PLATFORMS/LADDERS arrays it mutates locally, mirroring how L2/L3 do it).

## Files to create

```
src/components/game/level4/
  params.ts        // all tunables (per-iteration formulas)
  layout.ts        // platforms, ladders (2 sprouts per gap), volcano, sprout runtime (reuses L2-style cycle re-implemented locally)
  heart.ts         // princess heart spawner + leaf-fall physics
  dragon.ts        // dragon AI: walk, shrink, flash, grow, run-away, stomp, die
  monkeys.ts       // L4 monkey spawner with 2–5s same-level respawn
  volcano.ts       // L4 volcano + rocks (no green can to stop it)
  ending.ts        // princess hug → thank-you → new dragon kidnaps → return to L1 next iter
  level4.ts        // top-level update/render orchestrator + state machine
  types.ts
```

Plus copy `user-uploads://heart_NoBG.png` → `src/assets/heart.png` and import.

## Per-iteration formulas (params.ts)

- `heartsToFill(iter)` = `min(5, 2 + (iter - 1))`  → 2,3,4,5,5,5…
- `shrinkDurationSec(iter)` = `max(3, 10 * 0.9^(iter-1))`
- Flash window = last 2 s of shrink, alternating green/purple
- `hitsToKill(iter)` = `3` until heartsToFill == 5; afterwards `3 + (iter - iterWhenReached5)`
- `dragonSpeedMult(iter)` = `1 * 1.1^(iter-1)` (× caveman speed)
- Shrunk dragon runs from caveman at 50% of its normal walk speed
- Monkeys = `2 + (iter - 1)`; respawn same row in random 2–5 s

## Heart "leaf fall"

Spawn from princess head; horizontal sway via sine + small random drift, slow terminal velocity, gentle rotation. Lands on first platform it intersects (or top of MC). Picking it up bumps heart meter; when full, dragon shrinks.

## Dragon FSM

`walk` → (meter full) `shrunk` (runs away, MC can stomp) → on stomp `birdStun` (2 s, spinning bird overlay, still small, hit counter++, purple box count--) → `shrunk` resumes OR if shrink timer expires `flash` (2 s green/purple) → `walk`. On hit-count reaching `hitsToKill` → `dying` → purple watering can spawns on a random platform.

## Sprouts & volcano

Local re-impl of the L2 wither/regrow cycle (copy the algorithm, not the import) with same numeric params. Two sprouts per gap, random L/R within gap, with same gap-non-empty guarantee. Purple top sprout = win path. Volcano rocks behave like L2 (no green can exists).

## Ending

On purple sprout climb + reaching princess: play hug sprite, "Thank you!" speech bubble (2 s), spawn a new dragon that grabs her and flies offscreen, then transition to L1 with `iter += 1`.

## Wiring into `CavemanVsDragonGame.tsx`

- Add round mapping for L4 (round 16+ based on L3 = round 12–15, 4 iters per level).
- Add `startInLevel4Test` callback (sets round to L4 iter 1).
- Tap shortcut: 4 taps → already used for L3 iter 4. Bump: **4 taps on attract/main → L4 iter 1** (per user request). Move the L3-iter4 shortcut to 5 taps to keep it.
- Render delegates to `level4.ts` when current level === 4.
- Ensure no L4 code is imported by L1/L2/L3 paths.

## Assets

- `src/assets/heart.png` (from upload)
- Spinning bird = simple emoji/CSS or small inline SVG stars-circle (no new asset needed unless requested).

## Out of scope (will ask if needed)

- Sprite art for dragon shrinking, hug animation, kidnapping cinematic — using existing dragon/princess sprites scaled + simple tween unless you want custom art.

Confirm and I'll build it in this order: params + layout + heart → dragon FSM + stomp/bird → monkeys + volcano + sprouts → ending + L1 handoff → tap-shortcut + round mapping.
