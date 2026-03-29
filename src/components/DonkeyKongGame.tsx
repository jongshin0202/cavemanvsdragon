import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CANVAS_W, CANVAS_H, GRAVITY, JUMP_FORCE, MOVE_SPEED, BARREL_SPEED, CLIMB_SPEED, ROBOT_SPEED,
  PLATFORMS, LADDERS, getPlatformY, rectsOverlap, findPlatformIndex, findBestLadder,
  Barrel, Robot
} from './game/constants';
import { playJumpSound, playBarrelRollSound, playGameOverSound, playWinSound, playHitSound } from './game/sounds';

const DonkeyKongGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'win'>('playing');
  const gameRef = useRef({
    player: { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false },
    barrels: [] as Barrel[],
    robots: [] as Robot[],
    barrelTimer: 0,
    robotSpawnTimer: 0,
    score: 0,
    lives: 3,
    state: 'playing' as string,
    dkFrame: 0,
    dkTimer: 0,
    barrelSoundTimer: 0,
  });

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false };
    g.barrels = [];
    g.barrelTimer = 0;
  }, []);

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.state = 'playing';
    g.robots = [];
    g.robotSpawnTimer = 0;
    resetPlayer();
    setScore(0); setLives(3); setGameState('playing');
  }, [resetPlayer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'r' || e.key === 'R') resetGame();
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let animId: number;

    const gameLoop = () => {
      const g = gameRef.current;
      const keys = keysRef.current;
      const p = g.player;

      if (g.state === 'playing') {
        // === PLAYER MOVEMENT ===
        const onLadder = LADDERS.some(l =>
          p.x + p.w / 2 > l.x - 8 && p.x + p.w / 2 < l.x + 16 + 8 &&
          p.y + p.h > l.yTop && p.y + p.h <= l.yBot + 4
        );

        if (keys.has('ArrowUp') && onLadder) p.climbing = true;
        if (keys.has('ArrowDown') && onLadder) p.climbing = true;

        if (p.climbing) {
          if (!onLadder) p.climbing = false;
          else {
            p.vy = 0;
            if (keys.has('ArrowUp')) p.y -= CLIMB_SPEED;
            if (keys.has('ArrowDown')) p.y += CLIMB_SPEED;
            if (keys.has('ArrowLeft') || keys.has('ArrowRight')) p.climbing = false;
          }
        }

        if (!p.climbing) {
          if (keys.has('ArrowLeft')) { p.x -= MOVE_SPEED; p.facing = -1; }
          if (keys.has('ArrowRight')) { p.x += MOVE_SPEED; p.facing = 1; }
          // Jump only for dodging, NOT for reaching platforms (reduced force)
          if ((keys.has(' ')) && p.onGround && !onLadder) {
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
          else { playHitSound(); resetPlayer(); }
        }

        // Win condition
        if (p.y < 100 && p.x > 180 && p.x < 320) {
          g.state = 'win'; setGameState('win');
          g.score += 1000; setScore(g.score); playWinSound();
        }

        // === BARREL SPAWNING ===
        g.barrelTimer++;
        if (g.barrelTimer > 100) {
          g.barrelTimer = 0;
          g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: BARREL_SPEED, vy: 0, onLadder: false, falling: false, targetLadder: null });
          playBarrelRollSound();
        }

        // === ROBOT SPAWNING ===
        g.robotSpawnTimer++;
        if (g.robotSpawnTimer > 300 && g.robots.length < 4) {
          g.robotSpawnTimer = 0;
          const spawnX = Math.random() > 0.5 ? 490 : 10;
          g.robots.push({ x: spawnX, y: 400, w: 14, h: 16, vx: 0, vy: 0, onGround: false, climbing: false, targetLadder: null, direction: 1, frame: 0, frameTimer: 0 });
        }

        // DK animation
        g.dkTimer++;
        if (g.dkTimer > 30) { g.dkTimer = 0; g.dkFrame = (g.dkFrame + 1) % 2; }

        // === UPDATE BARRELS ===
        g.barrelSoundTimer++;
        for (let i = g.barrels.length - 1; i >= 0; i--) {
          const b = g.barrels[i];
          const bCenterX = b.x + b.w / 2;

          if (b.onLadder) {
            // Climbing down a ladder
            b.y += 2.5;
            b.vx = 0;
            if (b.targetLadder !== null) {
              const l = LADDERS[b.targetLadder];
              if (b.y + b.h >= l.yBot) {
                b.y = l.yBot - b.h;
                b.onLadder = false;
                b.targetLadder = null;
                // Pick direction toward player after exiting ladder
                b.vx = bCenterX < p.x + p.w / 2 ? BARREL_SPEED : -BARREL_SPEED;
              }
            }
          } else if (b.falling) {
            // Falling off platform edge
            b.vy += GRAVITY;
            b.y += b.vy;
            // Check landing on platform below
            for (const plat of PLATFORMS) {
              if (b.x + b.w > plat.x1 && b.x < plat.x2) {
                const platY = getPlatformY(plat, bCenterX);
                if (b.y + b.h >= platY && b.y + b.h <= platY + 16 && b.vy >= 0) {
                  b.y = platY - b.h;
                  b.vy = 0;
                  b.falling = false;
                  b.vx = bCenterX < p.x + p.w / 2 ? BARREL_SPEED : -BARREL_SPEED;
                }
              }
            }
          } else {
            // Rolling on platform
            const bPlatIdx = findPlatformIndex(b.y + b.h, bCenterX);
            const pPlatIdx = findPlatformIndex(p.y + p.h, p.x + p.w / 2);

            // Always roll toward the best ladder that leads closer to player
            if (bPlatIdx < pPlatIdx) {
              // Player is below — find closest ladder going down
              const ladderIdx = findBestLadder(bCenterX, bPlatIdx, pPlatIdx, true, p.x + p.w / 2);
              if (ladderIdx !== null) {
                const l = LADDERS[ladderIdx];
                const targetX = l.x + 7;
                if (Math.abs(bCenterX - targetX) < 8) {
                  // At the ladder, go down
                  b.onLadder = true;
                  b.targetLadder = ladderIdx;
                  b.x = l.x + (16 - b.w) / 2;
                  b.vx = 0;
                } else {
                  // Roll toward the ladder
                  b.vx = bCenterX < targetX ? BARREL_SPEED : -BARREL_SPEED;
                }
              } else {
                // No ladder found, roll toward player
                b.vx = bCenterX < p.x + p.w / 2 ? BARREL_SPEED : -BARREL_SPEED;
              }
            } else {
              // Same platform or above player, roll toward player
              b.vx = bCenterX < p.x + p.w / 2 ? BARREL_SPEED : -BARREL_SPEED;
            }

            b.x += b.vx;

            // Apply slope / stay on platform
            let onPlat = false;
            for (const plat of PLATFORMS) {
              if (b.x + b.w > plat.x1 && b.x < plat.x2) {
                const platY = getPlatformY(plat, bCenterX);
                if (Math.abs((b.y + b.h) - platY) < 10) {
                  b.y = platY - b.h;
                  onPlat = true;
                }
              }
            }

            // Check if barrel reached edge of platform — fall off
            const currentPlat = PLATFORMS.find(pl =>
              bCenterX >= pl.x1 && bCenterX <= pl.x2 &&
              Math.abs((b.y + b.h) - getPlatformY(pl, bCenterX)) < 10
            );

            if (currentPlat) {
              const atLeftEdge = b.x <= currentPlat.x1;
              const atRightEdge = b.x + b.w >= currentPlat.x2;
              if (atLeftEdge || atRightEdge) {
                b.falling = true;
                b.vy = 0;
              }
            } else if (!onPlat) {
              b.falling = true;
              b.vy = 0;
            }
          }

          if (b.y > CANVAS_H + 20) { g.barrels.splice(i, 1); continue; }

          // Barrels always hurt - cannot be killed
          if (rectsOverlap(p, b)) {
            g.lives--; setLives(g.lives);
            if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
            else { playHitSound(); resetPlayer(); }
            break;
          }
        }

        // === UPDATE ROBOTS (pathfinding AI) ===
        for (let i = g.robots.length - 1; i >= 0; i--) {
          const r = g.robots[i];
          const rCenterX = r.x + r.w / 2;
          const rPlatIdx = findPlatformIndex(r.y + r.h, rCenterX);
          const pPlatIdx = findPlatformIndex(p.y + p.h, p.x + p.w / 2);

          r.frameTimer++;
          if (r.frameTimer > 15) { r.frameTimer = 0; r.frame = (r.frame + 1) % 2; }

          if (r.climbing) {
            // Climbing a ladder
            const goingUp = rPlatIdx > pPlatIdx;
            r.y += goingUp ? -ROBOT_SPEED : ROBOT_SPEED;
            r.vx = 0;

            // Check if reached end of ladder
            if (r.targetLadder !== null) {
              const l = LADDERS[r.targetLadder];
              if (goingUp && r.y + r.h <= l.yTop + 2) {
                r.y = l.yTop - r.h;
                r.climbing = false;
                r.targetLadder = null;
              } else if (!goingUp && r.y + r.h >= l.yBot) {
                r.y = l.yBot - r.h;
                r.climbing = false;
                r.targetLadder = null;
              }
            } else {
              // Safety: if no target ladder, stop climbing
              r.climbing = false;
            }
          } else {
            // On platform - decide what to do
            if (rPlatIdx !== pPlatIdx) {
              // Need to get to player's platform
              const goingDown = rPlatIdx < pPlatIdx;
              const ladderIdx = findBestLadder(rCenterX, rPlatIdx, pPlatIdx, goingDown, p.x + p.w / 2);
              if (ladderIdx !== null) {
                const l = LADDERS[ladderIdx];
                const targetX = l.x + 7;
                if (Math.abs(rCenterX - targetX) < 6) {
                  r.climbing = true;
                  r.targetLadder = ladderIdx;
                  r.vx = 0;
                } else {
                  r.vx = rCenterX < targetX ? ROBOT_SPEED : -ROBOT_SPEED;
                  r.direction = r.vx > 0 ? 1 : -1;
                }
              } else {
                // No ladder found, just patrol
                r.vx = rCenterX < p.x + p.w / 2 ? ROBOT_SPEED : -ROBOT_SPEED;
                r.direction = r.vx > 0 ? 1 : -1;
              }
            } else {
              // Same platform, chase player
              r.vx = rCenterX < p.x + p.w / 2 ? ROBOT_SPEED : -ROBOT_SPEED;
              r.direction = r.vx > 0 ? 1 : -1;
            }

            r.x += r.vx;
            r.vy += GRAVITY;
            r.y += r.vy;
            r.onGround = false;
            for (const plat of PLATFORMS) {
              if (r.x + r.w > plat.x1 && r.x < plat.x2) {
                const platY = getPlatformY(plat, rCenterX);
                if (r.y + r.h >= platY && r.y + r.h <= platY + 12 && r.vy >= 0) {
                  r.y = platY - r.h; r.vy = 0; r.onGround = true;
                }
              }
            }
            r.x = Math.max(0, Math.min(CANVAS_W - r.w, r.x));
          }

          if (r.y > CANVAS_H + 20) { g.robots.splice(i, 1); continue; }

          // Robot-player collision
          if (rectsOverlap(p, r)) {
            if (p.jumping && p.vy < 0 && p.y + p.h < r.y + r.h / 2) {
              g.score += 200; setScore(g.score);
              g.robots.splice(i, 1);
            } else {
              g.lives--; setLives(g.lives);
              if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
              else { playHitSound(); resetPlayer(); }
              break;
            }
          }
        }
      }

      // === RENDER ===
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

      // DK
      ctx.fillStyle = '#8B4513';
      const dkX = 100, dkY = 76;
      ctx.fillRect(dkX, dkY, 32, 32);
      ctx.fillStyle = '#654321'; ctx.fillRect(dkX + 4, dkY + 4, 24, 20);
      ctx.fillStyle = '#DEB887'; ctx.fillRect(dkX + 8, dkY + 6, 16, 12);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(dkX + 10, dkY + 8, 4, 4); ctx.fillRect(dkX + 18, dkY + 8, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(dkX + 12, dkY + 9, 2, 2); ctx.fillRect(dkX + 20, dkY + 9, 2, 2);
      ctx.fillStyle = '#8B4513';
      if (g.dkFrame === 0) {
        ctx.fillRect(dkX - 8, dkY + 8, 8, 8); ctx.fillRect(dkX + 32, dkY + 8, 8, 8);
      } else {
        ctx.fillRect(dkX - 8, dkY + 2, 8, 8); ctx.fillRect(dkX + 32, dkY + 2, 8, 8);
      }

      // Pauline
      const paulX = 240, paulY = 72;
      ctx.fillStyle = '#FF69B4'; ctx.fillRect(paulX, paulY, 12, 20);
      ctx.fillStyle = '#FFD700'; ctx.fillRect(paulX + 2, paulY - 6, 8, 8);
      ctx.fillStyle = '#FF69B4'; ctx.font = '8px var(--font-arcade)';
      ctx.fillText('HELP!', paulX - 8, paulY - 10);

      // Barrels
      for (const b of g.barrels) {
        ctx.fillStyle = '#4488FF'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#88BBFF'; ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      }

      // Robots
      for (const r of g.robots) {
        // Body
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(r.x, r.y + 4, r.w, r.h - 4);
        // Head
        ctx.fillStyle = '#CC2222';
        ctx.fillRect(r.x + 2, r.y, r.w - 4, 6);
        // Eyes (glowing)
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(r.x + 3, r.y + 1, 3, 3);
        ctx.fillRect(r.x + r.w - 6, r.y + 1, 3, 3);
        // Legs (animated)
        ctx.fillStyle = '#AA1111';
        if (r.frame === 0) {
          ctx.fillRect(r.x + 1, r.y + r.h - 2, 4, 3);
          ctx.fillRect(r.x + r.w - 5, r.y + r.h - 1, 4, 2);
        } else {
          ctx.fillRect(r.x + 1, r.y + r.h - 1, 4, 2);
          ctx.fillRect(r.x + r.w - 5, r.y + r.h - 2, 4, 3);
        }
        // Antenna
        ctx.strokeStyle = '#FF6666'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.x + r.w / 2, r.y);
        ctx.lineTo(r.x + r.w / 2 + (r.frame === 0 ? 3 : -3), r.y - 5);
        ctx.stroke();
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(r.x + r.w / 2 + (r.frame === 0 ? 2 : -4), r.y - 6, 3, 3);
      }

      // Player (Mario)
      const pl = g.player;
      ctx.fillStyle = '#FF0000'; ctx.fillRect(pl.x + 2, pl.y, 12, 4);
      ctx.fillStyle = '#FFB366'; ctx.fillRect(pl.x + 2, pl.y + 4, 12, 6);
      ctx.fillStyle = '#FF0000'; ctx.fillRect(pl.x, pl.y + 10, 16, 8);
      ctx.fillStyle = '#3366FF'; ctx.fillRect(pl.x + 2, pl.y + 18, 12, 6);
      ctx.fillStyle = '#000';
      if (pl.facing > 0) ctx.fillRect(pl.x + 9, pl.y + 5, 2, 2);
      else ctx.fillRect(pl.x + 5, pl.y + 5, 2, 2);

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
      if (g.state === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = '20px var(--font-arcade)';
        ctx.fillText('YOU WIN!', 140, 220);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '10px var(--font-arcade)';
        ctx.fillText(`Score: ${g.score}`, 170, 260);
        ctx.fillText('Press R to restart', 140, 290);
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
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
      <h1 className="text-accent text-sm tracking-wider">DONKEY KONG</h1>
      <div className="border-4 border-primary rounded-sm shadow-[0_0_30px_rgba(212,42,42,0.3)]">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          className="block w-full max-w-[512px]" style={{ imageRendering: 'pixelated' }} tabIndex={0} />
      </div>
      <div className="flex w-full max-w-[512px] justify-between items-end mt-2 touch-none">
        <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-32 h-32">
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-xl flex items-center justify-center" {...handleDown('ArrowUp')}>↑</button>
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-xl flex items-center justify-center" {...handleDown('ArrowLeft')}>←</button>
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-xl flex items-center justify-center" {...handleDown('ArrowRight')}>→</button>
          <div />
          <button className="bg-muted active:bg-primary rounded text-foreground text-xl flex items-center justify-center" {...handleDown('ArrowDown')}>↓</button>
          <div />
        </div>
        <div className="flex gap-3 items-center">
          <button className="w-16 h-16 rounded-full bg-primary text-primary-foreground text-xs font-bold active:scale-95" {...handleDown(' ')}>JUMP</button>
          <button className="w-12 h-12 rounded-full bg-accent text-accent-foreground text-xs font-bold active:scale-95"
            onMouseDown={() => resetGame()} onTouchStart={() => resetGame()}>R</button>
        </div>
      </div>
    </div>
  );
};

export default DonkeyKongGame;
