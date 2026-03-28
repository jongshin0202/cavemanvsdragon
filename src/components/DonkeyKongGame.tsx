import { useEffect, useRef, useState, useCallback } from 'react';

const CANVAS_W = 512;
const CANVAS_H = 480;
const TILE = 16;
const GRAVITY = 0.5;
const JUMP_FORCE = -8;
const MOVE_SPEED = 2.5;
const BARREL_SPEED = 2;
const CLIMB_SPEED = 2;

interface Rect { x: number; y: number; w: number; h: number }
interface Barrel extends Rect { vx: number; vy: number; onLadder: boolean; falling: boolean }

// Platform definitions (y, xStart, xEnd)
const PLATFORMS: { y: number; x1: number; x2: number; slope?: number }[] = [
  { y: 432, x1: 0, x2: 512 },           // ground
  { y: 368, x1: 48, x2: 512, slope: 0.03 },
  { y: 304, x1: 0, x2: 464, slope: -0.03 },
  { y: 240, x1: 48, x2: 512, slope: 0.03 },
  { y: 176, x1: 0, x2: 464, slope: -0.03 },
  { y: 112, x1: 80, x2: 432 },           // top
];

// Ladder definitions (x, yTop, yBottom)
const LADDERS: { x: number; yTop: number; yBot: number }[] = [
  { x: 460, yTop: 368, yBot: 432 },
  { x: 100, yTop: 304, yBot: 368 },
  { x: 400, yTop: 240, yBot: 304 },
  { x: 140, yTop: 176, yBot: 240 },
  { x: 350, yTop: 112, yBot: 176 },
  // extra short ladders
  { x: 260, yTop: 368, yBot: 432 },
  { x: 300, yTop: 240, yBot: 304 },
  { x: 200, yTop: 304, yBot: 368 },
];

function getPlatformY(plat: typeof PLATFORMS[0], x: number): number {
  const slope = plat.slope || 0;
  return plat.y + (x - plat.x1) * slope;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const DonkeyKongGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'win'>('playing');
  const gameRef = useRef({
    player: { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false },
    barrels: [] as Barrel[],
    barrelTimer: 0,
    score: 0,
    lives: 3,
    state: 'playing' as string,
    dkFrame: 0,
    dkTimer: 0,
  });

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false };
    g.barrels = [];
    g.barrelTimer: 0;
  }, []);

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0;
    g.lives = 3;
    g.state = 'playing';
    resetPlayer();
    setScore(0);
    setLives(3);
    setGameState('playing');
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
        // Player movement
        const onLadder = LADDERS.some(l => 
          p.x + p.w / 2 > l.x - 8 && p.x + p.w / 2 < l.x + 16 + 8 &&
          p.y + p.h > l.yTop && p.y + p.h <= l.yBot + 4
        );

        if (keys.has('ArrowUp') && onLadder) {
          p.climbing = true;
        }
        if (keys.has('ArrowDown') && onLadder) {
          p.climbing = true;
        }

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
          if ((keys.has(' ') || keys.has('ArrowUp')) && p.onGround && !onLadder) {
            p.vy = JUMP_FORCE;
            p.onGround = false;
            p.jumping = true;
          }
          p.vy += GRAVITY;
          p.y += p.vy;

          // Platform collision
          p.onGround = false;
          for (const plat of PLATFORMS) {
            if (p.x + p.w > plat.x1 && p.x < plat.x2) {
              const platY = getPlatformY(plat, p.x + p.w / 2);
              if (p.y + p.h >= platY && p.y + p.h <= platY + 12 && p.vy >= 0) {
                p.y = platY - p.h;
                p.vy = 0;
                p.onGround = true;
                p.jumping = false;
              }
            }
          }
        }

        // Bounds
        p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x));
        if (p.y > CANVAS_H) {
          g.lives--;
          setLives(g.lives);
          if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); }
          else resetPlayer();
        }

        // Win condition - reach Pauline
        if (p.y < 100 && p.x > 180 && p.x < 320) {
          g.state = 'win';
          setGameState('win');
          g.score += 1000;
          setScore(g.score);
        }

        // Barrel spawning
        g.barrelTimer++;
        if (g.barrelTimer > 120) {
          g.barrelTimer = 0;
          g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: BARREL_SPEED, vy: 0, onLadder: false, falling: false });
        }

        // DK animation
        g.dkTimer++;
        if (g.dkTimer > 30) { g.dkTimer = 0; g.dkFrame = (g.dkFrame + 1) % 2; }

        // Update barrels
        for (let i = g.barrels.length - 1; i >= 0; i--) {
          const b = g.barrels[i];

          // Check if barrel is on a ladder (random chance to go down)
          if (!b.onLadder && !b.falling) {
            for (const l of LADDERS) {
              if (b.x + b.w / 2 > l.x && b.x + b.w / 2 < l.x + 16 && 
                  Math.abs(b.y + b.h - l.yTop) < 4 && Math.random() < 0.02) {
                b.onLadder = true;
                b.vx = 0;
                break;
              }
            }
          }

          if (b.onLadder) {
            b.y += 2;
            // Check if reached bottom of ladder
            const onLadderStill = LADDERS.some(l => 
              b.x + b.w / 2 > l.x && b.x + b.w / 2 < l.x + 16 && b.y + b.h <= l.yBot
            );
            if (!onLadderStill) {
              b.onLadder = false;
              b.vx = Math.random() > 0.5 ? BARREL_SPEED : -BARREL_SPEED;
            }
          } else {
            b.vy += GRAVITY;
            b.x += b.vx;
            b.y += b.vy;

            // Platform collision for barrels
            for (const plat of PLATFORMS) {
              if (b.x + b.w > plat.x1 && b.x < plat.x2) {
                const platY = getPlatformY(plat, b.x + b.w / 2);
                if (b.y + b.h >= platY && b.y + b.h <= platY + 12 && b.vy >= 0) {
                  b.y = platY - b.h;
                  b.vy = 0;
                  // Roll in direction of slope
                  const slope = plat.slope || 0;
                  b.vx = slope > 0 ? BARREL_SPEED : -BARREL_SPEED;
                }
              }
            }

            // Bounce off walls
            if (b.x < 0 || b.x + b.w > CANVAS_W) b.vx *= -1;
          }

          // Remove barrels that fall off screen
          if (b.y > CANVAS_H + 20) g.barrels.splice(i, 1);

          // Collision with player
          if (rectsOverlap(p, b)) {
            // Check if player jumped over barrel
            if (p.jumping && p.vy < 0 && p.y + p.h < b.y + b.h / 2) {
              g.score += 100;
              setScore(g.score);
            } else {
              g.lives--;
              setLives(g.lives);
              if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); }
              else resetPlayer();
              break;
            }
          }
        }

        // Score from jumping barrels
        for (const b of g.barrels) {
          if (p.jumping && !rectsOverlap(p, b) && Math.abs(p.x - b.x) < 20 && p.y + p.h < b.y) {
            // Already handled above
          }
        }
      }

      // === RENDER ===
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw platforms
      for (const plat of PLATFORMS) {
        ctx.fillStyle = '#D42A2A';
        for (let x = plat.x1; x < plat.x2; x += 16) {
          const y = getPlatformY(plat, x + 8);
          ctx.fillRect(x, y, 16, 8);
          // Girder pattern
          ctx.fillStyle = '#FF6B4A';
          ctx.fillRect(x + 2, y + 1, 5, 3);
          ctx.fillRect(x + 9, y + 4, 5, 3);
          ctx.fillStyle = '#D42A2A';
        }
      }

      // Draw ladders
      ctx.strokeStyle = '#66CCFF';
      ctx.lineWidth = 2;
      for (const l of LADDERS) {
        ctx.beginPath();
        ctx.moveTo(l.x, l.yTop); ctx.lineTo(l.x, l.yBot);
        ctx.moveTo(l.x + 14, l.yTop); ctx.lineTo(l.x + 14, l.yBot);
        for (let y = l.yTop; y < l.yBot; y += 12) {
          ctx.moveTo(l.x, y); ctx.lineTo(l.x + 14, y);
        }
        ctx.stroke();
      }

      // Draw DK
      ctx.fillStyle = '#8B4513';
      const dkX = 100, dkY = 76;
      // Body
      ctx.fillRect(dkX, dkY, 32, 32);
      ctx.fillStyle = '#654321';
      ctx.fillRect(dkX + 4, dkY + 4, 24, 20);
      // Face
      ctx.fillStyle = '#DEB887';
      ctx.fillRect(dkX + 8, dkY + 6, 16, 12);
      // Eyes
      ctx.fillStyle = '#FFF';
      ctx.fillRect(dkX + 10, dkY + 8, 4, 4);
      ctx.fillRect(dkX + 18, dkY + 8, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(dkX + 12, dkY + 9, 2, 2);
      ctx.fillRect(dkX + 20, dkY + 9, 2, 2);
      // Arms (animated)
      ctx.fillStyle = '#8B4513';
      if (g.dkFrame === 0) {
        ctx.fillRect(dkX - 8, dkY + 8, 8, 8);
        ctx.fillRect(dkX + 32, dkY + 8, 8, 8);
      } else {
        ctx.fillRect(dkX - 8, dkY + 2, 8, 8);
        ctx.fillRect(dkX + 32, dkY + 2, 8, 8);
      }

      // Draw Pauline (princess)
      const paulX = 240, paulY = 72;
      ctx.fillStyle = '#FF69B4';
      ctx.fillRect(paulX, paulY, 12, 20);
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(paulX + 2, paulY - 6, 8, 8);
      // HELP text
      ctx.fillStyle = '#FF69B4';
      ctx.font = '8px var(--font-arcade)';
      ctx.fillText('HELP!', paulX - 8, paulY - 10);

      // Draw barrels
      for (const b of g.barrels) {
        ctx.fillStyle = '#4488FF';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#88BBFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      }

      // Draw player (Mario)
      const p = g.player;
      ctx.fillStyle = '#FF0000'; // hat
      ctx.fillRect(p.x + 2, p.y, 12, 4);
      ctx.fillStyle = '#FFB366'; // face
      ctx.fillRect(p.x + 2, p.y + 4, 12, 6);
      ctx.fillStyle = '#FF0000'; // shirt
      ctx.fillRect(p.x, p.y + 10, 16, 8);
      ctx.fillStyle = '#3366FF'; // pants
      ctx.fillRect(p.x + 2, p.y + 18, 12, 6);
      // Eyes
      ctx.fillStyle = '#000';
      if (p.facing > 0) {
        ctx.fillRect(p.x + 9, p.y + 5, 2, 2);
      } else {
        ctx.fillRect(p.x + 5, p.y + 5, 2, 2);
      }

      // Draw barrel stack near DK
      ctx.fillStyle = '#4488FF';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(60, 90 + i * 16, 14, 14);
        ctx.strokeStyle = '#88BBFF';
        ctx.strokeRect(62, 92 + i * 16, 10, 10);
      }

      // HUD
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px var(--font-arcade)';
      ctx.fillText(`SCORE: ${g.score}`, 10, 20);
      ctx.fillText(`LIVES: ${'♥'.repeat(g.lives)}`, 350, 20);

      // Game over / Win overlay
      if (g.state === 'gameover') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FF0000';
        ctx.font = '20px var(--font-arcade)';
        ctx.fillText('GAME OVER', 120, 220);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px var(--font-arcade)';
        ctx.fillText('Press R to restart', 140, 260);
      }
      if (g.state === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700';
        ctx.font = '20px var(--font-arcade)';
        ctx.fillText('YOU WIN!', 140, 220);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px var(--font-arcade)';
        ctx.fillText(`Score: ${g.score}`, 170, 260);
        ctx.fillText('Press R to restart', 140, 290);
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [resetGame, resetPlayer]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-accent text-lg tracking-wider">DONKEY KONG</h1>
      <div className="border-4 border-primary rounded-sm shadow-[0_0_30px_rgba(212,42,42,0.3)]">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block"
          tabIndex={0}
        />
      </div>
      <div className="flex gap-8 text-xs text-muted-foreground">
        <span>← → Move</span>
        <span>↑ Jump / Climb</span>
        <span>↓ Descend</span>
        <span>R Restart</span>
      </div>
    </div>
  );
};

export default DonkeyKongGame;
