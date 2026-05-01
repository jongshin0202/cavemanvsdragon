import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CANVAS_W, CANVAS_H, GRAVITY, JUMP_FORCE, MOVE_SPEED, BARREL_SPEED, CLIMB_SPEED, ROBOT_SPEED, getRoundDifficulty,
  PLATFORMS, LADDERS, getPlatformY, rectsOverlap, findPlatformIndex, findBestLadder, buildMonkeyDistribution,
  Barrel, Robot
} from './game/constants';
import { playJumpSound, playBarrelRollSound, playGameOverSound, playWinSound, playHitSound, playRobotKillSound, playKeyGrabSound, playWaterSproutSound, playGenieAppearSound, playPrincessSavedSound, playVineGrowSound, playDragonRoarTracked, playPrincessHelpSound, isDragonRoaringNow, unlockAudio } from './game/sounds';
import { loadScores, qualifiesForTop, insertScore, clearLocalScores, formatDate, entryDisplayName, MAX_ENTRIES, type LeaderboardEntry } from './game/leaderboard';
import { checkAndRefresh, qualifiesForGlobal, submitGlobalScore, getCachedGlobal, type GlobalEntry } from './game/globalLeaderboard';
import { recordLaunchAndMaybeFlush, recordRound, recordGlobalHit } from './game/deviceStats';
import { validateName, NAME_MAX_LENGTH, NAME_ALLOWED_REGEX } from './game/profanity';
import { LEVEL2_PARAMS } from './game/level2/params';
import { initLevel2, updateLevel2, renderLevel2, spawnLevel2Robots, fireballHitsPlayer, tryPickupCan, tryPickupRock, trySealVolcano, maybeSpawnVolcanoRock, onMonkeyKilled, newSpawnJacket, pushJacket, isHoleAtPlatform, tickApples, appleHitsPlayer, type L2Sprites } from './game/level2/level2';
import { makeEmptyL2State, type L2State } from './game/level2/types';
import { applyLevel2Layout, restoreLevel1Layout, isLadderUsableL2, markSproutUsed, markSproutInUse, tickSprouts, getSprouts, waterTopSprout, isTopSproutGrown, GREEN_TOP_LADDER_IDX, PURPLE_TOP_LADDER_IDX } from './game/level2/layout';
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
import cavemanWinUrl from '@/assets/caveman-win.png';
import dragonFireUrl from '@/assets/dragon-fire.png';
import dragonAngryUrl from '@/assets/dragon-angry.png';
import princessSpriteUrl from '@/assets/princess-sprite.png';
import robotWalkUrl from '@/assets/robot-walk.png';
import rockWheelUrl from '@/assets/rock-wheel.png';
import wateringCanUrl from '@/assets/watering-can.png';
import introBackgroundUrl from '@/assets/intro-background.jpg';
import team2goLogoUrl from '@/assets/team2go-logo.png';

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

type GameState =
  | 'intro'
  | 'playing'
  | 'gameover'
  | 'win'
  | 'continue'
  | 'highscorePrompt'
  | 'enterName'
  | 'leaderboard'        // post-game LOCAL leaderboard (only-local qualifier)
  | 'globalLeaderboard'  // post-game GLOBAL leaderboard (global qualifier)
  | 'attractLocalLeaderboard'
  | 'attractGlobalLeaderboard'
  | 'attractControls';

const CavemanVsDragonGame = () => {
  const isMobile = useIsMobile();
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
  const [nameInput, setNameInput] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');
  const [pendingScore, setPendingScore] = useState(0);
  const [pendingLevel, setPendingLevel] = useState(1);
  // Level intro overlay: 'level' shows "Level N" for 3s, then 'black' for 0.5s, then null.
  const [levelIntro, setLevelIntro] = useState<null | 'level' | 'black'>(null);
  const [levelIntroNumber, setLevelIntroNumber] = useState(1);
  const levelIntroTimersRef = useRef<number[]>([]);
  const continueArmedAtRef = useRef(0); // ms timestamp when input is allowed
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
    frameCount: 0,
    playerHasMoved: true, // start spawning barrels and audio immediately
    barrelStartDelay: 0,
    winAnim: { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 },
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
  // Tracks the last intro-tap time so we can detect a double-tap shortcut
  // to jump straight to Level 2 (when LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2).
  const lastIntroTapRef = useRef<number>(0);

  const resetPlayer = useCallback(() => {
    const g = gameRef.current;
    g.player = { x: 80, y: 400, w: 16, h: 24, vy: 0, onGround: false, climbing: false, facing: 1, jumping: false, walkFrame: 0, walkTimer: 0, jumpFrame: 0, jumpTimer: 0, climbFrame: 0, climbTimer: 0, duckTimer: 0 };
    g.barrels = [];
    g.barrelTimer = 0;
    g.pendingClimb = null;
    g.courseDir = 0;
    // Brief invulnerability so we don't die on the same frame we respawn
    g.invulnTimer = 120; // ~2s at 60fps
  }, []);

  // Resets the level only (for next level / death respawn). Preserves score & lives.
  const resetLevel = useCallback(() => {
    const g = gameRef.current;
    g.state = 'playing'; g.dying = false; g.deathTimer = 0; g.deathFlashTimer = 0;
    g.robots = [];
    g.robotSpawnTimer = 0;
    g.robotsInitialized = false;
    g.nextBarrelTime = 69 + Math.random() * 138;
    g.frameCount = 0;
    g.playerHasMoved = true;
    g.barrelStartDelay = 0;
    g.dkAnimTimer = 0; g.dkFrame = 0;
    g.princessAnimTimer = 0; g.helpTimer = 0; g.showHelp = false;
    g.winAnim = { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 };
    g.monkeysKilled = 0;
    g.comboKills = 0;
    g.keySpawned = false;
    g.keyGrabbed = false;
    g.seedPlanted = false;
    g.topVineGrowth = 0;
    g.topVineUnlocked = false;
    if (!g.keyPos) g.keyPos = { x: 50, y: 158, w: 14, h: 14 };
    g.keyBob = 0;
    g.sparkleTimer = 0;
    resetPlayer();
    // For Level 2+, initialize the L2 module's own state. We still spawn
    // an L1 rock here for the (legacy) L1 layout — the L2 module manages
    // its own hazards independently and the host's L1 barrel-spawn block
    // is gated on round===1 below in the loop.
    if (g.round >= 2) {
      // Swap to L2 layout (flat platforms + sprout vines) BEFORE
      // initializing/spawning so monkey + sprite positions snap to it.
      applyLevel2Layout();
      initLevel2(l2Ref.current, g.round - 1); // L2 round = total round - 1
      // Spawn one monkey per P2..P5 (with 1-2 wearing green jackets)
      const { robots } = spawnLevel2Robots(l2Ref.current);
      g.robots.push(...robots);
      g.robotsInitialized = true; // prevent L1 spawner from also adding monkeys
    } else {
      // L1: make sure layout is the original (in case we just came back).
      restoreLevel1Layout();
    }
    // Spawn first rock immediately so action starts the moment the level begins
    if (g.round === 1) {
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
    const t1 = window.setTimeout(() => setLevelIntro('black'), 3000);
    const t2 = window.setTimeout(() => {
      setLevelIntro(null);
      onDone();
    }, 3500);
    levelIntroTimersRef.current.push(t1, t2);
  }, []);

  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0; g.lives = 3; g.round = 1;
    setScore(0); setLives(3);
    setGameState('playing');
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

  // Start the next level — for now (only one level), restart the same layout
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
    setGameState('playing');
    recordRound();
    playLevelIntro(nextRound, () => resetLevel());
  }, [resetLevel, playLevelIntro]);

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
    let timer = window.setTimeout(() => setGameState('intro'), 5000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setGameState('intro'), 5000);
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
      delay = 10000;
    } else if (gameState === 'attractLocalLeaderboard') {
      nextState = 'attractGlobalLeaderboard';
      delay = 10000;
    } else if (gameState === 'attractGlobalLeaderboard') {
      nextState = 'intro';
      delay = 10000;
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
        // DEV/TEST: PC presses "2" on intro to jump straight into Level 2.
        if (
          _source === 'keyboard' &&
          (gs === 'intro' || gs === 'attractControls') &&
          key === '2' &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          startInLevel2Test();
          return true;
        }
        // DEV/TEST: mobile/touch double-tap on intro/attract screens jumps
        // straight into Level 2.
        if (
          _source === 'pad' &&
          (gs === 'intro' ||
            gs === 'attractLocalLeaderboard' ||
            gs === 'attractGlobalLeaderboard' ||
            gs === 'attractControls') &&
          LEVEL2_PARAMS.TEST_SKIP_TO_LEVEL2
        ) {
          const since = now - lastIntroTapRef.current;
          lastIntroTapRef.current = now;
          if (since > 0 && since <= LEVEL2_PARAMS.DOUBLE_TAP_MAX_GAP_MS) {
            lastIntroTapRef.current = 0;
            startInLevel2Test();
            return true;
          }
          // First tap of a possible double — wait briefly to see if a
          // second one arrives. If not, start the normal game.
          window.setTimeout(() => {
            // If still on intro/attract and no second tap fired the shortcut,
            // begin the normal game.
            if (lastIntroTapRef.current !== 0) {
              const stillIntro =
                gameStateRef.current === 'intro' ||
                gameStateRef.current === 'attractLocalLeaderboard' ||
                gameStateRef.current === 'attractGlobalLeaderboard' ||
                gameStateRef.current === 'attractControls';
              lastIntroTapRef.current = 0;
              if (stillIntro) resetGame();
            }
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
        setGameState('enterName');
        // Focus the hidden input on the next tick so mobile soft keyboard pops up
        setTimeout(() => nameFieldRef.current?.focus(), 0);
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
  }, [startNextLevel, submitHighScore, resetGame, startInLevel2Test, globalScores]);


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
      unlockAudio();
      // When the user is typing into the name input, let the input handle the
      // key natively (we still listen for Enter inside the input's own onKeyDown).
      if (e.target === nameFieldRef.current) {
        return;
      }
      keysRef.current.add(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      // Route input through the unified handler. It returns true if it consumed the key.
      const consumed = anyInputHandlerRef.current?.(e.key, 'keyboard');
      if (consumed) { e.preventDefault(); return; }
      if (e.key === 'r' || e.key === 'R' || e.code === 'KeyR') { e.preventDefault(); resetGame(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
      // Releasing C cancels the pending hold-to-clear timer.
      if (e.key === 'c' || e.key === 'C') {
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

      const wa: any = g.winAnim || { active: false, gorillaY: 76, gorillaRotation: 0, showKiss: false, showCongrats: false, timer: 0 };
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
          // Phase: follow — caveman walks right and off-screen
          const t = (wa.timer - 120) / 90;
          wa.cavemanFollowOffset = (CANVAS_W + 80) * t;
        } else {
          // Phase: congrats overlay
          wa.showCongrats = true;
        }

        // After CONGRATS has been visible ~1.5s, switch to LEVEL CLEAR
        if (wa.timer > 210 + 90 && g.state === 'win') {
          g.state = 'continue';
          setGameState('continue');
          continueArmedAtRef.current = performance.now() + 1000; // 1s input lock
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
          resetPlayer();
          // Spawn first rock wheel immediately on respawn
          {
            const d = getRoundDifficulty(g.round);
            const speed = BARREL_SPEED * (d.barrelSpeedMul + Math.random() * d.barrelSpeedJitter);
            g.barrels.push({ x: 140, y: 88, w: 14, h: 14, vx: speed, vy: 0, onLadder: false, falling: false, targetLadder: null, speed, rollPhase: 0 });
            playBarrelRollSound();
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

      if (g.state === 'playing' && !g.dying) {
        // Decrement invulnerability after respawn
        if (g.invulnTimer > 0) g.invulnTimer--;
        // Periodic dragon roar and princess "Help!" sounds removed per user request.
        // === PLAYER MOVEMENT ===
        // Wider snap: find nearest ladder within LADDER_SNAP pixels
        const playerCX = p.x + p.w / 2;
        let nearestLadder: (typeof LADDERS)[number] | null = null;
        let nearestLadderIdx = -1;
        let nearestLadderDist = Infinity;
        for (let li = 0; li < LADDERS.length; li++) {
          if (g.round === 1 && li === getTopVineIdx() && !g.topVineUnlocked) continue;
          if (g.round >= 2 && !isLadderUsableL2(li)) continue;
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

        if (wantUp && nearestLadder && !jumpPressed) {
          p.climbing = true;
          p.x = nearestLadder.x + 7 - p.w / 2;
        } else if (wantDown) {
          if (nearestLadder && p.y + p.h < nearestLadder.yBot - 4) {
            // Climb down ladder
            p.climbing = true;
            p.x = nearestLadder.x + 7 - p.w / 2;
          } else if (p.onGround && !nearestLadder && rawDown) {
            // L2: ducking — start one duck per Down-press; auto-releases.
            if (g.round >= 2 && (p as any).duckTimer === 0 && !(p as any).duckHeld) {
              (p as any).duckTimer = LEVEL2_PARAMS.DUCK_FRAMES;
              (p as any).duckHeld = true;
            } else {
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
        }
        if (!rawDown) (p as any).duckHeld = false;
        if ((p as any).duckTimer > 0) (p as any).duckTimer--;

        if (p.climbing) {
          // If near the top of the ladder and pressing left/right, dismount
          const climbingLadder = nearestLadder;
          const nearTop = climbingLadder && (p.y + p.h) < climbingLadder.yTop + 10;
          const nearBot = climbingLadder && (p.y + p.h) > climbingLadder.yBot - 6;
          const wantsHorizontal = rawLeft || rawRight;
          
          if (jumpPressed) {
            // Jump pressed while climbing — dismount immediately so the jump can fire below
            p.climbing = false;
            if (climbingLadder && nearTop) p.y = climbingLadder.yTop - p.h;
            p.onGround = !!(climbingLadder && nearTop);
          } else if (!nearestLadder && !nearTop) {
            p.climbing = false;
          } else if (nearTop && (wantsHorizontal || rawUp)) {
            // Snap to top platform and dismount
            p.climbing = false;
            if (climbingLadder) p.y = climbingLadder.yTop - p.h;
            // L2: sprout withers after one use (climbed up)
            if (g.round >= 2 && nearestLadderIdx >= 0) markSproutUsed(nearestLadderIdx);
          } else if (nearBot && (wantsHorizontal || rawDown)) {
            p.climbing = false;
            if (climbingLadder) p.y = climbingLadder.yBot - p.h;
            // L2: sprout withers after one use (climbed down)
            if (g.round >= 2 && nearestLadderIdx >= 0) markSproutUsed(nearestLadderIdx);
          } else if (wantsHorizontal && !rawUp && !rawDown) {
            p.climbing = false;
          } else {
            p.vy = 0;
            // L2: keep this sprout alive while we're actively on it.
            if (g.round >= 2 && nearestLadderIdx >= 0) markSproutInUse(nearestLadderIdx);
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
                if (g.round >= 2 && isHoleAtPlatform(l2Ref.current, plIdx, p.x + p.w / 2)) {
                  continue;
                }
                p.y = platY - p.h; p.vy = 0; p.onGround = true; p.jumping = false;
                p.jumpFrame = 0; p.jumpTimer = 0;
                g.comboKills = 0;
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
        // Spawn the watering can once all monkeys for this round are dead.
        // Random placement: anywhere on P1–P4, OR the leftmost edge of P5.
        const monkeyTarget = getRoundDifficulty(g.round).monkeyCount;
        // Level-1 only mechanic — L2 has its own (green/purple) watering cans.
        if (g.round === 1 && !g.keySpawned && g.monkeysKilled >= monkeyTarget) {
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
            g.score += 200; setScore(g.score);
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
        if (g.round === 1) {
          const paulX = 175, paulY = 64;
          if (rectsOverlap(p, { x: paulX, y: paulY, w: 40, h: 48 })) {
            g.state = 'win'; setGameState('win');
            g.score += 2000 + g.lives * 1000; setScore(g.score); playWinSound(); playPrincessSavedSound();
            wa.active = true;
            wa.timer = 0;
            wa.gorillaY = 76;
            wa.gorillaRotation = 0;
            wa.showKiss = false;
            wa.showCongrats = false;
          }
        }

        // === BARREL SPAWNING (only after player first moves; first barrel ~0.5s after) ===
        // Disabled in Level 2 — the L2 module manages its own hazards.
        if (g.round === 1 && g.playerHasMoved) {
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

        // === LEVEL 2 UPDATE ===
        if (g.round >= 2) {
          const pl = g.player;
          updateLevel2(l2Ref.current, g.frameCount, pl.x + pl.w / 2, pl.y + pl.h / 2);
          // Tick sprout regrow timers (per-frame).
          tickSprouts();

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
              g.score += 100; setScore(g.score);
            }
          }

          // Fireball lethal hit on player
          if (g.invulnTimer === 0 && fireballHitsPlayer(l2Ref.current, pl)) {
            g.lives--; setLives(g.lives);
            if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
            else { playHitSound(); g.dying = true; g.deathTimer = 0; g.deathFlashTimer = 0; }
          }

          // ── Apples (colored monkeys throw them) ──
          tickApples(l2Ref.current, g.robots);
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
                g.score += 100; setScore(g.score);
              }
            }
            if (g.invulnTimer === 0) {
              const hit = appleHitsPlayer(l2Ref.current, hitbox);
              if (hit >= 0) {
                g.lives--; setLives(g.lives);
                if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
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
                if (waterTopSprout(l2Ref.current.carryingCan)) {
                  playWaterSproutSound();
                  playVineGrowSound();
                  l2Ref.current.carryingCan = null;
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
            }
          }

          // Win: purple sprout grown AND player touches princess
          if (isTopSproutGrown('purple') && !wa.active) {
            const paulX = 175, paulY = 64;
            if (rectsOverlap(pl, { x: paulX, y: paulY, w: 40, h: 48 })) {
              g.state = 'win'; setGameState('win');
              g.score += 2000 + g.lives * 1000; setScore(g.score);
              playWinSound(); playPrincessSavedSound();
              wa.active = true;
              wa.timer = 0;
              wa.gorillaY = 76;
              wa.gorillaRotation = 0;
              wa.showKiss = false;
              wa.showCongrats = false;
            }
          }

          // Respawn killed monkeys (so purple-jacket phase can occur).
          // Each pending respawn has its own random 5–10s delay rolled at
          // kill time. Enforce per-platform cap (1 monkey per platform).
          const queue: number[] = (g as any).l2RespawnQueue || [];
          if (queue.length > 0) {
            // Decrement all pending timers each frame.
            for (let qi = 0; qi < queue.length; qi++) queue[qi]--;
            // Find a ready entry (timer ≤ 0) and try to spawn.
            const readyIdx = queue.findIndex(t => t <= 0);
            if (readyIdx >= 0) {
              const platSlots = [1, 2, 3, 4];
              const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
              for (const rb of g.robots) {
                const idx = findPlatformIndex(rb.y + rb.h, rb.x + rb.w / 2);
                if (counts[idx] !== undefined) counts[idx]++;
              }
              const open = platSlots.filter(pi => counts[pi] === 0);
              if (open.length > 0) {
                queue.splice(readyIdx, 1);
                const pi = open[Math.floor(Math.random() * open.length)];
                const plat = PLATFORMS[pi];
                // Walk in from whichever side touches the screen edge (no gap).
                const leftAtEdge = plat.x1 <= 2;
                const rightAtEdge = plat.x2 >= CANVAS_W - 2;
                let fromLeft: boolean;
                if (leftAtEdge && rightAtEdge) fromLeft = Math.random() < 0.5;
                else if (leftAtEdge) fromLeft = true;
                else if (rightAtEdge) fromLeft = false;
                else fromLeft = (plat.x1 < CANVAS_W - plat.x2);
                const rx = fromLeft ? plat.x1 - 16 : plat.x2 + 2;
                const ry = getPlatformY(plat, fromLeft ? plat.x1 + 1 : plat.x2 - 1) - 16;
                const spd = ROBOT_SPEED * 0.6;
                g.robots.push({
                  x: rx, y: ry, w: 14, h: 16, vx: 0, vy: 0,
                  onGround: true, climbing: false, targetLadder: null,
                  direction: fromLeft ? 1 : -1,
                  frame: 0, frameTimer: 0, speed: spd,
                });
                pushJacket(l2Ref.current, newSpawnJacket(l2Ref.current));
              }
              // If no platform open, the entry stays at ≤0 and will retry next frame.
            }
            (g as any).l2RespawnQueue = queue;
          }
        }


        // === MONKEY SPAWNING ===
        // Distribution across P2..P5 grows by +1 per finished round, added to a
        // random platform with the current minimum count, until each platform
        // has 5 (20 monkeys total). After that the distribution stays at 5/5/5/5.
        if (g.round === 1 && !g.robotsInitialized) {
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
                if (g.round === 1 && li === getTopVineIdx() && !g.topVineUnlocked) continue;
                if (g.round >= 2 && !isLadderUsableL2(li)) continue;
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
                if (g.round === 1 && li === getTopVineIdx() && !g.topVineUnlocked) continue;
                if (g.round >= 2 && !isLadderUsableL2(li)) continue;
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
          if (rectsOverlap(p, b) && bPlatY === pPlatY && g.invulnTimer === 0 && p.onGround && !p.jumping) {
            g.lives--; setLives(g.lives);
            if (g.lives <= 0) { g.state = 'gameover'; setGameState('gameover'); playGameOverSound(); }
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
            g.score += 100; setScore(g.score);
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
              if (g.round === 1 && li === getTopVineIdx() && !g.topVineUnlocked) continue;
              if (g.round >= 2 && !isLadderUsableL2(li)) continue;
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

              for (let plIdx = 0; plIdx < PLATFORMS.length; plIdx++) {
                const plat = PLATFORMS[plIdx];
                if (r.x + r.w > plat.x1 && r.x < plat.x2) {
                  const platY = getPlatformY(plat, r.x + r.w / 2);
                  if (r.y + r.h >= platY && r.y + r.h <= platY + 12 && r.vy >= 0) {
                    if (g.round >= 2 && isHoleAtPlatform(l2Ref.current, plIdx, r.x + r.w / 2)) continue;
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
              const n = (g.comboKills || 0) + 1;
              g.comboKills = n;
              g.score += 300 * (2 * n - 1); setScore(g.score);
              playRobotKillSound();
              p.vy = -4;
              g.robots.splice(i, 1);
              g.monkeysKilled = (g.monkeysKilled || 0) + 1;
              if (g.round >= 2) {
                onMonkeyKilled(l2Ref.current, i);
                // L2: queue a respawn with a random 5–10s delay (300–600 frames @60fps).
                const q: number[] = (g as any).l2RespawnQueue || [];
                const delay = 300 + Math.floor(Math.random() * 301); // 300..600
                q.push(delay);
                (g as any).l2RespawnQueue = q;
              }
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
        if (g.round === 1 && li === getTopVineIdx()) continue; // L1: top vine drawn separately
        if (g.round >= 2 && !isLadderUsableL2(li)) continue; // L2: hide ungrown sprouts
        const l = LADDERS[li];
        drawVine(l.x, l.yTop, l.yBot);
      }

      // L2: for each non-top sprout that is currently NOT grown, draw the
      //     same seed mound + sprout art used by L1's top vine, and animate
      //     the vine growing up from the seed once the regrow timer expires.
      if (g.round >= 2) {
        const sprouts = getSprouts();
        for (let li = 0; li < LADDERS.length; li++) {
          // (no top-vine skip in L2: green/purple top sprouts are real entries here)
          const sr = sprouts[li];
          if (!sr || sr.grown) continue;
          const l = LADDERS[li];
          const sx = l.x + 7;
          const sy = l.yBot - 2;

          // Animated portion: vine growing from seed up toward top platform
          if (sr.growProgress > 0) {
            const fullH = l.yBot - l.yTop;
            const grownTop = l.yBot - fullH * sr.growProgress;
            drawVine(l.x, grownTop, l.yBot);
            // Sparkles only while regrowing — withering is silent (no water).
            if (sr.growProgress < 1 && sr.phase === 'grow') {
              for (let i = 0; i < 5; i++) {
                const dx = sx + Math.cos(g.sparkleTimer * 0.18 + i * 1.3 + li) * 7;
                const dy = grownTop - 4 + ((g.sparkleTimer * 0.6 + i * 5 + li * 3) % 18);
                ctx.fillStyle = ['#4FC3F7', '#B3E5FC', '#81D4FA', '#FFFFFF', '#4FC3F7'][i];
                ctx.fillRect(dx, dy, 2, 2);
              }
            }
          } else {
            // Dormant seed: small mound of dirt with tiny green sprout leaves.
            // No colored halo — the halo previously made the seed look like a
            // pickup item, which confused players.
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(sx - 6, sy - 2, 12, 4);
            ctx.fillStyle = '#3E2723';
            ctx.fillRect(sx - 6, sy + 1, 12, 1);
            // Two tiny leaves poking out of the dirt
            const leafColor = sr.topColor === 'purple' ? '#9C27B0' : '#66BB6A';
            ctx.fillStyle = leafColor;
            ctx.fillRect(sx - 3, sy - 5, 2, 3);
            ctx.fillRect(sx + 1, sy - 5, 2, 3);
            ctx.fillStyle = sr.topColor === 'purple' ? '#7B1FA2' : '#4CAF50';
            ctx.fillRect(sx - 4, sy - 6, 1, 1);
            ctx.fillRect(sx + 2, sy - 6, 1, 1);
          }
        }
        // Keep sparkle timer ticking so the grow droplets animate.
        g.sparkleTimer++;
      }

      // Topmost vine — animated growth from sprout up to top platform.
      // L1 only (L2 manages its own two top sprouts via getSprouts()).
      if (g.round === 1) {
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
      if (g.round >= 2) {
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
      if (g.round === 1 && g.keyGrabbed && !g.seedPlanted) {
        const canImg = wateringCanRef.current;
        const cx = pl.x + pl.w / 2;
        const cy = pl.y - 6;
        const drawW = 20, drawH = 16;
        if (canImg && canImg.complete && canImg.naturalWidth > 0) {
          ctx.drawImage(canImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
        }
      }
      // L2: carried can (colored) or carried grey rock above the player
      if (g.round >= 2) {
        const cx = pl.x + pl.w / 2;
        const cy = pl.y - 6;
        if (l2Ref.current.carryingCan) {
          const fill = l2Ref.current.carryingCan === 'green' ? '#2e9b3a' : '#7a2bd1';
          const hi = l2Ref.current.carryingCan === 'green' ? '#74e07f' : '#c79bff';
          ctx.fillStyle = fill;
          ctx.fillRect(cx - 8, cy - 5, 14, 10);
          ctx.fillRect(cx + 5, cy - 2, 4, 4);
          ctx.fillStyle = hi;
          ctx.fillRect(cx - 7, cy - 4, 4, 2);
          ctx.fillStyle = fill;
          ctx.fillRect(cx - 12, cy - 3, 4, 3);
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

      // HUD
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 18px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE: ${g.score}`, 10, 28);
      ctx.textAlign = 'right';
      ctx.fillText(`LIVES: ${'♥'.repeat(g.lives)}`, CANVAS_W - 10, 28);
      ctx.textAlign = 'center';
      const topScore = globalScoresRef.current[0]?.score ?? 0;
      ctx.fillText(`HI: ${topScore}`, CANVAS_W / 2, 28);
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
      if (g.state === 'win' && wa.showCongrats) {
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 40px ${arcade}`;
        ctx.fillText('CONGRATS!', CANVAS_W / 2, CANVAS_H / 2 - 110);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 52px ${arcade}`;
        ctx.fillText('YOU WON!', CANVAS_W / 2, CANVAS_H / 2 - 50);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 34px ${arcade}`;
        ctx.fillText(`SCORE: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 + 20);
      }
      // Use g.state alongside the React ref so we don't get a 1-frame flash of
      // the bare game scene when transitioning from 'win' (CONGRATS) → 'continue'
      // (LEVEL CLEAR), since g.state mutates immediately while gameStateRef.current
      // only updates on the next React commit.
      if (gameStateRef.current === 'continue' || g.state === 'continue') {
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#FFD700'; ctx.font = `bold 40px ${arcade}`;
        ctx.fillText(`LEVEL ${g.round} CLEAR!`, CANVAS_W / 2, CANVAS_H / 2 - 90);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 28px ${arcade}`;
        ctx.fillText(`SCORE: ${g.score}`, CANVAS_W / 2, CANVAS_H / 2 - 30);
        ctx.fillText(`LIVES: ${g.lives}`, CANVAS_W / 2, CANVAS_H / 2 + 10);
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 22px ${arcade}`;
        ctx.fillText(continuePrompt, CANVAS_W / 2, CANVAS_H / 2 + 70);
        ctx.fillText('TO CONTINUE', CANVAS_W / 2, CANVAS_H / 2 + 100);
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
            const isMine = e && e.score === pendingScore && e.name === typedName;
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
            const isMine = e && e.score === pendingScore && (e.name === typedName || e.name === nameInputRef.current);
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
            Positioned over the on-canvas name field, kept visually transparent
            so the canvas-rendered name is what the user sees. */}
        {gameState === 'enterName' && (
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
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={NAME_MAX_LENGTH}
            aria-label="Enter your name (up to 10 characters)"
            placeholder=""
            className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[14%] bg-transparent text-transparent caret-transparent border-0 outline-none focus:outline-none p-0 m-0 text-center"
            style={{ WebkitAppearance: 'none', appearance: 'none' }}
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
                  className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
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

      {/* Controls — hidden on desktop (md+); also hidden on mobile during intro/attract screens */}
      {!(gameState === 'intro' || gameState === 'attractLocalLeaderboard' || gameState === 'attractGlobalLeaderboard' || gameState === 'attractControls') && (
      <div className="md:hidden w-full shrink-0 overflow-hidden px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] touch-none">
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
          >JUMP</button>
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
            className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
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
