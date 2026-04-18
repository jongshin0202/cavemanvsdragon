// Web Audio API sound effects generator
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
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
