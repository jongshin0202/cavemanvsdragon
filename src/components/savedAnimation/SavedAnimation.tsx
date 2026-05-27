import { useEffect, useRef, useState } from 'react';
import cavemanWalkUrl from '@/assets/caveman-walk.png';

// Virtual canvas size (matches CavemanVsDragonGame CANVAS_W/H).
const CW = 512;
const CH = 480;
const WALK_FRAMES = 4;

// Timeline (ms):
// The L4 ending (in level4.ts) already shows the dragon re-kidnapping the
// princess and flying off. This overlay picks up AFTER that, so it must NOT
// replay the kidnap. It just shows the caveman walking determinedly across
// the screen, then the rallying line, then hands off to the next level.
//
// 0..3000   : caveman walks across (left → right) with the sad header text
// 3000..4000: blank (1s)
// 4000..7000: "I will save you princess!!!" centered (3s)
// 7000..9000: blank (2s)
// 9000      : onDone()
const T = {
  CAVEMAN_WALK_END: 3000,
  BLANK1_END: 4000,
  SAVE_LINE_END: 7000,
  DONE: 9000,
};

interface Props {
  onDone: () => void;
}

export default function SavedAnimation({ onDone }: Props) {
  const [t, setT] = useState(0);
  const startRef = useRef<number>(performance.now());
  const doneRef = useRef<boolean>(false);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      setT(elapsed);
      if (elapsed >= T.DONE) {
        if (!doneRef.current) { doneRef.current = true; onDone(); }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  // Caveman walks across the screen at princess-height.
  const cavemanW = 48, cavemanH = 64;
  const cavemanY = CH / 2 - cavemanH / 2;
  const walkP = Math.min(1, t / T.CAVEMAN_WALK_END);
  const cavemanX = -cavemanW + (CW + cavemanW * 2) * walkP;
  const cavemanVisible = t < T.CAVEMAN_WALK_END;
  const cavemanWalking = cavemanVisible;

  const walkFrame = cavemanWalking ? Math.floor(t / 120) % WALK_FRAMES : 0;

  const showSadText = t < T.CAVEMAN_WALK_END;
  const showSaveLine = t >= T.BLANK1_END && t < T.SAVE_LINE_END;

  const pct = (v: number, axis: 'x' | 'y') => `${(v / (axis === 'x' ? CW : CH)) * 100}%`;
  const sizePct = (v: number, axis: 'x' | 'y') => `${(v / (axis === 'x' ? CW : CH)) * 100}%`;

  const cavemanBg: React.CSSProperties = {
    backgroundImage: `url(${cavemanWalkUrl})`,
    backgroundSize: `${WALK_FRAMES * 100}% 100%`,
    backgroundPosition: `${(walkFrame / (WALK_FRAMES - 1)) * 100}% 0%`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black select-none">
      <div
        className="relative bg-black"
        style={{ aspectRatio: `${CW} / ${CH}`, height: '100%' }}
      >
        {/* "...but the happiness did not last long..." header */}
        {showSadText && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center font-caveman"
            style={{
              top: '5%',
              width: '94%',
              color: 'hsl(var(--accent))',
              fontSize: 'min(6vh, 3.2vw)',
              textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
              lineHeight: 1.2,
            }}
          >
            ... but the happiness did not last long ...
          </div>
        )}

        {/* Caveman walking across */}
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

        {/* "I will save you princess!!!" centered */}
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
