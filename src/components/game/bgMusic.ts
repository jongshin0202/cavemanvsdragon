// Background music for gameplay. Each level has its own looped track.
// Volume is 1/3 of the game's sound-effect level.
//
// Two loop strategies:
//  - Crossfade (level1, level4): dual HTMLAudio elements with an equal-power
//    tail/head crossfade so the end blends smoothly into the beginning.
//  - Gapless Web Audio loop (level2, level3): the MP3 is decoded once into
//    an AudioBuffer and played through an AudioBufferSourceNode with
//    loop=true. This bypasses MP3 encoder delay/padding entirely, so there
//    is NO silence gap when the track wraps back to the start.
import music1Asset from '@/assets/Gamemusic1.mp3.asset.json';
import music2Asset from '@/assets/Gamemusic2.mp3.asset.json';
import music3Asset from '@/assets/Gamemusic3.mp3.asset.json';
import music4Asset from '@/assets/Gamemusic4.mp3.asset.json';
import musicEndingAsset from '@/assets/Gamemusic_Ending.mp3.asset.json';

const VOL = 0.333;
// Default length of the tail/head crossfade in seconds.
const DEFAULT_CROSSFADE_SEC = 1.5;
// Per-track overrides. Level 2 and 3 use a gapless Web Audio loop
// (crossfadeSec = 0) because a manual crossfade between two different
// musical sections in those tracks sounds like overlap.
const CROSSFADE_OVERRIDES: Record<string, number> = {
  level2: 0,
  level3: 0,
};
// Fade tick interval (ms).
const FADE_TICK_MS = 30;

type Track = {
  url: string;
  // HTMLAudio-based crossfade path
  a?: HTMLAudioElement;
  b?: HTMLAudioElement;
  active?: HTMLAudioElement;
  fadeTimer?: number;
  watchTimer?: number;
  // Web Audio gapless-loop path
  buffer?: AudioBuffer;
  bufferLoading?: Promise<AudioBuffer | null>;
  source?: AudioBufferSourceNode;
  gain?: GainNode;
  playing: boolean;
  crossfadeSec: number;
  volume?: number;
  htmlNativeLoop?: boolean;
};

const tracks: Record<string, Track> = {
  level1: { url: music1Asset.url, playing: false, crossfadeSec: DEFAULT_CROSSFADE_SEC, volume: VOL },
  level2: { url: music2Asset.url, playing: false, crossfadeSec: CROSSFADE_OVERRIDES.level2, volume: 0.238, htmlNativeLoop: true },
  level3: { url: music3Asset.url, playing: false, crossfadeSec: CROSSFADE_OVERRIDES.level3, volume: 0.258, htmlNativeLoop: true },
  level4: { url: music4Asset.url, playing: false, crossfadeSec: DEFAULT_CROSSFADE_SEC, volume: 0.217 },
  ending: { url: musicEndingAsset.url, playing: false, crossfadeSec: DEFAULT_CROSSFADE_SEC, volume: 0.311 },
};

// -------- Web Audio (gapless loop) --------

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

async function loadBuffer(t: Track): Promise<AudioBuffer | null> {
  if (t.buffer) return t.buffer;
  if (t.bufferLoading) return t.bufferLoading;
  const ctx = getCtx();
  if (!ctx) return null;
  t.bufferLoading = (async () => {
    try {
      const res = await fetch(t.url);
      const arr = await res.arrayBuffer();
      const buf: AudioBuffer = await new Promise((resolve, reject) => {
        // Use callback form for widest browser support.
        ctx.decodeAudioData(arr, resolve, reject);
      });
      t.buffer = buf;
      return buf;
    } catch {
      return null;
    } finally {
      t.bufferLoading = undefined;
    }
  })();
  return t.bufferLoading;
}

function stopWebAudio(t: Track) {
  if (t.source) {
    try { t.source.stop(); } catch { /* ignore */ }
    try { t.source.disconnect(); } catch { /* ignore */ }
    t.source = undefined;
  }
  if (t.gain) {
    try { t.gain.disconnect(); } catch { /* ignore */ }
    t.gain = undefined;
  }
}

function startWebAudioLoop(t: Track) {
  const ctx = getCtx();
  if (!ctx || !t.buffer) return;
  // Some browsers start the context in "suspended" state until a user gesture.
  if (ctx.state === 'suspended') {
    try { void ctx.resume(); } catch { /* ignore */ }
  }
  stopWebAudio(t);
  const src = ctx.createBufferSource();
  src.buffer = t.buffer;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = t.buffer.duration; // full-file gapless loop
  const gain = ctx.createGain();
  gain.gain.value = t.volume ?? VOL;
  src.connect(gain).connect(ctx.destination);
  src.start(0);
  t.source = src;
  t.gain = gain;
}

// -------- HTMLAudio (crossfade) --------

function makeAudio(url: string): HTMLAudioElement {
  const el = new Audio(url);
  el.loop = false;
  el.preload = 'auto';
  el.volume = 0;
  return el;
}

function clearTimers(t: Track) {
  if (t.fadeTimer) { clearInterval(t.fadeTimer); t.fadeTimer = undefined; }
  if (t.watchTimer) { clearInterval(t.watchTimer); t.watchTimer = undefined; }
}

function startCrossfade(t: Track) {
  const from = t.active;
  const next = from === t.a ? t.b! : t.a!;
  if (!from || !next) return;
  try {
    next.currentTime = 0;
    next.volume = 0;
    void next.play().catch(() => {});
  } catch { /* ignore */ }
  t.active = next;

  const startAt = performance.now();
  if (t.fadeTimer) clearInterval(t.fadeTimer);
  const cf = t.crossfadeSec;
  t.fadeTimer = window.setInterval(() => {
    const elapsed = (performance.now() - startAt) / 1000;
    const p = Math.min(1, elapsed / cf);
    const tv = t.volume ?? VOL;
    const outV = Math.cos((p * Math.PI) / 2) * tv;
    const inV = Math.sin((p * Math.PI) / 2) * tv;
    try { from.volume = Math.max(0, outV); } catch { /* ignore */ }
    try { next.volume = Math.max(0, inV); } catch { /* ignore */ }
    if (p >= 1) {
      try { from.pause(); from.currentTime = 0; } catch { /* ignore */ }
      if (t.fadeTimer) { clearInterval(t.fadeTimer); t.fadeTimer = undefined; }
    }
  }, FADE_TICK_MS);
}

function watch(t: Track) {
  if (t.watchTimer) clearInterval(t.watchTimer);
  if (t.crossfadeSec <= 0) return;
  t.watchTimer = window.setInterval(() => {
    if (!t.playing || !t.active) return;
    const el = t.active;
    const dur = el.duration;
    if (!isFinite(dur) || dur <= 0) return;
    const remaining = dur - el.currentTime;
    if (remaining <= t.crossfadeSec + 0.05 && !t.fadeTimer) {
      startCrossfade(t);
    }
  }, 100);
}

// -------- Public control --------

function play(key: string) {
  for (const k of Object.keys(tracks)) if (k !== key) stop(k);
  const t = tracks[key];
  t.playing = true;

  if (t.htmlNativeLoop) {
    // Preserve the native stereo image for Level 2/3 in both browsers and
    // Android WebView by keeping every BGM track on an HTMLAudio path.
    stopWebAudio(t);
    clearTimers(t);
    if (!t.a) t.a = makeAudio(t.url);
    try {
      t.a.pause();
      t.a.currentTime = 0;
      t.a.loop = true;
      t.a.volume = t.volume ?? VOL;
      t.active = t.a;
      void t.a.play().catch(() => {});
    } catch { /* ignore */ }
    return;
  }

  if (t.crossfadeSec <= 0) {
    // Gapless Web Audio path
    const ctx = getCtx();
    if (!ctx) return;
    if (t.buffer) {
      startWebAudioLoop(t);
    } else {
      void loadBuffer(t).then((buf) => {
        if (buf && t.playing) startWebAudioLoop(t);
      });
    }
    return;
  }

  // Crossfade path
  if (!t.a) t.a = makeAudio(t.url);
  if (!t.b) t.b = makeAudio(t.url);
  clearTimers(t);
  try { t.a.pause(); t.a.currentTime = 0; t.a.volume = t.volume ?? VOL; } catch { /* ignore */ }
  try { t.b.pause(); t.b.currentTime = 0; t.b.volume = 0; } catch { /* ignore */ }
  t.active = t.a;
  try { void t.a.play().catch(() => {}); } catch { /* ignore */ }
  watch(t);
}

function stop(key: string) {
  const t = tracks[key];
  if (!t) return;
  t.playing = false;
  clearTimers(t);
  stopWebAudio(t);
  for (const el of [t.a, t.b]) {
    if (!el) continue;
    try { el.pause(); el.currentTime = 0; el.volume = 0; } catch { /* ignore */ }
  }
  t.active = undefined;
}

export const playLevel1Music = () => play('level1');
export const stopLevel1Music = () => stop('level1');
export const playLevel2Music = () => play('level2');
export const stopLevel2Music = () => stop('level2');
export const playLevel3Music = () => play('level3');
export const stopLevel3Music = () => stop('level3');
export const playLevel4Music = () => play('level4');
export const stopLevel4Music = () => stop('level4');
export const playEndingMusic = () => play('ending');
export const stopEndingMusic = () => stop('ending');

type BrowserPauseMusicSnapshot = {
  playingElements: HTMLAudioElement[];
  active?: HTMLAudioElement;
  fadeProgress: number | null;
};

const browserMusicSnapshots = new Map<string, BrowserPauseMusicSnapshot>();
let browserMusicPaused = false;
let browserMusicContextWasRunning = false;

export async function pauseBrowserMusic(): Promise<void> {
  if (browserMusicPaused) return;
  browserMusicPaused = true;
  browserMusicSnapshots.clear();

  browserMusicContextWasRunning = !!audioCtx && audioCtx.state === 'running';
  if (browserMusicContextWasRunning && audioCtx) {
    try { await audioCtx.suspend(); } catch { /* ignore */ }
  }

  for (const [key, track] of Object.entries(tracks)) {
    if (!track.playing) continue;
    const elements = [track.a, track.b].filter(
      (element): element is HTMLAudioElement => Boolean(element),
    );
    const playingElements = elements.filter((element) => !element.paused);

    let fadeProgress: number | null = null;
    if (
      track.fadeTimer &&
      track.active &&
      track.crossfadeSec > 0 &&
      playingElements.length > 1
    ) {
      const targetVolume = track.volume ?? VOL;
      if (targetVolume > 0) {
        const ratio = Math.max(0, Math.min(1, track.active.volume / targetVolume));
        fadeProgress = (2 / Math.PI) * Math.asin(ratio);
      }
    }

    browserMusicSnapshots.set(key, {
      playingElements,
      active: track.active,
      fadeProgress,
    });

    clearTimers(track);
    for (const element of playingElements) {
      try { element.pause(); } catch { /* ignore */ }
    }
  }
}

export async function resumeBrowserMusic(): Promise<void> {
  if (!browserMusicPaused) return;
  browserMusicPaused = false;

  if (browserMusicContextWasRunning && audioCtx?.state === 'suspended') {
    try { await audioCtx.resume(); } catch { /* ignore */ }
  }
  browserMusicContextWasRunning = false;

  for (const [key, snapshot] of browserMusicSnapshots.entries()) {
    const track = tracks[key];
    if (!track?.playing) continue;

    for (const element of snapshot.playingElements) {
      try { void element.play().catch(() => {}); } catch { /* ignore */ }
    }

    if (
      snapshot.fadeProgress !== null &&
      snapshot.active &&
      track.crossfadeSec > 0 &&
      snapshot.playingElements.length > 1
    ) {
      const incoming = snapshot.active;
      const outgoing = incoming === track.a ? track.b : track.a;
      const startProgress = Math.max(0, Math.min(1, snapshot.fadeProgress));
      const startAt = performance.now();
      const targetVolume = track.volume ?? VOL;
      track.active = incoming;

      track.fadeTimer = window.setInterval(() => {
        const elapsed = (performance.now() - startAt) / 1000;
        const progress = Math.min(1, startProgress + elapsed / track.crossfadeSec);
        const outgoingVolume = Math.cos((progress * Math.PI) / 2) * targetVolume;
        const incomingVolume = Math.sin((progress * Math.PI) / 2) * targetVolume;

        try { incoming.volume = Math.max(0, incomingVolume); } catch { /* ignore */ }
        if (outgoing) {
          try { outgoing.volume = Math.max(0, outgoingVolume); } catch { /* ignore */ }
        }

        if (progress >= 1) {
          if (outgoing) {
            try {
              outgoing.pause();
              outgoing.currentTime = 0;
              outgoing.volume = 0;
            } catch { /* ignore */ }
          }
          if (track.fadeTimer) {
            clearInterval(track.fadeTimer);
            track.fadeTimer = undefined;
          }
          watch(track);
        }
      }, FADE_TICK_MS);
    } else {
      watch(track);
    }
  }

  browserMusicSnapshots.clear();
}

export function stopAllMusic() {
  for (const k of Object.keys(tracks)) stop(k);
}
