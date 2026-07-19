// Background music for gameplay. Each level has its own looped track.
// Volume is 1/3 of the game's sound-effect level.
import music1Asset from '@/assets/Gamemusic1.mp3.asset.json';
import music2Asset from '@/assets/Gamemusic2.mp3.asset.json';
import music3Asset from '@/assets/Gamemusic3.mp3.asset.json';
import music4Asset from '@/assets/Gamemusic4.mp3.asset.json';

const VOL = 0.333;

type Track = { url: string; audio: HTMLAudioElement | null };
const tracks: Record<string, Track> = {
  level1: { url: music1Asset.url, audio: null },
  level2: { url: music2Asset.url, audio: null },
  level3: { url: music3Asset.url, audio: null },
  level4: { url: music4Asset.url, audio: null },
};

function getAudio(key: string): HTMLAudioElement {
  const t = tracks[key];
  if (!t.audio) {
    t.audio = new Audio(t.url);
    t.audio.loop = true;
    t.audio.preload = 'auto';
    t.audio.volume = VOL;
  }
  return t.audio;
}

function play(key: string) {
  for (const k of Object.keys(tracks)) if (k !== key) stop(k);
  const a = getAudio(key);
  try {
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch { /* ignore */ }
}

function stop(key: string) {
  const t = tracks[key];
  if (!t.audio) return;
  try {
    t.audio.pause();
    t.audio.currentTime = 0;
  } catch { /* ignore */ }
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
