import { useEffect, useRef, useState } from 'react';
import cavemanWalkUrl from '@/assets/caveman-walk.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';
import princessScaredUrl from '@/assets/princess-scared.png';
import dragonAngryUrl from '@/assets/dragon-angry.png';
import { playWingFlapSound, playPrincessHelpSound } from '../game/sounds';

const CW = 512;
const CH = 480;
const WALK_FRAMES = 4;
const DRAGON_FRAMES = 5;

// Full timeline (used for the 7-tap preview): plays the entire cinematic
// from the very beginning (caveman walks in → princess thanks → dragon
// returns and re-kidnaps her → caveman vows to save her).
//
// Short timeline (used after a real L4 win): the L4 ending already shows
// the kidnap inside the canvas, so we skip straight to the caveman walking
// across with the sad header and the rallying line.
const T_FULL = {
  CAVEMAN_WALK_END: 2000,
  PRINCESS_THANKS_END: 4000,
  CONGRATS_END: 5000,
  SAD_TEXT_APPEAR: 7000,
  DRAGON_APPEAR: 8000,
  ANOTHER_DRAGON_START: 9000,
  ANOTHER_DRAGON_END: 11000,
  DRAGON_HOVER_END: 12000,
  DRAGON_REACH: 13500,
  CARRY_END: 15500,
  CAVEMAN_EXIT_END: 17500,
  BLANK1_END: 18500,
  SAVE_LINE_END: 21500,
  DONE: 23500,
};
const T_SHORT = {
  CAVEMAN_WALK_END: 3000,
  BLANK1_END: 4000,
  SAVE_LINE_END: 7000,
  DONE: 9000,
};

interface Props {
  onDone: () => void;
  /** When true, play the full kidnap cinematic from the beginning (7-tap preview). */
  full?: boolean;
}

export default function SavedAnimation({ onDone, full = false }: Props) {
  const [t, setT] = useState(0);
  const startRef = useRef<number>(performance.now());
  const lastFlapRef = useRef<number>(0);
  const helpPlayedRef = useRef<boolean>(false);
  const doneRef = useRef<boolean>(false);

  const DONE = full ? T_FULL.DONE : T_SHORT.DONE;

  // Preload scared princess sprite so it doesn't flash blank on first use.
  useEffect(() => {
    if (!full) return;
    const img = new Image();
    img.src = princessScaredUrl;
  }, [full]);


  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      setT(elapsed);

      if (full) {
        if (elapsed >= T_FULL.DRAGON_APPEAR && elapsed < T_FULL.CARRY_END) {
          if (now - lastFlapRef.current > 600) {
            lastFlapRef.current = now;
            playWingFlapSound();
          }
        }
        if (!helpPlayedRef.current && elapsed >= T_FULL.DRAGON_REACH) {
          helpPlayedRef.current = true;
          try { playPrincessHelpSound(); } catch { /* noop */ }
        }
      }

      if (elapsed >= DONE) {
        if (!doneRef.current) { doneRef.current = true; onDone(); }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone, full, DONE]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const pct = (v: number, axis: 'x' | 'y') => `${(v / (axis === 'x' ? CW : CH)) * 100}%`;
  const sizePct = (v: number, axis: 'x' | 'y') => `${(v / (axis === 'x' ? CW : CH)) * 100}%`;

  // ── Short variant (post-L4-win): caveman walks across, sad header, then rallying line.
  if (!full) {
    const T = T_SHORT;
    const cavemanW = 48, cavemanH = 64;
    const cavemanY = CH / 2 - cavemanH / 2;
    const walkP = Math.min(1, t / T.CAVEMAN_WALK_END);
    const cavemanX = -cavemanW + (CW + cavemanW * 2) * walkP;
    const cavemanVisible = t < T.CAVEMAN_WALK_END;
    const walkFrame = cavemanVisible ? Math.floor(t / 120) % WALK_FRAMES : 0;
    const showSadText = t < T.CAVEMAN_WALK_END;
    const showSaveLine = t >= T.BLANK1_END && t < T.SAVE_LINE_END;

    const cavemanBg: React.CSSProperties = {
      backgroundImage: `url(${cavemanWalkUrl})`,
      backgroundSize: `${WALK_FRAMES * 100}% 100%`,
      backgroundPosition: `${(walkFrame / (WALK_FRAMES - 1)) * 100}% 0%`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
    };

    return (
      <div
        className="absolute inset-0 z-30 flex items-center justify-center bg-black select-none"
        onPointerDown={skip}
      >
        <div className="relative bg-black" style={{ aspectRatio: `${CW} / ${CH}`, height: '100%' }}>
          {showSadText && (
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center font-caveman"
              style={{
                top: '5%', width: '94%',
                color: 'hsl(var(--accent))',
                fontSize: 'min(6vh, 3.2vw)',
                textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
                lineHeight: 1.2,
              }}
            >
              ... but the happiness did not last long ...
            </div>
          )}
          {cavemanVisible && (
            <div style={{ position: 'absolute', left: pct(cavemanX, 'x'), top: pct(cavemanY, 'y'), width: sizePct(cavemanW, 'x'), height: sizePct(cavemanH, 'y'), ...cavemanBg }} />
          )}
          {showSaveLine && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-caveman"
              style={{
                width: '94%',
                color: 'hsl(var(--accent))',
                fontSize: 'min(6vh, 3.2vw)',
                textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
                lineHeight: 1.2,
              }}
            >
              I will save you princess!!!
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Full variant (7-tap preview): the original kidnap cinematic. ──
  const T = T_FULL;
  const princessW = 48, princessH = 64;
  const princessX = CW / 2 - princessW / 2;
  const princessY = CH / 2 - princessH / 2;

  const cavemanW = princessW, cavemanH = princessH;
  const cavemanY = princessY + princessH - cavemanH;

  let cavemanX: number;
  let cavemanWalking = true;
  let cavemanVisible = true;
  if (t <= T.CAVEMAN_WALK_END) {
    const p = Math.min(1, t / T.CAVEMAN_WALK_END);
    cavemanX = -cavemanW + (princessX - cavemanW - 6 + cavemanW) * p;
  } else if (t < T.CARRY_END) {
    cavemanX = princessX - cavemanW - 6;
    cavemanWalking = false;
  } else if (t < T.CAVEMAN_EXIT_END) {
    const p = Math.min(1, (t - T.CARRY_END) / (T.CAVEMAN_EXIT_END - T.CARRY_END));
    cavemanX = (princessX - cavemanW - 6) + (CW + 40 - (princessX - cavemanW - 6)) * p;
    cavemanWalking = true;
  } else {
    cavemanX = CW + 40;
    cavemanVisible = false;
  }

  const dragonW = princessW * 2, dragonH = princessH * 2;
  const dragonHoverY = CH / 4 - dragonH / 2;
  let dragonX = -dragonW;
  let dragonY = dragonHoverY;
  let showDragon = false;
  let princessHeldByDragon = false;
  if (t >= T.DRAGON_APPEAR && t < T.DRAGON_HOVER_END) {
    showDragon = true;
    dragonX = 8;
    dragonY = dragonHoverY + Math.sin((t - T.DRAGON_APPEAR) / 120) * 3;
  } else if (t >= T.DRAGON_HOVER_END && t < T.DRAGON_REACH) {
    showDragon = true;
    const p = (t - T.DRAGON_HOVER_END) / (T.DRAGON_REACH - T.DRAGON_HOVER_END);
    const tgtX = princessX + princessW / 2 - dragonW / 2;
    const tgtY = princessY - dragonH + 24;
    dragonX = 8 + (tgtX - 8) * p;
    dragonY = dragonHoverY + (tgtY - dragonHoverY) * p;
  } else if (t >= T.DRAGON_REACH && t < T.CARRY_END) {
    showDragon = true;
    princessHeldByDragon = true;
    const p = (t - T.DRAGON_REACH) / (T.CARRY_END - T.DRAGON_REACH);
    const startX = princessX + princessW / 2 - dragonW / 2;
    const startY = princessY - dragonH + 24;
    const endX = CW + 40;
    const endY = dragonHoverY;
    dragonX = startX + (endX - startX) * p;
    dragonY = startY + (endY - startY) * p;
  }

  let pX = princessX, pY = princessY;
  let showPrincess = t < T.DRAGON_REACH || princessHeldByDragon;
  if (princessHeldByDragon) {
    pX = dragonX + dragonW / 2 - princessW / 2;
    pY = dragonY + dragonH - 8;
  }
  if (t >= T.CARRY_END) showPrincess = false;

  const walkFrame = cavemanWalking ? Math.floor(t / 120) % WALK_FRAMES : 0;
  const dragonFrame = Math.floor(t / 100) % DRAGON_FRAMES;

  const showAnotherDragon = t >= T.ANOTHER_DRAGON_START && t < T.ANOTHER_DRAGON_END;
  const showSadText = t >= T.SAD_TEXT_APPEAR && t < T.CAVEMAN_EXIT_END;
  const showSaveLine = t >= T.BLANK1_END && t < T.SAVE_LINE_END;
  const showThanks = t >= T.CAVEMAN_WALK_END && t < T.CONGRATS_END;


  const showCongrats = t < T.CONGRATS_END;

  const cavemanBg: React.CSSProperties = {
    backgroundImage: `url(${cavemanWalkUrl})`,
    backgroundSize: `${WALK_FRAMES * 100}% 100%`,
    backgroundPosition: `${(walkFrame / (WALK_FRAMES - 1)) * 100}% 0%`,

    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
  const dragonBg: React.CSSProperties = {
    backgroundImage: `url(${dragonAngryUrl})`,
    backgroundSize: `${DRAGON_FRAMES * 100}% 100%`,
    backgroundPosition: `${(dragonFrame / (DRAGON_FRAMES - 1)) * 100}% 0%`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black select-none"
      onPointerDown={skip}
    >
      <div className="relative bg-black" style={{ aspectRatio: `${CW} / ${CH}`, height: '100%' }}>


        {showPrincess && !princessHeldByDragon && (
          <div
            style={{
              position: 'absolute',
              left: pct(pX, 'x'),
              top: pct(pY, 'y'),
              width: sizePct(princessW, 'x'),
              height: sizePct(princessH, 'y'),
              backgroundImage: `url(${princessSpriteUrl})`,
              backgroundSize: '500% 100%',
              backgroundPosition: '0% 0%',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              transform: 'scaleX(-1)',
              zIndex: 1,
            }}
          />
        )}

        {showCongrats && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center font-caveman"
            style={{
              top: '5%', width: '94%',
              color: 'hsl(var(--accent))',
              fontSize: 'min(6vh, 3.2vw)',
              textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
              lineHeight: 1.2,
            }}
          >
            <div>CONGRATULATIONS!</div>
            <div>YOU SAVED THE PRINCESS!</div>
          </div>
        )}


        {showThanks && (
          <div
            className="absolute text-center font-caveman"
            style={{
              left: pct(princessX + princessW / 2, 'x'),
              top: pct(princessY - 28, 'y'),
              transform: 'translateX(-50%)',
              color: '#000',
              background: 'rgba(255,255,255,0.92)',
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 'min(2.8vh, 1.5vw)',
              whiteSpace: 'nowrap',
            }}
          >
            Thank you, my hero!
          </div>
        )}


        {/* HELP! bubble to the LEFT of the princess's mouth while carried.
            0.5s after grab → show 1s → hide 0.5s → repeat until off-screen. */}
        {showPrincess && princessHeldByDragon && (() => {
          const since = t - T.DRAGON_REACH;
          if (since < 500) return null;
          if ((since - 500) % 1500 >= 1000) return null;
          return (
            <div
              className="absolute font-caveman"
              style={{
                left: pct(pX - 2, 'x'),
                top: pct(pY + princessH * 0.35, 'y'),
                transform: 'translateX(-100%)',
                color: '#fff',
                background: '#000',
                padding: '2px 6px',
                fontSize: 'min(3.2vh, 1.7vw)',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}
            >
              HELP!
            </div>
          );
        })()}





        {showAnotherDragon && (
          <div
            className="absolute text-center font-caveman"
            style={{
              left: pct(cavemanX, 'x'),
              top: pct(cavemanY - 22, 'y'),
              color: 'hsl(var(--accent))',
              background: 'rgba(0,0,0,0.7)',
              border: '2px solid hsl(var(--accent))',
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 'min(2.8vh, 1.5vw)',
              whiteSpace: 'nowrap',
              transform: 'translateX(-20%)',
            }}
          >
            ANOTHER DRAGON??
          </div>
        )}

        {cavemanVisible && (
          <div style={{ position: 'absolute', left: pct(cavemanX, 'x'), top: pct(cavemanY, 'y'), width: sizePct(cavemanW, 'x'), height: sizePct(cavemanH, 'y'), ...cavemanBg }} />
        )}

        {showDragon && (
          <div style={{ position: 'absolute', left: pct(dragonX, 'x'), top: pct(dragonY, 'y'), width: sizePct(dragonW, 'x'), height: sizePct(dragonH, 'y'), ...dragonBg }} />
        )}

        {showSadText && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center font-caveman"
            style={{
              top: '5%', width: '94%',
              color: 'hsl(var(--accent))',
              fontSize: 'min(6vh, 3.2vw)',
              textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
              lineHeight: 1.2,
            }}
          >
            ... but the happiness did not last long ...
          </div>
        )}

        {showSaveLine && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-caveman"
            style={{
              width: '94%',
              color: 'hsl(var(--accent))',
              fontSize: 'min(6vh, 3.2vw)',
              textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
              lineHeight: 1.2,
            }}
          >
            I will save you princess!!!
          </div>
        )}
      </div>
    </div>
  );
}
