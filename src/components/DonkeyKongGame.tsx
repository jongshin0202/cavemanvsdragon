import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CANVAS_W, CANVAS_H, GRAVITY, JUMP_FORCE, MOVE_SPEED, BARREL_SPEED, CLIMB_SPEED, ROBOT_SPEED,
  PLATFORMS, LADDERS, getPlatformY, rectsOverlap, findPlatformIndex, findBestLadder,
  Barrel, Robot
} from './game/constants';
import { playJumpSound, playBarrelRollSound, playGameOverSound, playWinSound, playHitSound, playRobotKillSound } from './game/sounds';
import cavemanWalkUrl from '@/assets/caveman-walk.png';
import cavemanJumpUrl from '@/assets/caveman-jump.png';
import cavemanClimbUrl from '@/assets/caveman-climb.png';
import cavemanWinUrl from '@/assets/caveman-win.png';
import dragonFireUrl from '@/assets/dragon-fire.png';
import dragonAngryUrl from '@/assets/dragon-angry.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';
import robotWalkUrl from '@/assets/robot-walk.png';
import rockWheelUrl from '@/assets/rock-wheel.png';

const ROBOT_WALK_FRAMES = 5;

// Dragon sprite sheets: each has 5 frames, randomly alternated
const DRAGON_FRAMES = 5;

const LADDER_SNAP = 30;

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
  });

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0 };
    g.barrels = [];
    g.barrelTimer = 0;
  }, []);

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.state = 'playing'; g.dying = false; g.deathTimer = 0; g.deathFlashTimer = 0;
    g.robots = [];
    g.robotSpawnTimer = 0;
    g.robotsInitialized = false;
    g.nextBarrelTime = 90 + Math.random() * 180;
    g.frameCount = 0;
    g.playerHasMoved = false;
    g.barrelStartDelay = 0;
    g.dkAnimTimer = 0; g.dkFrame = 0;
    g.princessAnimTimer = 0; g.helpTimer = 0; g.showHelp = false;
    g.winAnim = { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 };
    resetPlayer();
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
    const FRAME_INTERVAL = 1000 / 45; // ~45fps instead of 60fps = 25% slower

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
        if (g.deathTimer >= 45) { // ~1 second at 45fps
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
        // === PLAYER MOVEMENT ===
        // Wider snap: find nearest ladder within LADDER_SNAP pixels
        const playerCX = p.x + p.w / 2;
        let nearestLadder: (typeof LADDERS)[number] | null = null;
        let nearestLadderDist = Infinity;
        for (const l of LADDERS) {
          const ladderCX = l.x + 7;
          const dist = Math.abs(playerCX - ladderCX);
          if (dist < LADDER_SNAP && p.y + p.h > l.yTop - 8 && p.y + p.h <= l.yBot + 16 && dist < nearestLadderDist) {
            nearestLadder = l;
            nearestLadderDist = dist;
          }
        }

        // "Sticky" vertical intent: if user presses up/down with no ladder available,
        // remember the intent so we auto-mount the next ladder they walk into.
        // This way users don't need to look at their fingers — they keep moving
        // horizontally and climb automatically when a ladder is reached.
        if (keys.has('ArrowUp')) {
          (g as any).pendingClimb = 'up';
        } else if (keys.has('ArrowDown')) {
          (g as any).pendingClimb = 'down';
        }
        // Clear pending intent if user presses left/right after — but only if no vertical key held
        if (!keys.has('ArrowUp') && !keys.has('ArrowDown') && (keys.has('ArrowLeft') || keys.has('ArrowRight'))) {
          // keep pendingClimb so they auto-mount when they reach a ladder while walking
        }

        const wantUp = keys.has('ArrowUp') || (g as any).pendingClimb === 'up';
        const wantDown = keys.has('ArrowDown') || (g as any).pendingClimb === 'down';

        if (wantUp && nearestLadder) {
          p.climbing = true;
          p.x = nearestLadder.x + 7 - p.w / 2;
          (g as any).pendingClimb = null;
        } else if (wantDown) {
          if (nearestLadder && p.y + p.h < nearestLadder.yBot - 4) {
            // Climb down ladder
            p.climbing = true;
            p.x = nearestLadder.x + 7 - p.w / 2;
            (g as any).pendingClimb = null;
          } else if (p.onGround && !nearestLadder && keys.has('ArrowDown')) {
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
          
          if (!nearestLadder && !nearTop) {
            p.climbing = false;
          } else if (nearTop && (keys.has('ArrowLeft') || keys.has('ArrowRight') || keys.has('ArrowUp'))) {
            // Snap to top platform and dismount
            p.climbing = false;
            if (climbingLadder) p.y = climbingLadder.yTop - p.h;
          } else if (keys.has('ArrowLeft') || keys.has('ArrowRight')) {
            p.climbing = false;
          } else {
            p.vy = 0;
            const climbMoving = keys.has('ArrowUp') || keys.has('ArrowDown');
            if (keys.has('ArrowUp')) p.y -= CLIMB_SPEED;
            if (keys.has('ArrowDown')) p.y += CLIMB_SPEED;
            if (climbMoving) {
              p.climbTimer++;
              if (p.climbTimer > 8) { p.climbTimer = 0; p.climbFrame = (p.climbFrame + 1) % 4; }
            }
          }
        }

        if (!p.climbing) {
          const moving = keys.has('ArrowLeft') || keys.has('ArrowRight');
          if (moving && !g.playerHasMoved) { g.playerHasMoved = true; g.barrelStartDelay = 22; g.barrelTimer = 0; g.nextBarrelTime = 22; }
          if (keys.has('ArrowLeft')) { p.x -= MOVE_SPEED; p.facing = -1; }
          if (keys.has('ArrowRight')) { p.x += MOVE_SPEED; p.facing = 1; }
          if (moving && p.onGround) { p.walkTimer++; if (p.walkTimer > 6) { p.walkTimer = 0; p.walkFrame = (p.walkFrame + 1) % 4; } }
          else if (!moving) { p.walkFrame = 0; p.walkTimer = 0; }
          if ((keys.has(' ')) && p.onGround) {
            p.vy = -5; p.onGround = false; p.jumping = true;
            p.jumpFrame = 0; p.jumpTimer = 0;
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

        // Win condition - touch the girl
        const paulX = 240, paulY = 72;
        if (rectsOverlap(p, { x: paulX, y: paulY, w: 12, h: 20 })) {
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

        // === ROBOT SPAWNING (initial random per platform, respawn) ===
        if (!g.robotsInitialized) {
          g.robotsInitialized = true;
          // Spawn 0-2 robots on each platform except top (index 5)
          for (let pi = 0; pi < PLATFORMS.length - 1; pi++) {
            const count = 1;
            const plat = PLATFORMS[pi];
            for (let c = 0; c < count; c++) {
              const rx = pi === 0 ? plat.x2 - 30 : plat.x1 + 30 + Math.random() * (plat.x2 - plat.x1 - 60);
              const ry = getPlatformY(plat, rx) - 16;
              const spd = ROBOT_SPEED * (0.6 + Math.random() * 0.8);
              g.robots.push({ x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0, onGround: true, climbing: false, targetLadder: null, direction: pi === 0 ? -1 : (Math.random() > 0.5 ? 1 : -1), frame: 0, frameTimer: 0, speed: spd });
            }
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
          // Smooth, time-based roll animation phase (advances every frame)
          b.rollPhase = (b.rollPhase || 0) + 1;
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

          // Collision with player
          if (rectsOverlap(p, b)) {
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
          if (rectsOverlap(p, r) && (rPlatY === pPlatY || p.onGround)) {
            if (p.vy > 0 && p.y + p.h <= r.y + r.h * 0.6) {
              g.score += 200; setScore(g.score);
              playRobotKillSound();
              p.vy = -4;
              g.robots.splice(i, 1);
            } else {
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

      // Ladders - green caveman vines
      for (const l of LADDERS) {
        // Two vertical vines (wavy)
        ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = l.yTop; y <= l.yBot; y += 4) {
          const wave = Math.sin(y * 0.4) * 1.5;
          if (y === l.yTop) ctx.moveTo(l.x + wave, y);
          else ctx.lineTo(l.x + wave, y);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let y = l.yTop; y <= l.yBot; y += 4) {
          const wave = Math.sin(y * 0.4 + 1) * 1.5;
          if (y === l.yTop) ctx.moveTo(l.x + 14 + wave, y);
          else ctx.lineTo(l.x + 14 + wave, y);
        }
        ctx.stroke();
        // Vine highlights
        ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(l.x - 1, l.yTop); ctx.lineTo(l.x - 1, l.yBot);
        ctx.moveTo(l.x + 13, l.yTop); ctx.lineTo(l.x + 13, l.yBot);
        ctx.stroke();
        // Rungs as small twigs/leaves
        for (let y = l.yTop + 4; y < l.yBot; y += 12) {
          ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(l.x + 1, y); ctx.lineTo(l.x + 13, y);
          ctx.stroke();
          // Leaf accents
          ctx.fillStyle = '#66BB6A';
          ctx.fillRect(l.x + 3, y - 2, 2, 2);
          ctx.fillRect(l.x + 9, y + 1, 2, 2);
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
        } else {
          ctx.fillStyle = '#2d8c2d'; ctx.fillRect(-dragonSize / 2, -dragonSize / 2, dragonSize, dragonSize);
        }
        ctx.restore();
      } else {
        const dkY = 16;
        const frameIdx = g.dkFrame % DRAGON_FRAMES;
        if (dragonImg && dragonImg.complete && dragonFrameW > 0) {
          ctx.drawImage(dragonImg, frameIdx * dragonFrameW, 0, dragonFrameW, dragonFrameH, dkX, dkY, dragonSize, dragonSize);
        } else {
          ctx.fillStyle = '#2d8c2d'; ctx.fillRect(dkX, dkY, dragonSize, dragonSize);
        }
      }

      // Princess (sprite)
      const paulX = 235, paulY = 62;
      const princessImg = princessRef.current;
      const princessDrawW = 24;
      const princessDrawH = 32;
      if (princessImg && princessImg.complete && princessImg.naturalWidth > 0) {
        // Use first idle frame only - no alternation to avoid flashing
        const pFrameW = princessImg.naturalWidth / 7;
        const pFrameH = princessImg.naturalHeight / 3;
        if (wa.active && wa.showKiss) {
          ctx.drawImage(princessImg, 0, 0, pFrameW, pFrameH, paulX, paulY, princessDrawW, princessDrawH);
          ctx.fillStyle = '#FF0000'; ctx.font = '12px serif';
          ctx.fillText('❤', paulX + princessDrawW + 2, paulY + 8);
          ctx.fillStyle = '#FF69B4'; ctx.font = '7px monospace';
          ctx.fillText('Thank You!', paulX - 20, paulY - 6);
        } else {
          ctx.drawImage(princessImg, 0, 0, pFrameW, pFrameH, paulX, paulY, princessDrawW, princessDrawH);
          if (g.showHelp) {
            ctx.fillStyle = '#FFFFFF'; ctx.font = '7px monospace';
            ctx.fillText('Help!', paulX - 4, paulY - 6);
          }
        }
      } else {
        // Fallback
        ctx.fillStyle = '#FF69B4'; ctx.fillRect(paulX, paulY, 12, 20);
        ctx.fillStyle = '#FFD700'; ctx.fillRect(paulX + 2, paulY - 6, 8, 8);
        if (wa.active && wa.showKiss) {
          ctx.fillStyle = '#FF0000'; ctx.font = '12px serif';
          ctx.fillText('❤', paulX + 14, paulY + 4);
        } else {
          ctx.fillStyle = '#FF69B4'; ctx.font = '8px var(--font-arcade)';
          ctx.fillText('HELP!', paulX - 8, paulY - 10);
        }
      }

      // Rolling rock wheels (sprite-animated, rotates as it rolls)
      const rockImg = rockWheelRef.current;
      const ROCK_FRAMES = 5;
      const rockFrameW = rockImg && rockImg.naturalWidth > 0 ? rockImg.naturalWidth / ROCK_FRAMES : 0;
      const rockFrameH = rockImg ? rockImg.naturalHeight : 0;
      for (const b of g.barrels) {
        if (rockImg && rockImg.complete && rockFrameW > 0) {
          // Smooth animation: advance one frame every 4 game ticks regardless of speed
          const frameIdx = Math.floor((b.rollPhase || 0) / 4) % ROCK_FRAMES;
          const drawSize = (b.w + 4) * 1.5; // 50% bigger
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          ctx.drawImage(rockImg, frameIdx * rockFrameW, 0, rockFrameW, rockFrameH,
            cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
        } else {
          ctx.fillStyle = '#8B7355'; ctx.beginPath();
          ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 0, Math.PI * 2);
          ctx.fill();
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
        } else {
          ctx.fillStyle = '#FF4444';
          ctx.fillRect(r.x, r.y + 4, r.w, r.h - 4);
        }
      }

      // Player (Caveman sprite) - flash when dying (0.25s on/off = 15 frames)
      const pl = g.player;
      const showPlayer = !g.dying || Math.floor(g.deathFlashTimer / 15) % 2 === 0;
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
      } else if (showPlayer) {
        // Fallback pixel art (only if new sprites haven't loaded yet)
        ctx.fillStyle = '#FF0000'; ctx.fillRect(pl.x + 2, pl.y, 12, 4);
        ctx.fillStyle = '#FFB366'; ctx.fillRect(pl.x + 2, pl.y + 4, 12, 6);
        ctx.fillStyle = '#FF0000'; ctx.fillRect(pl.x, pl.y + 10, 16, 8);
        ctx.fillStyle = '#3366FF'; ctx.fillRect(pl.x + 2, pl.y + 18, 12, 6);
        ctx.fillStyle = '#000';
        if (pl.facing > 0) ctx.fillRect(pl.x + 9, pl.y + 5, 2, 2);
        else ctx.fillRect(pl.x + 5, pl.y + 5, 2, 2);
      }

      // Barrel stack
      ctx.fillStyle = '#4488FF';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(60, 90 + i * 16, 14, 14);
        ctx.strokeStyle = '#88BBFF'; ctx.strokeRect(62, 92 + i * 16, 10, 10);
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

  const vibrate = useCallback((ms = 15) => {
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms); } catch {}
  }, []);

  const simulateKey = useCallback((key: string, type: 'down' | 'up') => {
    if (type === 'down') keysRef.current.add(key); else keysRef.current.delete(key);
  }, []);

  // Slide-aware D-pad: track which button the pointer is over and only press that one
  const padRef = useRef<HTMLDivElement>(null);
  const activePadKeyRef = useRef<string | null>(null);
  const DPAD_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  const updatePadFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const key = el?.getAttribute('data-padkey');
    const next = key && DPAD_KEYS.includes(key) ? key : null;
    if (activePadKeyRef.current !== next) {
      if (activePadKeyRef.current) simulateKey(activePadKeyRef.current, 'up');
      if (next) { simulateKey(next, 'down'); vibrate(15); }
      activePadKeyRef.current = next;
    }
  }, [simulateKey, vibrate]);

  const clearPad = useCallback(() => {
    if (activePadKeyRef.current) {
      simulateKey(activePadKeyRef.current, 'up');
      activePadKeyRef.current = null;
    }
  }, [simulateKey]);

  const padHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
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
  };

  // Tap-only handler for jump / R (must be pressed, not slid into)
  const tapHandlers = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      simulateKey(key, 'down');
      vibrate(20);
    },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); simulateKey(key, 'up'); },
    onPointerCancel: () => simulateKey(key, 'up'),
  });

  return (
    <div className="flex flex-col items-stretch h-screen w-screen overflow-hidden select-none bg-background">
      {/* Game area — fills all remaining space above controls */}
      <div className="flex-1 min-h-0 w-full flex items-stretch justify-stretch">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          className="block w-full h-full border-b-2 border-primary"
          style={{ imageRendering: 'pixelated' }} tabIndex={0} />
      </div>

      {/* Controls — fixed compact height to maximize game area */}
      <div className="h-[26vh] max-h-[220px] min-h-[140px] w-full flex items-stretch justify-between gap-2 px-2 py-2 touch-none shrink-0">

        {/* D-pad: wide L/R meeting in center, wide Up/Down stacked */}
        <div
          ref={padRef}
          className="flex flex-col flex-1 h-full touch-none gap-1"
          {...padHandlers}
        >
          <button
            data-padkey="ArrowUp"
            className="w-full flex-1 bg-muted active:bg-primary rounded-lg text-foreground text-3xl flex items-center justify-center font-bold"
          >↑</button>

          <div className="w-full flex-1 flex items-stretch">
            <button
              data-padkey="ArrowLeft"
              className="flex-1 bg-muted active:bg-primary rounded-l-lg text-foreground text-3xl flex items-center justify-center font-bold border-r-2 border-background"
            >←</button>
            <button
              data-padkey="ArrowRight"
              className="flex-1 bg-muted active:bg-primary rounded-r-lg text-foreground text-3xl flex items-center justify-center font-bold"
            >→</button>
          </div>

          <button
            data-padkey="ArrowDown"
            className="w-full flex-1 bg-muted active:bg-primary rounded-lg text-foreground text-3xl flex items-center justify-center font-bold"
          >↓</button>
        </div>

        {/* R button — small, between arrows and jump, must be tapped (not slid) */}
        <button
          className="w-10 h-10 self-center rounded-full bg-accent text-accent-foreground text-sm font-bold active:scale-95 shrink-0"
          onPointerDown={(e) => { e.preventDefault(); vibrate(25); resetGame(); }}
        >R</button>

        {/* JUMP button — extra-large, tap-only */}
        <button
          className="h-full aspect-square rounded-full bg-primary text-primary-foreground text-2xl font-bold active:scale-95 shrink-0"
          {...tapHandlers(' ')}
        >JUMP</button>
      </div>
    </div>
  );
};

export default DonkeyKongGame;
