# Level 4 — Rebuild to match the annotated sketch

Canvas stays 512×480. Layout compressed into 6 vertical bands. All code stays under `src/components/game/level4/`, no L1/L2/L3 imports.

## Annotated path legend (from sketch)

- **0** princess (top platform, left of K)
- **K** volcano (top platform, right) — launches grey rocks
- **1** caveman spawn (bottom-left ground)
- **2** dragon spawn next to princess, then drops to mid-band on level start
- **3** rock spawn/exit anchor on top platform's far-left side
- **A** rock rest slot on the E-valley (kick-launch point)
- **B** rock falling target → lands on dragon
- **C** decision points on rolling paths (top + mid tent)
- **D** green sprout (mid-left stub → upper Band 2 left platform)
- **E** purple sprout (E-valley → princess platform)
- **F**, **G** corner climb/decision points on lower bands
- **H** three vertical-arrow sprouts acting as ladders between bands
- **L** vertical "rock falls straight down" arrow from princess platform → E/A
- **M** moving platforms (red ←→ arrows)
- **N** mid-meeting point of paired movers (Band 5)

## Layout (top → bottom)

```text
Band 1  y≈60   PRINCESS PLATFORM [princess 0 | C | K volcano]   + small top-right stub
                                  ↓ L (vertical drop)            \ ramp down-right
Band 2  y≈155  LEFT STUB [3 entry]→\ valley ↘ flat[E][A]/        ↗ ramp continues up-right
                                                                ↘ ramp down to Band 3 right
Band 3  y≈260  [D + left flat]  ←M→  [/‾tent C‾\]  ←M→  [right flat]
                                       dragon 2 lands here       ↕H2 down to Band 4 right
Band 4  y≈330  [left stub]                ←M→ (center mover)            [right stub above H2]
                ↕H1 down to Band 5 left
Band 5  y≈395  [F flat \ramp down]  ←M→ [mover]—N—[mover] ←M→  [/ramp G flat]
                                                                ↕H3 down to Band 6 right
Band 6  y≈452  [left ground (caveman 1)]   ←M→ center mover    [right ground]
```

## Mechanics (matches sketch arrows)

### Rock pipeline (path: K → 3/right-edge → C → either A or right-ramp cascade → B)
- K launches grey rock every spawn-tick (L1 `getRoundDifficulty` cadence keyed off L4 iter).
- Rock rolls left along Band 1 to **C** (decision point).
  - If slot A is empty → rock drops via **L** straight down into the E-valley and rolls to rest at **A**.
  - If A occupied → rock continues, falls off Band 1 right edge, bounces down right-side ramps (Band1→2→3 right side) killing caveman on contact (L1 barrel behavior), despawns off-screen.
- Standing on A + press Jump/Action → kick: rock arcs along **B** path to land on dragon.
  - Hit → dragon enters `downed` 5s. Final hit (iter X = X hits) → dragon dying anim + corpse.

### Sprouts (L2-style wither/regrow, local copy)
- **D** green sprout: ladder Band 3 left → Band 2 left stub. Grown by green watering can.
- **E** purple sprout: ladder E-valley → princess platform. Each purple watering grows it by `1/X` of full at iter X. Fully grown → climb E to princess to end level.
- **H1, H2, H3**: ladders between bands as drawn. Each on its own wither/regrow cycle.
- Watering E knocks D back to seed (re-earn green can to regrow).

### Watering cans
- Green can: spawns on random platform after the **last monkey** dies (L2 rule).
- Purple can: spawns on random platform after **each** successful dragon hit.

### Monkeys (light-blue ovals = anchor slots)
- ~12 anchor slots across Bands 3–6 (per sketch positions).
- Distribution: iter1=2 (1 per platform max), iter2=3, iter3=4, iter4=5 (1 platform doubles), …, cap = **20** total. Mirrors L1's `buildMonkeyDistribution` algorithm, locally re-implemented.
- After last monkey dies → green can spawns. After D dies from purple watering while dragon still alive → respawn full monkey set.

### Moving platforms M
- Each M oscillates horizontally between two solid endpoints, bouncing off them.
- Band-5 pair: starts moving toward each other, bounces off each other at **N**, then bounces off outer solid platforms — opposite-phase forever.
- Riders (caveman, dragon, monkeys) inherit vx while standing on a mover.

### Dragon (2)
- Spawns next to princess on Band 1. On level start: animated jump-down to Band 3 center (tent area).
- Roams Band 3 (walk + jump short gaps + ride M). Touch = caveman dies.
- States: `intro-jump | roam | downed (5s) | dying`. Hits-to-kill = current iter.

### Caveman (1)
- Spawns Band 6 far-left ground. Walk + jump.
- Jump rule kept from prior fix: jump = same-platform hop only, EXCEPT when standing on A → kick (launches rock along path B).
- Death/respawn/`_pendingGameOver` flow stays untouched.

## File plan (full rewrite under `src/components/game/level4/`)

- `layout.ts` — platforms, ramps, movers (with pair-bounce N), sprout anchors (D, E, H1–H3), monkey anchors, point A, princess/volcano/dragon spawn coords.
- `params.ts` — keep iter scaling; add `KICK_VX/VY`, `DOWNED_SEC=5`, `PURPLE_GROW_FRAC=1/iter`. Drop unused HEARTS_*.
- `rocks.ts` — spawn from K, roll, C-decision, L-drop to A, A-occupancy, kick along B, dragon hit, right-ramp cascade.
- `dragon.ts` — `intro-jump | roam | downed | dying`.
- `sprouts.ts` — D, E, H1–H3 cycle; E partial growth.
- `cans.ts` — green/purple spawn + pickup + water.
- `monkeys.ts` — distribution + respawn rule.
- `movers.ts` — horizontal movers + pair-bounce N.
- `level4.ts` — orchestrator + renderer for the new layout.
- `types.ts` — new state shape.

## Out of scope (will ask before adding)

- Volcano fireballs (sketch shows K as rock launcher only — fireballs removed).
- New sprite art (reuses existing dragon/princess/caveman/monkey/sprout/can/rock).
- Pixel-perfect tuning beyond a first playable pass.

Confirm and I'll build it module-by-module.