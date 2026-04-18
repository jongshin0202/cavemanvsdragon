// Web Audio API sound effects generator
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

// Call after a user gesture to unlock audio (browsers block autoplay otherwise).
export function unlockAudio() {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function playJumpSound() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

export function playBarrelRollSound() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

export function playGameOverSound() {
  const ctx = getCtx();
  const notes = [400, 350, 300, 200];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.19);
    osc.start(ctx.currentTime + i * 0.2);
    osc.stop(ctx.currentTime + i * 0.2 + 0.2);
  });
}

export function playWinSound() {
  const ctx = getCtx();
  const notes = [262, 330, 392, 523];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.14);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.15);
  });
}

export function playHitSound() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

export function playRobotKillSound() {
  const ctx = getCtx();
  const notes = [800, 1200];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.09);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.1);
  });
}

// Sparkly ascending jingle when the player grabs the key
export function playKeyGrabSound() {
  const ctx = getCtx();
  const notes = [880, 1175, 1568, 2093]; // A5, D6, G6, C7
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    const t = ctx.currentTime + i * 0.07;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}

// Soft watering / sprout sound when the vine starts growing
export function playWaterSproutSound() {
  const ctx = getCtx();
  // Noise burst (water trickle)
  const bufferSize = ctx.sampleRate * 0.6;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // Filtered noise that fades in then out
    const env = Math.sin((i / bufferSize) * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env * 0.4;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.12, ctx.currentTime);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, ctx.currentTime);
  filter.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.6);
  filter.Q.value = 4;
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 0.6);

  // Bubbly rising tone (sprout growing)
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime + 0.05);
  osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.55);
  oscGain.gain.setValueAtTime(0.08, ctx.currentTime + 0.05);
  oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
  osc.start(ctx.currentTime + 0.05);
  osc.stop(ctx.currentTime + 0.6);
}

// Magical "genie out of the bottle" happy jingle when the watering can appears
export function playGenieAppearSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;

  // 1) Whoosh / shimmer (filtered noise sweep) — "poof" of smoke
  const bufferSize = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const env = Math.sin((i / bufferSize) * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.Q.value = 6;
  noiseFilter.frequency.setValueAtTime(600, t0);
  noiseFilter.frequency.exponentialRampToValueAtTime(4000, t0 + 0.4);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.18, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(t0);
  noise.stop(t0 + 0.5);

  // 2) Sparkly ascending arpeggio (C major — bright, magical)
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    const t = t0 + 0.08 + i * 0.07;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    osc.start(t);
    osc.stop(t + 0.24);
  });

  // 3) Final glittery chime on top
  const chime = ctx.createOscillator();
  const chimeGain = ctx.createGain();
  chime.connect(chimeGain);
  chimeGain.connect(ctx.destination);
  chime.type = 'sine';
  const tc = t0 + 0.5;
  chime.frequency.setValueAtTime(2093, tc); // C7
  chimeGain.gain.setValueAtTime(0.14, tc);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, tc + 0.5);
  chime.start(tc);
  chime.stop(tc + 0.55);
}

// Cheerful "princess saved" fanfare — distinct from the genie jingle.
// Major triad fanfare with a celebratory final chord.
export function playPrincessSavedSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;

  // Quick rising fanfare melody (G major): G5 B5 D6 G6
  const melody = [783.99, 987.77, 1174.66, 1567.98];
  melody.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    const t = t0 + i * 0.11;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.13, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
  });

  // Final celebratory G-major chord (G5 + B5 + D6) held briefly
  const chordT = t0 + 0.55;
  const chord = [783.99, 987.77, 1174.66];
  chord.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, chordT);
    gain.gain.setValueAtTime(0.10, chordT);
    gain.gain.exponentialRampToValueAtTime(0.01, chordT + 0.55);
    osc.start(chordT);
    osc.stop(chordT + 0.6);
  });

  // Sparkle on top
  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();
  sparkle.connect(sparkleGain);
  sparkleGain.connect(ctx.destination);
  sparkle.type = 'sine';
  const ts = t0 + 0.55;
  sparkle.frequency.setValueAtTime(2349.32, ts); // D7
  sparkleGain.gain.setValueAtTime(0.10, ts);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, ts + 0.5);
  sparkle.start(ts);
  sparkle.stop(ts + 0.55);
}

// Magical growing-vine sound — soft creak + rising bubbly tones over ~1.1s
export function playVineGrowSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;
  const dur = 1.1;

  // Filtered pink-ish noise (organic creak/rustle)
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const env = Math.sin((i / bufferSize) * Math.PI);
    const white = Math.random() * 2 - 1;
    last = 0.92 * last + 0.08 * white; // low-passed noise
    data[i] = last * env;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(400, t0);
  filter.frequency.exponentialRampToValueAtTime(1600, t0 + dur);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.10, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(t0);
  noise.stop(t0 + dur);

  // Rising bubbly arpeggio (the vine "stretching upward")
  const notes = [220, 277, 330, 392, 466, 587, 698, 880]; // A3 → A5 ladder
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const t = t0 + i * (dur / notes.length);
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.05, t + 0.18);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    osc.start(t);
    osc.stop(t + 0.24);
  });

  // Final bright "bloom" chime
  const chime = ctx.createOscillator();
  const cg = ctx.createGain();
  chime.connect(cg);
  cg.connect(ctx.destination);
  chime.type = 'triangle';
  const tc = t0 + dur - 0.05;
  chime.frequency.setValueAtTime(1318.5, tc); // E6
  cg.gain.setValueAtTime(0.12, tc);
  cg.gain.exponentialRampToValueAtTime(0.001, tc + 0.45);
  chime.start(tc);
  chime.stop(tc + 0.5);
}

// Realistic dragon roar — heavy breath in, deep guttural growl, breath-out tail.
// Built from layered noise sources shaped by formant-style filters (no chip-tune oscillators).
export function playDragonRoarSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;
  const dur = 2.2;
  const sr = ctx.sampleRate;

  // ----- Helper: build a noise buffer with a custom envelope -----
  const buildNoise = (length: number, envFn: (i: number, n: number) => number) => {
    const n = Math.floor(sr * length);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      // Brown-ish noise (integrated white noise) — sounds far more "throaty" than white
      const w = Math.random() * 2 - 1;
      last = (last + 0.18 * w) / 1.05;
      d[i] = last * envFn(i, n);
    }
    return buf;
  };

  // ----- 1) Quick inhale (breath in) -----
  const inhaleDur = 0.25;
  const inhale = buildNoise(inhaleDur, (i, n) => {
    const x = i / n;
    return Math.sin(x * Math.PI) * 0.7;
  });
  const inS = ctx.createBufferSource(); inS.buffer = inhale;
  const inF = ctx.createBiquadFilter();
  inF.type = 'highpass'; inF.frequency.value = 800; inF.Q.value = 0.7;
  const inG = ctx.createGain();
  inG.gain.setValueAtTime(0.18, t0);
  inG.gain.exponentialRampToValueAtTime(0.001, t0 + inhaleDur);
  inS.connect(inF); inF.connect(inG); inG.connect(ctx.destination);
  inS.start(t0); inS.stop(t0 + inhaleDur);

  // ----- 2) Main growl body (1.6s) — TWO parallel formant bands of brown noise -----
  const growlStart = t0 + inhaleDur;
  const growlDur = 1.6;
  const growlBuf = buildNoise(growlDur, (i, n) => {
    const x = i / n;
    // Attack-sustain-release envelope shaped like a roar
    const attack = Math.min(1, x / 0.08);
    const release = Math.min(1, (1 - x) / 0.25);
    return attack * release;
  });

  // Low formant (chest rumble) ~120 Hz
  const lowSrc = ctx.createBufferSource(); lowSrc.buffer = growlBuf;
  const lowF = ctx.createBiquadFilter();
  lowF.type = 'bandpass'; lowF.Q.value = 4;
  lowF.frequency.setValueAtTime(140, growlStart);
  lowF.frequency.linearRampToValueAtTime(95, growlStart + growlDur);
  const lowG = ctx.createGain();
  lowG.gain.setValueAtTime(0.55, growlStart);
  lowG.gain.exponentialRampToValueAtTime(0.001, growlStart + growlDur);
  lowSrc.connect(lowF); lowF.connect(lowG); lowG.connect(ctx.destination);

  // Mid formant (throat snarl) ~450 Hz with slow LFO sweep for "growl waver"
  const midSrc = ctx.createBufferSource(); midSrc.buffer = growlBuf;
  const midF = ctx.createBiquadFilter();
  midF.type = 'bandpass'; midF.Q.value = 6;
  midF.frequency.setValueAtTime(480, growlStart);
  // Wobble the formant frequency to create vocal "growl" texture
  const lfo = ctx.createOscillator();
  const lfoG = ctx.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 11;
  lfoG.gain.value = 90;
  lfo.connect(lfoG); lfoG.connect(midF.frequency);
  const midG = ctx.createGain();
  midG.gain.setValueAtTime(0.32, growlStart);
  midG.gain.exponentialRampToValueAtTime(0.001, growlStart + growlDur);
  midSrc.connect(midF); midF.connect(midG); midG.connect(ctx.destination);

  // High formant (raspy edge) ~1.6 kHz
  const hiSrc = ctx.createBufferSource(); hiSrc.buffer = growlBuf;
  const hiF = ctx.createBiquadFilter();
  hiF.type = 'bandpass'; hiF.Q.value = 3;
  hiF.frequency.setValueAtTime(1700, growlStart);
  hiF.frequency.linearRampToValueAtTime(1100, growlStart + growlDur);
  const hiG = ctx.createGain();
  hiG.gain.setValueAtTime(0.16, growlStart);
  hiG.gain.exponentialRampToValueAtTime(0.001, growlStart + growlDur);
  hiSrc.connect(hiF); hiF.connect(hiG); hiG.connect(ctx.destination);

  // Master compressor-like soft limiter via slight gain
  lowSrc.start(growlStart); lowSrc.stop(growlStart + growlDur);
  midSrc.start(growlStart); midSrc.stop(growlStart + growlDur);
  hiSrc.start(growlStart); hiSrc.stop(growlStart + growlDur);
  lfo.start(growlStart); lfo.stop(growlStart + growlDur);

  // ----- 3) Sub-bass body thump (gives the chest weight) -----
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(75, growlStart);
  sub.frequency.exponentialRampToValueAtTime(45, growlStart + growlDur);
  subG.gain.setValueAtTime(0.0001, growlStart);
  subG.gain.exponentialRampToValueAtTime(0.35, growlStart + 0.1);
  subG.gain.exponentialRampToValueAtTime(0.001, growlStart + growlDur);
  sub.connect(subG); subG.connect(ctx.destination);
  sub.start(growlStart); sub.stop(growlStart + growlDur);

  // ----- 4) Breath-out tail -----
  const tailStart = growlStart + growlDur - 0.05;
  const tailDur = 0.35;
  const tailBuf = buildNoise(tailDur, (i, n) => {
    const x = i / n;
    return (1 - x) * 0.6;
  });
  const tailSrc = ctx.createBufferSource(); tailSrc.buffer = tailBuf;
  const tailF = ctx.createBiquadFilter();
  tailF.type = 'lowpass'; tailF.frequency.value = 900;
  const tailG = ctx.createGain();
  tailG.gain.setValueAtTime(0.18, tailStart);
  tailG.gain.exponentialRampToValueAtTime(0.001, tailStart + tailDur);
  tailSrc.connect(tailF); tailF.connect(tailG); tailG.connect(ctx.destination);
  tailSrc.start(tailStart); tailSrc.stop(tailStart + tailDur);

  // Update tracker so princess "Help!" doesn't overlap (length = full effect)
  lastRoarEndsAt = t0 + dur;
}

// Track last roar time so the princess "Help!" doesn't overlap it
let lastRoarEndsAt = 0;
const _origRoar = playDragonRoarSound;
export function isDragonRoaringNow(): boolean {
  const ctx = getCtx();
  return ctx.currentTime < lastRoarEndsAt;
}
// Wrap roar to record when it ends (≈1.4s duration)
export function playDragonRoarTracked() {
  const ctx = getCtx();
  lastRoarEndsAt = ctx.currentTime + 1.4;
  _origRoar();
}

// Princess yelling "Help!" — short cry built from formant-shaped tones
export function playPrincessHelpSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;

  // "Heeeelp!" — two-syllable rising-then-falling voice
  // Syllable 1 (longer "heeel"): pitch rises, then quick fall
  const v1 = ctx.createOscillator();
  const v1Gain = ctx.createGain();
  const v1Filt = ctx.createBiquadFilter();
  v1Filt.type = 'bandpass';
  v1Filt.Q.value = 6;
  v1Filt.frequency.setValueAtTime(900, t0);
  v1Filt.frequency.linearRampToValueAtTime(1200, t0 + 0.35);
  v1.type = 'sawtooth';
  v1.frequency.setValueAtTime(620, t0);
  v1.frequency.linearRampToValueAtTime(820, t0 + 0.25);
  v1.frequency.linearRampToValueAtTime(700, t0 + 0.4);
  // Vibrato for vocal feel
  const lfo1 = ctx.createOscillator();
  const lfo1g = ctx.createGain();
  lfo1.frequency.setValueAtTime(7, t0);
  lfo1g.gain.setValueAtTime(20, t0);
  lfo1.connect(lfo1g); lfo1g.connect(v1.frequency);
  v1Gain.gain.setValueAtTime(0.0001, t0);
  v1Gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
  v1Gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.35);
  v1Gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
  v1.connect(v1Filt); v1Filt.connect(v1Gain); v1Gain.connect(ctx.destination);
  v1.start(t0); lfo1.start(t0);
  v1.stop(t0 + 0.45); lfo1.stop(t0 + 0.45);

  // Syllable 2 ("p!" cutoff) — quick high chirp
  const t2 = t0 + 0.5;
  const v2 = ctx.createOscillator();
  const v2Gain = ctx.createGain();
  const v2Filt = ctx.createBiquadFilter();
  v2Filt.type = 'bandpass';
  v2Filt.Q.value = 8;
  v2Filt.frequency.setValueAtTime(1500, t2);
  v2.type = 'sawtooth';
  v2.frequency.setValueAtTime(900, t2);
  v2.frequency.exponentialRampToValueAtTime(550, t2 + 0.18);
  v2Gain.gain.setValueAtTime(0.0001, t2);
  v2Gain.gain.exponentialRampToValueAtTime(0.20, t2 + 0.03);
  v2Gain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.22);
  v2.connect(v2Filt); v2Filt.connect(v2Gain); v2Gain.connect(ctx.destination);
  v2.start(t2);
  v2.stop(t2 + 0.22);

  // Tiny breath of noise (consonant / sibilance)
  const dur = 0.08;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const env = Math.sin((i / bufSize) * Math.PI);
    data[i] = (Math.random() * 2 - 1) * env * 0.6;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nf = ctx.createBiquadFilter();
  nf.type = 'highpass'; nf.frequency.value = 2500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.08, t2 + 0.2);
  ng.gain.exponentialRampToValueAtTime(0.001, t2 + 0.3);
  noise.connect(nf); nf.connect(ng); ng.connect(ctx.destination);
  noise.start(t2 + 0.2);
  noise.stop(t2 + 0.3);
}
