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

// Track last roar time so the princess "Help!" doesn't overlap it
let lastRoarEndsAt = 0;
export function isDragonRoaringNow(): boolean {
  const ctx = getCtx();
  return ctx.currentTime < lastRoarEndsAt;
}

// Scary "AAARRRGGGHHH" dragon roar — guttural growl built from a buzzy
// sawtooth larynx tone shaped by vowel-formant bandpass filters, with a
// sub-bass body and a fast vibrato/growl LFO. No breath/swish noise.
export function playDragonRoarSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;
  const dur = 1.8;

  // ----- 1) Larynx tone: detuned sawtooths for a thick, buzzy growl -----
  const makeSaw = (detune: number, gainVal: number) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = detune;
    // Pitch contour: low → slightly lower (the "aaaarrrrgggghhh" descent)
    o.frequency.setValueAtTime(110, t0);
    o.frequency.linearRampToValueAtTime(95, t0 + 0.25);
    o.frequency.linearRampToValueAtTime(70, t0 + dur - 0.1);
    const g = ctx.createGain();
    g.gain.value = gainVal;
    o.connect(g);
    return { o, g };
  };
  const saw1 = makeSaw(-12, 0.5);
  const saw2 = makeSaw(+9, 0.45);
  const saw3 = makeSaw(-25, 0.4);

  // Growl LFO — fast amplitude wobble = "rrrrr" rasp
  const growlLfo = ctx.createOscillator();
  const growlDepth = ctx.createGain();
  growlLfo.type = 'sine';
  growlLfo.frequency.setValueAtTime(28, t0);
  growlLfo.frequency.linearRampToValueAtTime(18, t0 + dur);
  growlDepth.gain.value = 0.35;
  growlLfo.connect(growlDepth);

  // Vowel-formant bandpass chain (open "AAH" → closing "RRGGHH")
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass'; f1.Q.value = 4;
  f1.frequency.setValueAtTime(700, t0);
  f1.frequency.linearRampToValueAtTime(450, t0 + dur);

  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass'; f2.Q.value = 6;
  f2.frequency.setValueAtTime(1200, t0);
  f2.frequency.linearRampToValueAtTime(800, t0 + dur);

  // Master amp envelope — punchy attack, no fade-in swish
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.55, t0 + 0.04);
  amp.gain.setValueAtTime(0.55, t0 + dur - 0.45);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  // LFO modulates the master amp for the rasp
  growlDepth.connect(amp.gain);

  const sumIn = ctx.createGain();
  sumIn.gain.value = 1;
  saw1.g.connect(sumIn);
  saw2.g.connect(sumIn);
  saw3.g.connect(sumIn);
  sumIn.connect(f1);
  f1.connect(f2);
  f2.connect(amp);
  amp.connect(ctx.destination);

  saw1.o.start(t0); saw1.o.stop(t0 + dur);
  saw2.o.start(t0); saw2.o.stop(t0 + dur);
  saw3.o.start(t0); saw3.o.stop(t0 + dur);
  growlLfo.start(t0); growlLfo.stop(t0 + dur);

  // ----- 2) Sub-bass thump for chest weight -----
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(60, t0);
  sub.frequency.exponentialRampToValueAtTime(38, t0 + dur);
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.exponentialRampToValueAtTime(0.4, t0 + 0.05);
  subG.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  sub.connect(subG); subG.connect(ctx.destination);
  sub.start(t0); sub.stop(t0 + dur);

  lastRoarEndsAt = t0 + dur;
}

// Backwards-compatible alias — main roar function already updates the tracker.
export const playDragonRoarTracked = playDragonRoarSound;

// Cute digitized girl voice screaming "HEEELP!" — bright, high-pitched
// chiptune-style scream. Two square-wave syllables in the soprano range
// with vibrato + a tiny "p" pop at the end. No breathy noise tail.
export function playPrincessHelpSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;

  // ===== Syllable 1: "HEEELP" — long, high, scared =====
  const dur1 = 0.55;
  const sqr = ctx.createOscillator();
  const tri = ctx.createOscillator();
  sqr.type = 'square';
  tri.type = 'triangle';
  // Soprano scream: ~A5 (880) → D6 (1175) → C6 (1047)
  sqr.frequency.setValueAtTime(880, t0);
  sqr.frequency.linearRampToValueAtTime(1175, t0 + 0.08);
  sqr.frequency.linearRampToValueAtTime(1047, t0 + dur1 - 0.05);
  tri.frequency.setValueAtTime(1760, t0); // octave above for sparkle
  tri.frequency.linearRampToValueAtTime(2349, t0 + 0.08);
  tri.frequency.linearRampToValueAtTime(2093, t0 + dur1 - 0.05);

  // Fast vibrato — cute warble
  const vib = ctx.createOscillator();
  const vibAmt = ctx.createGain();
  vib.type = 'sine';
  vib.frequency.value = 9;
  vibAmt.gain.value = 35;
  vib.connect(vibAmt);
  vibAmt.connect(sqr.frequency);
  vibAmt.connect(tri.frequency);

  // Bandpass for "voice" formant feel
  const voiceFilt = ctx.createBiquadFilter();
  voiceFilt.type = 'bandpass';
  voiceFilt.Q.value = 2;
  voiceFilt.frequency.value = 1500;

  const sqrG = ctx.createGain();
  const triG = ctx.createGain();
  sqrG.gain.value = 0.18;
  triG.gain.value = 0.07;

  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t0);
  env1.gain.exponentialRampToValueAtTime(1.0, t0 + 0.04);
  env1.gain.setValueAtTime(1.0, t0 + dur1 - 0.08);
  env1.gain.exponentialRampToValueAtTime(0.001, t0 + dur1);

  sqr.connect(sqrG); sqrG.connect(voiceFilt);
  tri.connect(triG); triG.connect(voiceFilt);
  voiceFilt.connect(env1);
  env1.connect(ctx.destination);

  sqr.start(t0); sqr.stop(t0 + dur1);
  tri.start(t0); tri.stop(t0 + dur1);
  vib.start(t0); vib.stop(t0 + dur1);

  // ===== Syllable 2: "P!" — quick high pop =====
  const t2 = t0 + dur1 + 0.04;
  const dur2 = 0.12;
  const pop = ctx.createOscillator();
  pop.type = 'square';
  pop.frequency.setValueAtTime(1568, t2); // G6
  pop.frequency.exponentialRampToValueAtTime(880, t2 + dur2);
  const popG = ctx.createGain();
  popG.gain.setValueAtTime(0.0001, t2);
  popG.gain.exponentialRampToValueAtTime(0.22, t2 + 0.015);
  popG.gain.exponentialRampToValueAtTime(0.001, t2 + dur2);
  pop.connect(popG); popG.connect(ctx.destination);
  pop.start(t2); pop.stop(t2 + dur2);
}
