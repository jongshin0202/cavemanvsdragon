// Background music for Level 1. Loops while L1 plays; stops on princess touch,
// death, or leaving the level. Volume is 1/3 of the game's sound-effect level.
import musicAsset from '@/assets/Gamemusic1.mp3.asset.json';

let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(musicAsset.url);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.333; // ~1/3 of full effect volume
  }
  return audio;
}

export function playLevel1Music() {
  const a = getAudio();
  try {
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch { /* ignore */ }
}

export function stopLevel1Music() {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch { /* ignore */ }
}
