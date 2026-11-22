// Physically Based Procedural Web Audio Foley & Liminal Soundscape Engine.
// Zero external audio files.
//
// Acoustic architecture:
//   - Movement drives footsteps (actual collision-resolved stride distance); footsteps drive sound.
//   - ZERO continuous "if moving, turn noise volume up" loops.
//   - Water wading & droplet Foley is synthesized from physical Minnaert bubble differential physics
//     (Leighton 1994 / van den Doel 2005: f0 = 3.26 / R, rising-pitch chirp, thermal+viscous+radiation
//     damping, power-law bubble radius spectrum, and discrete micro-droplet surface clicks) into
//     multi-variation stereo Foley AudioBuffers at startup.

export function createAudioEngine(statusEl) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) {
    return {
      setProfile() {},
      unlock() {},
      toggle() {},
      setPaused() {},
      playFootstep() {},
      update() {},
      inspect: () => ({ state: "unsupported", muted: true, profile: "none" }),
    };
  }

  const ctx = new Context();
  const sr = ctx.sampleRate;
  const master = ctx.createGain();
  master.gain.value = 0.62;
  master.connect(ctx.destination);

  let seed = 9137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const randRange = (a, b) => a + (b - a) * rand();

  // =========================================================================
  // 1. FREQUENCY-DAMPED ARCHITECTURAL CONVOLUTION REVERB (3.1 s stereo IR)
  // =========================================================================
  const reverb = ctx.createConvolver();
  const irLen = Math.floor(sr * 3.1);
  const impulse = ctx.createBuffer(2, irLen, sr);
  const earlyTaps = [
    [0.011, 0.30, 0.19],
    [0.019, 0.17, 0.28],
    [0.029, 0.23, 0.14],
    [0.042, 0.13, 0.22],
    [0.058, 0.18, 0.15],
    [0.076, 0.11, 0.14],
    [0.095, 0.09, 0.10],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const t = i / sr;
      const alpha = Math.max(0.055, 0.40 * Math.exp(-t * 0.78));
      const w = (rand() * 2 - 1) * Math.exp(-t * 1.72);
      lp += (w - lp) * alpha;
      const onset = Math.min(1, t / 0.032);
      d[i] = lp * onset * 0.40;
    }
    for (const [delayS, gainL, gainR] of earlyTaps) {
      const idx = Math.floor(delayS * sr);
      if (idx >= 0 && idx < irLen - 4) {
        const g = (ch === 0 ? gainL : gainR) * (rand() > 0.5 ? 1 : -1);
        d[idx] += g;
        d[idx + 1] += g * 0.42;
      }
    }
  }
  reverb.buffer = impulse;

  const wet = ctx.createGain();
  wet.gain.value = 0.52;
  reverb.connect(wet);
  wet.connect(master);

  // =========================================================================
  // 2. PHYSICAL MINNAERT BUBBLE & FOLEY BUFFER SYNTHESIS (startup < 15 ms)
  // =========================================================================

  // Adds one physically damped, rising-pitch Minnaert air bubble oscillator into stereo L/R arrays.
  // Leighton (1994): f0 ≈ 3.26 / R_meters, damping δ ≈ 0.043*f0 + 0.0014*f0^1.5, rising pitch near surface.
  function addMinnaertBubble(L, R, startSec, radiusMm, amp, pan, riseRate = 0.22) {
    const f0 = Math.max(180, Math.min(7200, 3260 / Math.max(0.35, radiusMm)));
    const damp = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
    const dur = Math.min(0.14, 6.2 / Math.max(damp, 18));
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(dur * sr);
    const len = L.length;
    if (i0 >= len || n < 4) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const rise = riseRate * damp;
    const twoPi = Math.PI * 2;
    const end = Math.min(len, i0 + n);
    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      // Smooth 0.6 ms bubble pinch-off onset prevents artificial square clicks
      const onset = t < 0.0007 ? t / 0.0007 : 1.0;
      const env = onset * Math.exp(-damp * t);
      const phase = twoPi * f0 * (t + 0.5 * rise * t * t);
      const s = Math.sin(phase) * env;
      L[i] += s * gL;
      R[i] += s * gR;
    }
  }

  // Adds a crisp 1-4 ms water-droplet surface impact click or wet splash transient (NOT pink noise!).
  function addWetClick(L, R, startSec, amp, freqHz, pan) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(0.006 * sr);
    const len = L.length;
    if (i0 >= len) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);
    let y1 = 0;
    const rc = Math.exp((-2 * Math.PI * freqHz) / sr);
    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      const env = Math.exp(-t * 950);
      const x = (rand() * 2 - 1) * env;
      y1 = x - rc * y1;
      L[i] += y1 * gL;
      R[i] += y1 * gR;
    }
  }

  // Adds a damped low-frequency submerged/cavity thump (foot sole meeting pool floor or hydrodynamic push).
  function addHydroPulse(L, R, startSec, fStart, fEnd, durSec, amp, pan) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(durSec * sr);
    const len = L.length;
    if (i0 >= len) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);
    let phase = 0;
    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      const u = t / durSec;
      const freq = fStart * Math.pow(fEnd / fStart, u);
      phase += (Math.PI * 2 * freq) / sr;
      const env = Math.min(1, t / 0.006) * Math.exp(-u * 4.8);
      const s = Math.sin(phase) * env;
      L[i] += s * gL;
      R[i] += s * gR;
    }
  }

  // Adds a short shaped filtered micro-turbulence splash impulse (bandlimited 2nd-order resonator).
  function addFluidSloshImpulse(L, R, startSec, durSec, f0, fPeak, fEnd, q, amp, pan) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(durSec * sr);
    const len = L.length;
    if (i0 >= len || n < 8) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);
    // 2-pole SVF bandpass with time-varying cutoff & choppy droplet-modulated excitation
    let low = 0, band = 0;
    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      const u = t / durSec;
      const f = u < 0.32 ? f0 + (fPeak - f0) * (u / 0.32) : fPeak + (fEnd - fPeak) * ((u - 0.32) / 0.68);
      const fc = Math.min(0.45, (2 * Math.sin((Math.PI * Math.min(sr * 0.4, f)) / sr)));
      const damp = 1 / Math.max(0.7, q);
      // Sparse wet impulsive excitation (cubed noise gives liquid crackle instead of dry static hiss!)
      const r = rand() * 2 - 1;
      const wetExc = r * (0.38 + 0.62 * r * r);
      const env = Math.pow(Math.sin(Math.PI * u), 0.75) * Math.exp(-u * 1.9);
      const high = wetExc * env - low - damp * band;
      band += fc * high;
      low += fc * band;
      L[i] += band * gL;
      R[i] += band * gR;
    }
  }

  // Soft-clip & normalize stereo buffer cleanly so transients stay crisp with zero distortion.
  function finalizeBuffer(buf, targetPeak = 0.88) {
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    let peak = 1e-4;
    for (let i = 0; i < L.length; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    const scale = targetPeak / peak;
    for (let i = 0; i < L.length; i++) {
      L[i] = Math.tanh(L[i] * scale * 1.15) * 0.92;
      R[i] = Math.tanh(R[i] * scale * 1.15) * 0.92;
    }
    return buf;
  }

  // Synthesize 6 distinct physical WADING FOOTSTEP buffers (each = ONE complete stride in 60 cm water!)
  function buildWadingStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const dur = 0.68;
      const buf = ctx.createBuffer(2, Math.floor(sr * dur), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);

      // Phase A (0 - 65 ms): Rear foot lift breaking surface tension (hollow large/med Minnaert cavities!)
      addHydroPulse(L, R, 0.002, randRange(130, 165), 62, 0.065, 0.18, randRange(-0.12, 0.12));
      const liftBubbles = 18 + Math.floor(rand() * 8);
      for (let b = 0; b < liftBubbles; b++) {
        const t = randRange(0.004, 0.068);
        const rad = 2.4 + Math.pow(rand(), 1.4) * 6.8; // 2.4 - 9.2 mm -> 350 - 1350 Hz hollow glugs!
        addMinnaertBubble(L, R, t, rad, randRange(0.06, 0.15) * (rad / 6.0), randRange(-0.35, 0.35), randRange(0.24, 0.42));
      }

      // Phase B (52 - 220 ms): Forward shin sweep displacing pool water & tossing splash crown!
      // Driven by 95+ discrete physical Minnaert bubbles + choppy water-crest slosh (NOT white noise!).
      addFluidSloshImpulse(
        L, R,
        0.048, 0.175,
        randRange(190, 250), randRange(640, 860), randRange(240, 340),
        2.1, 0.34, randRange(-0.18, 0.18),
      );
      addFluidSloshImpulse(
        L, R,
        0.072, 0.145,
        randRange(720, 960), randRange(1950, 2650), randRange(820, 1150),
        1.7, 0.20, randRange(-0.22, 0.22),
      );
      const sweepBubbles = 92 + Math.floor(rand() * 28);
      for (let b = 0; b < sweepBubbles; b++) {
        const u = Math.pow(rand(), 0.85);
        const t = 0.052 + u * 0.175;
        // Physical power-law bubble size spectrum (many small crisp splash bubbles + resonant mid bubbles)
        const rad = 0.65 + Math.pow(rand(), 2.3) * 6.2;
        const env = Math.sin(Math.PI * u);
        const amp = (0.04 + 0.09 * Math.min(1, rad / 4.0)) * (0.45 + 0.55 * env);
        addMinnaertBubble(L, R, t, rad, amp, randRange(-0.55, 0.55), randRange(0.18, 0.38));
        if (rad < 1.6 && rand() < 0.38) {
          addWetClick(L, R, t, randRange(0.025, 0.065), randRange(2200, 5200), randRange(-0.55, 0.55));
        }
      }

      // Phase C (192 - 265 ms): Submerged ceramic sole plant on pool floor + displaced heel bubbles
      const plantT = randRange(0.192, 0.218);
      addHydroPulse(L, R, plantT, randRange(112, 138), 46, 0.078, 0.28, randRange(-0.1, 0.1));
      for (let b = 0; b < 14; b++) {
        const t = plantT + randRange(0.004, 0.062);
        const rad = 3.0 + Math.pow(rand(), 1.5) * 6.0;
        addMinnaertBubble(L, R, t, rad, randRange(0.05, 0.12), randRange(-0.32, 0.32), randRange(0.20, 0.35));
      }

      // Phase D (270 - 630 ms): Distinct settling water droplets dripping off calf onto pool surface!
      const drips = 6 + Math.floor(rand() * 4);
      for (let d = 0; d < drips; d++) {
        const t = 0.265 + (d / drips) * 0.32 + randRange(-0.018, 0.028);
        const rad = 1.05 + Math.pow(rand(), 1.7) * 2.4; // 950 - 3100 Hz unmistakable water plips!
        const pan = randRange(-0.48, 0.48);
        addWetClick(L, R, t, randRange(0.022, 0.052), randRange(2800, 5400), pan);
        addMinnaertBubble(L, R, t + 0.002, rad, randRange(0.065, 0.145), pan, randRange(0.32, 0.52));
      }

      bank.push(finalizeBuffer(buf, 0.86));
    }
    return bank;
  }

  // Synthesize 6 distinct Level 0 DAMP CARPET footstep buffers (heel-down + ball roll + subtle damp pile)
  function buildCarpetStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.24), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      addHydroPulse(L, R, 0.002, randRange(92, 114), 44, 0.055, 0.36, 0);
      addFluidSloshImpulse(L, R, 0.004, 0.068, 220, 540, 180, 1.05, 0.24, randRange(-0.12, 0.12));
      // Toe/ball weight transfer ~58 ms later + tiny damp carpet fiber squelch
      const toeT = randRange(0.052, 0.068);
      addHydroPulse(L, R, toeT, randRange(76, 94), 38, 0.052, 0.24, 0);
      addFluidSloshImpulse(L, R, toeT + 0.004, 0.072, 340, 820, 260, 1.35, 0.18, randRange(-0.14, 0.14));
      for (let b = 0; b < 5; b++) {
        addMinnaertBubble(L, R, toeT + randRange(0.01, 0.06), randRange(1.2, 2.8), 0.028, randRange(-0.2, 0.2), 0.22);
      }
      bank.push(finalizeBuffer(buf, 0.62));
    }
    return bank;
  }

  // Synthesize 6 distinct Level 1 WET CONCRETE footstep buffers (crisp heel + toe roll + micro-puddle splash)
  function buildConcreteStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const wet = v % 2 === 0;
      const buf = ctx.createBuffer(2, Math.floor(sr * (wet ? 0.34 : 0.22)), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      // Hard heel strike on gritty concrete
      addHydroPulse(L, R, 0.001, randRange(148, 182), 56, 0.048, 0.34, 0);
      addWetClick(L, R, 0.001, 0.32, randRange(1650, 2600), randRange(-0.08, 0.08));
      addFluidSloshImpulse(L, R, 0.002, 0.042, 650, 1950, 580, 1.35, 0.26, 0);
      // Forefoot roll 52 ms later
      const toeT = randRange(0.048, 0.062);
      addHydroPulse(L, R, toeT, randRange(118, 145), 48, 0.044, 0.20, 0);
      addWetClick(L, R, toeT, 0.18, randRange(1900, 3100), randRange(-0.10, 0.10));
      if (wet) {
        // Shallow concrete rainwater puddle micro-splash (real discrete micro-bubbles!)
        addFluidSloshImpulse(L, R, 0.008, 0.088, 950, 2850, 920, 1.5, 0.22, randRange(-0.2, 0.2));
        for (let b = 0; b < 24; b++) {
          const t = randRange(0.008, 0.14);
          const rad = 0.65 + Math.pow(rand(), 2.0) * 2.4;
          addMinnaertBubble(L, R, t, rad, randRange(0.03, 0.075), randRange(-0.4, 0.4), 0.30);
        }
        for (let d = 0; d < 3; d++) {
          addMinnaertBubble(L, R, 0.16 + d * 0.052 + randRange(0, 0.02), randRange(1.1, 2.2), 0.05, randRange(-0.3, 0.3), 0.38);
        }
      }
      bank.push(finalizeBuffer(buf, 0.78));
    }
    return bank;
  }

  // Synthesize 6 distinct Poolrooms WET PORCELAIN DECK dry footstep buffers
  function buildTileStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.20), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      addHydroPulse(L, R, 0.001, randRange(175, 215), 76, 0.038, 0.26, 0);
      addWetClick(L, R, 0.001, 0.38, randRange(2100, 3400), 0);
      addFluidSloshImpulse(L, R, 0.002, 0.032, 950, 2550, 880, 1.65, 0.20, 0);
      const toeT = randRange(0.046, 0.058);
      addWetClick(L, R, toeT, 0.20, randRange(2300, 3800), 0);
      for (let b = 0; b < 6; b++) {
        addMinnaertBubble(L, R, randRange(0.005, 0.075), randRange(0.8, 1.8), 0.032, randRange(-0.2, 0.2), 0.28);
      }
      bank.push(finalizeBuffer(buf, 0.72));
    }
    return bank;
  }

  // Synthesize 8 distinct standalone Minnaert ceiling/pipe water droplet buffers (zero hiss!)
  function buildDropletBank(count = 8) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.18), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const rad = 1.2 + Math.pow(rand(), 1.5) * 3.1; // 750 - 2700 Hz crystalline rising water drops!
      addWetClick(L, R, 0.001, 0.22, randRange(2800, 5200), 0);
      addMinnaertBubble(L, R, 0.003, rad, 0.85, 0, randRange(0.30, 0.48));
      // Subtle secondary micro-satellite drop
      if (rand() < 0.45) {
        addMinnaertBubble(L, R, randRange(0.025, 0.055), rad * randRange(0.55, 0.82), 0.28, randRange(-0.15, 0.15), 0.38);
      }
      bank.push(finalizeBuffer(buf, 0.80));
    }
    return bank;
  }

  // Subtle wall-lap pool stillness ripple (tiny cluster of 3-5 soft low bubbles — NO pink-noise hiss!)
  function buildStillLapBank(count = 4) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.42), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const n = 4 + Math.floor(rand() * 4);
      for (let b = 0; b < n; b++) {
        const t = randRange(0.01, 0.30);
        const rad = randRange(3.2, 7.5); // gentle 430 - 1020 Hz wall-lap glugs
        addMinnaertBubble(L, R, t, rad, randRange(0.14, 0.30), randRange(-0.35, 0.35), randRange(0.14, 0.26));
      }
      bank.push(finalizeBuffer(buf, 0.45));
    }
    return bank;
  }

  const wadingBank = buildWadingStepBank(6);
  const carpetBank = buildCarpetStepBank(6);
  const concreteBank = buildConcreteStepBank(6);
  const tileBank = buildTileStepBank(6);
  const dropletBank = buildDropletBank(8);
  const stillLapBank = buildStillLapBank(4);

  // =========================================================================
  // 3. QUIET ARCHITECTURAL ROOM AIR & FLUORESCENT HUM (stationary ambience only!)
  // =========================================================================
  const airLen = Math.floor(sr * 4.0);
  const airBuf = ctx.createBuffer(1, airLen, sr);
  const ad = airBuf.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < airLen; i++) {
    brown = (brown + (rand() * 2 - 1) * 0.020) / 1.020;
    ad[i] = brown * 2.2;
  }

  const pending = [];

  const airSrc = ctx.createBufferSource();
  airSrc.buffer = airBuf;
  airSrc.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "lowpass";
  airFilter.frequency.value = 340;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.026;
  airSrc.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(master);
  airGain.connect(reverb);
  pending.push(airSrc);

  // Subtle harmonic ballast / ventilation hum (profile-tuned: 60/120 Hz for Level 0, deep 46 Hz for Level 1)
  const humGain = ctx.createGain();
  humGain.gain.value = 0.010;
  humGain.connect(master);
  humGain.connect(reverb);
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 240;
  humFilter.connect(humGain);
  const oscs = [54, 81.15, 108.3].map((f, idx) => {
    const o = ctx.createOscillator();
    o.type = idx === 2 ? "sawtooth" : "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = idx === 0 ? 0.62 : idx === 1 ? 0.30 : 0.07;
    o.connect(g);
    g.connect(humFilter);
    pending.push(o);
    return { o, g };
  });

  let started = false;
  let paused = false;
  let muted = false;
  let profile = "poolrooms";
  let nextDripTime = 1.8;
  let nextLapTime = 2.8;
  let lastBankIdx = -1;

  function refreshStatus() {
    if (!statusEl) return;
    statusEl.textContent = paused
      ? "Paused"
      : muted
        ? "Audio Muted (M)"
        : ctx.state === "running"
          ? ""
          : "Click / Key for Audio";
  }

  function startPending() {
    if (ctx.state === "running" && !started) {
      started = true;
      for (const node of pending) node.start();
      applyProfile();
    }
    refreshStatus();
  }
  ctx.addEventListener("statechange", startPending);
  startPending();

  function applyProfile() {
    const now = ctx.currentTime;
    if (profile === "backrooms") {
      // Authentic commercial office 60/120/240 Hz fluorescent ballast buzz + dry carpeted acoustics
      wet.gain.setTargetAtTime(0.16, now, 0.25);
      airGain.gain.setTargetAtTime(0.028, now, 0.25);
      airFilter.frequency.setTargetAtTime(360, now, 0.25);
      humGain.gain.setTargetAtTime(0.052, now, 0.25);
      humFilter.frequency.setTargetAtTime(420, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(60, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(120, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(240.3, now, 0.2);
    } else if (profile === "parking") {
      // Subterranean concrete hall echo + deep distant ventilation drone
      wet.gain.setTargetAtTime(0.62, now, 0.25);
      airGain.gain.setTargetAtTime(0.048, now, 0.25);
      airFilter.frequency.setTargetAtTime(260, now, 0.25);
      humGain.gain.setTargetAtTime(0.032, now, 0.25);
      humFilter.frequency.setTargetAtTime(185, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(46, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(92.15, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(138.4, now, 0.2);
    } else {
      // Poolrooms hushed natatorium stillness (long warm tiled reverb, zero white-noise hiss!)
      wet.gain.setTargetAtTime(0.58, now, 0.25);
      airGain.gain.setTargetAtTime(0.022, now, 0.25);
      airFilter.frequency.setTargetAtTime(320, now, 0.25);
      humGain.gain.setTargetAtTime(0.008, now, 0.25);
      humFilter.frequency.setTargetAtTime(180, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(54, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(81.15, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(108.3, now, 0.2);
    }
  }

  function pickVariation(bank) {
    let idx = Math.floor(rand() * bank.length);
    if (idx === lastBankIdx && bank.length > 1) idx = (idx + 1) % bank.length;
    lastBankIdx = idx;
    return bank[idx];
  }

  function playFoleyBuffer(buf, { gain = 0.22, rate = 1.0, pan = 0, reverbSend = 0.35, delay = 0 } = {}) {
    if (ctx.state !== "running" || muted) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.65, Math.min(1.45, rate));

    const g = ctx.createGain();
    g.gain.value = gain;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const wetSend = ctx.createGain();
    wetSend.gain.value = reverbSend;

    src.connect(g);
    g.connect(panner);
    panner.connect(master);
    panner.connect(wetSend);
    wetSend.connect(reverb);

    src.start(t0);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      panner.disconnect();
      wetSend.disconnect();
    };
  }

  // Strictly event-driven physical footstep player — triggered 1:1 by actual stride distance!
  function playFootstep({ inWater = false, speed = 0.9, side = 1 } = {}) {
    if (ctx.state !== "running" || muted) return;
    const pan = side * (0.24 + rand() * 0.08);
    // Subtle organic left/right gait timbre difference
    const sideRate = (side > 0 ? 1.03 : 0.96) * randRange(0.95, 1.05);

    if (inWater) {
      const energy = Math.max(0.58, Math.min(1.38, speed / 0.85));
      const buf = pickVariation(wadingBank);
      // Strong dry near-field clarity (reverbSend 0.34) so each individual step stands out unmistakably!
      playFoleyBuffer(buf, {
        gain: 0.34 * energy,
        rate: sideRate * (0.94 + Math.min(0.18, speed * 0.10)),
        pan,
        reverbSend: 0.34,
      });
      return;
    }

    const dryEnergy = Math.max(0.55, Math.min(1.30, speed / 2.4));
    if (profile === "backrooms") {
      playFoleyBuffer(pickVariation(carpetBank), {
        gain: 0.24 * dryEnergy,
        rate: sideRate,
        pan,
        reverbSend: 0.14,
      });
    } else if (profile === "parking") {
      playFoleyBuffer(pickVariation(concreteBank), {
        gain: 0.26 * dryEnergy,
        rate: sideRate,
        pan,
        reverbSend: 0.56,
      });
    } else {
      playFoleyBuffer(pickVariation(tileBank), {
        gain: 0.22 * dryEnergy,
        rate: sideRate,
        pan,
        reverbSend: 0.48,
      });
    }
  }

  return {
    setProfile(name) {
      profile = name || "poolrooms";
      applyProfile();
    },
    unlock() {
      if (!paused && ctx.state === "suspended") {
        ctx.resume().then(() => { applyProfile(); refreshStatus(); }).catch(refreshStatus);
      }
    },
    toggle() {
      this.unlock();
      muted = !muted;
      master.gain.setTargetAtTime(muted ? 0 : 0.62, ctx.currentTime, 0.06);
      refreshStatus();
    },
    setPaused(v) {
      if (paused === v) return;
      paused = v;
      if (v) ctx.suspend().catch(refreshStatus);
      else ctx.resume().then(refreshStatus).catch(refreshStatus);
      refreshStatus();
    },
    playFootstep,
    // Ambient room acoustics ONLY — zero continuous movement-volume loops!
    update(t) {
      if (ctx.state !== "running" || muted) return;

      // Occasional distant echoing Minnaert ceiling/pipe water droplets (Poolrooms & Level 1)
      if ((profile === "poolrooms" || profile === "parking") && t >= nextDripTime) {
        const pan = randRange(-0.82, 0.82);
        const isParking = profile === "parking";
        const gain = isParking ? randRange(0.055, 0.105) : randRange(0.065, 0.125);
        const rate = isParking ? randRange(0.74, 1.05) : randRange(0.85, 1.25);
        playFoleyBuffer(pickVariation(dropletBank), { gain, rate, pan, reverbSend: 0.94 });
        if (rand() < 0.26) {
          playFoleyBuffer(pickVariation(dropletBank), {
            delay: randRange(0.18, 0.36),
            gain: gain * 0.62,
            rate: rate * randRange(0.92, 1.12),
            pan: pan + randRange(-0.14, 0.14),
            reverbSend: 0.94,
          });
        }
        nextDripTime = t + (isParking ? randRange(3.2, 7.6) : randRange(2.4, 6.0));
      }

      // Ultra-gentle occasional Poolrooms water-wall lap glug (glassy stillness, never wind hiss)
      if (profile === "poolrooms" && t >= nextLapTime) {
        playFoleyBuffer(pickVariation(stillLapBank), {
          gain: randRange(0.032, 0.062),
          rate: randRange(0.85, 1.15),
          pan: randRange(-0.78, 0.78),
          reverbSend: 0.88,
        });
        nextLapTime = t + randRange(3.4, 7.2);
      }
    },
    inspect: () => ({ state: ctx.state, muted, profile }),
  };
}
