// Background music for gameplay. Each level has its own looped track.
// Volume is 1/3 of the game's sound-effect level.
// Uses a dual-audio crossfade at the loop boundary so the end blends
// smoothly into the beginning and feels continuous.
import music1Asset from '@/assets/Gamemusic1.mp3.asset.json';
import music2Asset from '@/assets/Gamemusic2.mp3.asset.json';
import music3Asset from '@/assets/Gamemusic3.mp3.asset.json';
import music4Asset from '@/assets/Gamemusic4.mp3.asset.json';

const VOL = 0.333;
// Default length of the tail/head crossfade in seconds.
const DEFAULT_CROSSFADE_SEC = 1.5;
// Per-track overrides. Level 2 and 3 use browser-native gapless loop
// (crossfadeSec = 0 → nativeLoop) because a manual crossfade between two
// different musical sections in those tracks sounds like overlap. Native
// loop restarts the same file seamlessly at the end.
const CROSSFADE_OVERRIDES: Record<string, number> = {
  level2: 0,
  level3: 0,
};
// Fade tick interval (ms).
const FADE_TICK_MS = 30;

type Track = {
  url: string;
  a?: HTMLAudioElement;
  b?: HTMLAudioElement;
  active?: HTMLAudioElement;
  playing: boolean;
  fadeTimer?: number;
  watchTimer?: number;
  crossfadeSec: number;
};

const tracks: Record<string, Track> = {
  level1: { url: music1Asset.url, playing: false, crossfadeSec: DEFAULT_CROSSFADE_SEC },
  level2: { url: music2Asset.url, playing: false, crossfadeSec: CROSSFADE_OVERRIDES.level2 },
  level3: { url: music3Asset.url, playing: false, crossfadeSec: CROSSFADE_OVERRIDES.level3 },
  level4: { url: music4Asset.url, playing: false, crossfadeSec: DEFAULT_CROSSFADE_SEC },
};


function makeAudio(url: string, nativeLoop = false): HTMLAudioElement {
  const el = new Audio(url);
  el.loop = nativeLoop; // browser gapless loop when true
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
    // Equal-power crossfade
    const outV = Math.cos((p * Math.PI) / 2) * VOL;
    const inV = Math.sin((p * Math.PI) / 2) * VOL;
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
  if (t.crossfadeSec <= 0) return; // native loop, no watcher needed
  t.watchTimer = window.setInterval(() => {
    if (!t.playing || !t.active) return;
    const el = t.active;
    const dur = el.duration;
    if (!isFinite(dur) || dur <= 0) return;
    const remaining = dur - el.currentTime;
    // Trigger crossfade once we're inside the tail window and no fade in progress.
    if (remaining <= t.crossfadeSec + 0.05 && !t.fadeTimer) {
      startCrossfade(t);
    }
  }, 100);
}

function play(key: string) {
  for (const k of Object.keys(tracks)) if (k !== key) stop(k);
  const t = tracks[key];
  const useNativeLoop = t.crossfadeSec <= 0;
  if (!t.a) t.a = makeAudio(t.url, useNativeLoop);
  if (!t.b && !useNativeLoop) t.b = makeAudio(t.url, false);
  clearTimers(t);
  // Reset both
  try { t.a.pause(); t.a.currentTime = 0; t.a.volume = VOL; } catch { /* ignore */ }
  if (t.b) { try { t.b.pause(); t.b.currentTime = 0; t.b.volume = 0; } catch { /* ignore */ } }
  t.active = t.a;
  t.playing = true;
  try { void t.a.play().catch(() => {}); } catch { /* ignore */ }
  watch(t);
}

function stop(key: string) {
  const t = tracks[key];
  if (!t) return;
  t.playing = false;
  clearTimers(t);
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

export function stopAllMusic() {
  for (const k of Object.keys(tracks)) stop(k);
}
