# Level 4 Redesign — Plan

Full rewrite of Level 4 keeping the same `src/components/game/level4/` isolation. No imports into/from L1/L2/L3.

## New layout (mirrors the sketch)

Six "zones" stacked top-to-bottom, ~512×880 logical area but rendered into the existing 512×480 canvas (camera is fixed, layout compressed to fit current canvas). Coordinates are approximate; exact pixels tuned during implementation:

```
Top band      : Princess platform (with Princess 0 + Volcano K on right).
                Rock spawns from K, rolls left along this platform to point C.
                Decision at C: if no rock at A → fall to mid-left platform's A;
                else continue right and zig-zag down the right-side ramps.
Mid band L    : Kick ledge platform holding point E (purple sprout base) and
                point A (rock rest spot). Green sprout D rises from a lower-left
                stub platform up to this ledge so caveman can climb to A.
                Vertical drop arrow L = clear path from above platform → A.
Mid band      : Dragon roaming band (where 2 lives). Below kick ledge so a rock
                kicked from A falls onto Dragon (path B).
Lower bands   : Two rows of moving platforms (red-arrow tracks) connected by
                static ramps with monkeys (4) and several pickup spots (blue
                ellipses = potential watering-can spawn anchors).
Bottom band   : Caveman spawn platform on left (1) + more moving platforms +
                a tall stub H acting as a wall/jump-blocker.
```

Static platforms = green slabs. Moving platforms = short green slabs that translate horizontally between two stops (red double arrows). Vertical red arrows = vertical movers.

## Entities & mechanics

### Rock pipeline (replaces hearts entirely)
- Volcano K periodically launches a grey rock (same sprite as L1 barrel/rock). It lands on the top princess platform near C.
- Rolling logic at C:
  - If `A` (rest slot on kick ledge) is empty → rock falls down the L gap onto the kick ledge and rolls left, coming to rest at A.
  - Else → rock rolls right along princess platform, falls off right edge and zig-zags down the right ramps (kills caveman on contact, like L1 barrels), eventually despawning at the bottom.
- Only one rock can occupy A at a time. A "rock at A" is the only ammo for damaging the dragon.

### Kicking the rock
- When caveman stands at A and presses Action/Jump → kick animation, rock at A is launched off the ledge and falls straight down (path B).
- If rock collides with dragon during the fall → registers 1 hit, plays hit/stagger, dragon falls and is **down for 5s** (cannot move/attack).
- Iteration X requires X hits to kill (iter1=1, iter2=2, …). On final hit → dragon dying animation (reuse existing dragon death sprite/tween).

### Sprouts (D = green, E = purple)
- Same wither/regrow cycle as L2 (numerical params reused locally, no L2 imports — already mirrored in `params.ts`).
- Green sprout D: base on lower-left stub, top reaches kick ledge near A. Climbing D is the way up to A.
- Purple sprout E: base on kick ledge at E, top reaches princess platform near Princess 0. Climbing fully-grown E ends the level.
- Growth state machine per sprout: `seed → growing (watered) → alive → withering → seed`.

### Watering cans
- All monkeys in the level start present; killing the last monkey spawns the **green watering can** on a random platform (same rule as L2).
- Pick up green can → water D → D grows to full.
- After **each successful dragon hit** (rock from A lands on dragon), a **purple watering can** spawns on a random platform.
- Pick up purple can → climb D → water E. At iter X, each watering grows E by `1/X` of full height. So X hits → X waterings → E fully grown.
- Watering E **kills D back to seed** (must re-grow with a fresh green can — but green can only re-spawns when all monkeys are dead again; on iter1 there's a single watering so this rule mostly affects iter≥2).
- For iter≥2: after D dies from a purple watering, more monkeys spawn so player can earn the next green can. Concretely: respawn monkeys (count = current iter monkey count) when D dies via purple watering AND more hits are still required.

### Dragon AI
- Roams the dragon-band freely: walk left/right on platforms, jump between adjacent platforms (including onto moving platforms), climb fully-grown sprouts to change band, descend the same way.
- Pathfinding stays simple: pick a random reachable platform every 2–4s, walk/jump/climb toward it.
- Touching dragon kills caveman (same death flow already in place).
- When hit by rock: enters `downed` state for 5s (no movement, no damage). After 5s resumes.
- On final hit: `dying` animation → corpse fades, dragon removed. Princess waits for caveman to climb E.

### Monkeys
- Count = iter1=2, iter2=3, … (existing `MONKEYS_BASE + steps`).
- Distributed across the mid/lower platforms (blue-ellipse anchor points = preferred spawn slots).
- Same kill rule as L1/L2 (jumping onto them). Killing last monkey → green can spawn.
- Respawn rule (above) only triggers when D has just died from purple watering AND dragon still alive.

### Moving platforms
- Horizontal movers: oscillate between two x-stops at constant speed (reuse L3-style pattern, re-implemented locally).
- Vertical movers: oscillate between two y-stops (the H stubs visually delimit the track; H itself is solid scenery).
- Caveman/monkeys/dragon ride them (carry velocity on stand).

### Volcano fireballs?
- **Removed** in this redesign (the volcano's role is rock launcher). No fireball hazard, no L2 fireball logic in L4. (User can ask to re-add if desired.)

### Caveman jump rule (kept from last fix)
- Jump cannot change platforms. Only sprouts/ladders/moving-platform-rides change band. Kick = jump button when standing on A; otherwise jump = same-platform hop (no platform change).

## File changes

All under `src/components/game/level4/` (rewritten):
- `params.ts` — keep most constants; remove HEARTS_* (unused), add ROCK_* (launch interval, roll speed, kick velocity), DOWNED_SEC=5, PURPLE_GROW_FRAC=`1/iter`.
- `layout.ts` — new platform/ladder/mover/anchor tables matching sketch; volcano K position; A, C, D, E anchor points.
- `rocks.ts` — new module: spawn from K, roll along top platform, decide at C, occupy A, kick → falling, hit detection vs dragon, kill caveman on contact while rolling.
- `dragon.ts` — rewrite FSM: `roam | downed | dying`. Remove shrink/flash/bird/stomp logic.
- `sprouts.ts` — local L2-style cycle for D & E plus partial-grow for E (`growthFrac += 1/X` per watering).
- `cans.ts` — green can spawn (after last monkey killed), purple can spawn (after each dragon hit), pickup, carry, water.
- `monkeys.ts` — spawn N at level start; respawn after D-dies-via-purple while dragon alive.
- `ending.ts` — princess hug → thank-you bubble → new dragon kidnaps → advance to next L1 iter (unchanged behavior).
- `level4.ts` — orchestrator; reuse existing death-state/respawn + `_pendingGameOver` logic untouched (the death-flow fixes from prior turns stay).
- `types.ts` — new shape (Rocks[], Dragon, Sprouts{D,E}, Cans, Monkeys[], Movers[], etc.).

## Out of scope (will ask if needed)

- Exact pixel layout tuning beyond a first playable pass.
- New sprite art (reuses existing dragon, princess, caveman, monkey, sprout, watering-can, rock sprites).
- Dragon climbing animation polish.
- Re-introducing fireballs as an extra hazard.

Confirm and I'll build it module-by-module: layout + rocks → dragon + monkeys → sprouts + cans → orchestrator wiring → polish.
