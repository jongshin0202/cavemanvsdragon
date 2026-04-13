import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CANVAS_W, CANVAS_H, GRAVITY, JUMP_FORCE, MOVE_SPEED, BARREL_SPEED, CLIMB_SPEED, ROBOT_SPEED,
  PLATFORMS, LADDERS, getPlatformY, rectsOverlap, findPlatformIndex, findBestLadder,
  Barrel, Robot
} from './game/constants';
import { playJumpSound, playBarrelRollSound, playGameOverSound, playWinSound, playHitSound, playRobotKillSound } from './game/sounds';
import cavemanSpriteUrl from '@/assets/caveman-sprite.png';
import dragonSpriteUrl from '@/assets/dragon-sprite.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';

// Dragon sprite sheet config (idle row: top row, 4 frames)
const DRAGON_FRAME_W = 130;
const DRAGON_FRAME_H = 140;
const DRAGON_FRAMES = 4; // idle frames in top row

const LADDER_SNAP = 30;

// Sprite sheet config: 7 cols top row (walk), 7 cols mid row (attack+fall), 5 cols bottom row (hurt/die)
const SPRITE_COLS = 7;
const SPRITE_W = 190; // approximate frame width
const SPRITE_H = 200; // approximate frame height

const DonkeyKongGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'win'>('playing');
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const dragonRef = useRef<HTMLImageElement | null>(null);
  const princessRef = useRef<HTMLImageElement | null>(null);
  const gameRef = useRef({
    player: { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0 },
    barrels: [] as Barrel[],
    robots: [] as Robot[],
    barrelTimer: 0,
    nextBarrelTime: 90 + Math.random() * 180,
    robotSpawnTimer: 0,
    robotsInitialized: false,
    score: 0,
    lives: 3,
    state: 'playing' as string,
    dkFrame: 0,
    dkAnimTimer: 0,
    princessAnimTimer: 0,
    helpTimer: 0,
    showHelp: false,
    barrelSoundTimer: 0,
    deathTimer: 0,
    deathFlashTimer: 0,
    dying: false,
    frameCount: 0,
    winAnim: { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 },
  });

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0 };
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

    // Load sprite
    const spriteImg = new Image();
    spriteImg.src = cavemanSpriteUrl;
    spriteRef.current = spriteImg;

    const dragonImg = new Image();
    dragonImg.src = dragonSpriteUrl;
    dragonRef.current = dragonImg;

    const princessImg = new Image();
    princessImg.src = princessSpriteUrl;
    princessRef.current = princessImg;

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
      if (g.dkAnimTimer > 20) { g.dkAnimTimer = 0; g.dkFrame = (g.dkFrame + 1) % DRAGON_FRAMES; }
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

        if (keys.has('ArrowUp') && nearestLadder) {
          p.climbing = true;
          p.x = nearestLadder.x + 7 - p.w / 2;
        } else if (keys.has('ArrowDown') && nearestLadder) {
          // Only climb down if ladder goes below current position
          if (p.y + p.h < nearestLadder.yBot - 4) {
            p.climbing = true;
            p.x = nearestLadder.x + 7 - p.w / 2;
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
            if (keys.has('ArrowUp')) p.y -= CLIMB_SPEED;
            if (keys.has('ArrowDown')) p.y += CLIMB_SPEED;
          }
        }

        if (!p.climbing) {
          const moving = keys.has('ArrowLeft') || keys.has('ArrowRight');
          if (keys.has('ArrowLeft')) { p.x -= MOVE_SPEED; p.facing = -1; }
          if (keys.has('ArrowRight')) { p.x += MOVE_SPEED; p.facing = 1; }
          if (moving && p.onGround) { p.walkTimer++; if (p.walkTimer > 6) { p.walkTimer = 0; p.walkFrame = (p.walkFrame + 1) % 7; } }
          else if (!moving) { p.walkFrame = 0; p.walkTimer = 0; }
          if ((keys.has(' ')) && p.onGround) {
            p.vy = -5; p.onGround = false; p.jumping = true;
            playJumpSound();
          }
          p.vy += GRAVITY; p.y += p.vy;
          p.onGround = false;
          for (const plat of PLATFORMS) {
            if (p.x + p.w > plat.x1 && p.x < plat.x2) {
              const platY = getPlatformY(plat, p.x + p.w / 2);
              if (p.y + p.h >= platY && p.y + p.h <= platY + 12 && p.vy >= 0) {
                p.y = platY - p.h; p.vy = 0; p.onGround = true; p.jumping = false;
              }
            }
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

        // === BARREL SPAWNING (random intervals, random speeds) ===
        g.barrelTimer++;
        if (!g.nextBarrelTime) g.nextBarrelTime = 90 + Math.random() * 180;
        if (g.barrelTimer > g.nextBarrelTime) {
          g.barrelTimer = 0;
          g.nextBarrelTime = 90 + Math.random() * 180; // random 90-270 frames (1.5-4.5 seconds)
          const speed = BARREL_SPEED * (0.7 + Math.random() * 0.8);
          g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed });
          playBarrelRollSound();
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

        // === UPDATE ROBOTS (always moving, decide at ladders) ===
        for (let i = g.robots.length - 1; i >= 0; i--) {
          const r = g.robots[i];
          const rCenterX = r.x + r.w / 2;
          const rFeetY = r.y + r.h;
          const rPlatIdx = findPlatformIndex(rFeetY, rCenterX);
          const pPlatIdx = findPlatformIndex(playerFeetY, playerCenterX);

          r.frameTimer++;
          if (r.frameTimer > 15) { r.frameTimer = 0; r.frame = (r.frame + 1) % 2; }

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
            const desiredDirection = playerCenterX >= rCenterX ? 1 : -1;
            const continueScore = scoreToPlayer(rCenterX + desiredDirection * r.speed, rFeetY);
            let climbChoice: { ladderIdx: number; climbVy: number; score: number } | null = null;

            for (let li = 0; li < LADDERS.length; li++) {
              const l = LADDERS[li];
              const ladderCenterX = l.x + 7;
              if (Math.abs(rCenterX - ladderCenterX) > r.speed + 4) continue;

              const topPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yTop) < 12);
              const botPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yBot) < 12);

              // Climb UP: robot is on botPlatIdx, player is higher (lower index)
              if (botPlatIdx === rPlatIdx && topPlatIdx >= 0 && topPlatIdx < rPlatIdx) {
                const scoreUp = scoreToPlayer(ladderCenterX, l.yTop);
                if (scoreUp < continueScore && (!climbChoice || scoreUp < climbChoice.score)) {
                  climbChoice = { ladderIdx: li, climbVy: -r.speed, score: scoreUp };
                }
              }

              // Climb DOWN: robot is on topPlatIdx, player is lower (higher index)
              if (topPlatIdx === rPlatIdx && botPlatIdx >= 0 && botPlatIdx > rPlatIdx) {
                const scoreDown = scoreToPlayer(ladderCenterX, l.yBot);
                if (scoreDown < continueScore && (!climbChoice || scoreDown < climbChoice.score)) {
                  climbChoice = { ladderIdx: li, climbVy: r.speed, score: scoreDown };
                }
              }
            }

            if (climbChoice) {
              const l = LADDERS[climbChoice.ladderIdx];
              r.climbing = true;
              r.targetLadder = climbChoice.ladderIdx;
              r.vx = 0;
              r.vy = climbChoice.climbVy;
              r.x = l.x + (16 - r.w) / 2;
            } else {
              // Always move - patrol back and forth, prefer chasing player
              r.direction = desiredDirection;
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

              r.x = Math.max(0, Math.min(CANVAS_W - r.w, r.x));
            }
          }

          if (r.y > CANVAS_H + 20) { g.robots.splice(i, 1); continue; }

          if (rectsOverlap(p, r)) {
            // Stomp kill: player is falling and feet are above robot's mid-point
            if (p.vy > 0 && p.y + p.h <= r.y + r.h * 0.6) {
              g.score += 200; setScore(g.score);
              playRobotKillSound();
              p.vy = -4; // bounce up after stomp
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

      // Platforms
      for (const plat of PLATFORMS) {
        ctx.fillStyle = '#D42A2A';
        for (let x = plat.x1; x < plat.x2; x += 16) {
          const y = getPlatformY(plat, x + 8);
          ctx.fillRect(x, y, 16, 8);
          ctx.fillStyle = '#FF6B4A';
          ctx.fillRect(x + 2, y + 1, 5, 3);
          ctx.fillRect(x + 9, y + 4, 5, 3);
          ctx.fillStyle = '#D42A2A';
        }
      }

      // Ladders
      ctx.strokeStyle = '#66CCFF'; ctx.lineWidth = 2;
      for (const l of LADDERS) {
        ctx.beginPath();
        ctx.moveTo(l.x, l.yTop); ctx.lineTo(l.x, l.yBot);
        ctx.moveTo(l.x + 14, l.yTop); ctx.lineTo(l.x + 14, l.yBot);
        for (let y = l.yTop; y < l.yBot; y += 12) { ctx.moveTo(l.x, y); ctx.lineTo(l.x + 14, y); }
        ctx.stroke();
      }

      // Dragon boss (with win animation - flip and fall)
      const dkX = 90;
      const dragonSize = 48;
      const dragonImg = dragonRef.current;
      if (wa.active) {
        ctx.save();
        ctx.translate(dkX + dragonSize / 2, wa.gorillaY + dragonSize / 2);
        ctx.rotate(wa.gorillaRotation);
        if (dragonImg && dragonImg.complete) {
          ctx.drawImage(dragonImg, 0, 0, DRAGON_FRAME_W, DRAGON_FRAME_H, -dragonSize / 2, -dragonSize / 2, dragonSize, dragonSize);
        } else {
          ctx.fillStyle = '#2d8c2d'; ctx.fillRect(-dragonSize / 2, -dragonSize / 2, dragonSize, dragonSize);
        }
        ctx.restore();
      } else {
        const dkY = 64;
        const frameIdx = g.dkFrame % DRAGON_FRAMES;
        if (dragonImg && dragonImg.complete) {
          ctx.drawImage(dragonImg, frameIdx * DRAGON_FRAME_W, 0, DRAGON_FRAME_W, DRAGON_FRAME_H, dkX, dkY, dragonSize, dragonSize);
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

      // Barrels
      for (const b of g.barrels) {
        ctx.fillStyle = '#4488FF'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#88BBFF'; ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      }

      // Robots
      for (const r of g.robots) {
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(r.x, r.y + 4, r.w, r.h - 4);
        ctx.fillStyle = '#CC2222';
        ctx.fillRect(r.x + 2, r.y, r.w - 4, 6);
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(r.x + 3, r.y + 1, 3, 3);
        ctx.fillRect(r.x + r.w - 6, r.y + 1, 3, 3);
        ctx.fillStyle = '#AA1111';
        if (r.frame === 0) {
          ctx.fillRect(r.x + 1, r.y + r.h - 2, 4, 3);
          ctx.fillRect(r.x + r.w - 5, r.y + r.h - 1, 4, 2);
        } else {
          ctx.fillRect(r.x + 1, r.y + r.h - 1, 4, 2);
          ctx.fillRect(r.x + r.w - 5, r.y + r.h - 2, 4, 3);
        }
        ctx.strokeStyle = '#FF6666'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.x + r.w / 2, r.y);
        ctx.lineTo(r.x + r.w / 2 + (r.frame === 0 ? 3 : -3), r.y - 5);
        ctx.stroke();
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(r.x + r.w / 2 + (r.frame === 0 ? 2 : -4), r.y - 6, 3, 3);
      }

      // Player (Caveman sprite) - flash when dying (0.25s on/off = 15 frames)
      const pl = g.player;
      const showPlayer = !g.dying || Math.floor(g.deathFlashTimer / 15) % 2 === 0;
      const sprite = spriteRef.current;
      if (showPlayer && sprite && sprite.complete && sprite.naturalWidth > 0) {
        const row = pl.jumping ? 1 : 0; // top row = walk, mid row for jump/attack
        const col = pl.jumping ? 4 : pl.walkFrame; // use attack swing frame for jump
        const sw = sprite.naturalWidth / SPRITE_COLS;
        const sh = sprite.naturalHeight / 3;
        const sx = col * sw;
        const sy = row * sh;
        const drawW = 28;
        const drawH = 32;
        ctx.save();
        if (pl.facing < 0) {
          ctx.translate(pl.x + pl.w / 2, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(sprite, sx, sy, sw, sh, -drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        } else {
          ctx.drawImage(sprite, sx, sy, sw, sh, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        }
        ctx.restore();
      } else if (showPlayer) {
        // Fallback pixel art
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

      // Overlays
      if (g.state === 'gameover') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FF0000'; ctx.font = '20px var(--font-arcade)';
        ctx.fillText('GAME OVER', 120, 220);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '10px var(--font-arcade)';
        ctx.fillText('Press R to restart', 140, 260);
      }
      if (g.state === 'win' && wa.showCongrats) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 150, CANVAS_W, 100);
        ctx.fillStyle = '#FFD700'; ctx.font = '16px var(--font-arcade)';
        ctx.fillText('Congratulations!', 100, 190);
        ctx.fillText('You Won!', 160, 220);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '10px var(--font-arcade)';
        ctx.fillText(`Score: ${g.score}`, 190, 240);
        ctx.fillText('Press R to restart', 150, 260);
      }

      ctx.restore();
      animId = requestAnimationFrame((t) => gameLoop(t));
    };

    animId = requestAnimationFrame((t) => gameLoop(t));
    return () => { cancelAnimationFrame(animId); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [resetGame, resetPlayer]);

  const simulateKey = useCallback((key: string, type: 'down' | 'up') => {
    if (type === 'down') keysRef.current.add(key); else keysRef.current.delete(key);
  }, []);

  const handleDown = useCallback((key: string) => ({
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); simulateKey(key, 'down'); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); simulateKey(key, 'up'); },
    onMouseDown: () => simulateKey(key, 'down'),
    onMouseUp: () => simulateKey(key, 'up'),
    onMouseLeave: () => simulateKey(key, 'up'),
  }), [simulateKey]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-2 p-2 select-none">
      <h1 className="text-accent text-sm tracking-wider">DRAGON KONG</h1>
      <div className="border-4 border-primary rounded-sm shadow-[0_0_30px_rgba(212,42,42,0.3)]">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          className="block w-full max-w-[512px]" style={{ imageRendering: 'pixelated' }} tabIndex={0} />
      </div>
      <div className="flex w-full max-w-[512px] justify-between items-end mt-2 touch-none">
        <div className="grid grid-cols-3 grid-rows-3 gap-0 w-40 h-40">
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-2xl flex items-center justify-center p-4 -m-1 z-10" {...handleDown('ArrowUp')}>↑</button>
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-2xl flex items-center justify-center p-4 -m-1 z-10" {...handleDown('ArrowLeft')}>←</button>
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-2xl flex items-center justify-center p-4 -m-1 z-10" {...handleDown('ArrowRight')}>→</button>
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-2xl flex items-center justify-center p-4 -m-1 z-10" {...handleDown('ArrowDown')}>↓</button>
          <div />
        </div>
        <div className="flex gap-3 items-center">
          <button className="w-20 h-20 rounded-full bg-primary text-primary-foreground text-sm font-bold active:scale-95" {...handleDown(' ')}>JUMP</button>
          <button className="w-14 h-14 rounded-full bg-accent text-accent-foreground text-xs font-bold active:scale-95"
            onMouseDown={() => resetGame()} onTouchStart={() => resetGame()}>R</button>
        </div>
      </div>
    </div>
  );
};

export default DonkeyKongGame;
