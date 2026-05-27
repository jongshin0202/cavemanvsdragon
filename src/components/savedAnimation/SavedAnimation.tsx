import { useEffect, useRef, useState } from 'react';
import cavemanWalkUrl from '@/assets/caveman-walk.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';
import dragonAngryUrl from '@/assets/dragon-angry.png';
import { playWingFlapSound, playPrincessHelpSound } from '../game/sounds';

// Virtual canvas size (matches CavemanVsDragonGame CANVAS_W/H).
const CW = 512;
const CH = 480;
const WALK_FRAMES = 4;
const DRAGON_FRAMES = 5;

// Timeline (ms):
// 0          : show black bg, princess centered, congrats banner, caveman at left
// 0..2000    : caveman walks from left edge to right next to princess
// 2000..4000 : princess: "Thank you for saving me!"
// 4000..6000 : dragon appears from far left at y=25%, hovering/flapping in place
// 6000..7500 : dragon flies to princess
// 7500       : grab — princess "HELP ME!!!", congrats hides, caveman "I will save you!!!"
// 7500..9500 : dragon carries princess off to right at y=25%; caveman walks right & exits
// 9500..10500: blank 1s
// 10500..12500: "...but the happiness did not last long..." center
// 12500      : onDone()
const T = {
  CAVEMAN_WALK_END: 2000,
  PRINCESS_THANKS_END: 4000,
  DRAGON_HOVER_END: 6000,
  DRAGON_REACH: 7500,
  CARRY_END: 9500,      // dragon (+ princess) fully off-screen right
  CAVEMAN_EXIT_END: 11500, // caveman walks right and exits after dragon is gone
  PAUSE_END: 12500,
  TEXT_END: 14500,
  DONE: 14500,
};

interface Props {
  onDone: () => void;
}

export default function SavedAnimation({ onDone }: Props) {
  const [t, setT] = useState(0);
  const startRef = useRef<number>(performance.now());
  const lastFlapRef = useRef<number>(0);
  const helpPlayedRef = useRef<boolean>(false);
  const doneRef = useRef<boolean>(false);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      setT(elapsed);

      // Wing flap sound while dragon is on-screen (hover + flight + carry).
      if (elapsed >= 4000 && elapsed < T.CARRY_END) {
        if (now - lastFlapRef.current > 600) {
          lastFlapRef.current = now;
          playWingFlapSound();
        }
      }
      // Princess scream on grab.
      if (!helpPlayedRef.current && elapsed >= T.DRAGON_REACH) {
        helpPlayedRef.current = true;
        try { playPrincessHelpSound(); } catch { /* noop */ }
      }

      if (elapsed >= T.DONE) {
        if (!doneRef.current) { doneRef.current = true; onDone(); }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  // ── Layout positions (in virtual CW/CH space) ──
  const princessW = 48, princessH = 64;
  const princessX = CW / 2 - princessW / 2;
  const princessY = CH / 2 - princessH / 2;

  // Caveman is the SAME size as princess.
  const cavemanW = princessW, cavemanH = princessH;
  const cavemanY = princessY + princessH - cavemanH; // feet aligned with princess

  // Caveman path
  let cavemanX: number;
  let cavemanWalking = true;
  let cavemanVisible = true;
  if (t <= T.CAVEMAN_WALK_END) {
    const p = Math.min(1, t / T.CAVEMAN_WALK_END);
    cavemanX = -cavemanW + (princessX - cavemanW - 6 + cavemanW) * p;
  } else if (t < T.CARRY_END) {
    // Stand still next to princess from arrival through dragon grab and carry.
    cavemanX = princessX - cavemanW - 6;
    cavemanWalking = false;
  } else if (t < T.CAVEMAN_EXIT_END) {
    // After dragon is off-screen: walk right & exit.
    const p = Math.min(1, (t - T.CARRY_END) / (T.CAVEMAN_EXIT_END - T.CARRY_END));
    cavemanX = (princessX - cavemanW - 6) + (CW + 40 - (princessX - cavemanW - 6)) * p;
    cavemanWalking = true;
  } else {
    cavemanX = CW + 40;
    cavemanVisible = false;
  }

  // Dragon — TWICE the size of princess.
  const dragonW = princessW * 2, dragonH = princessH * 2;
  const dragonHoverY = CH / 4 - dragonH / 2; // 1/4 from top
  let dragonX = -dragonW;
  let dragonY = dragonHoverY;
  let showDragon = false;
  let princessHeldByDragon = false;
  if (t >= 4000 && t < T.DRAGON_HOVER_END) {
    // Hover at far left
    showDragon = true;
    dragonX = 8;
    // gentle bob
    dragonY = dragonHoverY + Math.sin((t - 4000) / 120) * 3;
  } else if (t >= T.DRAGON_HOVER_END && t < T.DRAGON_REACH) {
    showDragon = true;
    const p = (t - T.DRAGON_HOVER_END) / (T.DRAGON_REACH - T.DRAGON_HOVER_END);
    // fly from (8, dragonHoverY) to just above princess (so toes grab her head).
    const tgtX = princessX + princessW / 2 - dragonW / 2;
    const tgtY = princessY - dragonH + 24; // overlap so "toes" touch princess
    dragonX = 8 + (tgtX - 8) * p;
    dragonY = dragonHoverY + (tgtY - dragonHoverY) * p;
  } else if (t >= T.DRAGON_REACH && t < T.CARRY_END) {
    showDragon = true;
    princessHeldByDragon = true;
    const p = (t - T.DRAGON_REACH) / (T.CARRY_END - T.DRAGON_REACH);
    // fly from grab point off to the right at hover Y.
    const startX = princessX + princessW / 2 - dragonW / 2;
    const startY = princessY - dragonH + 24;
    const endX = CW + 40;
    const endY = dragonHoverY;
    dragonX = startX + (endX - startX) * p;
    dragonY = startY + (endY - startY) * p;
  }

  // Princess position — follows dragon once grabbed.
  let pX = princessX, pY = princessY;
  let showPrincess = t < T.DRAGON_REACH || princessHeldByDragon;
  if (princessHeldByDragon) {
    pX = dragonX + dragonW / 2 - princessW / 2;
    pY = dragonY + dragonH - 8; // hangs beneath dragon's toes
  }
  if (t >= T.CARRY_END) showPrincess = false;

  // Sprite frame counters — caveman freezes on frame 0 when not walking (no flashing).
  const walkFrame = cavemanWalking ? Math.floor(t / 120) % WALK_FRAMES : 0;
  const dragonFrame = Math.floor(t / 100) % DRAGON_FRAMES;

  // Overlay text states
  const showCongrats = t < T.DRAGON_REACH;
  const showThanks = t >= T.CAVEMAN_WALK_END && t < T.PRINCESS_THANKS_END;
  const showHelp = t >= T.DRAGON_REACH && t < T.CARRY_END;
  const showCavemanLine = t >= T.DRAGON_REACH && t < T.CAVEMAN_EXIT_END;
  const showSadText = t >= T.PAUSE_END && t < T.TEXT_END;

  // Scale virtual coords → percentage so this overlay matches the canvas aspect box.
  const pct = (v: number, axis: 'x' | 'y') => `${(v / (axis === 'x' ? CW : CH)) * 100}%`;
  const sizePct = (v: number, axis: 'x' | 'y') => `${(v / (axis === 'x' ? CW : CH)) * 100}%`;

  // Caveman sprite — sheet is 4 frames wide. We render via background-image for crisp pixel scaling.
  const cavemanBg: React.CSSProperties = {
    backgroundImage: `url(${cavemanWalkUrl})`,
    backgroundSize: `${WALK_FRAMES * 100}% 100%`,
    backgroundPosition: `-${walkFrame * 100}% 0`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    transform: 'scaleX(1)',
  };
  const dragonBg: React.CSSProperties = {
    backgroundImage: `url(${dragonAngryUrl})`,
    backgroundSize: `${DRAGON_FRAMES * 100}% 100%`,
    backgroundPosition: `-${dragonFrame * 100}% 0`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    // Dragon faces right when flying right; mirror when needed.
    transform: t >= T.DRAGON_HOVER_END ? 'scaleX(1)' : 'scaleX(1)',
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black select-none">
      {/* Virtual canvas box keeps the 512:480 aspect ratio. */}
      <div
        className="relative bg-black"
        style={{ aspectRatio: `${CW} / ${CH}`, height: '100%' }}
      >
        {/* CONGRATULATIONS banner */}
        {showCongrats && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center font-caveman"
            style={{
              top: '5%',
              width: '94%',
              color: 'hsl(var(--accent))',
              fontSize: 'min(3.4vh, 1.7vw)',
              textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
              lineHeight: 1.2,
            }}
          >
            CONGRATULATIONS!<br />YOU SAVED PRINCESS!
          </div>
        )}

        {/* Princess — render only frame 0 from the 5-frame sheet, mirrored to face LEFT. */}
        {showPrincess && (() => {
          // L1 princess "HELP!" toggle: alternate between idle frame 0 and help frame 2.
          // During grab, toggle every 400ms so the scream is visibly animated within the short carry.
          const princessFrame = princessHeldByDragon
            ? (Math.floor(t / 400) % 2 === 0 ? 0 : 2)
            : 0;
          return (
            <div
              style={{
                position: 'absolute',
                left: pct(pX, 'x'),
                top: pct(pY, 'y'),
                width: sizePct(princessW, 'x'),
                height: sizePct(princessH, 'y'),
                backgroundImage: `url(${princessSpriteUrl})`,
                backgroundSize: '500% 100%',                       // 5 frames wide
                backgroundPosition: `-${princessFrame * 100}% 0%`, // 0 = idle, 2 = HELP
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
                // scaleX(-1) flips so princess faces left.
                transform: princessHeldByDragon ? 'scaleX(-1) rotate(8deg)' : 'scaleX(-1)',
                transition: 'transform 0.2s',
              }}
            />
          );
        })()}



        {/* Princess "Thank you" speech bubble */}
        {showThanks && (
          <div
            className="absolute text-center font-caveman"
            style={{
              left: pct(princessX + princessW + 4, 'x'),
              top: pct(princessY - 18, 'y'),
              maxWidth: '40%',
              color: '#fff',
              background: 'rgba(0,0,0,0.7)',
              border: '2px solid hsl(var(--accent))',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 'min(1.8vh, 0.95vw)',
            }}
          >
            Thank you for saving me!
          </div>
        )}

        {/* Princess "HELP ME!!!" */}
        {showHelp && (
          <div
            className="absolute text-center font-caveman"
            style={{
              left: pct(pX, 'x'),
              top: pct(pY - 28, 'y'),
              transform: 'translateX(-25%)',
              color: '#ff5050',
              background: 'rgba(0,0,0,0.75)',
              border: '2px solid #ff5050',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 'min(2.4vh, 1.2vw)',
              fontWeight: 'bold',
            }}
          >
            HELP ME!!!
          </div>
        )}

        {/* Caveman line */}
        {showCavemanLine && (
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
              fontSize: 'min(1.8vh, 0.95vw)',
              whiteSpace: 'nowrap',
              transform: 'translateX(-20%)',
            }}
          >
            I will save you!!!
          </div>
        )}

        {/* Caveman */}
        {cavemanVisible && (
          <div
            style={{
              position: 'absolute',
              left: pct(cavemanX, 'x'),
              top: pct(cavemanY, 'y'),
              width: sizePct(cavemanW, 'x'),
              height: sizePct(cavemanH, 'y'),
              ...cavemanBg,
            }}
          />
        )}

        {/* Dragon */}
        {showDragon && (
          <div
            style={{
              position: 'absolute',
              left: pct(dragonX, 'x'),
              top: pct(dragonY, 'y'),
              width: sizePct(dragonW, 'x'),
              height: sizePct(dragonH, 'y'),
              ...dragonBg,
            }}
          />
        )}

        {/* Sad ending text */}
        {showSadText && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-caveman"
            style={{
              color: '#fff',
              fontSize: 'min(3vh, 1.5vw)',
              textShadow: '2px 2px 0 #000',
              width: '90%',
              lineHeight: 1.3,
            }}
          >
            ... but the happiness did not last long ...
          </div>
        )}
      </div>
    </div>
  );
}
