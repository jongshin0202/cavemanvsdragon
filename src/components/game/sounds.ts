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

// Dragon wing flap — cinematic "movie dragon" wingbeat.
// Layers: massive sub-rumble + leathery membrane snap + broad airy whoosh.
export function playWingFlapSound() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const dur = 0.3;

  // ── 1) Big airy whoosh (filtered noise, fast attack, long tail) ──
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    const attack = Math.min(1, t / 0.06);                  // sharp punch
    const release = Math.pow(1 - t, 1.2);                  // long airy fall
    data[i] = (Math.random() * 2 - 1) * attack * release;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3500, now);
  lp.frequency.exponentialRampToValueAtTime(220, now + dur);
  lp.Q.value = 0.7;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 60;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.95, now + 0.05);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(hp); hp.connect(lp); lp.connect(noiseGain); noiseGain.connect(ctx.destination);
  noise.start(now); noise.stop(now + dur);

  // ── 2) Deep sub-rumble = mass of air being moved ──
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(90, now);
  sub.frequency.exponentialRampToValueAtTime(35, now + 0.22);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, now);
  subGain.gain.linearRampToValueAtTime(0.85, now + 0.03);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  sub.connect(subGain); subGain.connect(ctx.destination);
  sub.start(now); sub.stop(now + 0.3);

  // ── 3) Leathery membrane snap (short bandpassed noise crack) ──
  const snapBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  const sd = snapBuf.getChannelData(0);
  for (let i = 0; i < sd.length; i++) {
    const t = i / sd.length;
    sd[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
  }
  const snap = ctx.createBufferSource();
  snap.buffer = snapBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 600;
  bp.Q.value = 2.5;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.55, now + 0.02);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  snap.connect(bp); bp.connect(snapGain); snapGain.connect(ctx.destination);
  snap.start(now + 0.02); snap.stop(now + 0.16);
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

// Fierce Godzilla-style "AAAARRRRGGGHHH" dragon scream — high, screaming
// monster vocal in the mid range (NOT a low growl). Built from a stack of
// detuned sawtooths sweeping HIGH then descending, shaped by an open "AAH"
// vowel formant, with hard distortion (waveshaper) for screaming rasp.
export function playDragonRoarSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;
  const dur = 2.0;

  // Hard-clip waveshaper for screaming distortion
  const makeShaper = (amount: number) => {
    const shaper = ctx.createWaveShaper();
    const samples = 1024;
    const curve = new Float32Array(samples);
    const k = amount;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    return shaper;
  };

  // ----- 1) Screaming larynx: stacked detuned sawtooths -----
  // Pitch contour: starts mid-high (~330 Hz, fierce open scream "AAAA"),
  // wavers, then descends through "RRRGGG" into "HHH" tail.
  const makeSaw = (detune: number, gainVal: number) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = detune;
    o.frequency.setValueAtTime(330, t0);                     // high open AAH
    o.frequency.linearRampToValueAtTime(380, t0 + 0.15);     // peak scream
    o.frequency.linearRampToValueAtTime(290, t0 + 0.6);      // sustain
    o.frequency.linearRampToValueAtTime(180, t0 + dur - 0.2); // descending RRGGHH
    o.frequency.linearRampToValueAtTime(140, t0 + dur);       // HHH tail
    const g = ctx.createGain();
    g.gain.value = gainVal;
    o.connect(g);
    return { o, g };
  };
  const saw1 = makeSaw(-15, 0.45);
  const saw2 = makeSaw(+12, 0.45);
  const saw3 = makeSaw(-30, 0.35);
  const saw4 = makeSaw(+22, 0.35);

  // Pitch vibrato — wide, scary tremor in the scream
  const vib = ctx.createOscillator();
  const vibAmt = ctx.createGain();
  vib.type = 'sine';
  vib.frequency.setValueAtTime(7, t0);
  vib.frequency.linearRampToValueAtTime(13, t0 + dur);
  vibAmt.gain.value = 18;
  vib.connect(vibAmt);
  vibAmt.connect(saw1.o.frequency);
  vibAmt.connect(saw2.o.frequency);
  vibAmt.connect(saw3.o.frequency);
  vibAmt.connect(saw4.o.frequency);

  // ----- 2) Open "AAH" formant filters (Godzilla mouth) -----
  // F1 ~800 Hz (open vowel), F2 ~1400 Hz (bright)
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass'; f1.Q.value = 3;
  f1.frequency.setValueAtTime(900, t0);
  f1.frequency.linearRampToValueAtTime(700, t0 + dur);

  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass'; f2.Q.value = 4;
  f2.frequency.setValueAtTime(1500, t0);
  f2.frequency.linearRampToValueAtTime(1100, t0 + dur);

  // High-shelf boost for screaming brightness
  const bright = ctx.createBiquadFilter();
  bright.type = 'highshelf';
  bright.frequency.value = 2000;
  bright.gain.value = 6;

  // ----- 3) Distortion (the "scream rasp") -----
  const shaper = makeShaper(8);

  // ----- 4) Master amp envelope — INSTANT punchy scream attack -----
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.7, t0 + 0.025); // very fast attack
  amp.gain.setValueAtTime(0.7, t0 + dur - 0.5);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  // Wire signal: saws → sum → distortion → formants → bright → amp → out
  const sumIn = ctx.createGain();
  sumIn.gain.value = 1;
  saw1.g.connect(sumIn);
  saw2.g.connect(sumIn);
  saw3.g.connect(sumIn);
  saw4.g.connect(sumIn);
  sumIn.connect(shaper);
  shaper.connect(f1);
  f1.connect(f2);
  f2.connect(bright);
  bright.connect(amp);
  amp.connect(ctx.destination);

  saw1.o.start(t0); saw1.o.stop(t0 + dur);
  saw2.o.start(t0); saw2.o.stop(t0 + dur);
  saw3.o.start(t0); saw3.o.stop(t0 + dur);
  saw4.o.start(t0); saw4.o.stop(t0 + dur);
  vib.start(t0); vib.stop(t0 + dur);

  // ----- 5) Sub-bass for monster body weight -----
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(80, t0);
  sub.frequency.exponentialRampToValueAtTime(45, t0 + dur);
  subG.gain.setValueAtTime(0.0001, t0);
  subG.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
  subG.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  sub.connect(subG); subG.connect(ctx.destination);
  sub.start(t0); sub.stop(t0 + dur);

  lastRoarEndsAt = t0 + dur;
}

// Backwards-compatible alias — main roar function already updates the tracker.
export const playDragonRoarTracked = playDragonRoarSound;

// Cute digitized girl voice screaming "HEEELP!" — bright, high-pitched
// chiptune-style scream. Two square-wave syllables in the soprano range
// with vibrato + a tiny "p!" pop at the end.
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

  // Per-oscillator gains (square louder = body, triangle = sparkle)
  const sqrG = ctx.createGain();
  const triG = ctx.createGain();
  sqrG.gain.value = 0.28;
  triG.gain.value = 0.10;

  // Master amp envelope — sharp scream attack, long sustain, quick fade
  const env1 = ctx.createGain();
  env1.gain.setValueAtTime(0.0001, t0);
  env1.gain.exponentialRampToValueAtTime(1.0, t0 + 0.04);
  env1.gain.setValueAtTime(1.0, t0 + dur1 - 0.08);
  env1.gain.exponentialRampToValueAtTime(0.001, t0 + dur1);

  // Direct path — the bandpass that was killing the fundamentals is removed
  sqr.connect(sqrG); sqrG.connect(env1);
  tri.connect(triG); triG.connect(env1);
  env1.connect(ctx.destination);

  sqr.start(t0); sqr.stop(t0 + dur1);
  tri.start(t0); tri.stop(t0 + dur1);
  vib.start(t0); vib.stop(t0 + dur1);

  // ===== Syllable 2: "P!" — quick high pop =====
  const t2 = t0 + dur1 + 0.04;
  const dur2 = 0.14;
  const pop = ctx.createOscillator();
  pop.type = 'square';
  pop.frequency.setValueAtTime(1568, t2); // G6
  pop.frequency.exponentialRampToValueAtTime(880, t2 + dur2);
  const popG = ctx.createGain();
  popG.gain.setValueAtTime(0.0001, t2);
  popG.gain.exponentialRampToValueAtTime(0.32, t2 + 0.015);
  popG.gain.exponentialRampToValueAtTime(0.001, t2 + dur2);
  pop.connect(popG); popG.connect(ctx.destination);
  pop.start(t2); pop.stop(t2 + dur2);
}

// Flamethrower / dragon fire-breath burst — heavy low-end roar with crackle.
// 0.5s duration to match the on-screen flame.
export function playFireBreathSound() {
  const ctx = getCtx();
  const t0 = ctx.currentTime;
  const dur = 1.5;

  // ----- 1) Rushing air + flame crackle (filtered noise) -----
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    // envelope: sharp attack, slight sustain, quick decay
    const env = t < 1.0 ? (t < 0.05 ? t / 0.05 : Math.pow(1 - (t - 0.05) / 0.95, 1.2)) : 1;
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(800, t0);
  lp.frequency.exponentialRampToValueAtTime(220, t0 + dur);
  lp.Q.value = 0.8;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 40;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(1.2, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);

  noise.connect(hp); hp.connect(lp); lp.connect(noiseGain); noiseGain.connect(ctx.destination);
  noise.start(t0); noise.stop(t0 + dur);

  // ----- 2) Low-frequency flame "whoosh" (sawtooth sweep) -----
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + dur);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.55, t0);
  oscGain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);
  osc.connect(oscGain); oscGain.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur);

  // ----- 3) Sub rumble for body -----
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(50, t0);
  sub.frequency.exponentialRampToValueAtTime(30, t0 + dur);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.45, t0);
  subGain.gain.exponentialRampToValueAtTime(0.01, t0 + dur);
  sub.connect(subGain); subGain.connect(ctx.destination);
  sub.start(t0); sub.stop(t0 + dur);
}
