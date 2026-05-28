import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CANVAS_W, CANVAS_H, GRAVITY, JUMP_FORCE, MOVE_SPEED, BARREL_SPEED, CLIMB_SPEED, ROBOT_SPEED, getRoundDifficulty,
  PLATFORMS, LADDERS, getPlatformY, rectsOverlap, findPlatformIndex, findBestLadder, buildMonkeyDistribution,
  isLevel2Round, isLevel3Round, isLevel4Round, getLevelIteration,
  Barrel, Robot
} from './game/constants';
import { initLevel4, updateLevel4, renderLevel4, type L4State, type L4Sprites, type L4Input } from './game/level4/level4';
import { scoreFor, type ScoreAction } from './game/scoring';

import heartUrl from '@/assets/heart.png';
import { playJumpSound, playBarrelRollSound, playGameOverSound, playWinSound, playHitSound, playRobotKillSound, playKeyGrabSound, playWaterSproutSound, playGenieAppearSound, playPrincessSavedSound, playVineGrowSound, playDragonRoarTracked, playPrincessHelpSound, isDragonRoaringNow, unlockAudio } from './game/sounds';
import { loadScores, qualifiesForTop, insertScore, clearLocalScores, formatDate, entryDisplayName, MAX_ENTRIES, type LeaderboardEntry } from './game/leaderboard';
import { checkAndRefresh, qualifiesForGlobal, submitGlobalScore, getCachedGlobal, type GlobalEntry } from './game/globalLeaderboard';
import { recordLaunchAndMaybeFlush, recordRound, recordGlobalHit } from './game/deviceStats';
import { validateName, NAME_MAX_LENGTH, NAME_ALLOWED_REGEX } from './game/profanity';
import { LEVEL2_PARAMS, getLevel2Difficulty } from './game/level2/params';
import { initLevel2, updateLevel2, renderLevel2, spawnLevel2Robots, fireballHitsPlayer, tryPickupCan, tryPickupRock, trySealVolcano, maybeSpawnVolcanoRock, onMonkeyKilled, newSpawnJacket, pushJacket, isHoleAtPlatform, tickApples, appleHitsPlayer, notifyVolcanoSealedL3, type L2Sprites } from './game/level2/level2';
import { makeEmptyL2State, type L2State } from './game/level2/types';
import { applyLevel2Layout, restoreLevel1Layout, isLadderUsableL2, markSproutUsed, markSproutInUse, tickSprouts, getSprouts, waterTopSprout, isTopSproutGrown, GREEN_TOP_LADDER_IDX, PURPLE_TOP_LADDER_IDX, enableLevel1SproutMechanic } from './game/level2/layout';
import { buildLevel3MovingPlatforms, clearLevel3MovingPlatforms, tickMovingPlatforms, renderMovingPlatforms, landOnMovingPlatform, getMovingPlatforms } from './game/level3/movingPlatforms';
import { applyLevel3Layout, getLevel3PermanentHoles, SPROUT_DROP_X1, SPROUT_DROP_X2 } from './game/level3/layout';
import { getL3Stage, notifyMpsMonkeyKilled, sproutsAllowedToGrow, setMpsMonkeyTarget } from './game/level3/stage';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import cavemanWalkUrl from '@/assets/caveman-walk.png';
import cavemanJumpUrl from '@/assets/caveman-jump.png';
import cavemanClimbUrl from '@/assets/caveman-climb.png';
import cavemanSproutReachUrl from '@/assets/MainChar-MovingBetweenSprouts-NoBG.png';
import cavemanWinUrl from '@/assets/caveman-win.png';
import dragonFireUrl from '@/assets/dragon-fire.png';
import dragonAngryUrl from '@/assets/dragon-angry.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';
import robotWalkUrl from '@/assets/robot-walk.png';
import rockWheelUrl from '@/assets/rock-wheel.png';
import wateringCanUrl from '@/assets/watering-can.png';
import introBackgroundUrl from '@/assets/intro-background.jpg';
import team2goLogoUrl from '@/assets/team2go-logo.png';
import dedicationMobileUrl from '@/assets/dedication-mobile.png';
import dedicationPcUrl from '@/assets/dedication-pc.png';
import SavedAnimation from './savedAnimation/SavedAnimation';

const ROBOT_WALK_FRAMES = 5;

// Dragon sprite sheets: each has 5 frames, randomly alternated
const DRAGON_FRAMES = 5;

const LADDER_SNAP = 36;

// Index of the topmost vine (P5 → Top). Always the LAST ladder in the
// (mutated) LADDERS array — true for both L1 and the rebuilt L2 layout.
// Hidden until the player plants the seed.
const getTopVineIdx = () => LADDERS.length - 1;
// Where the seed must be planted (base of the topmost vine, on platform P5)
const getPlantX = () => LADDERS[LADDERS.length - 1].x + 7;
// True when the L2-style sprout dying mechanic is active for this round —
// always on for L2 rounds, and on for L1 once the player reaches L1 iter 5+.
const sproutMechanicActive = (round: number): boolean => {
  if (isLevel2Round(round)) return true;
  return getLevelIteration(round) >= 5;
};
// Unified "is this ladder currently climbable" check (handles both the
// L2 sprout system and the L1 dying-sprout system once enabled).
const isLadderUsable = (round: number, idx: number): boolean => {
  if (sproutMechanicActive(round)) {
    // The L1 top vine remains gated by its own seed/key flow, not the
    // sprout runtime — let the existing topVineUnlocked logic handle it.
    if (!isLevel2Round(round) && idx === getTopVineIdx()) return true;
    return isLadderUsableL2(idx);
  }
  return true;
};

type MovingPlatformRide = ReturnType<typeof getMovingPlatforms>[number];
type MpsRobot = Robot & {
  _mpsL3?: boolean;
  _ssL3?: boolean;
  _rideMp?: MovingPlatformRide;
  _mpRow?: number;
  _lastMpX?: number;
  wanderDir?: number;
};

const findSproutSectionVineTarget = (
  round: number,
  rCenterX: number,
  playerCenterX: number,
  playerFeetY: number,
  mustBeUsable: boolean,
): number => {
  const chasingDown = playerFeetY > PLATFORMS[4].y + 24;
  let bestLi = -1;
  let bestScore = Infinity;
  for (let li = 0; li < LADDERS.length; li++) {
    if (li === GREEN_TOP_LADDER_IDX || li === PURPLE_TOP_LADDER_IDX) continue;
    if (mustBeUsable && !isLadderUsable(round, li)) continue;
    const l = LADDERS[li];
    if (Math.abs(l.yTop - PLATFORMS[4].y) > 12) continue;
    const lx = l.x + 7;
    if (rCenterX < SPROUT_DROP_X1 && lx > SPROUT_DROP_X2) continue;
    if (rCenterX > SPROUT_DROP_X2 && lx < SPROUT_DROP_X1) continue;
    const score = Math.abs(lx - (chasingDown ? playerCenterX : rCenterX)) + (chasingDown ? Math.abs(lx - rCenterX) * 0.25 : 0);
    if (score < bestScore) { bestScore = score; bestLi = li; }
  }
  return bestLi;
};

/** Lifelike random pick among the closest sprouts to the player (chasing down). */
const findSproutSectionVineTargetRandom = (
  round: number,
  rCenterX: number,
  playerCenterX: number,
  mustBeUsable: boolean,
): number => {
  const candidates: { li: number; d: number }[] = [];
  for (let li = 0; li < LADDERS.length; li++) {
    if (li === GREEN_TOP_LADDER_IDX || li === PURPLE_TOP_LADDER_IDX) continue;
    if (mustBeUsable && !isLadderUsable(round, li)) continue;
    const l = LADDERS[li];
    if (Math.abs(l.yTop - PLATFORMS[4].y) > 12) continue;
    const lx = l.x + 7;
    if (rCenterX < SPROUT_DROP_X1 && lx > SPROUT_DROP_X2) continue;
    if (rCenterX > SPROUT_DROP_X2 && lx < SPROUT_DROP_X1) continue;
    candidates.push({ li, d: Math.abs(lx - playerCenterX) });
  }
  if (candidates.length === 0) return -1;
  candidates.sort((a, b) => a.d - b.d);
  // Pick randomly among the 3 closest to the player for lifelike variety.
  const pool = candidates.slice(0, Math.min(3, candidates.length));
  return pool[Math.floor(Math.random() * pool.length)].li;
};

const getVisibleSproutBottomY = (ladderIdx: number): number => {
  const l = LADDERS[ladderIdx];
  if (!l) return 0;
  if (ladderIdx === GREEN_TOP_LADDER_IDX || ladderIdx === PURPLE_TOP_LADDER_IDX) return l.yBot;
  const sr = getSprouts()[ladderIdx];
  const progress = sr?.growProgress ?? 1;
  return l.yTop + (l.yBot - l.yTop) * progress;
};

const findMonkeyRidePlatform = (r: MpsRobot): MovingPlatformRide | null => {
  const mps = getMovingPlatforms();
  if (mps.length === 0) return null;
  if (r._rideMp && mps.includes(r._rideMp)) return r._rideMp;

  const savedRow = typeof r._mpRow === 'number' ? r._mpRow : undefined;
  const pool = savedRow === undefined ? mps : mps.filter(mp => mp.row === savedRow);
  const candidates = pool.length ? pool : mps;
  const cx = r.x + r.w / 2;
  const feetY = r.y + r.h;
  let best = candidates[0];
  let bestScore = Infinity;
  for (const mp of candidates) {
    const mpCx = mp.x + mp.w / 2;
    const score = Math.abs(mp.y - feetY) * 1000 + Math.abs(mpCx - cx);
    if (score < bestScore) { bestScore = score; best = mp; }
  }
  r._rideMp = best;
  r._mpRow = best.row;
  r._lastMpX = best.x;
  return best;
};

const REQUIRED_ITEM_CLEARANCE = 38;

const getRequiredItemZones = (s: L2State): { x: number; y: number; w: number; h: number }[] => {
  const zones: { x: number; y: number; w: number; h: number }[] = [];
  if (s.greenCan && !s.greenCan.collected) zones.push(s.greenCan);
  if (s.purpleCan && !s.purpleCan.collected) zones.push(s.purpleCan);
  if (s.volcanoRock && s.volcanoRock.landed && !s.volcanoRock.collected) zones.push(s.volcanoRock);
  return zones;
};

const keepMonkeyAwayFromRequiredItems = (r: Robot & { wanderDir?: number }, s: L2State): void => {
  const rcx = r.x + r.w / 2;
  const rFeet = r.y + r.h;
  for (const item of getRequiredItemZones(s)) {
    const icx = item.x + item.w / 2;
    const iFeet = item.y + item.h;
    const sameLevel = Math.abs(rFeet - iFeet) < 24;
    const tooClose = sameLevel && Math.abs(rcx - icx) < REQUIRED_ITEM_CLEARANCE;
    const overlapping = rectsOverlap(r, {
      x: item.x - 12,
      y: item.y - 18,
      w: item.w + 24,
      h: item.h + 28,
    });
    if (!tooClose && !overlapping) continue;

    const dir = rcx <= icx ? -1 : 1;
    r.wanderDir = dir;
    r.direction = dir;
    if (r.climbing) {
      r.vy = rFeet <= iFeet ? -Math.max(r.speed, 0.45) : Math.max(r.speed, 0.45);
      r.y += r.vy;
    } else {
      r.vx = dir * Math.max(r.speed, 0.45);
      r.x += r.vx;
    }
  }
};

type GameState =
  | 'intro'
  | 'playing'
  | 'gameover'
  | 'win'
  | 'continue'
  | 'savedAnim'          // L4-cleared cinematic: dragon re-kidnaps princess
  | 'highscorePrompt'
  | 'enterName'
  | 'leaderboard'        // post-game LOCAL leaderboard (only-local qualifier)
  | 'globalLeaderboard'  // post-game GLOBAL leaderboard (global qualifier)
  | 'attractLocalLeaderboard'
  | 'attractGlobalLeaderboard'
  | 'attractControls';

const CavemanVsDragonGame = () => {
  const isMobile = useIsMobile();
  // Touch device detection — controls must ONLY appear on touch devices,
  // never on PC/desktop regardless of window width.
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouchDevice(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<GameState>('intro');
  const [scores, setScores] = useState<LeaderboardEntry[]>(() => loadScores());
  const [globalScores, setGlobalScores] = useState<GlobalEntry[]>([]);
  const [globalLoading, setGlobalLoading] = useState<boolean>(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  // Whether the just-submitted score also made the global top — drives which
  // post-game leaderboard we show after name entry.
  const justSubmittedGlobal = useRef<boolean>(false);
  // Set to true right before we navigate to 'globalLeaderboard' after a
  // successful submission. The probe-on-view effect consumes (and clears)
  // this flag once, so we don't race the server commit and overwrite the
  // freshly-inserted row with a stale fetch.
  const justSubmittedSkipProbe = useRef<boolean>(false);
  const justSubmittedLocalDateRef = useRef<string | null>(null);
  const justSubmittedGlobalIdRef = useRef<string | null>(null);
  const [nameInput, setNameInput] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');
  const [pendingScore, setPendingScore] = useState(0);
  const [pendingLevel, setPendingLevel] = useState(1);
  // Level intro overlay: 'level' shows "Level N" for 3s, then 'black' for 0.5s, then null.
  const [levelIntro, setLevelIntro] = useState<null | 'level' | 'black'>(null);
  const [levelIntroNumber, setLevelIntroNumber] = useState(1);
  const [jumpLabel, setJumpLabel] = useState<'JUMP' | 'KICK'>('JUMP');
  const levelIntroTimersRef = useRef<number[]>([]);
  // Mirrors `levelIntro` so the rAF game loop (which doesn't see React state
  // directly) can pause physics/spawns/sounds while the "Level N" overlay is
  // showing. Without this, e.g. L1 barrels would start spawning during the
  // Level 3 / Level 5 intro and play barrel-roll jingles under the overlay.
  const levelIntroRef = useRef<null | 'level' | 'black'>(null);
  const continueArmedAtRef = useRef(0); // ms timestamp when input is allowed
  const walkSpriteRef = useRef<HTMLImageElement | null>(null);
  const jumpSpriteRef = useRef<HTMLImageElement | null>(null);
  const climbSpriteRef = useRef<HTMLImageElement | null>(null);
  const sproutReachSpriteRef = useRef<HTMLImageElement | null>(null);
  const winSpriteRef = useRef<HTMLImageElement | null>(null);
  const dragonFireRef = useRef<HTMLImageElement | null>(null);
  const dragonAngryRef = useRef<HTMLImageElement | null>(null);
  const princessRef = useRef<HTMLImageElement | null>(null);
  const robotWalkRef = useRef<HTMLImageElement | null>(null);
  const rockWheelRef = useRef<HTMLImageElement | null>(null);
  const wateringCanRef = useRef<HTMLImageElement | null>(null);
  // Refs mirroring React state so the canvas render loop (inside an effect)
  // can read the current values without re-running the effect.
  const scoresRef = useRef<LeaderboardEntry[]>(scores);
  const globalScoresRef = useRef<GlobalEntry[]>([]);
  const nameInputRef = useRef<string>('');
  const nameErrorRef = useRef<string>('');
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const isMobileRef = useRef<boolean>(false);
  // Returns true if the input was consumed (i.e., used to advance a menu/screen).
  const anyInputHandlerRef = useRef<((key: string, source: 'keyboard' | 'pad') => boolean) | null>(null);
  // PC: hold-C-for-10s on the local-leaderboard attract screen to clear it.
  const cHoldTimerRef = useRef<number | null>(null);
  const cHoldFiredRef = useRef<boolean>(false);
  // Hardware gamepad detection (PC Gamepad API or Android key events from a controller).
  // When true on mobile, on-screen D-pad/JUMP/R buttons are hidden.
  const gamepadActiveRef = useRef<boolean>(false);
  const [gamepadActive, setGamepadActive] = useState<boolean>(false);
  // Hidden dedication overlay: triggered by 3 quick taps on the Team2Go logo
  // (mobile + PC mouse) or 3 quick presses of "i" (PC keyboard).
  const [showDedication, setShowDedication] = useState<boolean>(false);
  const logoTapTimesRef = useRef<number[]>([]);
  const iKeyTimesRef = useRef<number[]>([]);
  const triggerDedication = useCallback(() => {
    setShowDedication(true);
  }, []);
  const handleLogoTap = useCallback((e?: React.SyntheticEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const now = Date.now();
    const arr = logoTapTimesRef.current;
    arr.push(now);
    while (arr.length > 3) arr.shift();
    if (arr.length === 3 && now - arr[0] <= 1000) {
      arr.length = 0;
      triggerDedication();
    }
  }, [triggerDedication]);
  const markGamepadActive = useCallback(() => {
    if (!gamepadActiveRef.current) {
      gamepadActiveRef.current = true;
      setGamepadActive(true);
    }
  }, []);

  // Hidden dedication: type "iiRcade" quickly on PC (case-insensitive,
  // each key within 1s of the previous).
  useEffect(() => {
    const SECRET = 'iircade';
    let buffer = '';
    let lastTime = 0;
    const onKey = (e: KeyboardEvent) => {
      if (showDedication) return;
      if (e.key.length !== 1) return;
      const ch = e.key.toLowerCase();
      const now = Date.now();
      if (now - lastTime > 1000) buffer = '';
      lastTime = now;
      buffer = (buffer + ch).slice(-SECRET.length);
      if (buffer === SECRET) {
        buffer = '';
        triggerDedication();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDedication, triggerDedication]);

  // Dismiss dedication overlay on any key (PC) — pointer dismissal handled inline.
  useEffect(() => {
    if (!showDedication) return;
    const onKey = () => setShowDedication(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDedication]);
  const gameRef = useRef({
    player: { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0, duckTimer: 0 },
    barrels: [] as Barrel[],
    robots: [] as (Robot & { wanderTimer?: number; wanderDir?: number })[],
    barrelTimer: 0,
    nextBarrelTime: 30, // first barrel within ~0.5s
    robotSpawnTimer: 0,
    robotsInitialized: false,
    score: 0,
    lives: 3,
    round: 1,
    state: 'intro' as string,
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
    fatalDying: false,
    frameCount: 0,
    playerHasMoved: true, // start spawning barrels and audio immediately
    barrelStartDelay: 0,
    winAnim: { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, timer: 0 },
    pendingClimb: null as null | 'up' | 'down',
    courseDir: 0 as -1 | 0 | 1,
    // Kill-monkeys → key → grow topmost vine mechanic
    monkeysKilled: 0,
    // Combo: monkeys killed during the current airborne phase (resets on jump start / landing).
    comboKills: 0,
    keySpawned: false,
    keyGrabbed: false,
    seedPlanted: false, // (legacy name) true once key is grabbed; triggers vine grow
    topVineGrowth: 0,
    topVineUnlocked: false,
    keyPos: { x: 50, y: 158, w: 14, h: 14 }, // leftmost edge of P5 (y=176, x1=48)
    keyBob: 0,
    sparkleTimer: 0,
    invulnTimer: 0,
    roarTimer: 0,
    nextRoarTime: 300 + Math.floor(Math.random() * 600), // 5–15s at 60fps
    helpTimerSfx: 0,
    nextHelpTime: 600 + Math.floor(Math.random() * 600), // 10–20s at 60fps
  });

  // ── Level 2 state (separate file/module; never mutated by L1 code) ──
  const l2Ref = useRef<L2State>(makeEmptyL2State());
  // ── Level 4 state (Popeye-style boss fight; fully self-contained) ──
  const l4Ref = useRef<L4State | null>(null);
  const l4SpritesRef = useRef<L4Sprites | null>(null);
  const heartImgRef = useRef<HTMLImageElement | null>(null);
  // Tracks the last intro-tap time so we can detect a double-tap shortcut
  // to jump straight to Level 2 (when LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2).
  const lastIntroTapRef = useRef<number>(0);
  // Tap-count buffer for the intro shortcut: 2 taps → L2, 3 taps → L3.
  const introTapCountRef = useRef<number>(0);
  const introTapTimerRef = useRef<number | null>(null);
  // Where to go after the L4 "saved princess" cinematic finishes.
  // 'next' → start next level (after a real L4 clear).
  // 'intro' → back to the title screen (7-tap preview from intro).
  const savedAnimReturnRef = useRef<'next' | 'intro'>('next');
  // Bumped each time we enter savedAnim so the overlay remounts and the
  // animation always plays from t=0.
  const savedAnimKeyRef = useRef<number>(0);
  // True when the 7-tap preview wants the full kidnap cinematic; false when
  // we're coming off a real L4 win (where L4 already showed the kidnap).
  const savedAnimFullRef = useRef<boolean>(false);

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0, duckTimer: 0 };
    g.barrels = [];
    g.barrelTimer = 0;
    g.pendingClimb = null;
    g.courseDir = 0;
    // Brief invulnerability so we don't die on the same frame we respawn
    g.invulnTimer = 120; // ~2s at 60fps
    // L2: if any hole overlaps the spawn footprint, close it so the player
    // doesn't immediately fall through and lose lives in a death loop.
    if (isLevel2Round(g.round) && l2Ref.current?.holes?.length) {
      const px1 = g.player.x - 4;
      const px2 = g.player.x + g.player.w + 4;
      l2Ref.current.holes = l2Ref.current.holes.filter((h: any) => {
        const hx1 = h.centerX - h.width / 2;
        const hx2 = h.centerX + h.width / 2;
        const overlapsSpawn = hx2 >= px1 && hx1 <= px2;
        // Spawn is on the bottommost platform (P0). Only remove holes there.
        return !(overlapsSpawn && h.platformIdx === 0);
      });
    }
  }, []);


  // Resets the level only (for next level / death respawn). Preserves score & lives.
  const resetLevel = useCallback(() => {
    const g = gameRef.current;
    g.state = 'playing'; g.dying = false; g.fatalDying = false; g.deathTimer = 0; g.deathFlashTimer = 0;
    g.robots = [];
    g.robotSpawnTimer = 0;
    g.robotsInitialized = false;
    g.nextBarrelTime = 69 + Math.random() * 138;
    g.frameCount = 0;
    g.playerHasMoved = true;
    g.barrelStartDelay = 0;
    g.dkAnimTimer = 0; g.dkFrame = 0;
    g.princessAnimTimer = 0; g.helpTimer = 0; g.showHelp = false;
    g.winAnim = { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, timer: 0 };
    g.monkeysKilled = 0;
    g.comboKills = 0;
    (g as any).l2RespawnQueue = [];
    (g as any)._playerPrevFrame = null;
    g.keySpawned = false;
    g.keyGrabbed = false;
    g.seedPlanted = false;
    g.topVineGrowth = 0;
    g.topVineUnlocked = false;
    if (!g.keyPos) g.keyPos = { x: 50, y: 158, w: 14, h: 14 };
    g.keyBob = 0;
    g.sparkleTimer = 0;
    resetPlayer();
    // L4: fully self-contained. Init L4 state and skip all L1/L2/L3 setup.
    if (isLevel4Round(g.round)) {
      l4Ref.current = initLevel4(getLevelIteration(g.round));
      setGameState('playing');
      return;
    }
    // For Level 2+, initialize the L2 module's own state. We still spawn
    // an L1 rock here for the (legacy) L1 layout — the L2 module manages
    // its own hazards independently and the host's L1 barrel-spawn block
    // is gated on round===1 below in the loop.
    if (isLevel2Round(g.round)) {
      // L3 uses its own layout module; L2 uses applyLevel2Layout.
      if (isLevel3Round(g.round)) {
        applyLevel3Layout(getLevelIteration(g.round));
      } else {
        applyLevel2Layout();
      }
      initLevel2(l2Ref.current, getLevelIteration(g.round)); // iteration #
      // Push permanent holes for L3 (sprout-platform drop, 2-piece split)
      if (isLevel3Round(g.round)) {
        for (const h of getLevel3PermanentHoles()) l2Ref.current.holes.push(h as any);
        (l2Ref.current as any)._isL3 = true;
      } else {
        (l2Ref.current as any)._isL3 = false;
      }
      if (isLevel3Round(g.round)) buildLevel3MovingPlatforms(getLevelIteration(g.round));
      else clearLevel3MovingPlatforms();
      const { robots } = spawnLevel2Robots(l2Ref.current);
      g.robots.push(...robots);
      g.robotsInitialized = true;
      if (isLevel3Round(g.round)) {
        const mpsCount = (l2Ref.current as any)._l3MpsCount ?? 0;
        setMpsMonkeyTarget(mpsCount);
      }
    } else {
      // L1: make sure layout is the original (in case we just came back).
      restoreLevel1Layout();
      clearLevel3MovingPlatforms();
      // From L1 iter 5 onwards, enable the L2-style sprout dying mechanic
      // on L1 ladders. Map L1 iter 5 → L2 iter 1, L1 iter 6 → L2 iter 2, …
      const l1Iter = getLevelIteration(g.round);
      if (l1Iter >= 5) {
        enableLevel1SproutMechanic(getTopVineIdx(), l1Iter - 4);
      }
    }
    // Spawn first rock immediately so action starts the moment the level begins
    if (!isLevel2Round(g.round)) {
      const d = getRoundDifficulty(g.round);
      const speed = BARREL_SPEED * (d.barrelSpeedMul + Math.random() * d.barrelSpeedJitter);
      g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed, rollPhase: 0 });
      playBarrelRollSound();
    }
    setGameState('playing');
  }, [resetPlayer]);

  // Plays the "Level N" intro (3s) → black (0.5s) → then runs onDone.
  const playLevelIntro = useCallback((levelNumber: number, onDone: () => void) => {
    levelIntroTimersRef.current.forEach((id) => window.clearTimeout(id));
    levelIntroTimersRef.current = [];
    setLevelIntroNumber(levelNumber);
    setLevelIntro('level');
    levelIntroRef.current = 'level';
    const t1 = window.setTimeout(() => {
      setLevelIntro('black');
      levelIntroRef.current = 'black';
    }, 3000);
    const t2 = window.setTimeout(() => {
      setLevelIntro(null);
      levelIntroRef.current = null;
      onDone();
    }, 3500);
    levelIntroTimersRef.current.push(t1, t2);
  }, []);

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 1;
    setScore(0); setLives(3);
    setGameState('playing');
    justSubmittedLocalDateRef.current = null;
    justSubmittedGlobalIdRef.current = null;
    // Anonymous usage stats: count this as a launch (round 1 implicit).
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(1, () => resetLevel());
  }, [resetLevel, playLevelIntro]);

  // DEV/TEST: jump straight into Level 2 from the intro screen (gated on
  // LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2). Triggered by double-tap on phone
  // or the "2" key on PC.
  const startInLevel2Test = useCallback(() => {
    if (!LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2) return;
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 2;
    setScore(0); setLives(3);
    setGameState('playing');
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(2, () => resetLevel());
  }, [resetLevel, playLevelIntro]);

  // DEV/TEST: jump straight into Level 3 (round 3 → L3 iter 1).
  const startInLevel3Test = useCallback(() => {
    if (!LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2) return;
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 3;
    setScore(0); setLives(3);
    setGameState('playing');
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(3, () => resetLevel());
  }, [resetLevel, playLevelIntro]);
  // DEV/TEST: jump straight into Level 3 iteration 4 (round 15 under new 4-level cycle).
  const startInLevel3Iter4Test = useCallback(() => {
    if (!LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2) return;
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 15;
    setScore(0); setLives(3);
    setGameState('playing');
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(3, () => resetLevel());
  }, [resetLevel, playLevelIntro]);
  // DEV/TEST: jump straight into Level 4 iteration 1 (round 4 under 4-level cycle).
  const startInLevel4Test = useCallback(() => {
    if (!LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2) return;
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 4;
    setScore(0); setLives(3);
    setGameState('playing');
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(4, () => resetLevel());
  }, [resetLevel, playLevelIntro]);
  // DEV/TEST: jump straight into Level 4 iteration 2 (round 8 under 4-level cycle).
  const startInLevel4Iter2Test = useCallback(() => {
    if (!LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2) return;
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 8;
    setScore(0); setLives(3);
    setGameState('playing');
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(4, () => resetLevel());
  }, [resetLevel, playLevelIntro]);
  // DEV/TEST: jump straight into Level 4 iteration 3 (round 12 under 4-level cycle).
  const startInLevel4Iter3Test = useCallback(() => {
    if (!LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2) return;
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 12;
    setScore(0); setLives(3);
    setGameState('playing');
    recordRound();
    recordLaunchAndMaybeFlush().catch(() => { /* logged in module */ });
    playLevelIntro(4, () => resetLevel());
  }, [resetLevel, playLevelIntro]);
  // with increased difficulty (next round) while preserving score and lives.
  const startNextLevel = useCallback(() => {
    const g = gameRef.current;
    g.round += 1;
    const nextRound = g.round;
    // Eagerly clear leftover L1 outro state so the "LEVEL N CLEAR" overlay
    // and the win-animation timer don't keep running underneath the intro.
    // (resetLevel() also clears these, but it doesn't run until after the
    // 3.5s intro completes.)
    g.state = 'playing';
    if (g.winAnim) g.winAnim.active = false;
    // Reset player position immediately so the previous level's end-pose
    // (e.g. standing on the princess at the top of L2) doesn't accidentally
    // re-trigger the next level's win condition during the "Level N" intro
    // overlay (before resetLevel runs).
    resetPlayer();
    setGameState('playing');
    recordRound();
    playLevelIntro(nextRound, () => resetLevel());
  }, [resetLevel, resetPlayer, playLevelIntro]);

  // Submit a high score: writes to LOCAL always, and to GLOBAL if it qualifies
  // for the global top 20. Then routes to the appropriate post-game view.
  const submitHighScore = useCallback(async () => {
    const raw = nameInputRef.current;
    const v = validateName(raw);
    if (!v.ok) {
      setNameError(v.error || 'INVALID NAME');
      return;
    }
    const cleanName = raw.trim().slice(0, NAME_MAX_LENGTH);
    const entry: LeaderboardEntry = {
      name: cleanName,
      // Keep initials for backward compat (first 3 chars uppercased)
      initials: cleanName.replace(/\s+/g, '').toUpperCase().padEnd(3, 'A').slice(0, 3),
      score: pendingScore,
      date: new Date().toISOString(),
      level: pendingLevel,
    };
    // 1) Always write to local
    const next = insertScore(entry);
    setScores(next);
    setNameError('');
    justSubmittedLocalDateRef.current = entry.date;

    // 2) If it qualifies globally, write to the cloud and show GLOBAL view.
    //    Otherwise, show LOCAL view.
    if (justSubmittedGlobal.current) {
      // Anonymous usage stats: count this as a global-leaderboard hit.
      recordGlobalHit();
      // Optimistically merge so the user instantly sees their row.
      const optimistic: GlobalEntry = {
        name: cleanName,
        score: pendingScore,
        level: pendingLevel,
        created_at: new Date().toISOString(),
      };
      setGlobalScores((prev) => {
        const merged = [...prev, optimistic]
          .sort((a, b) => b.score - a.score || (a.created_at || '').localeCompare(b.created_at || ''))
          .slice(0, MAX_ENTRIES);
        return merged;
      });
      // Mark "just submitted" so the leaderboard-view effect skips its probe
      // for this transition — we already have the authoritative row from the
      // insert response, and probing too early would race the server-side
      // commit and overwrite the optimistic row with a stale empty list.
      justSubmittedSkipProbe.current = true;
      // AWAIT the cloud write so we never navigate before the insert lands.
      // submitGlobalScore returns the canonical row and updates the cache.
      const saved = await submitGlobalScore({
        name: cleanName,
        score: pendingScore,
        level: pendingLevel,
      });
      if (saved) {
        justSubmittedGlobalIdRef.current = saved.id ?? null;
        // Replace the optimistic placeholder with the real row (now has id).
        setGlobalScores((prev) => {
          const withoutOptimistic = prev.filter(
            (r) => !(r.name === optimistic.name && r.score === optimistic.score && !r.id),
          );
          const merged = [...withoutOptimistic, saved]
            .sort((a, b) => b.score - a.score || (a.created_at || '').localeCompare(b.created_at || ''))
            .slice(0, MAX_ENTRIES);
          return merged;
        });
      }
      setGameState('globalLeaderboard');
    } else {
      setGameState('leaderboard');
    }
  }, [pendingScore, pendingLevel]);

  // Keep refs in sync with state for the canvas render loop
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  useEffect(() => { globalScoresRef.current = globalScores; }, [globalScores]);
  useEffect(() => { nameInputRef.current = nameInput; }, [nameInput]);
  useEffect(() => { nameErrorRef.current = nameError; }, [nameError]);
  useEffect(() => { isMobileRef.current = isMobile; }, [isMobile]);

  // Global leaderboard: check-on-demand strategy.
  //   1) Seed instantly from localStorage cache (zero network).
  //   2) On mount (game launch) run ONE tiny "did anything change?" probe.
  //      If the server signature matches our cache → no extra reads.
  //      If it differs → pull the fresh top N once.
  //   3) We also re-run the same probe whenever the user enters the
  //      GLOBAL leaderboard view with a fresh submission (see effect below).
  useEffect(() => {
    setGlobalScores(getCachedGlobal());
    setGlobalLoading(true);
    checkAndRefresh()
      .then((rows) => setGlobalScores(rows))
      .finally(() => setGlobalLoading(false));
  }, []);

  // Re-check when the user lands on the global leaderboard view, so the list
  // they see reflects any other players' submissions since launch.
  // EXCEPTION: if we just inserted our own row, skip this probe — we already
  // hold the canonical row from the insert response, and probing too soon
  // can race the server-side commit and overwrite it.
  useEffect(() => {
    if (gameState !== 'globalLeaderboard' && gameState !== 'attractGlobalLeaderboard') return;
    if (justSubmittedSkipProbe.current) {
      justSubmittedSkipProbe.current = false;
      return;
    }
    checkAndRefresh()
      .then((rows) => setGlobalScores(rows))
      .catch(() => { /* logged in module */ });
  }, [gameState]);

  // Clear any pending level-intro timers on unmount
  useEffect(() => () => {
    levelIntroTimersRef.current.forEach((id) => window.clearTimeout(id));
    levelIntroTimersRef.current = [];
  }, []);

  const gameStateRef = useRef<GameState>('intro');
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Auto-return to intro screen after 5s of inactivity on terminal screens
  // (gameover without high score, or after viewing the leaderboard post-game).
  useEffect(() => {
    if (gameState !== 'gameover' && gameState !== 'leaderboard' && gameState !== 'globalLeaderboard') return;
    let timer = window.setTimeout(() => {
      justSubmittedLocalDateRef.current = null;
      justSubmittedGlobalIdRef.current = null;
      setGameState('intro');
    }, 5000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        justSubmittedLocalDateRef.current = null;
        justSubmittedGlobalIdRef.current = null;
        setGameState('intro');
      }, 5000);
    };
    window.addEventListener('keydown', reset);
    window.addEventListener('pointerdown', reset);
    window.addEventListener('touchstart', reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('touchstart', reset);
    };
  }, [gameState]);

  // Attract-mode idle cycle on the title screen.
  //   PC:     intro → attractControls → attractLocalLeaderboard → attractGlobalLeaderboard → intro …
  //   Mobile: intro → attractLocalLeaderboard → attractGlobalLeaderboard → intro …
  useEffect(() => {
    let nextState: GameState | null = null;
    let delay = 0;
    if (gameState === 'intro') {
      nextState = isMobile ? 'attractLocalLeaderboard' : 'attractControls';
      delay = 5000;
    } else if (gameState === 'attractControls') {
      nextState = 'attractLocalLeaderboard';
      delay = 5000;
    } else if (gameState === 'attractLocalLeaderboard') {
      nextState = 'attractGlobalLeaderboard';
      delay = 5000;
    } else if (gameState === 'attractGlobalLeaderboard') {
      nextState = 'intro';
      delay = 5000;
    }
    if (!nextState) return;
    const target = nextState;
    const timer = window.setTimeout(() => setGameState(target), delay);
    return () => window.clearTimeout(timer);
  }, [gameState, isMobile]);

  // Wire up the unified "any input" handler. Re-binds whenever dependencies change.
  useEffect(() => {
    anyInputHandlerRef.current = (key, _source) => {
      const now = performance.now();
      const gs = gameStateRef.current;
      const g = gameRef.current;

      if (
        gs === 'intro' ||
        gs === 'attractLocalLeaderboard' ||
        gs === 'attractGlobalLeaderboard' ||
        gs === 'attractControls'
      ) {
        // PC: on the local-leaderboard attract screen, holding C for 10s
        // opens the "clear local leaderboard" confirmation. Don't start a
        // new game while C is being held.
        if (
          _source === 'keyboard' &&
          gs === 'attractLocalLeaderboard' &&
          (key === 'c' || key === 'C')
        ) {
          if (cHoldTimerRef.current === null && !cHoldFiredRef.current) {
            cHoldFiredRef.current = false;
            cHoldTimerRef.current = window.setTimeout(() => {
              cHoldFiredRef.current = true;
              cHoldTimerRef.current = null;
              setConfirmClearOpen(true);
            }, 10_000);
          }
          return true; // swallow C — don't start the game
        }
        // DEV/TEST: PC presses "2" → Level 2, "3" → Level 3, "5" → L4 iter 2, "6" → L4 iter 3.
        if (
          _source === 'keyboard' &&
          (gs === 'intro' || gs === 'attractControls') &&
          key === '2' &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          startInLevel2Test();
          return true;
        }
        if (
          _source === 'keyboard' &&
          (gs === 'intro' || gs === 'attractControls') &&
          key === '3' &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          startInLevel3Test();
          return true;
        }
        if (
          _source === 'keyboard' &&
          (gs === 'intro' || gs === 'attractControls') &&
          key === '5' &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          startInLevel4Iter2Test();
          return true;
        }
        if (
          _source === 'keyboard' &&
          (gs === 'intro' || gs === 'attractControls') &&
          key === '6' &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          startInLevel4Iter3Test();
          return true;
        }
        // DEV/TEST: mobile tap-count shortcut on intro/attract:
        //   2 taps → Level 2; 3 taps → Level 3; 4 taps → L4 iter 1;
        //   5 taps → L4 iter 2; 6 taps → L4 iter 3.
        if (
          _source === 'pad' &&
          (gs === 'intro' ||
            gs === 'attractLocalLeaderboard' ||
            gs === 'attractGlobalLeaderboard' ||
            gs === 'attractControls') &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          introTapCountRef.current += 1;
          if (introTapTimerRef.current !== null) {
            window.clearTimeout(introTapTimerRef.current);
            introTapTimerRef.current = null;
          }
          introTapTimerRef.current = window.setTimeout(() => {
            const taps = introTapCountRef.current;
            introTapCountRef.current = 0;
            introTapTimerRef.current = null;
            const stillIntro =
              gameStateRef.current === 'intro' ||
              gameStateRef.current === 'attractLocalLeaderboard' ||
              gameStateRef.current === 'attractGlobalLeaderboard' ||
              gameStateRef.current === 'attractControls';
            if (!stillIntro) return;
            if (taps >= 7) {
              // Preview the L4-cleared cinematic, then advance to the NEXT
              // Level 1 iteration. round 4 = L4 iter 1; startNextLevel bumps
              // it to round 5 = L1 iter 2 and shows the "Level" intro.
              const g = gameRef.current;
              g.score = 0; g.lives = 3; g.round = 4;
              setScore(0); setLives(3);
              savedAnimReturnRef.current = 'next';
              savedAnimKeyRef.current += 1;
              savedAnimFullRef.current = true;
              setGameState('savedAnim');
            }
            else if (taps === 6) startInLevel4Iter3Test();
            else if (taps === 5) startInLevel4Iter2Test();
            else if (taps === 4) startInLevel4Test();
            else if (taps === 3) startInLevel3Test();
            else if (taps === 2) startInLevel2Test();
            else resetGame();
          }, LEVEL2_PARAMS.DOUBLE_TAP_MAX_GAP_MS + 20);
          return true;
        }
        // Any other key/tap starts the game from the intro/attract screens
        resetGame();
        return true;
      }

      if (gs === 'continue') {
        if (now < continueArmedAtRef.current) return true; // still locked, swallow
        startNextLevel();
        return true;
      }

      if (gs === 'highscorePrompt') {
        if (now < continueArmedAtRef.current) return true;
        setNameInput('');
        setNameError('');
        // Focus the hidden input synchronously within the user gesture so
        // the mobile soft keyboard reliably opens on iOS/Android.
        try { nameFieldRef.current?.focus({ preventScroll: true } as any); } catch { nameFieldRef.current?.focus(); }
        setGameState('enterName');
        // Re-focus after the state update / re-render in case the browser drops it.
        setTimeout(() => nameFieldRef.current?.focus(), 0);
        setTimeout(() => nameFieldRef.current?.focus(), 50);
        return true;
      }

      if (gs === 'gameover') {
        if (qualifiesForTop(g.score)) {
          // Promote to high-score prompt; swallow this input so a second press is required to advance
          setPendingScore(g.score);
          setPendingLevel(g.round);
          // Decide now whether this also makes the global top, so we know
          // which leaderboard to display after name entry. Use the latest
          // global list we have cached.
          justSubmittedGlobal.current = qualifiesForGlobal(g.score, globalScores);
          continueArmedAtRef.current = now + 1000;
          setGameState('highscorePrompt');
          return true;
        }
        // Not a high score: only R restarts (handled by outer keydown handler)
        return false;
      }

      if (gs === 'enterName') {
        // The hidden <input> handles typing via React onChange; here we only
        // catch Enter (submit). Everything else is swallowed so it doesn't
        // bleed into the game.
        if (key === 'Enter') {
          submitHighScore();
          return true;
        }
        return true; // swallow other keys during entry (typing handled by input element)
      }

      if (gs === 'leaderboard' || gs === 'globalLeaderboard') {
        // Only R restarts (handled by outer handler) — swallow other keys
        if (key === 'r' || key === 'R') return false;
        return true;
      }

      return false;
    };
  }, [startNextLevel, submitHighScore, resetGame, startInLevel2Test, startInLevel3Test, startInLevel3Iter4Test, startInLevel4Test, globalScores]);


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

    const sproutReachImg = new Image();
    sproutReachImg.src = cavemanSproutReachUrl;
    sproutReachSpriteRef.current = sproutReachImg;

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

    const heartImg = new Image();
    heartImg.src = heartUrl;
    heartImgRef.current = heartImg;
    l4SpritesRef.current = {
      cavemanWalk: walkImg,
      cavemanJump: jumpImg,
      cavemanClimb: climbImg,
      cavemanWin: winImg,
      dragonFire: dragonFireImg,
      dragonAngry: dragonAngryImg,
      princess: princessImg,
      heart: heartImg,
      wateringCan: canImg,
      robotWalk: robotImg,
      rockWheel: rockImg,
    };

    // Android gamepad keyCode → standard web key mapping.
    // 19=DPAD_UP, 20=DPAD_DOWN, 21=DPAD_LEFT, 22=DPAD_RIGHT, 96=BUTTON_A (jump), 108=BUTTON_START (R).
    const ANDROID_PAD_KEYS: Record<number, string> = {
      19: 'ArrowUp', 20: 'ArrowDown', 21: 'ArrowLeft', 22: 'ArrowRight',
      96: ' ', 108: 'r',
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      unlockAudio();
      // When the user is typing into the name input, let the input handle the
      // key natively (we still listen for Enter inside the input's own onKeyDown).
      if (e.target === nameFieldRef.current) {
        return;
      }
      // Translate Android controller keycodes to standard keys + flag gamepad.
      let key = e.key;
      const padKey = ANDROID_PAD_KEYS[e.keyCode];
      if (padKey) { key = padKey; markGamepadActive(); e.preventDefault(); }
      keysRef.current.add(key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) e.preventDefault();
      // Route input through the unified handler. It returns true if it consumed the key.
      const consumed = anyInputHandlerRef.current?.(key, padKey ? 'pad' : 'keyboard');
      if (consumed) { e.preventDefault(); return; }
      if (key === 'r' || key === 'R' || e.code === 'KeyR') { e.preventDefault(); resetGame(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const padKey = ANDROID_PAD_KEYS[e.keyCode];
      const key = padKey ?? e.key;
      keysRef.current.delete(key);
      // Releasing C cancels the pending hold-to-clear timer.
      if (key === 'c' || key === 'C') {
        if (cHoldTimerRef.current !== null) {
          window.clearTimeout(cHoldTimerRef.current);
          cHoldTimerRef.current = null;
        }
        cHoldFiredRef.current = false;
      }
    };
    const handleFirstGesture = () => { unlockAudio(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handleFirstGesture);
    window.addEventListener('touchstart', handleFirstGesture, { passive: true });

    let intervalId: number | null = null; // 60Hz game loop driver

    let lastTime = 0;
    const FRAME_INTERVAL = 1000 / 60; // 60fps logical step

    const gameLoop = (timestamp: number) => {
      // Fixed-timestep gate: only run one full step+render per ~16.67ms.
      // Using >= (not <) so we don't busy-skip on high-refresh monitors;
      // we'll be re-driven by the next RAF/interval tick instead.
      const elapsed = timestamp - lastTime;
      if (elapsed < FRAME_INTERVAL) {
        return;
      }
      lastTime = timestamp - (elapsed % FRAME_INTERVAL);

      const g = gameRef.current;
      const keys = keysRef.current;
      const p = g.player;

      // ── Level 4: fully isolated update + render path ──
      if (isLevel4Round(g.round) && g.state === 'playing' && !levelIntroRef.current) {
        let s4 = l4Ref.current;
        if (!s4) {
          s4 = initLevel4(getLevelIteration(g.round));
          l4Ref.current = s4;
        }
        const padKeys = activePadKeysRef.current;
        const input: L4Input = {
          left: keys.has('ArrowLeft') || padKeys.includes('ArrowLeft'),
          right: keys.has('ArrowRight') || padKeys.includes('ArrowRight'),
          up: keys.has('ArrowUp') || padKeys.includes('ArrowUp'),
          down: keys.has('ArrowDown') || padKeys.includes('ArrowDown'),
          jump: keys.has(' '),
        };
        const pendingGO = (s4 as any)._pendingGameOver as number | undefined;
        if (pendingGO === undefined || pendingGO > 0) {
          const result = updateLevel4(s4, input);
          if (result.scoreEvents && result.scoreEvents.length) {
            const iter = getLevelIteration(g.round);
            for (const ev of result.scoreEvents) {
              g.score += scoreFor(ev, iter);
            }
            setScore(g.score);
          }
          if (result.died) {
            g.lives -= 1;
            setLives(g.lives);
            playHitSound();
            if (g.lives <= 0) {
              // Let the death animation (~1.8s) play out before showing game over.
              (s4 as any)._pendingGameOver = 110;
            }
            // L4 handles its own death-flash + respawn — do not reinit.
          } else if (result.won && g.state === 'playing') {
            g.state = 'savedAnim';
            savedAnimReturnRef.current = 'next';
            savedAnimFullRef.current = true;
            // L4 already waits 2s after the princess touch before reporting won,
            // so jump straight into the cinematic now.
            savedAnimKeyRef.current += 1;
            setGameState('savedAnim');
          }


          if ((s4 as any)._pendingGameOver !== undefined && (s4 as any)._pendingGameOver > 0) {
            (s4 as any)._pendingGameOver -= 1;
          }
        } else {
          g.state = 'gameover';
          setGameState('gameover');
          playGameOverSound();
          (s4 as any)._pendingGameOver = undefined;
        }
        // Render L4 onto canvas and skip the rest of the loop
        const sprites = l4SpritesRef.current;
        if (sprites) renderLevel4(ctx, s4, sprites);
        // Update JUMP/KICK button label based on caveman's proximity to rock at A.
        const pl = s4.player;
        const rIdx = s4.rockAtAIdx;
        const nextLabel: 'JUMP' | 'KICK' = (
          rIdx >= 0 && pl.onGround && pl.kickTimer === 0 && pl.groundPlatIdx === 4 &&
          s4.rocks[rIdx] && Math.abs((pl.x + pl.w / 2) - s4.rocks[rIdx].x) < 22
        ) ? 'KICK' : 'JUMP';


        setJumpLabel(prev => prev === nextLabel ? prev : nextLabel);
        return;
      }


      const wa: any = g.winAnim || { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, timer: 0 };
      if (!g.winAnim) g.winAnim = wa;
      if (wa.active) {
        wa.timer++;
        // ── Outro phases (replaces old "dragon falls" animation) ──
        // grab    (0..60f)    : dragon swoops to the right with princess in tow,
        //                       both slide off-screen by frame ~60
        // pause   (60..120f)  : 1 second of quiet
        // follow  (120..210f) : caveman walks right and exits screen
        // congrats(210..)     : show CONGRATS overlay; after another ~90f → continue
        if (wa.dragonX === undefined) wa.dragonX = 0;
        if (wa.princessX === undefined) wa.princessX = 0;
        if (wa.cavemanFollowOffset === undefined) wa.cavemanFollowOffset = 0;

        if (wa.timer <= 60) {
          // Phase: grab — accelerate dragon + princess to the right
          const t = wa.timer / 60;
          // ease-in: travel ~CANVAS_W + 80 over 60 frames
          const dist = (CANVAS_W + 80) * (t * t);
          wa.dragonX = dist;
          wa.princessX = dist;
          wa.showKiss = wa.timer > 12 && wa.timer < 40; // brief "!" beat
        } else if (wa.timer <= 120) {
          // Phase: pause (1s)
          wa.showKiss = false;
        } else if (wa.timer <= 210) {
          // Phase: follow — caveman walks right and off-screen.
          // FIRST frame of this phase: snap the caveman down onto the TOP
          // platform so he chases the dragon by walking on the platform
          // (not in mid-air) — covers the case where the win was triggered
          // mid-jump (e.g. jumping into the princess).
          if (!wa.followGrounded) {
            const topPlat = PLATFORMS[PLATFORMS.length - 1];
            const topY = getPlatformY(topPlat, p.x + p.w / 2);
            p.y = topY - p.h;
            p.vy = 0;
            p.jumping = false;
            p.jumpFrame = 0;
            wa.followGrounded = true;
          }
          const t = (wa.timer - 120) / 90;
          wa.cavemanFollowOffset = (CANVAS_W + 80) * t;
        } else {
          // Phase ended — switch straight to LEVEL CLEAR (no congrats overlay)
          if (g.state === 'win') {
            g.state = 'continue';
            setGameState('continue');
            continueArmedAtRef.current = performance.now() + 1000; // 1s input lock
          }
        }
      }

      // Handle dying state (1 second pause with flashing)
      if (g.dying) {
        g.deathTimer++;
        g.deathFlashTimer++;
        if (g.deathTimer >= 108) { // 3 visible flashes (~1.8s at 60fps)
          g.dying = false;
          g.deathTimer = 0;
          g.deathFlashTimer = 0;
          if (g.fatalDying) {
            g.fatalDying = false;
            g.state = 'gameover';
            setGameState('gameover');
            playGameOverSound();
          } else {
            resetPlayer();
            // L3 has no static ground — rebuild the moving platforms so a
            // platform is guaranteed near spawn, and place the player on
            // top of the leftmost row-0 platform so they don't fall into
            // an endless death loop.
            if (isLevel3Round(g.round)) {
              buildLevel3MovingPlatforms(getLevelIteration(g.round));
              for (const rb of g.robots as MpsRobot[]) {
                if (!rb._mpsL3) continue;
                rb._rideMp = undefined;
                rb._lastMpX = undefined;
                const mp = findMonkeyRidePlatform(rb);
                if (!mp) continue;
                rb.x = Math.max(mp.x + 1, Math.min(mp.x + mp.w - rb.w - 1, rb.x));
                rb.y = mp.y - rb.h;
                rb.vx = 0;
                rb.vy = 0;
                rb.onGround = true;
                rb.climbing = false;
              }
              const mps = getMovingPlatforms();
              const r0 = mps.filter(m => m.row === 0).sort((a, b) => a.x - b.x);
              if (r0.length > 0) {
                const target = r0[0];
                g.player.x = target.x + target.w / 2 - g.player.w / 2;
                g.player.y = target.y - g.player.h;
                g.player.vy = 0;
                g.player.onGround = true;
              }
            }
            // Spawn first rock wheel immediately on respawn — Level 1 only.
            // Level 2 manages its own hazards (fireballs/apples) and must
            // never get a rolling rock.
            if (!isLevel2Round(g.round)) {
              const d = getRoundDifficulty(g.round);
              const speed = BARREL_SPEED * (d.barrelSpeedMul + Math.random() * d.barrelSpeedJitter);
              g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed, rollPhase: 0 });
              playBarrelRollSound();
            }
          }
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

      // Pause physics, spawning, and gameplay sounds while the "Level N"
      // intro overlay is showing — otherwise e.g. the L1 barrel-spawner
      // would fire under the Level 3 / Level 5 overlay and play barrel-roll
      // jingles before the level actually starts.
      if (g.state === 'playing' && !g.dying && !levelIntroRef.current) {
        // Decrement invulnerability after respawn
        if (g.invulnTimer > 0) g.invulnTimer--;
        // Periodic dragon roar and princess "Help!" sounds removed per user request.
        // === PLAYER MOVEMENT ===
        const applePrevHitbox = { x: p.x, y: p.y, w: p.w, h: p.h };
        const playerPrevFrame = { x: p.x, y: p.y, w: p.w, h: p.h, vy: p.vy, onGround: p.onGround };
        (g as any)._playerPrevFrame = playerPrevFrame;
        // Wider snap: find nearest ladder within LADDER_SNAP pixels
        const playerCX = p.x + p.w / 2;
        let nearestLadder: (typeof LADDERS)[number] | null = null;
        let nearestLadderIdx = -1;
        let nearestLadderDist = Infinity;
        for (let li = 0; li < LADDERS.length; li++) {
          if (!isLevel2Round(g.round) && li === getTopVineIdx() && !g.topVineUnlocked) continue;
          if (!isLadderUsable(g.round, li)) continue;
          const l = LADDERS[li];
          const ladderCX = l.x + 7;
          const dist = Math.abs(playerCX - ladderCX);
          if (dist < LADDER_SNAP && p.y + p.h > l.yTop - 8 && p.y + p.h <= l.yBot + 16 && dist < nearestLadderDist) {
            nearestLadder = l;
            nearestLadderIdx = li;
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

        // Jump always takes priority — even if Up is held over a ladder.
        // This prevents getting "stuck" climbing in place at the top of a vine.
        const jumpPressed = keys.has(' ');
        const jumpJustPressed = jumpPressed && !(g as any)._jumpHeldLastFrame;
        (g as any)._jumpHeldLastFrame = jumpPressed;

        // To start climbing, the player must be CLOSELY aligned with the ladder
        // (no large horizontal snap that would look like teleporting). Once
        // climbing, the wider LADDER_SNAP keeps them stuck to the vine.
        const MOUNT_SNAP = 12;
        const canMountHere = !!nearestLadder && nearestLadderDist <= MOUNT_SNAP;

        if (wantUp && nearestLadder && !jumpPressed && (p.climbing || canMountHere)) {
          p.climbing = true;
          p.x = nearestLadder.x + 7 - p.w / 2;
        } else if (wantDown) {
          if (nearestLadder && p.y + p.h < nearestLadder.yBot - 4 && (p.climbing || canMountHere)) {
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
        // Ducking removed from the entire game.
        (p as any).duckHeld = false;
        (p as any).duckTimer = 0;

        // L3: ALWAYS tick moving platforms, regardless of climbing/jumping
        //   state. Storing the per-frame dx array on `g` so the landing
        //   block (in the !climbing path) can apply carry.
        if (isLevel3Round(g.round)) {
          (g as any)._l3Dxs = tickMovingPlatforms();
        } else {
          (g as any)._l3Dxs = undefined;
        }

        // L3: if the sprout the player is climbing on dies, drop them.
        if (p.climbing && isLevel3Round(g.round)) {
          const trackedIdx = (p as any).climbLadderIdx;
          const onMidVine = typeof trackedIdx === 'number'
            && trackedIdx >= 0
            && trackedIdx !== GREEN_TOP_LADDER_IDX
            && trackedIdx !== PURPLE_TOP_LADDER_IDX;
          if (onMidVine && !isLadderUsable(g.round, trackedIdx)) {
            p.climbing = false;
            p.vy = 0;
            p.onGround = false;
            (p as any).lateralPhase = 'idle';
            (p as any).climbLadderIdx = -1;
          }
        }

        if (p.climbing) {
          // Active sprout-to-sprout reach pose: hold for ~0.5s at midpoint
          // between the two vines, then snap to the target vine.
          const reach = (p as any).lateralReach;
          if (reach) {
            p.x = (reach.fromX + reach.toX) / 2;
            p.facing = reach.dir;
            p.vy = 0;
            if (sproutMechanicActive(g.round)) {
              if (typeof reach.fromIdx === 'number' && reach.fromIdx >= 0) markSproutInUse(reach.fromIdx);
              if (typeof reach.targetIdx === 'number' && reach.targetIdx >= 0) markSproutInUse(reach.targetIdx);
            }
            reach.timer--;
            if (reach.timer <= 0) {
              p.x = reach.toX;
              (p as any).climbLadderIdx = reach.targetIdx;
              (p as any).lateralCD = 0;
              (p as any)._prevLat = { l: false, r: false };
              (p as any).lateralReach = null;
            }
          } else {
          const climbingLadder = nearestLadder;
          if (nearestLadderIdx >= 0) (p as any).climbLadderIdx = nearestLadderIdx;
          // Define a generous "near end" zone: the top/bottom 10% of the
          // ladder length counts as "at the end", so the player can dismount
          // (snap to the platform, or step off sideways) once they're 90%
          // of the way up/down.
          const visibleBot = (() => {
            if (!climbingLadder || !isLevel3Round(g.round) || nearestLadderIdx === GREEN_TOP_LADDER_IDX || nearestLadderIdx === PURPLE_TOP_LADDER_IDX) return climbingLadder?.yBot ?? 0;
            const sr = getSprouts()[nearestLadderIdx];
            const fullH = climbingLadder.yBot - climbingLadder.yTop;
            return climbingLadder.yTop + fullH * (sr?.growProgress ?? 1);
          })();
          const ladderLen = climbingLadder ? Math.max(1, visibleBot - climbingLadder.yTop) : 0;
          const endZone = Math.max(8, ladderLen * 0.10);
          const feetY = p.y + p.h;
          const nearTop = !!climbingLadder && feetY < climbingLadder.yTop + endZone;
          const nearBot = !!climbingLadder && feetY > visibleBot - endZone;
          const wantsHorizontal = rawLeft || rawRight;
          if (!wantsHorizontal) (p as any)._prevLat = { l: false, r: false };

          // No jump-off mid-climb. The player can leave the ladder by
          // pressing up/down at the corresponding end, OR by pressing
          // left/right at any height — in which case we snap to the nearest
          // end (top if in the upper half, bottom otherwise) so the player
          // dismounts onto a platform.
          if (!nearestLadder && !nearTop) {
            p.climbing = false;
          } else if (nearTop && rawUp) {
            // Reached the top via Up — snap to the platform.
            p.climbing = false;
            if (climbingLadder) p.y = climbingLadder.yTop - p.h;
            if (sproutMechanicActive(g.round) && nearestLadderIdx >= 0) markSproutUsed(nearestLadderIdx);
          } else if (nearBot && rawDown) {
            // Reached the bottom via Down — dismount onto the lower platform.
            p.climbing = false;
            if (climbingLadder) p.y = visibleBot - p.h;
            if (sproutMechanicActive(g.round) && nearestLadderIdx >= 0) markSproutUsed(nearestLadderIdx);
          } else if (wantsHorizontal && climbingLadder) {
            // L3 mid-sprout vines: lateral hop to nearest USABLE vine in the
            // pressed direction (Donkey-Kong-Jr style). Variable vine lengths
            // are supported — the candidate must reach the player's current
            // feet height. Single-tap commits the hop; sprite swings during
            // the brief "reach across" pose.
            const isL3MidVine = isLevel3Round(g.round)
              && nearestLadderIdx !== GREEN_TOP_LADDER_IDX
              && nearestLadderIdx !== PURPLE_TOP_LADDER_IDX;
            if (isL3MidVine) {
              const curL = climbingLadder;
              const sprouts = getSprouts();
              const effBottomFor = (li: number, l: { yTop: number; yBot: number }) => {
                const sr = sprouts[li];
                const fullH = l.yBot - l.yTop;
                const prog = sr ? sr.growProgress : 1;
                return l.yTop + fullH * prog;
              };

              const prev = (p as any)._prevLat || { l: false, r: false };
              const edgeL = rawLeft && !prev.l;
              const edgeR = rawRight && !prev.r;
              (p as any)._prevLat = { l: rawLeft, r: rawRight };

              const findNeighbor = (dir: -1 | 1) => {
                let idx = -1;
                let L: { x: number; yTop: number; yBot: number } | null = null;
                let best = Infinity;
                const curCX = curL.x + 7;
                for (let li = 0; li < LADDERS.length; li++) {
                  if (li === nearestLadderIdx) continue;
                  if (li === GREEN_TOP_LADDER_IDX || li === PURPLE_TOP_LADDER_IDX) continue;
                  const cand = LADDERS[li];
                  // All mid vines share the same ceiling yTop — match on
                  // ceiling only (yBot in LADDERS is the FULL length, not
                  // the variable visible length).
                  if (cand.yTop !== curL.yTop) continue;
                  if (!isLadderUsable(g.round, li)) continue;
                  // Candidate must be visibly reachable near this height. Use a
                  // generous hand-reach window so tiny length differences don't
                  // make adjacent sprouts feel randomly blocked.
                  if (effBottomFor(li, cand) < (p.y + p.h) - 18) continue;
                  const dx = ((cand.x + 7) - curCX) * dir;
                  // Only allow hopping to an immediately-adjacent vine slot.
                  // Vines are placed every 32px with every-other parity, so
                  // adjacent live sprouts sit ~64px apart. If the next live
                  // sprout in this direction is farther (gap or dead vine in
                  // between), the player cannot reach it.
                  if (dx > 0 && dx <= 72 && dx < best) { best = dx; idx = li; L = cand; }
                }
                return { idx, L };
              };

              const cd = (p as any).lateralCD || 0;
              p.vy = 0;
              const REACH_FRAME = 3;
              const HOLD_FRAME = 0;

              const tryStep = (dir: -1 | 1) => {
                const { idx, L } = findNeighbor(dir);
                if (idx < 0 || !L) return;
                p.facing = dir;
                const fromX = p.x;
                const toX = L.x + 7 - p.w / 2;
                // Begin reach-across pose: hold the spread caveman sprite
                // for 15 frames (~0.25s @ 60fps), then snap to the target vine.
                (p as any).lateralReach = {
                  fromX, toX, dir,
                  fromIdx: nearestLadderIdx,
                  targetIdx: idx,
                  timer: 15,
                };
                (p as any).lateralCD = 15;
                p.climbFrame = REACH_FRAME;
                p.climbTimer = 0;
              };

              if (cd > 0) {
                (p as any).lateralCD = cd - 1;
                const rf = (p as any).lateralReachFrames || 0;
                if (rf > 0) {
                  (p as any).lateralReachFrames = rf - 1;
                  if (rf - 1 === 0) p.climbFrame = HOLD_FRAME;
                }
              } else {
                if (edgeL) tryStep(-1);
                else if (edgeR) tryStep(1);
              }

              // Allow current vine to die only if any other usable vine in
              // the same layer can hold the player.
              if (sproutMechanicActive(g.round)) {
                let hasOtherGrown = false;
                for (let li = 0; li < LADDERS.length; li++) {
                  if (li === nearestLadderIdx) continue;
                  if (li === GREEN_TOP_LADDER_IDX || li === PURPLE_TOP_LADDER_IDX) continue;
                  const cand = LADDERS[li];
                  if (cand.yTop !== curL.yTop) continue;
                  if (isLadderUsable(g.round, li)) { hasOtherGrown = true; break; }
                }
                if (!hasOtherGrown) markSproutInUse(nearestLadderIdx);
              }
            } else {
              // Default: horizontal dismount at any height.
              const midY = (climbingLadder.yTop + climbingLadder.yBot) / 2;
              const snapTop = feetY <= midY;
              p.y = (snapTop ? climbingLadder.yTop : climbingLadder.yBot) - p.h;
              p.climbing = false;
              if (sproutMechanicActive(g.round) && nearestLadderIdx >= 0) markSproutUsed(nearestLadderIdx);
            }
          } else {
            p.vy = 0;
            // Keep this sprout alive while we're actively on it.
            if (sproutMechanicActive(g.round) && nearestLadderIdx >= 0) markSproutInUse(nearestLadderIdx);
            const climbMoving = rawUp || rawDown;
            if (rawUp) p.y -= CLIMB_SPEED;
            if (rawDown) p.y += CLIMB_SPEED;
            // L3 mid-vines: clamp to the vine's effective (visible) bottom
            // since vines now grow to a random length.
            if (climbingLadder && isLevel3Round(g.round)
                && nearestLadderIdx !== GREEN_TOP_LADDER_IDX
                && nearestLadderIdx !== PURPLE_TOP_LADDER_IDX
                && nearestLadderIdx >= 0) {
              const sr = getSprouts()[nearestLadderIdx];
              if (sr) {
                const fullH = climbingLadder.yBot - climbingLadder.yTop;
                const effBot = climbingLadder.yTop + fullH * sr.growProgress;
                if (p.y + p.h > effBot) p.y = effBot - p.h;
              }
            }
            if (climbMoving) {
              p.climbTimer++;
              if (p.climbTimer > 6) { p.climbTimer = 0; p.climbFrame = (p.climbFrame + 1) % 4; }
            }
          }
          } // end else (no active lateralReach)
        }

        if (!p.climbing) {
          const moving = holdLeft || holdRight;
          if (moving && !g.playerHasMoved) { g.playerHasMoved = true; g.barrelStartDelay = 22; g.barrelTimer = 0; g.nextBarrelTime = 22; }
          if (holdLeft) { p.x -= MOVE_SPEED; p.facing = -1; }
          if (holdRight) { p.x += MOVE_SPEED; p.facing = 1; }
          if (moving && p.onGround) { p.walkTimer++; if (p.walkTimer > 5) { p.walkTimer = 0; p.walkFrame = (p.walkFrame + 1) % 4; } }
          else if (!moving) { p.walkFrame = 0; p.walkTimer = 0; }
          if (jumpJustPressed && p.onGround) {
            p.vy = -5; p.onGround = false; p.jumping = true;
            p.jumpFrame = 0; p.jumpTimer = 0;
            g.pendingClimb = null;
            g.comboKills = 0;
            playJumpSound();
          }
          p.vy += GRAVITY; p.y += p.vy;
          p.onGround = false;
          for (let plIdx = 0; plIdx < PLATFORMS.length; plIdx++) {
            const plat = PLATFORMS[plIdx];
            if (p.x + p.w > plat.x1 && p.x < plat.x2) {
              const platY = getPlatformY(plat, p.x + p.w / 2);
              if (p.y + p.h >= platY && p.y + p.h <= platY + 12 && p.vy >= 0) {
                // L2: fall through holes (or the permanent top-platform gap).
                if (isLevel2Round(g.round) && isHoleAtPlatform(l2Ref.current, plIdx, p.x + p.w / 2)) {
                  continue;
                }
                p.y = platY - p.h; p.vy = 0; p.onGround = true; p.jumping = false;
                p.jumpFrame = 0; p.jumpTimer = 0;
                g.comboKills = 0;
              }
            }
          }
          // L3: let player land on moving platforms and ride along.
          //   (Movers are TICKED unconditionally below, even while climbing,
          //    so they never freeze.)
          if (isLevel3Round(g.round)) {
            const dxs = (g as any)._l3Dxs as number[] | undefined;
            if (dxs) {
              const carry = landOnMovingPlatform(p as any, dxs);
              if (carry !== 0) {
                p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x + carry));
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
        if (p.y > CANVAS_H && !g.dying && g.invulnTimer === 0) {
          g.lives--; setLives(g.lives);
          g.invulnTimer = 120;
          if (g.lives <= 0) { playHitSound(); g.dying = true; g.fatalDying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
          else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
        }

        // === KILL ALL MONKEYS → KEY APPEARS → GRAB KEY → VINE GROWS ===
        // Spawn the watering can once all monkeys for this round are dead.
        // Random placement: anywhere on P1–P4, OR the leftmost edge of P5.
        const monkeyTarget = getRoundDifficulty(g.round).monkeyCount;
        // Level-1 only mechanic — L2 has its own (green/purple) watering cans.
        if (!isLevel2Round(g.round) && !g.keySpawned && g.monkeysKilled >= monkeyTarget) {
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
            playKeyGrabSound();
          }
        }
        // Carry the watering can to the sprout: when player reaches the
        // sprout location on P5, plant/water it and start the vine growing.
        if (g.keyGrabbed && !g.seedPlanted) {
          const tv = LADDERS[getTopVineIdx()];
          const sproutX = tv.x + 7;
          const sproutY = tv.yBot;
          const playerCXNow = p.x + p.w / 2;
          const playerFeetNow = p.y + p.h;
          if (Math.abs(playerCXNow - sproutX) < 14 && Math.abs(playerFeetNow - sproutY) < 12) {
            g.seedPlanted = true; // triggers vine-grow animation
            playWaterSproutSound();
            playVineGrowSound();
            g.score += scoreFor('waterGreen', getLevelIteration(g.round)); setScore(g.score);
          }

        }
        // Grow the vine after watering (~1.5s at 60fps ≈ 68 frames)
        if (g.seedPlanted && g.topVineGrowth < 1) {
          g.topVineGrowth = Math.min(1, g.topVineGrowth + 1 / 68);
          g.sparkleTimer++;
          if (g.topVineGrowth >= 1) g.topVineUnlocked = true;
        }

        // Win condition - touch the girl (next to the dragon). Level 1 only;
        // Level 2 owns its own win flow inside the L2 module.
        if (!isLevel2Round(g.round)) {
          const paulX = 175, paulY = 64;
          if (rectsOverlap(p, { x: paulX, y: paulY, w: 40, h: 48 })) {
            g.state = 'win'; setGameState('win');
            g.score += scoreFor('completeLevel', getLevelIteration(g.round)); setScore(g.score); playWinSound(); playPrincessSavedSound();
            wa.active = true;
            wa.timer = 0;
            wa.gorillaY = 76;
            wa.gorillaRotation = 0;
            wa.showKiss = false;
          }
        }

        // === BARREL SPAWNING (only after player first moves; first barrel ~0.5s after) ===
        // Disabled in Level 2 — the L2 module manages its own hazards.
        if (!isLevel2Round(g.round) && g.playerHasMoved) {
          const d = getRoundDifficulty(g.round);
          g.barrelTimer++;
          if (!g.nextBarrelTime) g.nextBarrelTime = d.barrelSpawnMin + Math.random() * d.barrelSpawnRange;
          if (g.barrelTimer > g.nextBarrelTime) {
            g.barrelTimer = 0;
            g.nextBarrelTime = d.barrelSpawnMin + Math.random() * d.barrelSpawnRange;
            const speed = BARREL_SPEED * (d.barrelSpeedMul + Math.random() * d.barrelSpeedJitter);
            g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed, rollPhase: 0 });
            playBarrelRollSound();
          }
        }

        // Tick the sprout lifecycle whenever the dying-sprout mechanic is
        // active (always for L2 rounds; from L1 iter 5 onwards as well).
        if (sproutMechanicActive(g.round)) {
          // L3 Stage A: keep non-top sprouts paused until MPS monkeys cleared.
          if (isLevel3Round(g.round) && sproutsAllowedToGrow()) {
            for (const s of getSprouts()) {
              if (!s.isTop && s.phase === 'dormant' && s.regrowTimer > 1000) {
                s.regrowTimer = 0;
              }
            }
          }
          if (!isLevel3Round(g.round) || sproutsAllowedToGrow() || true) {
            tickSprouts();
          }
        }

        // === LEVEL 2 UPDATE ===
        if (isLevel2Round(g.round)) {
          // Belt-and-suspenders: Level 2 must NEVER show L1 rolling rocks.
          if (g.barrels.length) g.barrels = [];
          const pl = g.player;
          updateLevel2(l2Ref.current, g.frameCount, pl.x + pl.w / 2, pl.y + pl.h / 2);

          // Award 100 points the first time the player jumps over a fireball
          for (const fb of l2Ref.current.fireballs as any[]) {
            if (fb.jumpedOver || fb.landed) continue;
            if (
              (pl.jumping || !pl.onGround) &&
              pl.x + pl.w > fb.x - fb.radius &&
              pl.x < fb.x + fb.radius &&
              pl.y + pl.h < fb.y - fb.radius + 4
            ) {
              fb.jumpedOver = true;
              // Fireballs are volcano hazards, not apples — no score per spec.
            }

          }

          // Fireball lethal hit on player
          if (g.invulnTimer === 0 && !g.dying && fireballHitsPlayer(l2Ref.current, pl)) {
            g.lives--; setLives(g.lives);
            g.invulnTimer = 120;
            if (g.lives <= 0) { playHitSound(); g.dying = true; g.fatalDying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
            else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
          }

          // ── Apples (colored monkeys throw them) ──
          tickApples(l2Ref.current, g.robots, pl);
          {
            // Build hitbox honoring duck (top half shaved off when ducking).
            const ducked = (pl as any).duckTimer > 0;
            const hitbox = ducked
              ? { x: pl.x, y: pl.y + Math.floor(pl.h * 0.55), w: pl.w, h: Math.ceil(pl.h * 0.45) }
              : { x: pl.x, y: pl.y, w: pl.w, h: pl.h };
            // Track apples that have passed the player → award 100 each.
            for (const a of l2Ref.current.apples as any[]) {
              if (a._scored) continue;
              const passedRight = a.vx > 0 && a.x > pl.x + pl.w + 2;
              const passedLeft  = a.vx < 0 && a.x + a.w < pl.x - 2;
              if (passedRight || passedLeft) {
                a._scored = true;
                g.score += scoreFor('jumpApple', getLevelIteration(g.round)); setScore(g.score);

              }
            }
            if (g.invulnTimer === 0 && !g.dying) {
              const prevHitbox = ducked
                ? { x: applePrevHitbox.x, y: applePrevHitbox.y + Math.floor(applePrevHitbox.h * 0.55), w: applePrevHitbox.w, h: Math.ceil(applePrevHitbox.h * 0.45) }
                : applePrevHitbox;
              const hit = appleHitsPlayer(l2Ref.current, hitbox, prevHitbox);
              if (hit >= 0) {
                g.lives--; setLives(g.lives);
                g.invulnTimer = 120;
                if (g.lives <= 0) { playHitSound(); g.dying = true; g.fatalDying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
                else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
              }
            }
          }

          const pickedColor = tryPickupCan(l2Ref.current, pl);
          if (pickedColor) playKeyGrabSound();

          // Water a top sprout when standing at its base while carrying matching can
          if (l2Ref.current.carryingCan) {
            const targetIdx = l2Ref.current.carryingCan === 'green' ? GREEN_TOP_LADDER_IDX : PURPLE_TOP_LADDER_IDX;
            if (targetIdx >= 0) {
              const tv = LADDERS[targetIdx];
              const sproutX = tv.x + 7;
              const sproutY = tv.yBot;
              const playerCXNow = pl.x + pl.w / 2;
              const playerFeetNow = pl.y + pl.h;
              if (Math.abs(playerCXNow - sproutX) < 16 && Math.abs(playerFeetNow - sproutY) < 12) {
                const wateringColor = l2Ref.current.carryingCan;
                if (waterTopSprout(wateringColor)) {
                  playWaterSproutSound();
                  playVineGrowSound();
                  l2Ref.current.carryingCan = null;
                  const action: ScoreAction = wateringColor === 'green' ? 'waterGreen' : 'waterPurple';
                  g.score += scoreFor(action, getLevelIteration(g.round)); setScore(g.score);
                }
              }

            }
          }

          // Once green sprout is fully grown → volcano coughs out a rock (one time).
          if (isTopSproutGrown('green') && !l2Ref.current.rockSpawned && !l2Ref.current.volcanoSealed) {
            maybeSpawnVolcanoRock(l2Ref.current);
          }

          // Pickup the volcano rock
          if (tryPickupRock(l2Ref.current, pl)) {
            playKeyGrabSound();
          }

          // Seal volcano if carrying rock and at volcano
          if (l2Ref.current.carryingRock) {
            if (trySealVolcano(l2Ref.current, pl.x + pl.w / 2, pl.y + pl.h)) {
              playWinSound();
              g.score += scoreFor('coverVolcano', getLevelIteration(g.round)); setScore(g.score);

              // L3: queue iter*2 respawns split between SS + MPS rows.
              if (isLevel3Round(g.round)) {
                const total = notifyVolcanoSealedL3(l2Ref.current);
                const l2D = getLevel2Difficulty(getLevelIteration(g.round));
                const q: number[] = (g as any).l2RespawnQueue || [];
                const span = Math.max(1, l2D.respawnMaxFrames - l2D.respawnMinFrames);
                for (let k = 0; k < total; k++) {
                  q.push(l2D.respawnMinFrames + Math.floor(Math.random() * (span + 1)));
                }
                (g as any).l2RespawnQueue = q;
              }
            }
          }

          // Win: purple sprout grown AND player touches princess
          if (isTopSproutGrown('purple') && !wa.active) {
            const paulX = 175, paulY = 64;
            if (rectsOverlap(pl, { x: paulX, y: paulY, w: 40, h: 48 })) {
              g.state = 'win'; setGameState('win');
              g.score += scoreFor('completeLevel', getLevelIteration(g.round)); setScore(g.score);
              playWinSound(); playPrincessSavedSound();
              wa.active = true;
              wa.timer = 0;
              wa.gorillaY = 76;
              wa.gorillaRotation = 0;
              wa.showKiss = false;
            }
          }

          // Respawn killed monkeys (so purple-jacket phase can occur).
          // Each pending respawn has its own random delay rolled at kill time
          // (per-iteration via getLevel2Difficulty).
          // Enforce per-iteration TOTAL monkey cap and per-platform cap.
          const queue: number[] = (g as any).l2RespawnQueue || [];
          if (queue.length > 0) {
            const l2Diff = getLevel2Difficulty(getLevelIteration(g.round));
            const aliveTotal = g.robots.length;
            if (aliveTotal < l2Diff.maxMonkeys) {
                const platSlots = isLevel3Round(g.round) ? [4] : [1, 2, 3, 4];
                const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
                for (const rb of g.robots) {
                  const idx = findPlatformIndex(rb.y + rb.h, rb.x + rb.w / 2);
                  if (counts[idx] !== undefined) counts[idx]++;
                }
                // Open platforms = those under per-platform cap.
                const perPlatformCap = isLevel3Round(g.round) ? 2 : l2Diff.maxMonkeysPerPlatform;
                const open = platSlots.filter(pi => counts[pi] < perPlatformCap);
                // L3 post-seal: also allow MPS rows as spawn targets.
                const l3Sealed = isLevel3Round(g.round) && l2Ref.current.volcanoSealed;
                const mps = l3Sealed ? getMovingPlatforms() : [];
                const mpOpen = mps.filter(mp => {
                  // Skip MP if a robot already stands on it.
                  return !g.robots.some(rb =>
                    Math.abs((rb.y + rb.h) - mp.y) < 4 &&
                    rb.x + rb.w / 2 >= mp.x - 2 &&
                    rb.x + rb.w / 2 <= mp.x + mp.w + 2
                  );
                });
                if (open.length > 0 || mpOpen.length > 0) {
                  // Sequential respawn timer: only the head-of-queue ticks,
                  // and only while a legal spawn slot is open. This prevents
                  // old queued respawns from maturing behind a full monkey cap
                  // and appearing instantly right after the next monkey dies.
                  queue[0]--;
                  const readyIdx = queue[0] <= 0 ? 0 : -1;
                  if (readyIdx >= 0) {
                  queue.splice(readyIdx, 1);
                  // 50/50 between SS-platform and MPS when both available; else fallback.
                  const useMp = mpOpen.length > 0 && (open.length === 0 || Math.random() < 0.5);
                  let newR: any;
                  if (useMp) {
                    const mp = mpOpen[Math.floor(Math.random() * mpOpen.length)];
                    const rx = mp.x + (mp.w - 14) / 2;
                    const ry = mp.y - 16;
                    const spd = ROBOT_SPEED * (l2Diff.monkeySpeedMul + Math.random() * l2Diff.monkeySpeedJitter);
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    newR = {
                      x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0,
                      onGround: true, climbing: false, targetLadder: null,
                      direction: dir,
                      frame: 0, frameTimer: 0, speed: spd,
                      _mpsL3: true,
                      _rideMp: mp,
                      _mpRow: mp.row,
                      _lastMpX: mp.x,
                      wanderDir: dir,
                    };
                  } else {
                    open.sort((a, b) => counts[a] - counts[b]);
                    const minCount = counts[open[0]];
                    const leastFilled = open.filter(pi => counts[pi] === minCount);
                    const pi = leastFilled[Math.floor(Math.random() * leastFilled.length)];
                    const plat = PLATFORMS[pi];
                    const leftAtEdge = plat.x1 <= 2;
                    const rightAtEdge = plat.x2 >= CANVAS_W - 2;
                    let fromLeft: boolean;
                    if (leftAtEdge && rightAtEdge) fromLeft = Math.random() < 0.5;
                    else if (leftAtEdge) fromLeft = true;
                    else if (rightAtEdge) fromLeft = false;
                    else fromLeft = (plat.x1 < CANVAS_W - plat.x2);
                    // L3 sprout platform — always enter from the leftmost or
                    // rightmost edge of the screen (no random middle spawns).
                    let rx: number;
                    if (isLevel3Round(g.round) && pi === 4) {
                      fromLeft = Math.random() < 0.5;
                      rx = fromLeft ? plat.x1 + 1 : plat.x2 - 15;
                    } else {
                      rx = fromLeft ? plat.x1 - 16 : plat.x2 + 2;
                    }
                    const ry = getPlatformY(plat, fromLeft ? plat.x1 + 1 : plat.x2 - 1) - 16;
                    const spd = ROBOT_SPEED * (l2Diff.monkeySpeedMul + Math.random() * l2Diff.monkeySpeedJitter);
                    newR = {
                      x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0,
                      onGround: true, climbing: false, targetLadder: null,
                      direction: fromLeft ? 1 : -1,
                      frame: 0, frameTimer: 0, speed: spd,
                    };
                    if (isLevel3Round(g.round) && pi === 4) newR._ssL3 = true;
                  }
                  g.robots.push(newR);
                  // L3 jacket caps: max alive greens = iter, max alive purples = iter.
                  const jArr: ('green' | 'purple' | null)[] = (l2Ref.current as any)._jackets || [];
                  const aliveGreens = jArr.filter(j => j === 'green').length;
                  const alivePurples = jArr.filter(j => j === 'purple').length;
                  const itr = Math.max(1, getLevelIteration(g.round));
                  let jacket = newSpawnJacket(l2Ref.current);
                  if (isLevel3Round(g.round)) {
                    // TOTAL cap (alive + already killed) — never spawn more
                    // greens/purples than the iteration's quota over the
                    // entire level.
                    const greensSoFar = aliveGreens + (l2Ref.current.greenJacketsKilled || 0);
                    const purplesSoFar = alivePurples + (l2Ref.current.purpleJacketsKilled || 0);
                    if (jacket === 'green' && greensSoFar >= itr) jacket = null;
                    if (jacket === 'purple' && purplesSoFar >= itr) jacket = null;
                    // SS monkeys must throw apples — assign green only if total cap allows.
                    if (newR._ssL3 && !jacket && greensSoFar < itr) jacket = 'green';
                  }
                  pushJacket(l2Ref.current, jacket);
                }
              }
            }
            (g as any).l2RespawnQueue = queue;
          }
        }


        // === MONKEY SPAWNING ===
        // Distribution across P2..P5 grows by +1 per finished round, added to a
        // random platform with the current minimum count, until each platform
        // has 5 (20 monkeys total). After that the distribution stays at 5/5/5/5.
        if (!isLevel2Round(g.round) && !g.robotsInitialized) {
          g.robotsInitialized = true;
          const d = getRoundDifficulty(g.round);
          const platSlots = [1, 2, 3, 4]; // P2..P5
          const distribution = buildMonkeyDistribution(g.round);
          for (let s = 0; s < platSlots.length; s++) {
            const pi = platSlots[s];
            const plat = PLATFORMS[pi];
            const count = distribution[s] || 0;
            for (let m = 0; m < count; m++) {
              const rx = plat.x1 + 30 + Math.random() * (plat.x2 - plat.x1 - 60);
              const ry = getPlatformY(plat, rx) - 16;
              const spd = ROBOT_SPEED * (d.monkeySpeedMul + Math.random() * d.monkeySpeedJitter);
              g.robots.push({ x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0, onGround: true, climbing: false, targetLadder: null, direction: Math.random() > 0.5 ? 1 : -1, frame: 0, frameTimer: 0, speed: spd });
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

            // Vine-drop selection.
            // - If the player IS on the platform directly below the wheel, use the
            //   slope rule so the wheel rolls toward him after landing:
            //     * landing platform tilts down-right (slope > 0): drop at the closest
            //       vine on the LEFT side of the player.
            //     * landing platform tilts down-left  (slope < 0): drop at the closest
            //       vine on the RIGHT side of the player.
            // - Otherwise (player isn't on the platform right below), just drop at the
            //   vine on this platform that is NEAREST to the wheel.
            let tookLadder = false;
            const playerPlatIdx = findPlatformIndex(playerFeetY, playerCenterX);
            // PLATFORMS[0] is ground (highest y); index increases UPWARD.
            // The platform directly below the wheel is therefore bPlatIdx - 1.
            const directlyBelowIdx = bPlatIdx - 1;
            const playerOnSamePlatform = playerPlatIdx === bPlatIdx;
            const playerIsDirectlyBelow = playerPlatIdx === directlyBelowIdx;

            let bestLi = -1;
            let bestDist = Infinity;

            // If the wheel is on the same platform as the player, never take a vine —
            // just keep rolling so it can hit him directly.
            if (playerOnSamePlatform) {
              // skip vine selection entirely
            } else if (playerIsDirectlyBelow) {
              const landingPlat = PLATFORMS[directlyBelowIdx];
              const landingRollDir = landingPlat && (landingPlat.slope || 0) < 0 ? -1 : 1;
              const wantLeftOfPlayer = landingRollDir > 0;
              for (let li = 0; li < LADDERS.length; li++) {
                if (!isLevel2Round(g.round) && li === getTopVineIdx() && !g.topVineUnlocked) continue;
                if (!isLadderUsable(g.round, li)) continue;
                const l = LADDERS[li];
                const topPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yTop) < 12);
                const botPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yBot) < 12);
                if (topPlatIdx !== bPlatIdx) continue;
                if (botPlatIdx !== directlyBelowIdx) continue;
                const ladderCenterX = l.x + 7;
                if (wantLeftOfPlayer) {
                  if (ladderCenterX > playerCenterX) continue;
                  const d = playerCenterX - ladderCenterX;
                  if (d < bestDist) { bestDist = d; bestLi = li; }
                } else {
                  if (ladderCenterX < playerCenterX) continue;
                  const d = ladderCenterX - playerCenterX;
                  if (d < bestDist) { bestDist = d; bestLi = li; }
                }
              }
            } else {
              // Player not on the platform directly below — drop at the vine on this
              // platform nearest to the wheel.
              for (let li = 0; li < LADDERS.length; li++) {
                if (!isLevel2Round(g.round) && li === getTopVineIdx() && !g.topVineUnlocked) continue;
                if (!isLadderUsable(g.round, li)) continue;
                const l = LADDERS[li];
                const topPlatIdx = PLATFORMS.findIndex(pl => Math.abs(pl.y - l.yTop) < 12);
                if (topPlatIdx !== bPlatIdx) continue;
                const ladderCenterX = l.x + 7;
                const d = Math.abs(ladderCenterX - bCenterX);
                if (d < bestDist) { bestDist = d; bestLi = li; }
              }
            }

            // Take the chosen vine when the wheel reaches it
            if (bestLi !== -1) {
              const l = LADDERS[bestLi];
              const ladderCenterX = l.x + 7;
              if (Math.abs(bCenterX - ladderCenterX) <= b.speed + 4) {
                b.onLadder = true;
                b.targetLadder = bestLi;
                b.x = l.x + (16 - b.w) / 2;
                b.vx = 0;
                tookLadder = true;
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

          // Collision with player only if on the same platform AND player is on the ground.
          // Jumping over barrels must be safe (core mechanic) — being airborne means
          // we don't take a hit from a barrel that happens to overlap during the arc.
          const bPlatY = findPlatformIndex(b.y + b.h, b.x + b.w / 2);
          const pPlatY = findPlatformIndex(p.y + p.h, p.x + p.w / 2);
          if (rectsOverlap(p, b) && bPlatY === pPlatY && g.invulnTimer === 0 && !g.dying && p.onGround && !p.jumping) {
            g.lives--; setLives(g.lives);
            g.invulnTimer = 120;
            if (g.lives <= 0) { playHitSound(); g.dying = true; g.fatalDying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
            else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
            break;
          }
          // Award 100 points the first time the player jumps over a barrel:
          // player is airborne, on the same platform, and horizontally overlaps the barrel.
          if (
            !b.jumpedOver &&
            (p.jumping || !p.onGround) &&
            bPlatY === pPlatY &&
            p.x + p.w > b.x && p.x < b.x + b.w &&
            p.y + p.h < b.y + 4 // player's feet are above the barrel's top
          ) {
            b.jumpedOver = true;
            g.score += scoreFor('jumpRock', getLevelIteration(g.round)); setScore(g.score);
          }
        }

        // === UPDATE ROBOTS (always moving — random wander biased toward player) ===
        // Precompute ladder→platform index map once per frame (perf: avoids
        // O(robots × ladders × platforms) findIndex calls every tick).
        const ladderTopPlat: number[] = [];
        const ladderBotPlat: number[] = [];
        for (let li = 0; li < LADDERS.length; li++) {
          const l = LADDERS[li];
          let tp = -1, bp = -1;
          for (let pi = 0; pi < PLATFORMS.length; pi++) {
            if (tp < 0 && Math.abs(PLATFORMS[pi].y - l.yTop) < 12) tp = pi;
            if (bp < 0 && Math.abs(PLATFORMS[pi].y - l.yBot) < 12) bp = pi;
            if (tp >= 0 && bp >= 0) break;
          }
          ladderTopPlat[li] = tp;
          ladderBotPlat[li] = bp;
        }
        for (let i = g.robots.length - 1; i >= 0; i--) {
          const r = g.robots[i];
          const prevRobotX = r.x;
          const prevRobotY = r.y;
          const rCenterX = r.x + r.w / 2;
          const rFeetY = r.y + r.h;
          const rPlatIdx = findPlatformIndex(rFeetY, rCenterX);

          // Smooth, time-based animation (not position-based)
          r.frameTimer++;
          if (r.frameTimer >= 5) { r.frameTimer = 0; r.frame = (r.frame + 1) % ROBOT_WALK_FRAMES; }

          // L3 MPS monkey: locked to its assigned moving platform — never falls off,
          // wanders left/right within the MP's bounds and is carried with it.
          const mpsRide = isLevel3Round(g.round) && (r as any)._mpsL3
            ? findMonkeyRidePlatform(r as MpsRobot)
            : null;
          if (mpsRide) {
            // Carry with the moving platform (so monkey rides instead of slipping).
            const lastMpX = (r as any)._lastMpX;
            if (typeof lastMpX === 'number') r.x += mpsRide.x - lastMpX;
            const minX = mpsRide.x + 1;
            const maxX = mpsRide.x + mpsRide.w - r.w - 1;
            r.x = Math.max(minX, Math.min(maxX, r.x));
            r.y = mpsRide.y - r.h;
            r.vy = 0;
            r.onGround = true;
            r.climbing = false;
            if ((r as any).wanderDir === undefined) (r as any).wanderDir = r.direction || 1;
            r.direction = (r as any).wanderDir;
            r.vx = r.direction * r.speed;
            r.x += r.vx;
            if (r.x <= minX) { r.x = minX; (r as any).wanderDir = 1; r.direction = 1; }
            else if (r.x >= maxX) { r.x = maxX; (r as any).wanderDir = -1; r.direction = -1; }
            (r as any)._lastMpX = mpsRide.x;
          } else if (r.climbing) {
            r.vx = 0;
            if (r.targetLadder !== null) {
              const l = LADDERS[r.targetLadder];
              const isSsMonkey = isLevel3Round(g.round) && (r as any)._ssL3;
              const visibleBot = getVisibleSproutBottomY(r.targetLadder);
              // Keep this sprout alive while the monkey is on it.
              if (r.targetLadder !== GREEN_TOP_LADDER_IDX && r.targetLadder !== PURPLE_TOP_LADDER_IDX) {
                markSproutInUse(r.targetLadder);
              }
              // SS monkey: use sprouts to chase the player, not to idle-loop.
              // If the player is above/on the sprout platform, climb up and
              // dismount so normal walking can continue toward the player.
              if (isSsMonkey
                  && r.targetLadder !== GREEN_TOP_LADDER_IDX
                  && r.targetLadder !== PURPLE_TOP_LADDER_IDX) {
                const sproutTop = l.yTop;
                const sproutLen = Math.max(1, visibleBot - sproutTop);
                const monkeyMidY = r.y + r.h / 2;
                const playerOnTop = playerFeetY <= PLATFORMS[4].y + 24;
                const verticalGap = Math.abs(playerFeetY - monkeyMidY);
                (r as any)._climbReDecide = ((r as any)._climbReDecide ?? 0) - 1;
                const atTop = r.y + r.h <= sproutTop + 2;
                const atBot = r.y + r.h >= visibleBot - 2;
                if (atTop) r.vy = playerOnTop ? -r.speed : r.speed;
                else if (atBot) r.vy = -r.speed;
                else if ((r as any)._climbReDecide <= 0) {
                  if (playerOnTop) {
                    r.vy = -r.speed;
                  } else if (verticalGap > sproutLen * 0.25) {
                    r.vy = playerFeetY < monkeyMidY ? -r.speed : r.speed;
                  } else {
                    r.vy = Math.random() < 0.5 ? -r.speed : r.speed;
                  }
                  (r as any)._climbReDecide = 20 + Math.floor(Math.random() * 25);
                }
              }
              r.y += r.vy;
              // Never let a monkey hang in the air below the visible sprout.
              if (r.y + r.h > visibleBot + 1) {
                r.y = visibleBot - r.h;
              }
              if (r.vy < 0 && r.y + r.h <= l.yTop + 2) {
                if (isSsMonkey) {
                  r.y = l.yTop - r.h;
                  r.vy = 0;
                  r.climbing = false;
                  r.targetLadder = null;
                  r.onGround = true;
                  r.wanderDir = playerCenterX >= (r.x + r.w / 2) ? 1 : -1;
                  r.direction = r.wanderDir;
                  r.wanderTimer = 0;
                } else {
                  r.y = l.yTop - r.h;
                  r.vy = 0; r.climbing = false; r.targetLadder = null;
                  r.onGround = true;
                }
              } else if (r.vy > 0 && r.y + r.h >= visibleBot) {
                if (isSsMonkey) {
                  r.y = visibleBot - r.h;
                  r.vy = -r.speed;
                  r.onGround = false;
                } else {
                  r.y = l.yBot - r.h;
                  r.vy = 0; r.climbing = false; r.targetLadder = null;
                }
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
            // L3 SS monkey: actively seek a grown sprout vine near the player,
            // then climb down into the sprout / moving-platform section.
            const isSsSeek = isLevel3Round(g.round) && (r as any)._ssL3 && rPlatIdx === 4;
            if (isSsSeek && r.wanderTimer <= 0) {
              const playerOnSproutPlatform = playerFeetY <= PLATFORMS[4].y + 24;
              // If player is on platform 4 on the OPPOSITE side of the hole,
              // monkey can't cross the hole — head toward nearest screen edge
              // to wrap around to the player's side.
              const monkeyOnLeft = rCenterX < SPROUT_DROP_X1;
              const monkeyOnRight = rCenterX > SPROUT_DROP_X2;
              const playerOnLeft = playerCenterX < SPROUT_DROP_X1;
              const playerOnRight = playerCenterX > SPROUT_DROP_X2;
              const crossHole = playerOnSproutPlatform && (
                (monkeyOnLeft && playerOnRight) || (monkeyOnRight && playerOnLeft)
              );
              if (crossHole) {
                // Walk toward the closer screen edge → wrap to player's side.
                r.wanderDir = monkeyOnLeft ? -1 : 1;
                r.wanderTimer = 40 + Math.floor(Math.random() * 40);
              } else {
                const targetLi = playerOnSproutPlatform ? -1 : findSproutSectionVineTargetRandom(g.round, rCenterX, playerCenterX, true);
                if (targetLi >= 0) {
                  const targetX = LADDERS[targetLi].x + 7;
                  r.wanderDir = targetX > rCenterX ? 1 : -1;
                  r.wanderTimer = 30 + Math.floor(Math.random() * 30);
                } else {
                  const fallbackLi = playerOnSproutPlatform ? -1 : findSproutSectionVineTargetRandom(g.round, rCenterX, playerCenterX, false);
                  if (fallbackLi >= 0) {
                    const targetX = LADDERS[fallbackLi].x + 7;
                    r.wanderDir = targetX > rCenterX ? 1 : -1;
                    r.wanderTimer = 30 + Math.floor(Math.random() * 30);
                  } else {
                    r.wanderTimer = 30 + Math.floor(Math.random() * 60);
                    // Add random jitter so movement doesn't look patterned.
                    const toward = playerCenterX >= rCenterX ? 1 : -1;
                    r.wanderDir = Math.random() < 0.75 ? toward : -toward;
                  }
                }
              }
            } else if (!isSsSeek && r.wanderTimer <= 0) {
              r.wanderTimer = 30 + Math.floor(Math.random() * 60); // 0.7-2s at 45fps
              const towardPlayer = playerCenterX >= rCenterX ? 1 : -1;
              // 70% bias toward player, 30% random — never stop
              r.wanderDir = Math.random() < 0.7 ? towardPlayer : (Math.random() < 0.5 ? 1 : -1);
            }



            // Consider climbing if a ladder is right here AND it gets us closer.
            // L1 + L2: monkeys NEVER climb ladders/vines — only L3 SS monkeys do.
            let climbChoice: { ladderIdx: number; climbVy: number; score: number } | null = null;
            const continueScore = scoreToPlayer(rCenterX + r.wanderDir * r.speed * 30, rFeetY);
            const monkeyCanClimb = isLevel3Round(g.round) && !!(r as any)._ssL3;
            for (let li = 0; monkeyCanClimb && li < LADDERS.length; li++) {
              if (!isLevel2Round(g.round) && li === getTopVineIdx() && !g.topVineUnlocked) continue;
              if (!isLadderUsable(g.round, li)) continue;
              if (isLevel3Round(g.round) && !(r as any)._ssL3 && li !== GREEN_TOP_LADDER_IDX && li !== PURPLE_TOP_LADDER_IDX) continue;
              const l = LADDERS[li];
              const ladderCenterX = l.x + 7;
              const alignTol = (isLevel3Round(g.round) && (r as any)._ssL3) ? r.speed + 10 : r.speed + 4;
              if (Math.abs(rCenterX - ladderCenterX) > alignTol) continue;
              const topPlatIdx = ladderTopPlat[li];
              const botPlatIdx = ladderBotPlat[li];
              if (botPlatIdx === rPlatIdx && topPlatIdx >= 0 && l.yTop < l.yBot) {
                const scoreUp = scoreToPlayer(ladderCenterX, l.yTop);
                if (scoreUp < continueScore && (!climbChoice || scoreUp < climbChoice.score)) {
                  climbChoice = { ladderIdx: li, climbVy: -r.speed, score: scoreUp };
                }
              }
              if (topPlatIdx === rPlatIdx && botPlatIdx >= 0 && l.yBot > l.yTop) {
                const scoreDown = scoreToPlayer(ladderCenterX, l.yBot);
                if (scoreDown < continueScore && (!climbChoice || scoreDown < climbChoice.score)) {
                  climbChoice = { ladderIdx: li, climbVy: r.speed, score: scoreDown };
                }
              }
            }

            // SS monkeys: commit to climbing whenever a vine is in range (no 60% gate).
            const isSsCommit = isLevel3Round(g.round) && (r as any)._ssL3;
            if (climbChoice && (isSsCommit || Math.random() < 0.6)) {
              const l = LADDERS[climbChoice.ladderIdx];
              const ladderX = l.x + (16 - r.w) / 2;
              // Smoothly walk toward ladder center instead of snapping X.
              const dx = ladderX - r.x;
              const maxStep = Math.max(r.speed, 0.6);
              if (Math.abs(dx) > 0.5) {
                r.x += Math.max(-maxStep, Math.min(maxStep, dx));
                r.direction = dx > 0 ? 1 : -1;
                r.wanderDir = r.direction;
                r.vx = r.direction * r.speed;
              } else {
                r.x = ladderX;
                r.climbing = true;
                r.targetLadder = climbChoice.ladderIdx;
                r.vx = 0;
                r.vy = climbChoice.climbVy;
              }
            } else {
              // Always moving — never stop, even if aligned with player
              r.direction = r.wanderDir;
              r.vx = r.direction * r.speed;
              r.x += r.vx;
              if (isSsCommit && r.onGround) {
                if (r.x + r.w < 0) r.x = CANVAS_W - 1;
                else if (r.x > CANVAS_W) r.x = 1 - r.w;
              }
              // Top-platform hole: blocks BOTH non-SS and SS L3 monkeys
              // from walking across. SS monkeys must wrap via screen edges.
              if (isLevel3Round(g.round) && rPlatIdx === 4 && r.onGround) {
                const nextCenter = r.x + r.w / 2;
                if (r.vx > 0 && nextCenter >= SPROUT_DROP_X1 - 4 && nextCenter < SPROUT_DROP_X2) {
                  r.x = SPROUT_DROP_X1 - r.w - 2;
                  r.wanderDir = isSsCommit ? -1 : -1;
                  r.direction = -1;
                } else if (r.vx < 0 && nextCenter <= SPROUT_DROP_X2 + 4 && nextCenter > SPROUT_DROP_X1) {
                  r.x = SPROUT_DROP_X2 + 2;
                  r.wanderDir = isSsCommit ? 1 : 1;
                  r.direction = 1;
                }
              }
              // L3 MPS monkey edge-bounce: if currently riding a moving
              // platform, never walk off — reverse at the platform's edges.
              if (isLevel3Round(g.round) && (r as any)._mpsL3 && r.onGround) {
                const mps = getMovingPlatforms();
                let curMp: typeof mps[number] | null = null;
                for (const mp of mps) {
                  if (Math.abs((r.y + r.h) - mp.y) < 4
                      && r.x + r.w / 2 >= mp.x - 2
                      && r.x + r.w / 2 <= mp.x + mp.w + 2) {
                    curMp = mp; break;
                  }
                }
                if (curMp) {
                  if (r.x <= curMp.x + 1) { r.x = curMp.x + 1; r.wanderDir = 1; r.direction = 1; r.vx = r.speed; }
                  else if (r.x + r.w >= curMp.x + curMp.w - 1) { r.x = curMp.x + curMp.w - r.w - 1; r.wanderDir = -1; r.direction = -1; r.vx = -r.speed; }
                }
              }
              r.vy += GRAVITY;
              r.y += r.vy;
              r.onGround = false;

              let landed = false;
              const isSsMonkey = isLevel3Round(g.round) && (r as any)._ssL3;
              for (let plIdx = 0; plIdx < PLATFORMS.length; plIdx++) {
                // L3 SS monkeys can ONLY land on platform 4 (top sprout
                // platform) — never drop into MPS levels.
                if (isSsMonkey && plIdx !== 4) continue;
                const plat = PLATFORMS[plIdx];
                if (plat.x2 - plat.x1 <= 0) continue;
                if (r.x + r.w > plat.x1 && r.x < plat.x2) {
                  const platY = getPlatformY(plat, r.x + r.w / 2);
                  if (r.y + r.h >= platY && r.y + r.h <= platY + 12 && r.vy >= 0) {
                    // Holes only apply to L2; L3 SS monkeys treat the platform-4
                    // hole as solid so they cannot fall through it.
                    if (isLevel2Round(g.round) && !(isSsMonkey && plIdx === 4) && isHoleAtPlatform(l2Ref.current, plIdx, r.x + r.w / 2)) continue;
                    r.y = platY - r.h; r.vy = 0; r.onGround = true; landed = true; break;
                  }
                }
              }

              // L3: monkeys can ride moving platforms (carry with dx).
              // SS monkeys are excluded — they must stay on platform 4.
              if (!landed && isLevel3Round(g.round) && !isSsMonkey) {
                const mps = getMovingPlatforms();
                const dxs: number[] = (g as any)._l3Dxs || [];
                for (let mi = 0; mi < mps.length; mi++) {
                  const mp = mps[mi];
                  if (r.x + r.w > mp.x && r.x < mp.x + mp.w) {
                    if (r.y + r.h >= mp.y && r.y + r.h <= mp.y + 12 && r.vy >= 0) {
                      r.y = mp.y - r.h; r.vy = 0; r.onGround = true;
                      r.x += dxs[mi] || 0;
                      landed = true;
                      break;
                    }
                  }
                }
              }

              // Bounce off walls / platform edges so it keeps moving
              const curPlat = PLATFORMS[rPlatIdx];
              if (!isSsMonkey && curPlat && curPlat.x2 - curPlat.x1 > 0) {
                if (r.x <= curPlat.x1 + 2) { r.wanderDir = 1; r.direction = 1; r.vx = r.speed; r.x = curPlat.x1 + 2; }
                else if (r.x + r.w >= curPlat.x2 - 2) { r.wanderDir = -1; r.direction = -1; r.vx = -r.speed; r.x = curPlat.x2 - r.w - 2; }
              }
              if (!isSsMonkey) r.x = Math.max(0, Math.min(CANVAS_W - r.w, r.x));
            }
          }

          if (isLevel2Round(g.round)) {
            keepMonkeyAwayFromRequiredItems(r, l2Ref.current);
          }

          const movedDist = Math.abs(r.x - prevRobotX) + Math.abs(r.y - prevRobotY);
          (r as any)._stillFrames = movedDist < 0.15 ? ((r as any)._stillFrames ?? 0) + 1 : 0;
          // Monkeys must NEVER stall in place. If we detect <0.15px movement for
          // even a few frames, force a direction flip and apply movement now so
          // the walking animation always matches actual displacement.
          if ((r as any)._stillFrames > 4) {
            const recoverDir = ((r as any).wanderDir || r.direction || 1) * -1;
            (r as any).wanderDir = recoverDir;
            r.direction = recoverDir;
            (r as any).wanderTimer = 20 + Math.floor(Math.random() * 30);
            if (r.climbing) {
              r.vy = recoverDir * Math.max(r.speed, 0.6);
              r.y += r.vy;
            } else {
              r.vx = recoverDir * Math.max(r.speed, 0.6);
              r.x = Math.max(0, Math.min(CANVAS_W - r.w, r.x + r.vx));
            }
            (r as any)._stillFrames = 0;
          }

          // Stricter fall cull for L3 — any monkey that passes the bottom row
          // without finding ground is removed (prevents stuck-off-screen).
          if (isLevel3Round(g.round) && r.y > 460 && !r.onGround && !r.climbing) {
            g.robots.splice(i, 1); continue;
          }
          if (r.y > CANVAS_H + 20) { g.robots.splice(i, 1); continue; }

          const rPlatY = findPlatformIndex(r.y + r.h, r.x + r.w / 2);
          const pPlatY = findPlatformIndex(p.y + p.h, p.x + p.w / 2);
          const topSproutY = PLATFORMS[4].y;
          const climbingAboveTopSprout = r.climbing && r.y < topSproutY;
          if (rectsOverlap(p, r) && (rPlatY === pPlatY || climbingAboveTopSprout)) {
            // Stomp = player's feet are above the monkey's upper portion.
            // Don't require p.vy > 0: after a chain stomp we set p.vy = -4
            // (rising), and the next overlapping monkey in the same airborne
            // arc must still count as a stomp (combo kill), not a side-hit.
            // ALSO: when the player jump-lands onto a monkey already standing
            // on the destination platform, both end up at the same platY in
            // the same frame. In that "descending landing" case (p.vy > 0,
            // not yet onGround), accept a more generous stomp window so the
            // landing counts as a kill instead of a fatal side-hit.
            // Stomp ONLY when descending onto the monkey's head (bonk on top).
            // Rising into a monkey on the way up is a side-hit, not a kill.
            // Climbing monkey on a sprout: killable as soon as ANY part of the
            // monkey is above the top sprout platform.
            const prevP = (g as any)._playerPrevFrame || p;
            const prevFeet = prevP.y + prevP.h;
            const feet = p.y + p.h;
            const descendingIntoHead = (prevP.vy > 0 || p.vy > 0 || feet >= prevFeet) && prevFeet <= r.y + r.h * 0.75;
            const climbingBlocksKill = r.climbing && !climbingAboveTopSprout;
            const stompHeadLimit = climbingAboveTopSprout ? r.y + r.h + 4 : r.y + r.h * 0.6;
            const isStomp =
              descendingIntoHead &&
              (p.y + p.h <= stompHeadLimit) &&
              !climbingBlocksKill;
            if (isStomp) {
              // Find any OTHER monkeys overlapping the same monkey position
              // (clustered at same spot). Player kills all in one stomp.
              const groupIdxs: number[] = [i];
              for (let j = g.robots.length - 1; j >= 0; j--) {
                if (j === i) continue;
                const o = g.robots[j];
                if (rectsOverlap(o, r)) groupIdxs.push(j);
              }
              const killCount = groupIdxs.length;
              // Per scoring spec: 300 * (iteration+1)/2 per monkey, flat (no combo).
              const perKill = scoreFor('killMonkey', getLevelIteration(g.round));
              const scoreGain = perKill * killCount;
              g.comboKills = (g.comboKills || 0) + killCount;
              g.score += scoreGain; setScore(g.score);

              playRobotKillSound();
              p.vy = -4;
              const wasMps = !!(r as any)._mpsL3;
              // Splice in descending index order so indices remain valid.
              groupIdxs.sort((a, b) => b - a);
              for (const ki of groupIdxs) {
                g.robots.splice(ki, 1);
                g.monkeysKilled = (g.monkeysKilled || 0) + 1;
                if (isLevel2Round(g.round)) {
                  onMonkeyKilled(l2Ref.current, ki);
                  if (isLevel3Round(g.round) && wasMps) notifyMpsMonkeyKilled();
                  const l2D = getLevel2Difficulty(getLevelIteration(g.round));
                  const q: number[] = (g as any).l2RespawnQueue || [];
                  const span = Math.max(1, l2D.respawnMaxFrames - l2D.respawnMinFrames);
                  const delay = l2D.respawnMinFrames + Math.floor(Math.random() * (span + 1));
                  q.push(delay);
                  (g as any).l2RespawnQueue = q;
                }
              }
              break;
            } else if (g.invulnTimer === 0 && !g.dying) {
              g.lives--; setLives(g.lives);
              g.invulnTimer = 120;
              if (g.lives <= 0) { playHitSound(); g.dying = true; g.fatalDying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
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
        if (!isLevel2Round(g.round) && li === getTopVineIdx()) continue; // L1: top vine drawn separately
        if (!isLadderUsable(g.round, li)) continue; // hide ungrown sprouts
        const l = LADDERS[li];
        const sr = isLevel3Round(g.round) ? getSprouts()[li] : null;
        const isMidVineL3 = sr && li !== GREEN_TOP_LADDER_IDX && li !== PURPLE_TOP_LADDER_IDX;
        const visibleBot = isMidVineL3 ? l.yTop + (l.yBot - l.yTop) * sr.growProgress : l.yBot;
        drawVine(l.x, l.yTop, visibleBot);
      }

      // L2: for each non-top sprout that is currently NOT grown, draw the
      //     same seed mound + sprout art used by L1's top vine, and animate
      //     the vine growing up from the seed once the regrow timer expires.
      if (isLevel2Round(g.round)) {
        const sprouts = getSprouts();
        const ceilingMode = isLevel3Round(g.round);
        for (let li = 0; li < LADDERS.length; li++) {
          // (no top-vine skip in L2: green/purple top sprouts are real entries here)
          const sr = sprouts[li];
          if (!sr || sr.grown) continue;
          const l = LADDERS[li];
          // For L3 mid-vines, seed is on the CEILING (yTop) and the vine
          // grows DOWNWARD. Top vines (green/purple) keep the original
          // ground-up behaviour.
          const isMidVineL3 = ceilingMode
            && li !== GREEN_TOP_LADDER_IDX
            && li !== PURPLE_TOP_LADDER_IDX;
          const sx = l.x + 7;
          const sy = isMidVineL3 ? l.yTop + 2 : l.yBot - 2;

          // Animated portion: vine growing from seed toward the opposite end
          if (sr.growProgress > 0) {
            const fullH = l.yBot - l.yTop;
            if (isMidVineL3) {
              const grownBot = l.yTop + fullH * sr.growProgress;
              drawVine(l.x, l.yTop, grownBot);
            } else {
              const grownTop = l.yBot - fullH * sr.growProgress;
              drawVine(l.x, grownTop, l.yBot);
            }
            // Sparkles only while regrowing — withering is silent (no water).
            if (sr.growProgress < 1 && sr.phase === 'grow') {
              for (let i = 0; i < 5; i++) {
                const dx = sx + Math.cos(g.sparkleTimer * 0.18 + i * 1.3 + li) * 7;
                const baseY = isMidVineL3
                  ? l.yTop + fullH * sr.growProgress - 4
                  : l.yBot - fullH * sr.growProgress - 4;
                const dy = baseY + ((g.sparkleTimer * 0.6 + i * 5 + li * 3) % 18);
                ctx.fillStyle = ['#4FC3F7', '#B3E5FC', '#81D4FA', '#FFFFFF', '#4FC3F7'][i];
                ctx.fillRect(dx, dy, 2, 2);
              }
            }
          } else {
            // Dormant seed: small mound of dirt with tiny green sprout leaves.
            // For ceiling-mounted (L3) sprouts, flip the leaves to point DOWN.
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(sx - 6, sy - 2, 12, 4);
            ctx.fillStyle = '#3E2723';
            ctx.fillRect(sx - 6, isMidVineL3 ? sy + 2 : sy + 1, 12, 1);
            const leafColor = sr.topColor === 'purple' ? '#9C27B0' : '#66BB6A';
            ctx.fillStyle = leafColor;
            if (isMidVineL3) {
              ctx.fillRect(sx - 3, sy + 4, 2, 3);
              ctx.fillRect(sx + 1, sy + 4, 2, 3);
              ctx.fillStyle = sr.topColor === 'purple' ? '#7B1FA2' : '#4CAF50';
              ctx.fillRect(sx - 4, sy + 6, 1, 1);
              ctx.fillRect(sx + 2, sy + 6, 1, 1);
            } else {
              ctx.fillRect(sx - 3, sy - 5, 2, 3);
              ctx.fillRect(sx + 1, sy - 5, 2, 3);
              ctx.fillStyle = sr.topColor === 'purple' ? '#7B1FA2' : '#4CAF50';
              ctx.fillRect(sx - 4, sy - 6, 1, 1);
              ctx.fillRect(sx + 2, sy - 6, 1, 1);
            }
          }
        }
        // Keep sparkle timer ticking so the grow droplets animate.
        g.sparkleTimer++;
      }

      // Topmost vine — animated growth from sprout up to top platform.
      // L1 only (L2 manages its own two top sprouts via getSprouts()).
      if (!isLevel2Round(g.round)) {
        const tv = LADDERS[getTopVineIdx()];
        if (g.seedPlanted && g.topVineGrowth > 0) {
          const fullH = tv.yBot - tv.yTop; // 64
          const grownTop = tv.yBot - fullH * g.topVineGrowth;
          drawVine(tv.x, grownTop, tv.yBot);
          if (g.topVineGrowth < 1) {
            for (let i = 0; i < 5; i++) {
              const sx = tv.x + 7 + Math.cos(g.sparkleTimer * 0.18 + i * 1.3) * 7;
              const sy = grownTop - 4 + ((g.sparkleTimer * 0.6 + i * 5) % 18);
              ctx.fillStyle = ['#4FC3F7', '#B3E5FC', '#81D4FA', '#FFFFFF', '#4FC3F7'][i];
              ctx.fillRect(sx, sy, 2, 2);
            }
          }
        }
        if (!g.seedPlanted) {
          const sx = tv.x + 7;
          const sy = tv.yBot - 2;
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(sx - 7, sy - 3, 14, 5);
          ctx.fillStyle = 'rgba(102, 187, 106, 0.22)';
          ctx.beginPath();
          ctx.arc(sx, sy - 7, 8, 0, Math.PI * 2);
          ctx.fill();
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
        // Green glow (unified watering-can look across all levels)
        ctx.fillStyle = 'rgba(116, 224, 127, 0.45)';
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
        // Dragon-grab outro: dragon stays upright on the top platform but
        // slides to the right (carrying the princess) until off-screen.
        const dkY = 16;
        const offset = wa.dragonX || 0;
        const frameIdx = g.dkFrame % DRAGON_FRAMES;
        if (dragonImg && dragonImg.complete && dragonFrameW > 0) {
          ctx.drawImage(dragonImg, frameIdx * dragonFrameW, 0, dragonFrameW, dragonFrameH, dkX + offset, dkY, dragonSize, dragonSize);
        }
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
        const PRINCESS_FRAMES = 5;
        const pFrameW = princessImg.naturalWidth / PRINCESS_FRAMES;
        const pFrameH = princessImg.naturalHeight;
        // During outro, princess slides right with the dragon (carried away).
        // Otherwise, alternate idle / help-shout frames.
        const princessOffset = wa.active ? (wa.princessX || 0) : 0;
        let frameIdx = 0;
        if (wa.active) {
          // "!" / shocked beat early in the grab, otherwise help frame
          frameIdx = wa.showKiss ? 2 : 0;
        } else {
          frameIdx = g.showHelp ? 2 : 0;
        }
        ctx.drawImage(
          princessImg,
          frameIdx * pFrameW, 0, pFrameW, pFrameH,
          paulX + princessOffset, paulY, princessDrawW, princessDrawH,
        );
        if (wa.active && wa.showKiss) {
          ctx.fillStyle = '#FFD700'; ctx.font = 'bold 14px "Press Start 2P", monospace';
          ctx.fillText('!', paulX + princessOffset + princessDrawW / 2 - 3, paulY - 8);
        } else if (!wa.active && g.showHelp) {
          ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 14px "Press Start 2P", monospace';
          ctx.fillText('HELP!', paulX - 4, paulY - 8);
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

      // ── LEVEL 2: paint L2 scene on top of L1 visuals so the L1 dragon /
      // princess / vines / monkeys / barrels visually disappear. The player
      // is drawn after this block so they remain visible.
      if (isLevel2Round(g.round)) {
        renderLevel2(ctx, l2Ref.current, {
          walk: walkSpriteRef.current,
          jump: jumpSpriteRef.current,
          climb: climbSpriteRef.current,
          win: winSpriteRef.current,
          dragonAngry: dragonAngryRef.current,
          dragonFire: dragonFireRef.current,
          princess: princessRef.current,
          robot: robotWalkRef.current,
          rockWheel: rockWheelRef.current,
          wateringCan: wateringCanRef.current,
        }, g.robots);
      }
      // L3: draw moving platforms over the static layout.
      if (isLevel3Round(g.round)) {
        renderMovingPlatforms(ctx);
      }
      // (toggle every 18 frames over 108 frames at 60fps → 3 on/off cycles)
      const pl = g.player;
      const showPlayer = g.dying
        ? Math.floor(g.deathFlashTimer / 18) % 2 === 0
        : (g.invulnTimer === 0 || Math.floor(g.invulnTimer / 6) % 2 === 0);
      const walkSprite = walkSpriteRef.current;
      const jumpSprite = jumpSpriteRef.current;
      const climbSprite = climbSpriteRef.current;
      const winSprite = winSpriteRef.current;
      // During the dragon-grab outro: phase 'follow' (timer 120..210) we
      // want the caveman to walk right off-screen. Force walking animation
      // and apply the horizontal follow offset.
      const inFollowPhase = wa.active && wa.timer > 120 && (wa.cavemanFollowOffset || 0) > 0;
      if (inFollowPhase) {
        // advance walk frame
        pl.walkTimer = (pl.walkTimer || 0) + 1;
        if (pl.walkTimer > 5) { pl.walkTimer = 0; pl.walkFrame = (pl.walkFrame + 1) % 4; }
        pl.facing = 1;
      }
      const useWin = (g.state === 'win' || wa.active) && !inFollowPhase && winSprite && winSprite.complete && winSprite.naturalWidth > 0;
      const useClimb = !useWin && pl.climbing && climbSprite && climbSprite.complete && climbSprite.naturalWidth > 0;
      const useJump = !useWin && !pl.climbing && pl.jumping && jumpSprite && jumpSprite.complete && jumpSprite.naturalWidth > 0;
      const useWalk = (!useWin && !pl.climbing && !pl.jumping || inFollowPhase) && !!(walkSprite && walkSprite.complete && walkSprite.naturalWidth > 0);

      const followDx = inFollowPhase ? (wa.cavemanFollowOffset || 0) : 0;
      ctx.save();
      if (followDx) ctx.translate(followDx, 0);
      // Player sprites — 50% bigger
      if (showPlayer && useWin) {
        const drawW = 48;
        const drawH = 54;
        ctx.drawImage(winSprite, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
      } else if (showPlayer && useClimb) {
        const reachSprite = sproutReachSpriteRef.current;
        const inReach = !!(pl as any).lateralReach
          && reachSprite && reachSprite.complete && reachSprite.naturalWidth > 0;
        if (inReach) {
          const drawW = 52;
          const drawH = 48;
          ctx.drawImage(reachSprite!, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        } else {
          const sw = climbSprite.naturalWidth / 4;
          const sh = climbSprite.naturalHeight;
          const sx = pl.climbFrame * sw;
          const drawW = 42;
          const drawH = 48;
          ctx.drawImage(climbSprite, sx, 0, sw, sh, pl.x + pl.w / 2 - drawW / 2, pl.y + pl.h - drawH, drawW, drawH);
        }
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
        let drawW = 42;
        let drawH = 48;
        // Duck: squash vertically so the apple flies overhead.
        const ducked = (pl as any).duckTimer > 0;
        if (ducked) drawH = Math.round(drawH * 0.55);
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
      ctx.restore();

      // Carried watering can floats above the player until they water the sprout.
      if (!isLevel2Round(g.round) && g.keyGrabbed && !g.seedPlanted) {
        const canImg = wateringCanRef.current;
        const cx = pl.x + pl.w / 2;
        const cy = pl.y - 6;
        const drawW = 20, drawH = 16;
        if (canImg && canImg.complete && canImg.naturalWidth > 0) {
          ctx.drawImage(canImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        }
      }
      // L2: carried can (colored glow + L1 sprite) or carried grey rock above the player
      if (isLevel2Round(g.round)) {
        const cx = pl.x + pl.w / 2;
        const cy = pl.y - 6;
        if (l2Ref.current.carryingCan) {
          const glow = l2Ref.current.carryingCan === 'green'
            ? 'rgba(116,224,127,0.45)'
            : 'rgba(176,120,230,0.45)';
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          const canImg = wateringCanRef.current;
          const drawW = 20, drawH = 16;
          if (canImg && canImg.complete && canImg.naturalWidth > 0) {
            ctx.drawImage(canImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
          }
        }
        if (l2Ref.current.carryingRock) {
          ctx.fillStyle = '#777';
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#999';
          ctx.beginPath();
          ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2);
          ctx.fill();
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

      // HUD — sized to fit up to 10-digit scores within 512px canvas
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${g.score}`, 6, 24);
      ctx.textAlign = 'right';
      ctx.fillText(`LIVES ${'♥'.repeat(g.lives)}`, CANVAS_W - 6, 24);
      ctx.textAlign = 'center';
      const topScore = globalScoresRef.current[0]?.score ?? 0;
      ctx.fillText(`HI ${topScore}`, CANVAS_W / 2, 24);
      ctx.textAlign = 'left';

      // Overlays - large, centered
      ctx.textAlign = 'center';
      const arcade = '"Press Start 2P", monospace';
      const continuePrompt = isMobileRef.current ? 'PRESS ANY BUTTON' : 'PRESS ANY KEY';

      if (gameStateRef.current === 'gameover') {
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FF3030'; ctx.font = `bold 52px ${arcade}`;
        ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 50);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 34px ${arcade}`;
        ctx.fillText(`SCORE: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 + 20);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 22px ${arcade}`;
        if (qualifiesForTop(g.score, scoresRef.current)) {
          ctx.fillText(continuePrompt, CANVAS_W / 2, CANVAS_H / 2 + 80);
          ctx.fillText('TO CONTINUE', CANVAS_W / 2, CANVAS_H / 2 + 110);
        } else {
          ctx.fillText('PRESS R TO RESTART', CANVAS_W / 2, CANVAS_H / 2 + 80);
        }
      }
      if (gameStateRef.current === 'highscorePrompt') {
        ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 32px ${arcade}`;
        ctx.fillText('NEW HIGH SCORE!', CANVAS_W / 2, CANVAS_H / 2 - 80);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 28px ${arcade}`;
        ctx.fillText(`SCORE: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 - 20);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 20px ${arcade}`;
        ctx.fillText(continuePrompt, CANVAS_W / 2, CANVAS_H / 2 + 50);
        ctx.fillText('TO CONTINUE', CANVAS_W / 2, CANVAS_H / 2 + 78);
      }
      if (gameStateRef.current === 'continue' || g.state === 'continue') {
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 28px ${arcade}`;
        ctx.fillText(`LEVEL ${g.round} CLEAR!`, CANVAS_W / 2, CANVAS_H / 2 - 70);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 20px ${arcade}`;
        ctx.fillText(`SCORE: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 - 20);
        ctx.fillText(`LIVES: ${g.lives}`, CANVAS_W / 2, CANVAS_H / 2 + 16);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 16px ${arcade}`;
        ctx.fillText(continuePrompt, CANVAS_W / 2, CANVAS_H / 2 + 70);
        ctx.fillText('TO CONTINUE', CANVAS_W / 2, CANVAS_H / 2 + 96);
      }
      if (gameStateRef.current === 'enterName') {
        ctx.fillStyle = 'rgba(0,0,0,0.95)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 26px ${arcade}`;
        ctx.fillText('ENTER YOUR NAME', CANVAS_W / 2, 90);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 22px ${arcade}`;
        ctx.fillText(`SCORE: ${pendingScore}`, CANVAS_W / 2, 140);

        // Name field box (visual representation of the typed name)
        const boxW = 380, boxH = 64;
        const boxX = (CANVAS_W - boxW) / 2;
        const boxY = 200;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        const typed = nameInputRef.current;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 28px ${arcade}`;
        ctx.textAlign = 'center';
        const display = typed.length === 0 ? '_' : typed;
        ctx.fillText(display, CANVAS_W / 2, boxY + boxH / 2 + 10);

        // Char counter
        ctx.font = `bold 12px ${arcade}`;
        ctx.fillStyle = '#888888';
        ctx.fillText(`${typed.length}/${NAME_MAX_LENGTH}`, CANVAS_W / 2, boxY + boxH + 22);

        // Error message
        if (nameErrorRef.current) {
          ctx.fillStyle = '#FF5050';
          ctx.font = `bold 14px ${arcade}`;
          ctx.fillText(nameErrorRef.current, CANVAS_W / 2, boxY + boxH + 50);
        }

        // Hints
        ctx.font = `bold 12px ${arcade}`;
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('A-Z, 0-9, SPACE   MAX 10 CHARS', CANVAS_W / 2, CANVAS_H - 60);
        ctx.fillText(isMobileRef.current ? 'TAP FIELD ABOVE TO TYPE' : 'PRESS ENTER TO SUBMIT', CANVAS_W / 2, CANVAS_H - 38);
      }
      if (gameStateRef.current === 'leaderboard' || gameStateRef.current === 'globalLeaderboard') {
        const isGlobal = gameStateRef.current === 'globalLeaderboard';
        ctx.fillStyle = 'rgba(0,0,0,0.95)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 20px ${arcade}`;
        ctx.fillText(isGlobal ? `GLOBAL TOP ${MAX_ENTRIES}` : `LOCAL TOP ${MAX_ENTRIES}`, CANVAS_W / 2, 30);

        ctx.font = `bold 10px ${arcade}`;
        ctx.textAlign = 'left';
        const colRank = 14, colName = 44, colScore = 230, colLevel = 320, colDate = 360;
        ctx.fillStyle = '#FFD700';
        ctx.fillText('#', colRank, 55);
        ctx.fillText('NAME', colName, 55);
        ctx.fillText('SCORE', colScore, 55);
        ctx.fillText('LV', colLevel, 55);
        ctx.fillText('DATE', colDate, 55);
        const rowH = 19;
        const startY = 72;
        const typedName = nameInputRef.current.trim();
        for (let i = 0; i < MAX_ENTRIES; i++) {
          const y = startY + i * rowH;
          ctx.fillText(`${i + 1}.`, colRank, y);
          if (isGlobal) {
            const e = globalScoresRef.current[i];
            const isMine = e && e.id === justSubmittedGlobalIdRef.current;
            ctx.fillStyle = isMine ? '#FFD700' : '#FFFFFF';
            ctx.fillText(`${i + 1}.`, colRank, y);
            if (e) {
              ctx.fillText((e.name || '---').slice(0, 10), colName, y);
              ctx.fillText(String(e.score), colScore, y);
              ctx.fillText(e.level != null ? String(e.level) : '-', colLevel, y);
              ctx.fillText(e.created_at ? formatDate(e.created_at).slice(0, 10) : '---', colDate, y);
            } else {
              ctx.fillStyle = '#444444';
              ctx.fillText('---', colName, y);
              ctx.fillText('---', colScore, y);
              ctx.fillText('-', colLevel, y);
              ctx.fillText('---', colDate, y);
            }
          } else {
            const e = scoresRef.current[i];
            const isMine = e && e.date === justSubmittedLocalDateRef.current;
            ctx.fillStyle = isMine ? '#FFD700' : '#FFFFFF';
            ctx.fillText(`${i + 1}.`, colRank, y);
            if (e) {
              const display = (e.name && e.name.trim()) || e.initials;
              ctx.fillText(display.slice(0, 10), colName, y);
              ctx.fillText(String(e.score), colScore, y);
              ctx.fillText(e.level != null ? String(e.level) : '-', colLevel, y);
              ctx.fillText(formatDate(e.date).slice(0, 10), colDate, y);
            } else {
              ctx.fillStyle = '#444444';
              ctx.fillText('---', colName, y);
              ctx.fillText('---', colScore, y);
              ctx.fillText('-', colLevel, y);
              ctx.fillText('---', colDate, y);
            }
          }
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 14px ${arcade}`;
        ctx.fillText('PRESS R TO RESTART', CANVAS_W / 2, CANVAS_H - 12);
      }
      ctx.textAlign = 'start';

      ctx.restore();
    };

    // Drive the loop with setInterval at 60Hz instead of RAF so we get a
    // consistent cadence on high-refresh-rate monitors (120/144Hz). RAF
    // would fire 2-3x per logical frame and cause perceived stutter when
    // the throttle skipped frames.
    intervalId = window.setInterval(() => {
      gameLoop(performance.now());
    }, FRAME_INTERVAL);

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
  }, [resetGame, resetPlayer]);

  // ============= Gamepad API polling (PC + browsers that expose it) =============
  // Standard mapping: 0=A (jump), 9=Start (R), 12/13/14/15 = DPAD up/down/left/right.
  // Left stick: axes[0] (x), axes[1] (y). Threshold 0.4.
  useEffect(() => {
    let raf = 0;
    const prev: Record<string, boolean> = {};
    const send = (key: string, down: boolean, isStart = false) => {
      if (down === !!prev[key]) return;
      prev[key] = down;
      if (down) {
        markGamepadActive();
        keysRef.current.add(key);
        anyInputHandlerRef.current?.(key, 'pad');
        if (isStart && key === 'r') {
          // Match keyboard 'R' behavior: if not consumed by menus, reset.
          // anyInputHandlerRef already had a chance above.
        }
      } else {
        keysRef.current.delete(key);
      }
    };
    const poll = () => {
      const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
      let anyConnected = false;
      for (const gp of pads) {
        if (!gp) continue;
        anyConnected = true;
        const b = gp.buttons;
        const ax = gp.axes || [];
        const x = ax[0] ?? 0;
        const y = ax[1] ?? 0;
        const up    = (b[12]?.pressed) || y < -0.4;
        const down  = (b[13]?.pressed) || y >  0.4;
        const left  = (b[14]?.pressed) || x < -0.4;
        const right = (b[15]?.pressed) || x >  0.4;
        const jump  = !!b[0]?.pressed;
        const start = !!b[9]?.pressed;
        send('ArrowUp', up);
        send('ArrowDown', down);
        send('ArrowLeft', left);
        send('ArrowRight', right);
        send(' ', jump);
        send('r', start, true);
        if (up || down || left || right || jump || start) markGamepadActive();
        break; // first connected gamepad wins
      }
      if (!anyConnected) {
        // release any latched keys
        for (const k of Object.keys(prev)) if (prev[k]) send(k, false);
      }
      raf = requestAnimationFrame(poll);
    };
    const onConnect = () => { markGamepadActive(); };
    window.addEventListener('gamepadconnected', onConnect);
    raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      cancelAnimationFrame(raf);
    };
  }, [markGamepadActive]);
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
    if (type === 'down') {
      keysRef.current.add(key);
      // Route mobile pad presses through the unified menu input handler too.
      anyInputHandlerRef.current?.(key, 'pad');
    } else {
      keysRef.current.delete(key);
    }
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

  // Track active pad pointer so document-level move/up listeners follow the finger
  // even if it slides over a child element (which would otherwise steal the events).
  const padPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (padPointerIdRef.current === null || e.pointerId !== padPointerIdRef.current) return;
      e.preventDefault();
      updatePadFromPoint(e.clientX, e.clientY);
    };
    const handleUp = (e: PointerEvent) => {
      if (padPointerIdRef.current === null || e.pointerId !== padPointerIdRef.current) return;
      padPointerIdRef.current = null;
      clearPad();
    };
    document.addEventListener('pointermove', handleMove, { passive: false });
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
  }, []);

  const padHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      ensureVibrateUnlocked();
      padPointerIdRef.current = e.pointerId;
      updatePadFromPoint(e.clientX, e.clientY);
    },
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
    onPointerCancel: (e: React.PointerEvent) => { e.preventDefault(); simulateKey(key, 'up'); },
    onPointerLeave: (e: React.PointerEvent) => {
      // Only release if the pointer is no longer pressed (finger lifted off-button).
      if (e.buttons === 0) simulateKey(key, 'up');
    },
    // Prevent the browser from synthesizing duplicate mouse/touch events
    // after pointerdown — those can fire a spurious pointercancel that
    // releases the held key (e.g. JUMP only triggering once while held).
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); },
    onTouchCancel: (e: React.TouchEvent) => { e.preventDefault(); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] w-full flex-col overflow-hidden select-none bg-background">
      {/* Game area — fills all remaining space above controls */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block border-b-2 border-primary max-h-full max-w-full h-auto w-auto"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            height: '100%',
            width: 'auto',
          }}
          tabIndex={0}
        />

        {/* Hidden text input — surfaces the OS soft keyboard during name entry.
            Always mounted so focus() called inside a user-gesture handler can
            reliably open the mobile keyboard. Visually hidden when not in use. */}
        <input
          ref={nameFieldRef}
          type="text"
          value={nameInput}
          onChange={(e) => {
            const filtered = e.target.value
              .replace(/[^A-Za-z0-9 ]/g, '')
              .slice(0, NAME_MAX_LENGTH);
            setNameInput(filtered);
            if (nameError) setNameError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitHighScore();
            }
          }}
          autoFocus={gameState === 'enterName'}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={NAME_MAX_LENGTH}
          aria-label="Enter your name (up to 10 characters)"
          placeholder=""
          inputMode={gameState === 'enterName' ? 'text' : 'none'}
          readOnly={gameState !== 'enterName'}
          tabIndex={gameState === 'enterName' ? 0 : -1}
          className={
            gameState === 'enterName'
              ? "absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[14%] bg-transparent text-transparent caret-transparent border-0 outline-none focus:outline-none p-0 m-0 text-center"
              : "absolute opacity-0 pointer-events-none w-px h-px -left-[9999px] top-0 border-0 outline-none p-0 m-0"
          }
          style={{ WebkitAppearance: 'none', appearance: 'none' }}
        />

        {/* L4-cleared cinematic: dragon re-kidnaps the princess. */}
        {gameState === 'savedAnim' && (
          <SavedAnimation
            key={savedAnimKeyRef.current}
            full={savedAnimFullRef.current}
            onDone={() => {
              if (savedAnimReturnRef.current === 'intro') {
                setGameState('intro');
                gameRef.current.state = 'intro';
              } else {
                startNextLevel();
              }
            }}
          />
        )}

        {/* Arcade-style intro / title screen overlay */}
        {gameState === 'intro' && (
          <button
            type="button"
            aria-label="Start game"
            onPointerDown={(e) => {
              e.preventDefault();
              unlockAudio();
              anyInputHandlerRef.current?.('Tap', 'pad');
            }}
            className="absolute inset-0 flex flex-col items-center justify-between overflow-hidden focus:outline-none bg-black"
            style={{
              backgroundImage: `url(${introBackgroundUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
            }}
          >
            {/* Darken middle band for title legibility */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-black/70 via-black/40 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

            {/* Title is baked into the background image */}
            <div className="relative z-10" />

            {/* Footer prompt */}
            <div className="relative z-10 mb-[7%] flex w-full flex-col items-center gap-3 px-4">
              <div
                className="intro-blink text-center font-caveman"
                style={{
                  fontSize: 'clamp(1.25rem, 4.2vw, 2.4rem)',
                  color: 'hsl(var(--accent))',
                  textShadow: '3px 3px 0 hsl(var(--primary)), 5px 5px 0 #000',
                }}
              >
                {isMobile ? 'Tap Anywhere to Start' : 'Press R to Start'}
              </div>
              <div
                className="flex items-center justify-center gap-3 text-center font-caveman"
                style={{
                  fontSize: 'clamp(0.85rem, 2.4vw, 1.4rem)',
                  color: 'hsl(var(--foreground))',
                  textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
                  letterSpacing: '0.08em',
                }}
              >
                <span>© Team2Go, 2026</span>
                <img
                  src={team2goLogoUrl}
                  alt="Team2Go logo"
                  onPointerDown={handleLogoTap}
                  className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] cursor-pointer"
                  style={{
                    width: 'clamp(40px, 7vw, 64px)',
                    height: 'clamp(40px, 7vw, 64px)',
                  }}
                />
              </div>
            </div>
          </button>
        )}

        {/* Attract: LOCAL leaderboard (your own device only) */}
        {gameState === 'attractLocalLeaderboard' && (
          <AttractLeaderboardScreen
            kind="local"
            isMobile={isMobile}
            scores={scores}
            globalScores={globalScores}
            globalLoading={globalLoading}
            onStart={() => { unlockAudio(); anyInputHandlerRef.current?.('Tap', 'pad'); }}
            onRequestClearLocal={() => setConfirmClearOpen(true)}
            background={introBackgroundUrl}
            logo={team2goLogoUrl}
            onLogoTap={handleLogoTap}
          />
        )}

        {/* Attract: GLOBAL leaderboard (everyone, via Lovable Cloud) */}
        {gameState === 'attractGlobalLeaderboard' && (
          <AttractLeaderboardScreen
            kind="global"
            isMobile={isMobile}
            scores={scores}
            globalScores={globalScores}
            globalLoading={globalLoading}
            onStart={() => { unlockAudio(); anyInputHandlerRef.current?.('Tap', 'pad'); }}
            onRequestClearLocal={() => setConfirmClearOpen(true)}
            background={introBackgroundUrl}
            logo={team2goLogoUrl}
            onLogoTap={handleLogoTap}
          />
        )}

        {/* Attract: How to play (PC only) */}
        {gameState === 'attractControls' && (
          <button
            type="button"
            aria-label="Start game"
            onPointerDown={(e) => { e.preventDefault(); unlockAudio(); anyInputHandlerRef.current?.('Tap', 'pad'); }}
            className="absolute inset-0 flex flex-col items-center overflow-hidden focus:outline-none bg-black"
            style={{
              backgroundImage: `url(${introBackgroundUrl})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-black/75" />
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-6 px-6">
              <h2
                className="font-caveman text-center"
                style={{
                  fontSize: 'clamp(1.4rem, 5vw, 2.8rem)',
                  color: 'hsl(var(--accent))',
                  textShadow: '3px 3px 0 hsl(var(--primary)), 5px 5px 0 #000',
                }}
              >
                How to Play
              </h2>
              <ul
                className="flex w-full max-w-md flex-col gap-3 font-caveman"
                style={{
                  fontSize: 'clamp(0.85rem, 2.6vw, 1.25rem)',
                  color: 'hsl(var(--foreground))',
                  textShadow: '2px 2px 0 #000',
                }}
              >
                <li className="flex items-center justify-between gap-4 border-b border-accent/30 pb-1"><span className="text-accent">↑ Up Arrow</span><span>Climb Up</span></li>
                <li className="flex items-center justify-between gap-4 border-b border-accent/30 pb-1"><span className="text-accent">↓ Down Arrow</span><span>Climb Down</span></li>
                <li className="flex items-center justify-between gap-4 border-b border-accent/30 pb-1"><span className="text-accent">← Left Arrow</span><span>Move Left</span></li>
                <li className="flex items-center justify-between gap-4 border-b border-accent/30 pb-1"><span className="text-accent">→ Right Arrow</span><span>Move Right</span></li>
                <li className="flex items-center justify-between gap-4 border-b border-accent/30 pb-1"><span className="text-accent">Space</span><span>Jump</span></li>
              </ul>
              <div
                className="intro-blink mt-2 text-center font-caveman"
                style={{
                  fontSize: 'clamp(0.9rem, 2.8vw, 1.4rem)',
                  color: 'hsl(var(--accent))',
                  textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
                }}
              >
                Press R to Start
              </div>
            </div>
          </button>
        )}

        {/* Hidden dedication overlay (3 quick logo taps, or "i" x3 on PC) */}
        {showDedication && (
          <div
            className="absolute inset-0 z-50 bg-black flex items-center justify-center cursor-pointer"
            onPointerDown={(e) => { e.preventDefault(); setShowDedication(false); }}
          >
            <img
              src={isMobile ? dedicationMobileUrl : dedicationPcUrl}
              alt="Dedication"
              className="max-h-full max-w-full object-contain select-none"
              draggable={false}
            />
          </div>
        )}

        {/* Level intro overlay: "Level N" for 3s, then full black for 0.5s */}
        {levelIntro && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
            {levelIntro === 'level' && (
              <div
                className="font-caveman text-center"
                style={{
                  fontSize: 'clamp(2rem, 9vw, 5rem)',
                  color: 'hsl(var(--accent))',
                  textShadow: '4px 4px 0 hsl(var(--primary)), 6px 6px 0 #000',
                  letterSpacing: '0.08em',
                }}
              >
                Level {levelIntroNumber}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls — only on touch devices (mobile/tablet). Never on PC, regardless of window width.
          Also hidden during intro/attract screens or when a hardware gamepad is detected. */}
      {isTouchDevice && !gamepadActive && !(gameState === 'intro' || gameState === 'attractLocalLeaderboard' || gameState === 'attractGlobalLeaderboard' || gameState === 'attractControls') && (
      <div className="w-full shrink-0 overflow-hidden px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] touch-none">
        <div className="grid h-[152px] w-full grid-cols-[minmax(0,1fr)_3rem_minmax(7.5rem,38vw)] items-stretch gap-2">
          {/* Locked D-pad shape: box-style arrows only, wide Up/Down, L/R centered and slightly taller */}
          <div
            ref={padRef}
            className="flex h-full min-w-0 touch-none flex-col gap-1"
            {...padHandlers}
          >
            <div
              data-padkey="ArrowUp"
              style={{ flexGrow: 0.95, flexBasis: 0, width: '74%', pointerEvents: 'none' }}
              className={`self-center ${activePadKeys.includes('ArrowUp') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-center font-bold transition-colors select-none`}
            >↑</div>

            <div style={{ flexGrow: 1.1, flexBasis: 0 }} className="w-full flex items-stretch gap-1 min-w-0">
              <div
                data-padkey="ArrowLeft"
                style={{ pointerEvents: 'none' }}
                className={`flex-1 ${activePadKeys.includes('ArrowLeft') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-end pr-4 font-bold transition-colors select-none`}
              >←</div>
              <div
                data-padkey="ArrowRight"
                style={{ pointerEvents: 'none' }}
                className={`flex-1 ${activePadKeys.includes('ArrowRight') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-start pl-4 font-bold transition-colors select-none`}
              >→</div>
            </div>

            <div
              data-padkey="ArrowDown"
              style={{ flexGrow: 0.95, flexBasis: 0, width: '74%', pointerEvents: 'none' }}
              className={`self-center ${activePadKeys.includes('ArrowDown') ? 'bg-red-500' : 'bg-blue-500'} rounded-lg text-white text-3xl flex items-center justify-center font-bold transition-colors select-none`}
            >↓</div>
          </div>

          {/* R button — only shown on screens prompting "PRESS R TO RESTART".
              Slot stays in the grid so D-pad and JUMP keep their positions. */}
          {(gameState === 'gameover' || gameState === 'leaderboard' || gameState === 'globalLeaderboard') ? (
            <button
              className="w-12 h-12 self-center rounded-full bg-accent text-accent-foreground text-sm font-bold active:scale-95 shrink-0"
              onPointerDown={(e) => {
                e.preventDefault();
                ensureVibrateUnlocked();
                pulseHaptic(45);
                const consumed = anyInputHandlerRef.current?.('r', 'pad');
                if (!consumed) resetGame();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                ensureVibrateUnlocked();
                pulseHaptic(45);
                const consumed = anyInputHandlerRef.current?.('r', 'pad');
                if (!consumed) resetGame();
              }}
            >R</button>
          ) : (
            <div className="w-12 h-12 self-center shrink-0" aria-hidden="true" />
          )}

          {/* JUMP button — large but constrained so controls always fit */}
          <button
            className="h-full w-full min-w-0 rounded-full bg-primary text-primary-foreground text-2xl font-bold active:scale-95"
            {...tapHandlers(' ', 45)}
          >{jumpLabel}</button>
        </div>
      </div>
      )}
      {/* Confirm clearing the LOCAL leaderboard (long-press on mobile attract screen) */}
      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear local leaderboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes the Top {MAX_ENTRIES} list saved on this device only. The
              global leaderboard is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearLocalScores();
                setScores([]);
                setConfirmClearOpen(false);
              }}
            >
              Yes, clear it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AttractLeaderboardScreen
// Shared visual for the LOCAL and GLOBAL attract-mode leaderboards.
// On the LOCAL variant on mobile, holding the screen for 10s triggers
// `onRequestClearLocal`. Tapping (short press) starts the game.
// ---------------------------------------------------------------------------
interface AttractLeaderboardScreenProps {
  kind: 'local' | 'global';
  isMobile: boolean;
  scores: LeaderboardEntry[];
  globalScores: GlobalEntry[];
  globalLoading: boolean;
  background: string;
  logo: string;
  onStart: () => void;
  onRequestClearLocal: () => void;
  onLogoTap?: (e?: React.SyntheticEvent) => void;
}

const LONG_PRESS_MS = 10_000;

const AttractLeaderboardScreen = ({
  kind,
  isMobile,
  scores,
  globalScores,
  globalLoading,
  background,
  logo,
  onStart,
  onRequestClearLocal,
  onLogoTap,
}: AttractLeaderboardScreenProps) => {
  const longPressTimer = useRef<number | null>(null);
  const longPressFiredRef = useRef<boolean>(false);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    longPressFiredRef.current = false;
    if (kind === 'local' && isMobile) {
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        onRequestClearLocal();
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    const wasLong = longPressFiredRef.current;
    clearLongPress();
    longPressFiredRef.current = false;
    if (wasLong) return; // long-press already opened the dialog
    onStart();
  };

  const handlePointerCancel = () => {
    clearLongPress();
    longPressFiredRef.current = false;
  };

  const isGlobal = kind === 'global';
  const title = isGlobal ? `Global Top ${MAX_ENTRIES}` : `Local Top ${MAX_ENTRIES}`;

  return (
    <button
      type="button"
      aria-label="Start game"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      className="absolute inset-0 flex flex-col items-center overflow-hidden focus:outline-none bg-black"
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/70" />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 px-6 py-8">
        <h2
          className="font-caveman text-center"
          style={{
            fontSize: 'clamp(1.4rem, 5vw, 2.8rem)',
            color: 'hsl(var(--accent))',
            textShadow: '3px 3px 0 hsl(var(--primary)), 5px 5px 0 #000',
          }}
        >
          {title}
        </h2>

        <ol
          className="flex w-full max-w-md flex-col font-caveman"
          style={{
            fontSize: 'clamp(0.55rem, 1.7vw, 0.85rem)',
            color: 'hsl(var(--foreground))',
            textShadow: '2px 2px 0 #000',
            lineHeight: 1.15,
          }}
        >
          <li
            className="flex items-center justify-between gap-2 border-b-2 border-accent px-2 py-1 text-accent"
            aria-hidden="true"
          >
            <span className="w-6">#</span>
            <span className="flex-1 tracking-widest">NAME</span>
            <span className="w-16 text-right">SCORE</span>
            <span className="w-8 text-right">LV</span>
          </li>
          {Array.from({ length: MAX_ENTRIES }).map((_, i) => {
            if (isGlobal) {
              const e = globalScores[i];
              const display = e ? (e.name || '---') : '---';
              return (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-accent/20 px-2 py-[2px]">
                  <span className="w-6 text-accent">{(i + 1).toString().padStart(2, '0')}</span>
                  <span className="flex-1 truncate tracking-wider">{display}</span>
                  <span className="w-16 text-right">{e ? e.score.toString().padStart(6, '0') : '------'}</span>
                  <span className="w-8 text-right text-accent">{e && e.level != null ? `L${e.level}` : '--'}</span>
                </li>
              );
            }
            const e = scores[i];
            const display = e ? entryDisplayName(e) : '---';
            return (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-accent/20 px-2 py-[2px]">
                <span className="w-6 text-accent">{(i + 1).toString().padStart(2, '0')}</span>
                <span className="flex-1 truncate tracking-wider">{display}</span>
                <span className="w-16 text-right">{e ? e.score.toString().padStart(6, '0') : '------'}</span>
                <span className="w-8 text-right text-accent">{e && e.level != null ? `L${e.level}` : '--'}</span>
              </li>
            );
          })}
        </ol>

        {isGlobal && globalLoading && globalScores.length === 0 && (
          <div
            className="font-caveman text-center"
            style={{
              fontSize: 'clamp(0.7rem, 2vw, 1rem)',
              color: 'hsl(var(--accent))',
              textShadow: '2px 2px 0 #000',
            }}
          >
            Loading global scores…
          </div>
        )}

        {/* Hidden hint: clearing local leaderboard still works
            (long-press on mobile, hold C on PC), but is intentionally not shown. */}
      </div>
      {/* Footer prompt — same position as intro screen */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mb-[7%] flex w-full flex-col items-center gap-3 px-4">
        <div
          className="intro-blink text-center font-caveman"
          style={{
            fontSize: 'clamp(1.25rem, 4.2vw, 2.4rem)',
            color: 'hsl(var(--accent))',
            textShadow: '3px 3px 0 hsl(var(--primary)), 5px 5px 0 #000',
          }}
        >
          {isMobile ? 'Tap Anywhere to Start' : 'Press R to Start'}
        </div>
        <div
          className="flex items-center justify-center gap-3 text-center font-caveman"
          style={{
            fontSize: 'clamp(0.85rem, 2.4vw, 1.4rem)',
            color: 'hsl(var(--foreground))',
            textShadow: '2px 2px 0 hsl(var(--primary)), 3px 3px 0 #000',
            letterSpacing: '0.08em',
          }}
        >
          <span>© Team2Go, 2026</span>
          <img
            src={logo}
            alt="Team2Go logo"
            onPointerDown={onLogoTap}
            className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] cursor-pointer"
            style={{
              width: 'clamp(40px, 7vw, 64px)',
              height: 'clamp(40px, 7vw, 64px)',
            }}
          />
        </div>
      </div>
    </button>
  );
};

export default CavemanVsDragonGame;
