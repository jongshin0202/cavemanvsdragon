import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CANVAS_W, CANVAS_H, GRAVITY, JUMP_FORCE, MOVE_SPEED, BARREL_SPEED, CLIMB_SPEED, ROBOT_SPEED,
  PLATFORMS, LADDERS, getPlatformY, rectsOverlap, findPlatformIndex, findBestLadder,
  Barrel, Robot
} from './game/constants';
import { playJumpSound, playBarrelRollSound, playGameOverSound, playWinSound, playHitSound, playRobotKillSound, playKeyGrabSound, playWaterSproutSound, playGenieAppearSound } from './game/sounds';
import cavemanWalkUrl from '@/assets/caveman-walk.png';
import cavemanJumpUrl from '@/assets/caveman-jump.png';
import cavemanClimbUrl from '@/assets/caveman-climb.png';
import cavemanWinUrl from '@/assets/caveman-win.png';
import dragonFireUrl from '@/assets/dragon-fire.png';
import dragonAngryUrl from '@/assets/dragon-angry.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';
import robotWalkUrl from '@/assets/robot-walk.png';
import rockWheelUrl from '@/assets/rock-wheel.png';
import wateringCanUrl from '@/assets/watering-can.png';

const ROBOT_WALK_FRAMES = 5;

// Dragon sprite sheets: each has 5 frames, randomly alternated
const DRAGON_FRAMES = 5;

const LADDER_SNAP = 36;

// Index of the topmost vine (P5 → Top). Hidden until the player plants the seed.
const TOP_VINE_IDX = 8;
// Where the seed must be planted (base of the topmost vine, on platform P5)
const PLANT_X = 357; // matches LADDERS[8].x + 7

const DonkeyKongGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'win'>('playing');
  const walkSpriteRef = useRef<HTMLImageElement | null>(null);
  const jumpSpriteRef = useRef<HTMLImageElement | null>(null);
  const climbSpriteRef = useRef<HTMLImageElement | null>(null);
  const winSpriteRef = useRef<HTMLImageElement | null>(null);
  const dragonFireRef = useRef<HTMLImageElement | null>(null);
  const dragonAngryRef = useRef<HTMLImageElement | null>(null);
  const princessRef = useRef<HTMLImageElement | null>(null);
  const robotWalkRef = useRef<HTMLImageElement | null>(null);
  const rockWheelRef = useRef<HTMLImageElement | null>(null);
  const wateringCanRef = useRef<HTMLImageElement | null>(null);
  const gameRef = useRef({
    player: { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0 },
    barrels: [] as Barrel[],
    robots: [] as (Robot & { wanderTimer?: number; wanderDir?: number })[],
    barrelTimer: 0,
    nextBarrelTime: 90 + Math.random() * 180,
    robotSpawnTimer: 0,
    robotsInitialized: false,
    score: 0,
    lives: 3,
    state: 'playing' as string,
    dkFrame: 0,
    dkAnimTimer: 0,
    dkSheet: 0 as 0 | 1, // 0 = fire, 1 = angry
    princessAnimTimer: 0,
    helpTimer: 0,
    showHelp: false,
    barrelSoundTimer: 0,
    deathTimer: 0,
    deathFlashTimer: 0,
    dying: false,
    frameCount: 0,
    playerHasMoved: false,
    barrelStartDelay: 0,
    winAnim: { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 },
    pendingClimb: null as null | 'up' | 'down',
    courseDir: 0 as -1 | 0 | 1,
    // Kill-monkeys → key → grow topmost vine mechanic
    monkeysKilled: 0,
    keySpawned: false,
    keyGrabbed: false,
    seedPlanted: false, // (legacy name) true once key is grabbed; triggers vine grow
    topVineGrowth: 0,
    topVineUnlocked: false,
    keyPos: { x: 50, y: 158, w: 14, h: 14 }, // leftmost edge of P5 (y=176, x1=48)
    keyBob: 0,
    sparkleTimer: 0,
    invulnTimer: 0,
  });

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0 };
    g.barrels = [];
    g.barrelTimer = 0;
    g.pendingClimb = null;
    g.courseDir = 0;
    // Brief invulnerability so we don't die on the same frame we respawn
    g.invulnTimer = 120; // ~2s at 60fps
  }, []);

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.state = 'playing'; g.dying = false; g.deathTimer = 0; g.deathFlashTimer = 0;
    g.robots = [];
    g.robotSpawnTimer = 0;
    g.robotsInitialized = false;
    g.nextBarrelTime = 60 + Math.random() * 120;
    g.frameCount = 0;
    g.playerHasMoved = true;
    g.barrelStartDelay = 0;
    g.dkAnimTimer = 0; g.dkFrame = 0;
    g.princessAnimTimer = 0; g.helpTimer = 0; g.showHelp = false;
    g.winAnim = { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 };
    g.monkeysKilled = 0;
    g.keySpawned = false;
    g.keyGrabbed = false;
    g.seedPlanted = false;
    g.topVineGrowth = 0;
    g.topVineUnlocked = false;
    if (!g.keyPos) g.keyPos = { x: 50, y: 158, w: 14, h: 14 };
    g.keyBob = 0;
    g.sparkleTimer = 0;
    resetPlayer();
    // Spawn first rock immediately so action starts the moment the game begins
    {
      const speed = BARREL_SPEED * (0.7 + Math.random() * 0.8);
      g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed, rollPhase: 0 });
      playBarrelRollSound();
    }
    setScore(0); setLives(3); setGameState('playing');
  }, [resetPlayer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Load sprites
    const walkImg = new Image();
    walkImg.src = cavemanWalkUrl;
    walkSpriteRef.current = walkImg;

    const jumpImg = new Image();
    jumpImg.src = cavemanJumpUrl;
    jumpSpriteRef.current = jumpImg;

    const climbImg = new Image();
    climbImg.src = cavemanClimbUrl;
    climbSpriteRef.current = climbImg;

    const winImg = new Image();
    winImg.src = cavemanWinUrl;
    winSpriteRef.current = winImg;

    const dragonFireImg = new Image();
    dragonFireImg.src = dragonFireUrl;
    dragonFireRef.current = dragonFireImg;

    const dragonAngryImg = new Image();
    dragonAngryImg.src = dragonAngryUrl;
    dragonAngryRef.current = dragonAngryImg;

    const princessImg = new Image();
    princessImg.src = princessSpriteUrl;
    princessRef.current = princessImg;

    const robotImg = new Image();
    robotImg.src = robotWalkUrl;
    robotWalkRef.current = robotImg;

    const rockImg = new Image();
    rockImg.src = rockWheelUrl;
    rockWheelRef.current = rockImg;

    const canImg = new Image();
    canImg.src = wateringCanUrl;
    wateringCanRef.current = canImg;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'r' || e.key === 'R') resetGame();
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let animId: number;

    let lastTime = 0;
    const FRAME_INTERVAL = 1000 / 60; // native 60fps for smooth motion

    const gameLoop = (timestamp: number) => {
      const elapsed = timestamp - lastTime;
      if (elapsed < FRAME_INTERVAL) {
        animId = requestAnimationFrame(gameLoop);
        return;
      }
      lastTime = timestamp - (elapsed % FRAME_INTERVAL);

      const g = gameRef.current;
      const keys = keysRef.current;
      const p = g.player;

      const wa = g.winAnim || { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 };
      if (!g.winAnim) g.winAnim = wa;
      if (wa.active) {
        wa.timer++;
        if (wa.gorillaY < CANVAS_H + 50) {
          wa.gorillaY += 4;
          wa.gorillaRotation += 0.15;
        }
        if (wa.timer > 30) wa.showKiss = true;
        if (wa.timer > 90) wa.showCongrats = true;
      }

      // Handle dying state (1 second pause with flashing)
      if (g.dying) {
        g.deathTimer++;
        g.deathFlashTimer++;
        if (g.deathTimer >= 108) { // 3 visible flashes (~1.8s at 60fps)
          g.dying = false;
          g.deathTimer = 0;
          g.deathFlashTimer = 0;
          resetPlayer();
        }
      }

      // Animate dragon and princess smoothly (always running)
      g.dkAnimTimer++;
      if (g.dkAnimTimer > 20) {
        g.dkAnimTimer = 0;
        g.dkFrame = (g.dkFrame + 1) % DRAGON_FRAMES;
      }
      g.helpTimer++;
      if (g.helpTimer > 120) { g.helpTimer = 0; g.showHelp = !g.showHelp; }

      if (g.state === 'playing' && !g.dying) {
        // Decrement invulnerability after respawn
        if (g.invulnTimer > 0) g.invulnTimer--;
        // === PLAYER MOVEMENT ===
        // Wider snap: find nearest ladder within LADDER_SNAP pixels
        const playerCX = p.x + p.w / 2;
        let nearestLadder: (typeof LADDERS)[number] | null = null;
        let nearestLadderDist = Infinity;
        for (let li = 0; li < LADDERS.length; li++) {
          if (li === TOP_VINE_IDX && !g.topVineUnlocked) continue;
          const l = LADDERS[li];
          const ladderCX = l.x + 7;
          const dist = Math.abs(playerCX - ladderCX);
          if (dist < LADDER_SNAP && p.y + p.h > l.yTop - 8 && p.y + p.h <= l.yBot + 16 && dist < nearestLadderDist) {
            nearestLadder = l;
            nearestLadderDist = dist;
          }
        }

        const padKeys = activePadKeysRef.current;
        const rawLeft = keys.has('ArrowLeft') || padKeys.includes('ArrowLeft');
        const rawRight = keys.has('ArrowRight') || padKeys.includes('ArrowRight');
        const rawUp = keys.has('ArrowUp') || padKeys.includes('ArrowUp');
        const rawDown = keys.has('ArrowDown') || padKeys.includes('ArrowDown');

        if (rawLeft && !rawRight) g.courseDir = -1;
        else if (rawRight && !rawLeft) g.courseDir = 1;
        else if (!rawUp && !rawDown) g.courseDir = 0;

        // Keep the last left/right course active only while searching for a
        // ladder. Once we're in ladder range, Up/Down must take over fully so
        // a slide into Up starts climbing immediately instead of dismounting.
        const canGuideTowardLadder = !nearestLadder && !p.climbing && (rawUp || rawDown);
        const holdLeft = rawLeft || (!rawRight && canGuideTowardLadder && g.courseDir === -1);
        const holdRight = rawRight || (!rawLeft && canGuideTowardLadder && g.courseDir === 1);

        if (rawUp) {
          g.pendingClimb = 'up';
        } else if (rawDown) {
          g.pendingClimb = 'down';
        } else {
          g.pendingClimb = null;
        }

        const wantUp = rawUp || g.pendingClimb === 'up';
        const wantDown = rawDown || g.pendingClimb === 'down';

        if (wantUp && nearestLadder) {
          p.climbing = true;
          p.x = nearestLadder.x + 7 - p.w / 2;
        } else if (wantDown) {
          if (nearestLadder && p.y + p.h < nearestLadder.yBot - 4) {
            // Climb down ladder
            p.climbing = true;
            p.x = nearestLadder.x + 7 - p.w / 2;
          } else if (p.onGround && !nearestLadder && rawDown) {
            // Drop down from platform edge - check if near edge of current platform
            const curPlatIdx = findPlatformIndex(p.y + p.h, playerCX);
            const curPlat = PLATFORMS[curPlatIdx];
            if (curPlat) {
              const distToLeft = playerCX - curPlat.x1;
              const distToRight = curPlat.x2 - playerCX;
              if (distToLeft < 20 || distToRight < 20) {
                p.onGround = false;
                p.vy = 1;
              }
            }
          }
        }

        if (p.climbing) {
          // If near the top of the ladder and pressing left/right, dismount
          const climbingLadder = nearestLadder;
          const nearTop = climbingLadder && (p.y + p.h) < climbingLadder.yTop + 10;
          const nearBot = climbingLadder && (p.y + p.h) > climbingLadder.yBot - 6;
          const wantsHorizontal = rawLeft || rawRight;
          
          if (!nearestLadder && !nearTop) {
            p.climbing = false;
          } else if (nearTop && (wantsHorizontal || rawUp)) {
            // Snap to top platform and dismount
            p.climbing = false;
            if (climbingLadder) p.y = climbingLadder.yTop - p.h;
          } else if (nearBot && (wantsHorizontal || rawDown)) {
            p.climbing = false;
            if (climbingLadder) p.y = climbingLadder.yBot - p.h;
          } else if (wantsHorizontal && !rawUp && !rawDown) {
            p.climbing = false;
          } else {
            p.vy = 0;
            const climbMoving = rawUp || rawDown;
            if (rawUp) p.y -= CLIMB_SPEED;
            if (rawDown) p.y += CLIMB_SPEED;
            if (climbMoving) {
              p.climbTimer++;
              if (p.climbTimer > 6) { p.climbTimer = 0; p.climbFrame = (p.climbFrame + 1) % 4; }
            }
          }
        }

        if (!p.climbing) {
          const moving = holdLeft || holdRight;
          if (moving && !g.playerHasMoved) { g.playerHasMoved = true; g.barrelStartDelay = 22; g.barrelTimer = 0; g.nextBarrelTime = 22; }
          if (holdLeft) { p.x -= MOVE_SPEED; p.facing = -1; }
          if (holdRight) { p.x += MOVE_SPEED; p.facing = 1; }
          if (moving && p.onGround) { p.walkTimer++; if (p.walkTimer > 5) { p.walkTimer = 0; p.walkFrame = (p.walkFrame + 1) % 4; } }
          else if (!moving) { p.walkFrame = 0; p.walkTimer = 0; }
          if ((keys.has(' ')) && p.onGround) {
            p.vy = -5; p.onGround = false; p.jumping = true;
            p.jumpFrame = 0; p.jumpTimer = 0;
            g.pendingClimb = null;
            playJumpSound();
          }
          p.vy += GRAVITY; p.y += p.vy;
          p.onGround = false;
          for (const plat of PLATFORMS) {
            if (p.x + p.w > plat.x1 && p.x < plat.x2) {
              const platY = getPlatformY(plat, p.x + p.w / 2);
              if (p.y + p.h >= platY && p.y + p.h <= platY + 12 && p.vy >= 0) {
                p.y = platY - p.h; p.vy = 0; p.onGround = true; p.jumping = false;
                p.jumpFrame = 0; p.jumpTimer = 0;
              }
            }
          }
          // Advance jump frame animation while in air
          if (p.jumping) {
            p.jumpTimer++;
            if (p.jumpTimer > 4 && p.jumpFrame < 4) { p.jumpTimer = 0; p.jumpFrame++; }
          }
        }

        p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x));
        if (p.y > CANVAS_H) {
          g.lives--; setLives(g.lives);
          if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
          else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
        }

        // === KILL ALL MONKEYS → KEY APPEARS → GRAB KEY → VINE GROWS ===
        // Spawn the watering can once all 4 monkeys are dead.
        // Random placement: anywhere on P1–P4, OR the leftmost edge of P5.
        if (!g.keySpawned && g.monkeysKilled >= 4) {
          g.keySpawned = true;
          const choice = Math.floor(Math.random() * 5); // 0..4
          let kx: number;
          let kPlat: typeof PLATFORMS[number];
          if (choice === 4) {
            // Leftmost edge of P5 (second-from-top)
            kPlat = PLATFORMS[4];
            kx = kPlat.x1 + 4;
          } else {
            // Random spot on P1..P4
            kPlat = PLATFORMS[choice];
            const margin = 16;
            kx = kPlat.x1 + margin + Math.random() * Math.max(1, (kPlat.x2 - kPlat.x1) - margin * 2);
          }
          const ky = getPlatformY(kPlat, kx) - 16;
          g.keyPos = { x: kx, y: ky, w: 14, h: 14 };
          playGenieAppearSound();
        }
        // Pick up the watering can
        if (g.keySpawned && !g.keyGrabbed) {
          g.keyBob = (g.keyBob + 1) % 120;
          if (g.keyPos && rectsOverlap(p, g.keyPos)) {
            g.keyGrabbed = true;
            g.score += 300; setScore(g.score);
            playKeyGrabSound();
          }
        }
        // Carry the watering can to the sprout: when player reaches the
        // sprout location on P5, plant/water it and start the vine growing.
        if (g.keyGrabbed && !g.seedPlanted) {
          const tv = LADDERS[TOP_VINE_IDX];
          const sproutX = tv.x + 7;
          const sproutY = tv.yBot;
          const playerCXNow = p.x + p.w / 2;
          const playerFeetNow = p.y + p.h;
          if (Math.abs(playerCXNow - sproutX) < 14 && Math.abs(playerFeetNow - sproutY) < 12) {
            g.seedPlanted = true; // triggers vine-grow animation
            playWaterSproutSound();
          }
        }
        // Grow the vine after watering (~1.5s at 60fps ≈ 68 frames)
        if (g.seedPlanted && g.topVineGrowth < 1) {
          g.topVineGrowth = Math.min(1, g.topVineGrowth + 1 / 68);
          g.sparkleTimer++;
          if (g.topVineGrowth >= 1) g.topVineUnlocked = true;
        }

        // Win condition - touch the girl (next to the dragon)
        const paulX = 175, paulY = 64;
        if (rectsOverlap(p, { x: paulX, y: paulY, w: 40, h: 48 })) {
          g.state = 'win'; setGameState('win');
          g.score += 1000; setScore(g.score); playWinSound();
          wa.active = true;
          wa.timer = 0;
          wa.gorillaY = 76;
          wa.gorillaRotation = 0;
          wa.showKiss = false;
          wa.showCongrats = false;
        }

        // === BARREL SPAWNING (only after player first moves; first barrel ~0.5s after) ===
        if (g.playerHasMoved) {
          g.barrelTimer++;
          if (!g.nextBarrelTime) g.nextBarrelTime = 90 + Math.random() * 180;
          if (g.barrelTimer > g.nextBarrelTime) {
            g.barrelTimer = 0;
            g.nextBarrelTime = 90 + Math.random() * 180;
            const speed = BARREL_SPEED * (0.7 + Math.random() * 0.8);
            g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed, rollPhase: 0 });
            playBarrelRollSound();
          }
        }

        // === MONKEY SPAWNING (exactly 4 monkeys, one per platform P2..P5) ===
        if (!g.robotsInitialized) {
          g.robotsInitialized = true;
          // Spawn one monkey on platforms 1..4 (skip ground P1 and top P6) → exactly 4
          for (let pi = 1; pi <= 4; pi++) {
            const plat = PLATFORMS[pi];
            const rx = plat.x1 + 30 + Math.random() * (plat.x2 - plat.x1 - 60);
            const ry = getPlatformY(plat, rx) - 16;
            const spd = ROBOT_SPEED * (0.6 + Math.random() * 0.8);
            g.robots.push({ x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0, onGround: true, climbing: false, targetLadder: null, direction: Math.random() > 0.5 ? 1 : -1, frame: 0, frameTimer: 0, speed: spd });
          }
        }

        // DK animation moved to always-running section above

        const playerCenterX = p.x + p.w / 2;
        const playerFeetY = p.y + p.h;
        const scoreToPlayer = (x: number, y: number) => Math.abs(x - playerCenterX) + Math.abs(y - playerFeetY);

        // === UPDATE BARRELS (only move downward, never upward) ===
        g.barrelSoundTimer++;
        for (let i = g.barrels.length - 1; i >= 0; i--) {
          const b = g.barrels[i];
          // Distance-based roll: rotate based on horizontal movement (true rolling)
          b.rollPhase = (b.rollPhase || 0) + Math.abs(b.vx) + (b.falling ? Math.abs(b.vy) * 0.5 : 0);
          const bCenterX = b.x + b.w / 2;
          const bFeetY = b.y + b.h;
          const bPlatIdx = findPlatformIndex(bFeetY, bCenterX);

          if (b.onLadder) {
            // Barrels only go DOWN through ladders
            b.y += 2.5;
            b.vx = 0;

            if (b.targetLadder !== null) {
              const l = LADDERS[b.targetLadder];
              if (b.y + b.h >= l.yBot) {
                b.y = l.yBot - b.h;
                b.onLadder = false;
                b.targetLadder = null;
                // Roll downhill based on platform slope
                const landedPlat = PLATFORMS.find(pl => b.x + b.w > pl.x1 && b.x < pl.x2 && Math.abs((b.y + b.h) - getPlatformY(pl, b.x + b.w / 2)) < 16);
                b.vx = (landedPlat && (landedPlat.slope || 0) < 0) ? -b.speed : b.speed;
              }
            }
          } else if (b.falling) {
            b.vy += GRAVITY;
            b.y += b.vy;

            let landed = false;
            for (const plat of PLATFORMS) {
              if (b.x + b.w > plat.x1 && b.x < plat.x2) {
                const platY = getPlatformY(plat, b.x + b.w / 2);
                if (b.y + b.h >= platY && b.y + b.h <= platY + 16 && b.vy >= 0) {
                  b.y = platY - b.h;
                  b.vy = 0;
                  b.falling = false;
                  // Roll downhill: positive slope → right, negative slope → left
                  b.vx = ((plat.slope || 0) < 0) ? -b.speed : b.speed;
                  landed = true;
                  break;
                }
              }
            }

            if (!landed && b.y > CANVAS_H + 20) {
              g.barrels.splice(i, 1);
              continue;
            }
          } else {
            // Rolling on platform — always roll downhill
            if (b.vx === 0) {
              const curPlat = PLATFORMS[bPlatIdx];
              b.vx = (curPlat && (curPlat.slope || 0) < 0) ? -b.speed : b.speed;
            }

            // Check for ladders going DOWN only (barrels never go up)
            let tookLadder = false;
            for (let li = 0; li < LADDERS.length; li++) {
              if (li === TOP_VINE_IDX && !g.topVineUnlocked) continue;
              const l = LADDERS[li];
              const ladderCenterX = l.x + 7;

              if (Math.abs(bCenterX - ladderCenterX) > b.speed + 4) continue;

              // Only consider ladders where top matches current platform (going down)
              const topPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yTop) < 12);
              if (topPlatIdx !== bPlatIdx) continue;

              // Check if player is beyond all ladders on this platform toward the drop edge
              // If so, skip the ladder and let barrel fall off the edge
              const curPlat = PLATFORMS[bPlatIdx];
              const dropEdgeIsLeft = curPlat && curPlat.x1 > 0;
              const dropEdgeIsRight = curPlat && curPlat.x2 < CANVAS_W;
              
              // Find all ladders on this platform going down
              const laddersOnPlat = LADDERS.filter((ll, lli) => {
                if (lli === TOP_VINE_IDX && !g.topVineUnlocked) return false;
                const tpi = PLATFORMS.findIndex(pl => Math.abs(pl.y - ll.yTop) < 12);
                return tpi === bPlatIdx;
              });
              
              const allLadderXs = laddersOnPlat.map(ll => ll.x + 7);
              const minLadderX = Math.min(...allLadderXs);
              const maxLadderX = Math.max(...allLadderXs);
              
              // If player is left of leftmost ladder and there's a drop edge on left, skip ALL ladders
              let playerBeyondLadders = false;
              if (dropEdgeIsLeft && playerCenterX < minLadderX) {
                playerBeyondLadders = true;
              }
              if (dropEdgeIsRight && playerCenterX > maxLadderX) {
                playerBeyondLadders = true;
              }

              if (playerBeyondLadders) {
                continue; // skip this ladder entirely, let barrel fall off edge
              }

              // Score: is taking this ladder down closer to the player?
              const ladderBottomY = l.yBot;
              const ladderScore = scoreToPlayer(ladderCenterX, ladderBottomY);
              const continueScore = scoreToPlayer(bCenterX + Math.sign(b.vx) * 50, bFeetY);

              if (ladderScore <= continueScore) {
                b.onLadder = true;
                b.targetLadder = li;
                b.x = l.x + (16 - b.w) / 2;
                b.vx = 0;
                tookLadder = true;
                break;
              }
            }

            if (!tookLadder) {
              b.x += b.vx;

              // Follow platform slope
              let supportingPlat: (typeof PLATFORMS)[number] | null = null;
              for (const plat of PLATFORMS) {
                if (b.x + b.w > plat.x1 && b.x < plat.x2) {
                  const platY = getPlatformY(plat, b.x + b.w / 2);
                  if (Math.abs((b.y + b.h) - platY) < 16) {
                    b.y = platY - b.h;
                    supportingPlat = plat;
                    break;
                  }
                }
              }

              // Fall off edge
              if (!supportingPlat) {
                b.falling = true;
                b.vy = 0;
              } else {
                // Check if next step goes off edge
                const nextX = b.x + b.w / 2 + Math.sign(b.vx) * b.speed;
                if (nextX < supportingPlat.x1 || nextX > supportingPlat.x2) {
                  b.falling = true;
                  b.vy = 0;
                }
              }
            }
          }

          // Remove if off screen
          if (b.y > CANVAS_H + 20) {
            g.barrels.splice(i, 1);
            continue;
          }

          // Collision with player only if on the same platform
          const bPlatY = findPlatformIndex(b.y + b.h, b.x + b.w / 2);
          const pPlatY = findPlatformIndex(p.y + p.h, p.x + p.w / 2);
          if (rectsOverlap(p, b) && bPlatY === pPlatY && g.invulnTimer === 0) {
            g.lives--; setLives(g.lives);
            if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
            else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
            break;
          }
        }

        // === UPDATE ROBOTS (always moving — random wander biased toward player) ===
        for (let i = g.robots.length - 1; i >= 0; i--) {
          const r = g.robots[i];
          const rCenterX = r.x + r.w / 2;
          const rFeetY = r.y + r.h;
          const rPlatIdx = findPlatformIndex(rFeetY, rCenterX);

          // Smooth, time-based animation (not position-based)
          r.frameTimer++;
          if (r.frameTimer >= 5) { r.frameTimer = 0; r.frame = (r.frame + 1) % ROBOT_WALK_FRAMES; }

          if (r.climbing) {
            r.y += r.vy;
            r.vx = 0;
            if (r.targetLadder !== null) {
              const l = LADDERS[r.targetLadder];
              if (r.vy < 0 && r.y + r.h <= l.yTop + 2) {
                r.y = l.yTop - r.h;
                r.vy = 0; r.climbing = false; r.targetLadder = null;
              } else if (r.vy > 0 && r.y + r.h >= l.yBot) {
                r.y = l.yBot - r.h;
                r.vy = 0; r.climbing = false; r.targetLadder = null;
              }
            } else {
              r.vy = 0; r.climbing = false;
            }
          } else {
            // Wander timer: pick a new random direction occasionally,
            // biased toward player so movement is gradual + natural.
            if (r.wanderTimer === undefined) r.wanderTimer = 0;
            if (r.wanderDir === undefined) r.wanderDir = r.direction || 1;
            r.wanderTimer--;
            if (r.wanderTimer <= 0) {
              r.wanderTimer = 30 + Math.floor(Math.random() * 60); // 0.7-2s at 45fps
              const towardPlayer = playerCenterX >= rCenterX ? 1 : -1;
              // 70% bias toward player, 30% random — never stop
              r.wanderDir = Math.random() < 0.7 ? towardPlayer : (Math.random() < 0.5 ? 1 : -1);
            }

            // Consider climbing if a ladder is right here AND it gets us closer
            let climbChoice: { ladderIdx: number; climbVy: number; score: number } | null = null;
            const continueScore = scoreToPlayer(rCenterX + r.wanderDir * r.speed * 30, rFeetY);
            for (let li = 0; li < LADDERS.length; li++) {
              if (li === TOP_VINE_IDX && !g.topVineUnlocked) continue;
              const l = LADDERS[li];
              const ladderCenterX = l.x + 7;
              if (Math.abs(rCenterX - ladderCenterX) > r.speed + 4) continue;
              const topPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yTop) < 12);
              const botPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yBot) < 12);
              if (botPlatIdx === rPlatIdx && topPlatIdx >= 0 && topPlatIdx < rPlatIdx) {
                const scoreUp = scoreToPlayer(ladderCenterX, l.yTop);
                if (scoreUp < continueScore && (!climbChoice || scoreUp < climbChoice.score)) {
                  climbChoice = { ladderIdx: li, climbVy: -r.speed, score: scoreUp };
                }
              }
              if (topPlatIdx === rPlatIdx && botPlatIdx >= 0 && botPlatIdx > rPlatIdx) {
                const scoreDown = scoreToPlayer(ladderCenterX, l.yBot);
                if (scoreDown < continueScore && (!climbChoice || scoreDown < climbChoice.score)) {
                  climbChoice = { ladderIdx: li, climbVy: r.speed, score: scoreDown };
                }
              }
            }

            if (climbChoice && Math.random() < 0.6) {
              const l = LADDERS[climbChoice.ladderIdx];
              r.climbing = true;
              r.targetLadder = climbChoice.ladderIdx;
              r.vx = 0;
              r.vy = climbChoice.climbVy;
              r.x = l.x + (16 - r.w) / 2;
            } else {
              // Always moving — never stop, even if aligned with player
              r.direction = r.wanderDir;
              r.vx = r.direction * r.speed;
              r.x += r.vx;
              r.vy += GRAVITY;
              r.y += r.vy;
              r.onGround = false;

              for (const plat of PLATFORMS) {
                if (r.x + r.w > plat.x1 && r.x < plat.x2) {
                  const platY = getPlatformY(plat, r.x + r.w / 2);
                  if (r.y + r.h >= platY && r.y + r.h <= platY + 12 && r.vy >= 0) {
                    r.y = platY - r.h; r.vy = 0; r.onGround = true; break;
                  }
                }
              }

              // Bounce off walls / platform edges so it keeps moving
              const curPlat = PLATFORMS[rPlatIdx];
              if (curPlat) {
                if (r.x <= curPlat.x1 + 2) { r.wanderDir = 1; r.x = curPlat.x1 + 2; }
                else if (r.x + r.w >= curPlat.x2 - 2) { r.wanderDir = -1; r.x = curPlat.x2 - r.w - 2; }
              }
              r.x = Math.max(0, Math.min(CANVAS_W - r.w, r.x));
            }
          }

          if (r.y > CANVAS_H + 20) { g.robots.splice(i, 1); continue; }

          const rPlatY = findPlatformIndex(r.y + r.h, r.x + r.w / 2);
          const pPlatY = findPlatformIndex(p.y + p.h, p.x + p.w / 2);
          if (rectsOverlap(p, r) && rPlatY === pPlatY) {
            if (p.vy > 0 && p.y + p.h <= r.y + r.h * 0.6) {
              g.score += 200; setScore(g.score);
              playRobotKillSound();
              p.vy = -4;
              g.robots.splice(i, 1);
              g.monkeysKilled = (g.monkeysKilled || 0) + 1;
            } else if (g.invulnTimer === 0) {
              g.lives--; setLives(g.lives);
              if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
              else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
              break;
            }
          }
        }
      }


      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Platforms - soil base with grass top
      for (const plat of PLATFORMS) {
        for (let x = plat.x1; x < plat.x2; x += 16) {
          const y = getPlatformY(plat, x + 8);
          // Soil body
          ctx.fillStyle = '#6B4226';
          ctx.fillRect(x, y + 2, 16, 6);
          // Soil texture flecks
          ctx.fillStyle = '#4A2C18';
          ctx.fillRect(x + 3, y + 4, 2, 2);
          ctx.fillRect(x + 10, y + 5, 2, 1);
          ctx.fillStyle = '#8B5A2B';
          ctx.fillRect(x + 7, y + 6, 2, 1);
          // Grass top
          ctx.fillStyle = '#3CB043';
          ctx.fillRect(x, y, 16, 3);
          ctx.fillStyle = '#5BD15B';
          ctx.fillRect(x + 1, y, 2, 1);
          ctx.fillRect(x + 6, y, 2, 1);
          ctx.fillRect(x + 11, y, 2, 1);
          // Grass blades
          ctx.fillStyle = '#2E8B33';
          ctx.fillRect(x + 4, y - 1, 1, 1);
          ctx.fillRect(x + 12, y - 1, 1, 1);
        }
      }

      // Ladders - green caveman vines (skip top vine; rendered separately based on growth)
      const drawVine = (lx: number, lyTop: number, lyBot: number) => {
        ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = lyTop; y <= lyBot; y += 4) {
          const wave = Math.sin(y * 0.4) * 1.5;
          if (y === lyTop) ctx.moveTo(lx + wave, y);
          else ctx.lineTo(lx + wave, y);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let y = lyTop; y <= lyBot; y += 4) {
          const wave = Math.sin(y * 0.4 + 1) * 1.5;
          if (y === lyTop) ctx.moveTo(lx + 14 + wave, y);
          else ctx.lineTo(lx + 14 + wave, y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx - 1, lyTop); ctx.lineTo(lx - 1, lyBot);
        ctx.moveTo(lx + 13, lyTop); ctx.lineTo(lx + 13, lyBot);
        ctx.stroke();
        for (let y = lyTop + 4; y < lyBot; y += 12) {
          ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lx + 1, y); ctx.lineTo(lx + 13, y);
          ctx.stroke();
          ctx.fillStyle = '#66BB6A';
          ctx.fillRect(lx + 3, y - 2, 2, 2);
          ctx.fillRect(lx + 9, y + 1, 2, 2);
        }
      };
      for (let li = 0; li < LADDERS.length; li++) {
        if (li === TOP_VINE_IDX) continue; // top vine drawn below based on growth
        const l = LADDERS[li];
        drawVine(l.x, l.yTop, l.yBot);
      }

      // Topmost vine — animated growth from sprout up to top platform
      {
        const tv = LADDERS[TOP_VINE_IDX];
        if (g.seedPlanted && g.topVineGrowth > 0) {
          const fullH = tv.yBot - tv.yTop; // 64
          const grownTop = tv.yBot - fullH * g.topVineGrowth;
          drawVine(tv.x, grownTop, tv.yBot);
          // Water droplets while the vine grows
          if (g.topVineGrowth < 1) {
            for (let i = 0; i < 5; i++) {
              const sx = tv.x + 7 + Math.cos(g.sparkleTimer * 0.18 + i * 1.3) * 7;
              const sy = grownTop - 4 + ((g.sparkleTimer * 0.6 + i * 5) % 18);
              ctx.fillStyle = ['#4FC3F7', '#B3E5FC', '#81D4FA', '#FFFFFF', '#4FC3F7'][i];
              ctx.fillRect(sx, sy, 2, 2);
            }
          }
        }
        // Sprout/seed marker at the planting spot when not yet planted
        if (!g.seedPlanted) {
          const sx = tv.x + 7;
          const sy = tv.yBot - 2;
          // Mound
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(sx - 7, sy - 3, 14, 5);
          ctx.fillStyle = 'rgba(102, 187, 106, 0.22)';
          ctx.beginPath();
          ctx.arc(sx, sy - 7, 8, 0, Math.PI * 2);
          ctx.fill();
          // Bigger sprout hint
          ctx.fillStyle = '#66BB6A';
          ctx.fillRect(sx - 2, sy - 10, 4, 8);
          ctx.fillStyle = '#4CAF50';
          ctx.fillRect(sx - 6, sy - 10, 4, 4);
          ctx.fillRect(sx + 2, sy - 12, 4, 4);
          ctx.fillRect(sx - 4, sy - 14, 3, 3);
          ctx.fillRect(sx + 1, sy - 15, 3, 3);
        }
      }

      // Watering can on leftmost edge of P5 (drawn after all 4 monkeys
      // are killed, until grabbed). When grabbed, the player carries it
      // over their head until they reach the sprout.
      if (g.keySpawned && !g.keyGrabbed && g.keyPos) {
        const kp = g.keyPos;
        const bob = Math.sin(g.keyBob * 0.12) * 2;
        const cx = kp.x + kp.w / 2;
        const cy = kp.y + kp.h / 2 + bob;
        // Soft blue glow
        ctx.fillStyle = 'rgba(79, 195, 247, 0.35)';
        ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
        const canImg = wateringCanRef.current;
        const drawW = 22, drawH = 18;
        if (canImg && canImg.complete && canImg.naturalWidth > 0) {
          ctx.drawImage(canImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        }
      }

      // Dragon boss (with win animation - flip and fall) - 2x bigger
      const dkX = 70;
      const dragonSize = 96;
      const dragonImg = dragonAngryRef.current;
      const dragonFrameW = dragonImg && dragonImg.naturalWidth > 0 ? dragonImg.naturalWidth / DRAGON_FRAMES : 0;
      const dragonFrameH = dragonImg ? dragonImg.naturalHeight : 0;
      if (wa.active) {
        ctx.save();
        ctx.translate(dkX + dragonSize / 2, wa.gorillaY + dragonSize / 2);
        ctx.rotate(wa.gorillaRotation);
        if (dragonImg && dragonImg.complete && dragonFrameW > 0) {
          ctx.drawImage(dragonImg, 0, 0, dragonFrameW, dragonFrameH, -dragonSize / 2, -dragonSize / 2, dragonSize, dragonSize);
        }
        ctx.restore();
      } else {
        const dkY = 16;
        const frameIdx = g.dkFrame % DRAGON_FRAMES;
        if (dragonImg && dragonImg.complete && dragonFrameW > 0) {
          ctx.drawImage(dragonImg, frameIdx * dragonFrameW, 0, dragonFrameW, dragonFrameH, dkX, dkY, dragonSize, dragonSize);
        }
      }

      // Princess (sprite) - placed right next to the dragon on the top platform
      const princessDrawW = 40;
      const princessDrawH = 48;
      const paulX = 175;                          // just to the right of the dragon (dkX=70 + dragonSize=96 ≈ 166)
      const paulY = 112 - princessDrawH;          // feet on top platform (y=112)
      const princessImg = princessRef.current;
      if (princessImg && princessImg.complete && princessImg.naturalWidth > 0) {
        // New sprite: 5 frames in a single row
        const PRINCESS_FRAMES = 5;
        const pFrameW = princessImg.naturalWidth / PRINCESS_FRAMES;
        const pFrameH = princessImg.naturalHeight;
        // Pick frame: kiss → frame 0; otherwise alternate between idle (0) and "help" (2)
        let frameIdx = 0;
        if (!(wa.active && wa.showKiss)) {
          frameIdx = g.showHelp ? 2 : 0;
        }
        ctx.drawImage(princessImg, frameIdx * pFrameW, 0, pFrameW, pFrameH, paulX, paulY, princessDrawW, princessDrawH);
        if (wa.active && wa.showKiss) {
          ctx.fillStyle = '#FF0000'; ctx.font = '12px serif';
          ctx.fillText('❤', paulX + princessDrawW + 2, paulY + 8);
          ctx.fillStyle = '#FF69B4'; ctx.font = '7px monospace';
          ctx.fillText('Thank You!', paulX - 20, paulY - 6);
        } else if (g.showHelp) {
          ctx.fillStyle = '#FFFFFF'; ctx.font = '7px monospace';
          ctx.fillText('Help!', paulX + 4, paulY - 6);
        }
      }

      // Rolling rock wheels (sprite-animated, rotates as it rolls)
      const rockImg = rockWheelRef.current;
      const ROCK_FRAMES = 5;
      const rockFrameW = rockImg && rockImg.naturalWidth > 0 ? rockImg.naturalWidth / ROCK_FRAMES : 0;
      const rockFrameH = rockImg ? rockImg.naturalHeight : 0;
      for (const b of g.barrels) {
        if (rockImg && rockImg.complete && rockFrameW > 0) {
          // Keep the sprite's natural aspect ratio so the rock stays round (not squished).
          // Size the rock by its diameter, then derive width from the sprite's aspect.
          const diameter = (b.w + 4) * 1.5; // visual diameter
          const aspect = rockFrameW / rockFrameH;
          const drawH = diameter;
          const drawW = diameter * aspect;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const radius = diameter / 2;
          // Circumference-based rotation: angle = distance / radius, direction = sign(vx)
          const dir = b.vx >= 0 ? 1 : -1;
          const angle = ((b.rollPhase || 0) / radius) * dir;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.drawImage(rockImg, 0, 0, rockFrameW, rockFrameH,
            -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }
      }

      // Robots (sprite-based) — 50% bigger
      const robotSprite = robotWalkRef.current;
      const robotReady = robotSprite && robotSprite.complete && robotSprite.naturalWidth > 0;
      for (const r of g.robots) {
        if (robotReady) {
          const sw = robotSprite.naturalWidth / ROBOT_WALK_FRAMES;
          const sh = robotSprite.naturalHeight;
          const sx = (r.frame % ROBOT_WALK_FRAMES) * sw;
          const drawW = 33;
          const drawH = 33;
          const dx = r.x + r.w / 2 - drawW / 2;
          const dy = r.y + r.h - drawH;
          ctx.save();
          if (r.direction < 0) {
            ctx.translate(r.x + r.w / 2, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(robotSprite, sx, 0, sw, sh, -drawW / 2, dy, drawW, drawH);
          } else {
            ctx.drawImage(robotSprite, sx, 0, sw, sh, dx, dy, drawW, drawH);
          }
          ctx.restore();
        }
      }

      // Player (Caveman sprite) - flash 3 times when dying
      // (toggle every 18 frames over 108 frames at 60fps → 3 on/off cycles)
      const pl = g.player;
      const showPlayer = g.dying
        ? Math.floor(g.deathFlashTimer / 18) % 2 === 0
        : (g.invulnTimer === 0 || Math.floor(g.invulnTimer / 6) % 2 === 0);
      const walkSprite = walkSpriteRef.current;
      const jumpSprite = jumpSpriteRef.current;
      const climbSprite = climbSpriteRef.current;
      const winSprite = winSpriteRef.current;
      const useWin = (g.state === 'win' || wa.active) && winSprite && winSprite.complete && winSprite.naturalWidth > 0;
      const useClimb = !useWin && pl.climbing && climbSprite && climbSprite.complete && climbSprite.naturalWidth > 0;
      const useJump = !useWin && !pl.climbing && pl.jumping && jumpSprite && jumpSprite.complete && jumpSprite.naturalWidth > 0;
      const useWalk = !useWin && !pl.climbing && !pl.jumping && walkSprite && walkSprite.complete && walkSprite.naturalWidth > 0;
      // Player sprites — 50% bigger
      if (showPlayer && useWin) {
        const drawW = 48;
        const drawH = 54;
        ctx.drawImage(winSprite, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
      } else if (showPlayer && useClimb) {
        const sw = climbSprite.naturalWidth / 4;
        const sh = climbSprite.naturalHeight;
        const sx = pl.climbFrame * sw;
        const drawW = 42;
        const drawH = 48;
        ctx.drawImage(climbSprite, sx, 0, sw, sh, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
      } else if (showPlayer && useJump) {
        const sw = jumpSprite.naturalWidth / 5;
        const sh = jumpSprite.naturalHeight;
        const sx = Math.min(pl.jumpFrame, 4) * sw;
        const drawW = 42;
        const drawH = 48;
        ctx.save();
        if (pl.facing < 0) {
          ctx.translate(pl.x + pl.w / 2, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(jumpSprite, sx, 0, sw, sh, -drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        } else {
          ctx.drawImage(jumpSprite, sx, 0, sw, sh, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        }
        ctx.restore();
      } else if (showPlayer && useWalk) {
        const sw = walkSprite.naturalWidth / 4;
        const sh = walkSprite.naturalHeight;
        const sx = pl.walkFrame * sw;
        const sy = 0;
        const drawW = 42;
        const drawH = 48;
        ctx.save();
        if (pl.facing < 0) {
          ctx.translate(pl.x + pl.w / 2, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(walkSprite, sx, sy, sw, sh, -drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        } else {
          ctx.drawImage(walkSprite, sx, sy, sw, sh, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        }
        ctx.restore();
      }

      // Carried watering can floats above the player until they water the sprout.
      if (g.keyGrabbed && !g.seedPlanted) {
        const canImg = wateringCanRef.current;
        const cx = pl.x + pl.w / 2;
        const cy = pl.y - 6;
        const drawW = 20, drawH = 16;
        if (canImg && canImg.complete && canImg.naturalWidth > 0) {
          ctx.drawImage(canImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        }
      }


      // Single rock wheel (frame 1) on the left of the dragon
      {
        const stackRock = rockWheelRef.current;
        const stackFrameW = stackRock && stackRock.naturalWidth > 0 ? stackRock.naturalWidth / 5 : 0;
        const stackFrameH = stackRock ? stackRock.naturalHeight : 0;
        const stackSize = 18;
        const sx = 60;
        const sy = 88;
        if (stackRock && stackRock.complete && stackFrameW > 0) {
          ctx.drawImage(stackRock, 0, 0, stackFrameW, stackFrameH, sx, sy, stackSize, stackSize);
        }
      }

      // HUD
      ctx.fillStyle = '#FFFFFF'; ctx.font = '10px var(--font-arcade)';
      ctx.fillText(`SCORE: ${g.score}`, 10, 20);
      ctx.fillText(`LIVES: ${'♥'.repeat(g.lives)}`, 350, 20);

      // Overlays - large, centered
      ctx.textAlign = 'center';
      if (g.state === 'gameover') {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FF3030'; ctx.font = 'bold 44px var(--font-arcade)';
        ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 30);
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 22px var(--font-arcade)';
        ctx.fillText(`SCORE: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 + 20);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 20px var(--font-arcade)';
        ctx.fillText('Press R to restart', CANVAS_W / 2, CANVAS_H / 2 + 60);
      }
      if (g.state === 'win' && wa.showCongrats) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 36px var(--font-arcade)';
        ctx.fillText('Congratulations!', CANVAS_W / 2, CANVAS_H / 2 - 50);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 32px var(--font-arcade)';
        ctx.fillText('You Won!', CANVAS_W / 2, CANVAS_H / 2 - 10);
        ctx.fillStyle = '#FFD700'; ctx.font = 'bold 24px var(--font-arcade)';
        ctx.fillText(`Score: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 + 30);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 20px var(--font-arcade)';
        ctx.fillText('Press R to restart', CANVAS_W / 2, CANVAS_H / 2 + 70);
      }
      ctx.textAlign = 'start';

      ctx.restore();
      animId = requestAnimationFrame((t) => gameLoop(t));
    };

    animId = requestAnimationFrame((t) => gameLoop(t));
    return () => { cancelAnimationFrame(animId); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [resetGame, resetPlayer]);

  // Direct, synchronous vibrate — Android is more reliable with a cleared pattern
  // and a slightly longer minimum pulse fired directly from touch/pointer handlers.
  const vibrateNow = (ms: number) => {
    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
      if (!nav || typeof nav.vibrate !== 'function') return;
      const duration = Math.max(18, Math.round(ms));
      nav.vibrate(0);
      nav.vibrate(duration);
    } catch {}
  };
  const lastHapticAtRef = useRef(0);
  const pulseHaptic = (ms: number) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastHapticAtRef.current < 18) return;
    lastHapticAtRef.current = now;
    vibrateNow(ms);
  };

  const vibrateUnlockedRef = useRef(false);
  const ensureVibrateUnlocked = () => {
    if (!vibrateUnlockedRef.current) {
      vibrateUnlockedRef.current = true;
      vibrateNow(18);
    }
  };

  const simulateKey = useCallback((key: string, type: 'down' | 'up') => {
    if (type === 'down') keysRef.current.add(key); else keysRef.current.delete(key);
  }, []);

  const padRef = useRef<HTMLDivElement>(null);
  const activePadKeysRef = useRef<string[]>([]);
  const [activePadKeys, setActivePadKeysState] = useState<string[]>([]);
  const DPAD_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  const padKeyToKeys = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return raw.split('+').filter((k) => DPAD_KEYS.includes(k));
  };

  const setActiveKeys = (next: string[]) => {
    const cur = activePadKeysRef.current;
    cur.forEach((k) => { if (!next.includes(k)) simulateKey(k, 'up'); });
    next.forEach((k) => { if (!cur.includes(k)) simulateKey(k, 'down'); });
    if (next.length && next.join(',') !== cur.join(',')) pulseHaptic(35);
    activePadKeysRef.current = next;
    setActivePadKeysState(next);
  };

  const resolvePadKeysFromPoint = (clientX: number, clientY: number): string[] => {
    const pad = padRef.current;
    if (!pad) return [];
    const rect = pad.getBoundingClientRect();
    const margin = 14;
    if (clientX < rect.left - margin || clientX > rect.right + margin || clientY < rect.top - margin || clientY > rect.bottom + margin) {
      return [];
    }

    const localX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const localY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    // Make slide controls forgiving: the full top band is Up, full bottom band is Down,
    // middle band splits left/right. This avoids losing input in visual gaps while sliding.
    if (localY <= 0.32) return ['ArrowUp'];
    if (localY >= 0.68) return ['ArrowDown'];
    return [localX < 0.5 ? 'ArrowLeft' : 'ArrowRight'];
  };

  const updatePadFromPoint = (clientX: number, clientY: number) => {
    setActiveKeys(resolvePadKeysFromPoint(clientX, clientY));
  };

  const clearPad = () => setActiveKeys([]);

  const pressPadKey = (rawKey: string) => {
    ensureVibrateUnlocked();
    setActiveKeys(padKeyToKeys(rawKey));
    pulseHaptic(35);
  };

  const padHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      ensureVibrateUnlocked();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      updatePadFromPoint(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons === 0 && e.pointerType === 'mouse') return;
      updatePadFromPoint(e.clientX, e.clientY);
    },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); clearPad(); },
    onPointerCancel: () => clearPad(),
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse' && e.buttons === 0) clearPad(); },
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      ensureVibrateUnlocked();
      const touch = e.touches[0];
      if (touch) updatePadFromPoint(touch.clientX, touch.clientY);
    },
    onTouchMove: (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) updatePadFromPoint(touch.clientX, touch.clientY);
    },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); clearPad(); },
    onTouchCancel: () => clearPad(),
  };

  const tapHandlers = (key: string, vibMs = 40) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      ensureVibrateUnlocked();
      pulseHaptic(vibMs);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      simulateKey(key, 'down');
    },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); simulateKey(key, 'up'); },
    onPointerCancel: () => simulateKey(key, 'up'),
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      ensureVibrateUnlocked();
      pulseHaptic(vibMs);
      simulateKey(key, 'down');
    },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); simulateKey(key, 'up'); },
    onTouchCancel: () => simulateKey(key, 'up'),
  });

  return (
    <div className="flex flex-col items-stretch h-screen w-screen overflow-hidden select-none bg-background">
      {/* Game area — fills all remaining space above controls */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block border-b-2 border-primary md:h-full md:w-auto md:max-w-full w-full h-full"
          style={{ imageRendering: 'pixelated', aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
          tabIndex={0}
        />
      </div>

      {/* Controls — hidden on desktop (md+); use keyboard arrows + space instead */}
      <div className="md:hidden h-[26vh] max-h-[220px] min-h-[140px] w-full flex items-stretch justify-between gap-2 px-2 py-2 touch-none shrink-0">

        {/* Locked D-pad shape: box-style arrows only, wide Up/Down, L/R centered and slightly taller */}
        <div
          ref={padRef}
          className="flex flex-1 h-full touch-none flex-col gap-1"
          {...padHandlers}
        >
          <button
            data-padkey="ArrowUp"
            style={{ flexGrow: 0.95, flexBasis: 0, width: '74%' }}
            className={`self-center ${activePadKeys.includes('ArrowUp') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-center font-bold transition-colors`}
            onPointerDown={(e) => { e.preventDefault(); pressPadKey('ArrowUp'); }}
            onTouchStart={(e) => { e.preventDefault(); pressPadKey('ArrowUp'); }}
          >↑</button>

          <div style={{ flexGrow: 1.1, flexBasis: 0 }} className="w-full flex items-stretch gap-1">
            <button
              data-padkey="ArrowLeft"
              className={`flex-1 ${activePadKeys.includes('ArrowLeft') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-end pr-4 font-bold transition-colors`}
              onPointerDown={(e) => { e.preventDefault(); pressPadKey('ArrowLeft'); }}
              onTouchStart={(e) => { e.preventDefault(); pressPadKey('ArrowLeft'); }}
            >←</button>
            <button
              data-padkey="ArrowRight"
              className={`flex-1 ${activePadKeys.includes('ArrowRight') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-start pl-4 font-bold transition-colors`}
              onPointerDown={(e) => { e.preventDefault(); pressPadKey('ArrowRight'); }}
              onTouchStart={(e) => { e.preventDefault(); pressPadKey('ArrowRight'); }}
            >→</button>
          </div>

          <button
            data-padkey="ArrowDown"
            style={{ flexGrow: 0.95, flexBasis: 0, width: '74%' }}
            className={`self-center ${activePadKeys.includes('ArrowDown') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-center font-bold transition-colors`}
            onPointerDown={(e) => { e.preventDefault(); pressPadKey('ArrowDown'); }}
            onTouchStart={(e) => { e.preventDefault(); pressPadKey('ArrowDown'); }}
          >↓</button>
        </div>

        {/* R button — small, between arrows and jump, must be tapped (not slid) */}
        <button
          className="w-10 h-10 self-center rounded-full bg-accent text-accent-foreground text-sm font-bold active:scale-95 shrink-0"
          onPointerDown={(e) => { e.preventDefault(); ensureVibrateUnlocked(); pulseHaptic(45); resetGame(); }}
          onTouchStart={(e) => { e.preventDefault(); ensureVibrateUnlocked(); pulseHaptic(45); resetGame(); }}
        >R</button>

        {/* JUMP button — extra-large, tap-only */}
        <button
          className="h-full aspect-square rounded-full bg-primary text-primary-foreground text-2xl font-bold active:scale-95 shrink-0"
          {...tapHandlers(' ', 45)}
        >JUMP</button>
      </div>
    </div>
  );
};

export default DonkeyKongGame;
