// Physically Grounded Procedural Web Audio Foley & Liminal Soundscape Engine.
// Zero external audio files.
//
// Acoustic architecture:
//   - Movement drives footsteps (actual collision-resolved stride distance); footsteps drive sound.
//   - ZERO continuous "if moving, turn noise volume up" loops.
//   - Wading footsteps are synthesized from layered hydrodynamic broadband turbulence:
//     submerged leg-displacement surge, granular Poisson-spaced liquid splash micro-puffs,
//     muffled underwater sole contact, and quiet receding surface wash (zero cartoon sine-chirp storms!).
//   - Level 0 (backrooms) defaults to pure realistic ambient acoustics featuring the iconic loud,
//     piercing, slightly inconsistent constant Backrooms fluorescent ballast hum (60/120/240 Hz
//     electromagnetic core buzz + harsh 960 Hz chassis resonance + faint filament whine + irregular
//     overhead flicker-sizzle stutters).
//   - Poolrooms defaults to classic "Hi — TEMPOREX" pure-code DX7 BGM (toggleable anytime via N).

import { createBgmEngine } from "./bgm.js";

export function createAudioEngine(statusEl) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) {
    return {
      setProfile() {},
      unlock() {},
      toggle() {},
      setPaused() {},
      setBgmEnabled() { return false; },
      toggleBgm() { return false; },
      setBgmVolume() {},
      playFootstep() {},
      update() {},
      inspect: () => ({
        state: "unsupported",
        muted: true,
        profile: "none",
        bgm: { enabled: false, volume: 0, profile: "none", track: "", style: "", bpm: 0, bar: 1 },
      }),
    };
  }

  const ctx = new Context();
  const sr = ctx.sampleRate;
  const master = ctx.createGain();
  master.gain.value = 0.64;
  master.connect(ctx.destination);
  const bgm = createBgmEngine(ctx, master);

  let seed = 9137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const randRange = (a, b) => a + (b - a) * rand();

  // =========================================================================
  // 1. FREQUENCY-DAMPED ARCHITECTURAL CONVOLUTION REVERB (3.0 s stereo IR)
  // =========================================================================
  const reverb = ctx.createConvolver();
  const irLen = Math.floor(sr * 3.0);
  const impulse = ctx.createBuffer(2, irLen, sr);
  const earlyTaps = [
    [0.011, 0.28, 0.18],
    [0.019, 0.16, 0.26],
    [0.029, 0.21, 0.14],
    [0.043, 0.13, 0.20],
    [0.059, 0.16, 0.14],
    [0.078, 0.10, 0.13],
    [0.098, 0.08, 0.09],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const t = i / sr;
      const alpha = Math.max(0.055, 0.38 * Math.exp(-t * 0.80));
      const w = (rand() * 2 - 1) * Math.exp(-t * 1.75);
      lp += (w - lp) * alpha;
      const onset = Math.min(1, t / 0.030);
      d[i] = lp * onset * 0.38;
    }
    for (const [delayS, gainL, gainR] of earlyTaps) {
      const idx = Math.floor(delayS * sr);
      if (idx >= 0 && idx < irLen - 4) {
        const g = (ch === 0 ? gainL : gainR) * (rand() > 0.5 ? 1 : -1);
        d[idx] += g;
        d[idx + 1] += g * 0.40;
      }
    }
  }
  reverb.buffer = impulse;

  const wet = ctx.createGain();
  wet.gain.value = 0.50;
  reverb.connect(wet);
  wet.connect(master);

  // =========================================================================
  // 2. REALISTIC HYDRODYNAMIC & FOLEY BUFFER SYNTHESIS (startup < 15 ms)
  // =========================================================================

  // Adds a smooth low-Q broadband swept fluid surge (submerged water-mass push & wake wash).
  // Uses smooth organic random-walk modulation (NEVER a periodic sine-LFO tremolo!) and steep
  // 2-pole lowpass shaping so it sounds like heavy calm water mass, zero radio-static hiss!
  function addTurbulentWash(L, R, startSec, durSec, fStart, fPeak, fEnd, q, amp, pan, peakPos = 0.34, _unused = 0) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(durSec * sr);
    const len = L.length;
    if (i0 >= len || n < 16) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);

    let b0 = 0, b1 = 0, b2 = 0; // warm brown-pink fluid excitation
    let lowL = 0, bandL = 0;
    let lowR = 0, bandR = 0;
    let drift = 0; // slow organic turbulence random walk (zero periodic LFO!)
    const damp = 1.0 / Math.max(0.70, q);

    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      const u = t / durSec;
      const f = u < peakPos
        ? fStart + (fPeak - fStart) * (u / Math.max(0.01, peakPos))
        : fPeak + (fEnd - fPeak) * ((u - peakPos) / Math.max(0.01, 1 - peakPos));
      const fc = Math.min(0.36, 2 * Math.sin((Math.PI * Math.min(sr * 0.32, f)) / sr));

      // Smooth asymmetric fluid displacement envelope with organic low-frequency eddy modulation
      const attack = Math.pow(Math.min(1, u / Math.max(0.05, peakPos)), 1.15);
      const decay = Math.exp(-Math.max(0, u - peakPos * 0.50) * 3.4);
      drift = drift * 0.9992 + (rand() * 2 - 1) * 0.018;
      const organic = Math.max(0.45, Math.min(1.25, 0.88 + drift * 1.6));
      const env = attack * decay * organic;

      const wL = rand() * 2 - 1;
      const wR = rand() * 2 - 1;
      b0 = 0.997 * b0 + wL * 0.045;
      b1 = 0.968 * b1 + wL * 0.095;
      b2 = 0.820 * b2 + wL * 0.16;
      const flL = (b0 * 1.2 + b1 + b2 * 0.55) * env;
      const flR = (b0 * 0.5 + b1 * 0.5 + b2 * 0.35 + (wR * 0.08)) * env;

      // Lowpass + gentle bandpass blend -> warm submerged water body without hiss
      const highL = flL - lowL - damp * bandL;
      bandL += fc * highL;
      lowL += fc * bandL;

      const highR = flR - lowR - damp * bandR;
      bandR += fc * highR;
      lowR += fc * bandR;

      L[i] += (bandL * 0.72 + lowL * 0.28) * gL;
      R[i] += (bandR * 0.72 + lowR * 0.28) * gR;
    }
  }

  // Adds ONE short Hanning-windowed damped contact grain (used for dry tile/carpet texture & flickers).
  function addSplashGrain(L, R, startSec, durSec, freqHz, q, amp, pan) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(durSec * sr);
    const len = L.length;
    if (i0 >= len || n < 10) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);
    const fc = Math.min(0.45, 2 * Math.sin((Math.PI * Math.min(sr * 0.38, freqHz)) / sr));
    const damp = 1.0 / Math.max(0.75, q);
    let low = 0, band = 0;
    for (let i = i0; i < end; i++) {
      const u = (i - i0) / n;
      const env = 0.5 - 0.5 * Math.cos(Math.PI * 2 * u);
      const x = (rand() * 2 - 1) * env;
      const high = x - low - damp * band;
      band += fc * high;
      low += fc * band;
      L[i] += band * gL;
      R[i] += band * gR;
    }
  }

  // Noise-excited stochastic water-packet formant stream (Andy Farnell liquid synthesis):
  // Zero sine oscillators (impossible to sound like cartoon bloops!) and zero flat continuous
  // static hiss (excitation is sculpted into irregular overlapping liquid turbulence packets
  // driving a smoothly drifting resonant fluid cavity bandpass filter!).
  function addLiquidFormantStream(L, R, startSec, durSec, fStart, fPeak, fEnd, q, amp, pan, peakPos = 0.35, clumpRateHz = 34) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(durSec * sr);
    const len = L.length;
    if (i0 >= len || n < 32) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);

    // Pre-generate organic irregular water-clump envelope (Poisson bursts smoothed by asymmetric
    // liquid attack/decay -> authentic churning/sloshing liquid motion, zero periodic tremolo!)
    let clumpEnv = 0.25;
    let clumpTarget = 0.25;
    const pBurst = clumpRateHz / sr;
    let fWalk = 0;

    let b0L = 0, b1L = 0, b0R = 0, b1R = 0;
    let lowL = 0, bandL = 0, lowR = 0, bandR = 0;
    const damp = 1.0 / Math.max(1.2, q);

    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      const u = t / durSec;

      // Macro asymmetric splash wave envelope
      const attack = Math.pow(Math.min(1, u / Math.max(0.04, peakPos)), 1.05);
      const decay = Math.exp(-Math.max(0, u - peakPos * 0.45) * 3.3);
      const macroEnv = attack * decay;

      // Irregular fluid packet surges (sharp liquid crest, smooth wet decay)
      if (rand() < pBurst) {
        clumpTarget = Math.min(1.65, clumpTarget + 0.35 + Math.pow(rand(), 1.6) * 0.95);
      }
      clumpTarget *= 0.9984;
      const envCoeff = clumpTarget > clumpEnv ? 0.018 : 0.0028;
      clumpEnv += (clumpTarget - clumpEnv) * envCoeff;

      // Smoothly wandering resonant cavity frequency (sounds wet and alive!)
      fWalk = fWalk * 0.9985 + (rand() * 2 - 1) * 0.022;
      const baseF = u < peakPos
        ? fStart + (fPeak - fStart) * (u / Math.max(0.01, peakPos))
        : fPeak + (fEnd - fPeak) * ((u - peakPos) / Math.max(0.01, 1 - peakPos));
      const f = Math.max(95, Math.min(sr * 0.34, baseF * Math.pow(2, fWalk * 0.55)));
      const fc = Math.min(0.42, 2 * Math.sin((Math.PI * f) / sr));

      // Stereo-decorrelated pink-tilted fluid noise excitation
      const wL = rand() * 2 - 1;
      const wR = rand() * 2 - 1;
      b0L = 0.985 * b0L + wL * 0.14;
      b1L = 0.850 * b1L + wL * 0.28;
      b0R = 0.985 * b0R + wR * 0.14;
      b1R = 0.850 * b1R + wR * 0.28;

      const gain = macroEnv * (0.18 + clumpEnv * 0.92);
      const xL = (b0L + b1L) * gain;
      const xR = (b0R + b1R) * gain;

      const hiL = xL - lowL - damp * bandL;
      bandL += fc * hiL;
      lowL += fc * bandL;

      const hiR = xR - lowR - damp * bandR;
      bandR += fc * hiR;
      lowR += fc * bandR;

      L[i] += bandL * gL;
      R[i] += bandR * gR;
    }
  }

  // Adds a soft damped low-frequency physical contact thump (underwater sole, carpet heel, tile step).
  function addDampedThump(L, R, startSec, fStart, fEnd, durSec, amp, pan) {
    const i0 = Math.floor(startSec * sr);
    const n = Math.floor(durSec * sr);
    const len = L.length;
    if (i0 >= len || n < 8) return;
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const end = Math.min(len, i0 + n);
    let phase = 0;
    for (let i = i0; i < end; i++) {
      const t = (i - i0) / sr;
      const u = t / durSec;
      const freq = fStart * Math.pow(fEnd / fStart, u);
      phase += (Math.PI * 2 * freq) / sr;
      const env = Math.min(1, t / 0.008) * Math.exp(-u * 5.2);
      const s = Math.sin(phase) * env;
      L[i] += s * gL;
      R[i] += s * gR;
    }
  }

  // Adds a single subtle natural Minnaert droplet (reserved strictly for isolated ceiling drips).
  function addNaturalDroplet(L, R, startSec, radiusMm, amp, pan, riseRate = 0.14) {
    const f0 = Math.max(240, Math.min(4800, 3260 / Math.max(0.65, radiusMm)));
    const damp = 0.055 * f0 + 0.0018 * Math.pow(f0, 1.5);
    const dur = Math.min(0.11, 5.5 / Math.max(damp, 24));
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
      const onset = t < 0.001 ? t / 0.001 : 1.0;
      const env = onset * Math.exp(-damp * t);
      const phase = twoPi * f0 * (t + 0.5 * rise * t * t);
      const s = Math.sin(phase) * env;
      L[i] += s * gL;
      R[i] += s * gR;
    }
  }

  function finalizeBuffer(buf, targetPeak = 0.85, lowpassHz = 0) {
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    // Optional gentle warm acoustic roll-off (eliminates harsh digital >3.5 kHz fizz on water buffers)
    if (lowpassHz > 0) {
      const a = 1 - Math.exp((-2 * Math.PI * lowpassHz) / sr);
      let sL = 0, sR = 0;
      for (let i = 0; i < L.length; i++) {
        sL += a * (L[i] - sL);
        sR += a * (R[i] - sR);
        L[i] = sL;
        R[i] = sR;
      }
    }
    let peak = 1e-4;
    for (let i = 0; i < L.length; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    const scale = targetPeak / peak;
    for (let i = 0; i < L.length; i++) {
      L[i] = Math.tanh(L[i] * scale * 1.08) * 0.90;
      R[i] = Math.tanh(R[i] * scale * 1.08) * 0.90;
    }
    return buf;
  }

  // Synthesize 6 distinct REALISTIC SHALLOW TILED-POOL WADING FOOTSTEP buffers (44 cm calm water).
  // Two-phase hydrodynamic pool Foley (verified by direct WAV listening):
  //   Phase A (0 - 170 ms): Warm low-mid shin-drag water push parting calm pool water
  //   Phase B (120 - 380 ms): Crisp surface-break plunge splash (hollow wet cavity slap + multi-band
  //                           stochastic liquid formant streams + sparse crisp 2-6 kHz water flecks)
  //   Phase C (340 - 760 ms): Gentle receding wake slosh + 6-9 delicate runoff droplets hitting calm pool
  function buildWadingStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const dur = 0.82;
      const buf = ctx.createBuffer(2, Math.floor(sr * dur), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);

      // Phase A (0 - 210 ms): Smooth submerged shin push parting calm pool water
      addTurbulentWash(
        L, R,
        0.002, 0.21,
        randRange(100, 130), randRange(240, 320), randRange(120, 155),
        1.20, 0.44, randRange(-0.14, 0.14), 0.42,
      );
      addLiquidFormantStream(
        L, R,
        0.006, 0.20,
        randRange(200, 260), randRange(390, 490), randRange(190, 245),
        3.8, 0.38, randRange(-0.18, 0.18), 0.44, 22,
      );

      // Phase B (115 - 430 ms): Distinct wet surface-break plunge & heavy hollow pool splash!
      // Deep warm underwater cavity displacement
      addTurbulentWash(
        L, R,
        0.115, 0.28,
        randRange(75, 105), randRange(270, 360), randRange(110, 145),
        1.25, 0.54, randRange(-0.12, 0.12), 0.24,
      );
      // Hollow resonant wet cavity slosh formant (250 - 620 Hz, Q=4.8 -> unmistakable heavy water!)
      addLiquidFormantStream(
        L, R,
        0.120, 0.33,
        randRange(240, 320), randRange(500, 640), randRange(215, 290),
        4.8, 0.56, randRange(-0.22, 0.22), 0.22, 30,
      );
      // Wet liquid body splash formant (560 - 1420 Hz, Q=5.0 -> rich liquid gurgle/splash, never dry brush!)
      addLiquidFormantStream(
        L, R,
        0.126, 0.31,
        randRange(560, 740), randRange(1080, 1450), randRange(480, 660),
        5.0, 0.48, randRange(-0.30, 0.30), 0.24, 42,
      );
      // Sparkling wet surface-sheet breakup (1300 - 2900 Hz, Q=4.2, clumpy surges!)
      addLiquidFormantStream(
        L, R,
        0.132, 0.25,
        randRange(1280, 1680), randRange(2200, 2900), randRange(1050, 1420),
        4.2, 0.24, randRange(-0.36, 0.36), 0.22, 52,
      );

      // Sparse soft wet water-sheet slaps (750 - 3300 Hz, Q=3.2..4.8 -> wet slap, zero dry snow-crunch!)
      const fleckCount = 14 + Math.floor(rand() * 6);
      for (let s = 0; s < fleckCount; s++) {
        const u = Math.pow(rand(), 0.90);
        const t = 0.125 + u * 0.24;
        const env = Math.sin(Math.PI * Math.min(1, u * 1.1));
        const f = 740 * Math.pow(4.3, Math.pow(rand(), 1.1));
        const durS = randRange(0.005, 0.014);
        const amp = (0.030 + 0.068 * env) * (0.35 + 0.65 * Math.pow(rand(), 1.8));
        addSplashGrain(L, R, t, durS, f, randRange(3.2, 4.8), amp, randRange(-0.44, 0.44));
      }

      // 6-8 quiet buried natural entrainment bubbles right inside the wet splash crest (-18 to -24 dB)
      // Subtle enough NEVER to sound cartoonish, yet gives unmistakable liquid authenticity!
      const crestBubbles = 6 + Math.floor(rand() * 3);
      for (let b = 0; b < crestBubbles; b++) {
        const t = 0.135 + (b / crestBubbles) * 0.18 + randRange(-0.015, 0.020);
        addNaturalDroplet(L, R, t, randRange(2.2, 5.4), randRange(0.022, 0.048), randRange(-0.40, 0.40), randRange(0.06, 0.12));
      }

      // Subtle muffled submerged ceramic heel contact right under the plunge crest
      const plantT = randRange(0.155, 0.185);
      addDampedThump(L, R, plantT, randRange(84, 102), 42, 0.056, 0.15, randRange(-0.10, 0.10));

      // Phase C (290 - 780 ms): Gentle receding wake slosh + 4-6 delicate runoff drops hitting calm glass pool
      addLiquidFormantStream(
        L, R,
        0.28, 0.48,
        randRange(220, 290), randRange(450, 600), randRange(175, 240),
        3.6, 0.26, randRange(-0.24, 0.24), 0.25, 20,
      );
      const runoffTicks = 5 + Math.floor(rand() * 4);
      for (let r = 0; r < runoffTicks; r++) {
        const u = (r + rand() * 0.85) / runoffTicks;
        const t = 0.35 + u * 0.38;
        addSplashGrain(
          L, R, t,
          randRange(0.004, 0.010),
          randRange(1200, 3400),
          randRange(3.0, 4.4),
          (1.0 - u * 0.55) * randRange(0.016, 0.042),
          randRange(-0.48, 0.48),
        );
      }
      const dripCount = 4 + Math.floor(rand() * 3);
      for (let d = 0; d < dripCount; d++) {
        const t = 0.40 + (d / dripCount) * 0.34 + randRange(-0.025, 0.035);
        addNaturalDroplet(L, R, t, randRange(1.4, 3.2), randRange(0.020, 0.042), randRange(-0.52, 0.52), randRange(0.09, 0.15));
      }

      // Warm natural 4.6 kHz acoustic roll-off -> crystal wet pool water with zero dry brushiness!
      bank.push(finalizeBuffer(buf, 0.88, 4600));
    }
    return bank;
  }

  // Synthesize 6 distinct Level 0 DAMP COMMERCIAL CARPET footstep buffers (soft muffled heel-toe + fabric brush, ZERO bubbles!)
  function buildCarpetStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.22), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      // Muffled commercial-carpet heel plant
      addDampedThump(L, R, 0.002, randRange(86, 108), 42, 0.055, 0.38, 0);
      addTurbulentWash(L, R, 0.003, 0.068, 190, 460, 170, 0.95, 0.32, randRange(-0.10, 0.10), 0.28, 18.0);
      // Subtle wool loop-pile fabric rub on ball roll (~55 ms later)
      const toeT = randRange(0.050, 0.064);
      addDampedThump(L, R, toeT, randRange(72, 88), 36, 0.050, 0.22, 0);
      addTurbulentWash(L, R, toeT + 0.004, 0.082, 280, 680, 230, 1.10, 0.22, randRange(-0.12, 0.12), 0.30, 22.0);
      bank.push(finalizeBuffer(buf, 0.62));
    }
    return bank;
  }

  // Synthesize 6 distinct Poolrooms WET PORCELAIN DECK dry footstep buffers (clean bare/rubber sole contact)
  function buildTileStepBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.18), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      addDampedThump(L, R, 0.001, randRange(165, 205), 72, 0.036, 0.30, 0);
      addSplashGrain(L, R, 0.001, 0.012, randRange(1450, 2650), 1.3, 0.36, 0);
      addTurbulentWash(L, R, 0.003, 0.042, 650, 1850, 580, 1.2, 0.24, 0, 0.25, 20.0);
      const toeT = randRange(0.045, 0.058);
      addSplashGrain(L, R, toeT, 0.010, randRange(1600, 2900), 1.3, 0.22, 0);
      bank.push(finalizeBuffer(buf, 0.72));
    }
    return bank;
  }

  // Synthesize 6 subtle isolated ceiling water droplet buffers (gentle natural natatorium drips)
  function buildDropletBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.16), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const rad = 1.6 + Math.pow(rand(), 1.4) * 2.8; // 740 - 2050 Hz gentle natural drips
      addSplashGrain(L, R, 0.001, 0.006, randRange(2100, 3800), 1.2, 0.22, 0);
      addNaturalDroplet(L, R, 0.003, rad, 0.68, 0, randRange(0.14, 0.22));
      bank.push(finalizeBuffer(buf, 0.74));
    }
    return bank;
  }

  // Subtle Poolrooms water-against-tile stillness lap (quiet fluid wash, zero cartoon boops)
  function buildStillLapBank(count = 4) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const buf = ctx.createBuffer(2, Math.floor(sr * 0.56), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      addTurbulentWash(
        L, R,
        0.02, 0.48,
        randRange(160, 220), randRange(420, 580), randRange(180, 240),
        1.15, 0.45, randRange(-0.30, 0.30), 0.38, randRange(6.5, 9.5),
      );
      for (let g = 0; g < 8; g++) {
        addSplashGrain(L, R, randRange(0.08, 0.38), randRange(0.008, 0.018), randRange(520, 1250), 1.2, randRange(0.06, 0.14), randRange(-0.35, 0.35));
      }
      bank.push(finalizeBuffer(buf, 0.42));
    }
    return bank;
  }

  // Synthesize 6 iconic Level 0 INCONSISTENT FLUORESCENT BALLAST FLICKER / ARC SIZZLE bursts!
  // Short jarring 120 Hz transformer stutter + dry electrical tube sizzle from mismatched ceiling fixtures.
  function buildBallastFlickerBank(count = 6) {
    const bank = [];
    for (let v = 0; v < count; v++) {
      const dur = randRange(0.12, 0.28);
      const buf = ctx.createBuffer(2, Math.floor(sr * dur), sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const baseF = 120.0 + randRange(-0.8, 0.8);
      // 2-4 brief erratic electrical contact re-strikes
      const pulses = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < pulses; p++) {
        const pStart = (p / pulses) * (dur * 0.72) + randRange(0, 0.015);
        const pDur = randRange(0.018, 0.048);
        const i0 = Math.floor(pStart * sr);
        const end = Math.min(L.length, i0 + Math.floor(pDur * sr));
        for (let i = i0; i < end; i++) {
          const t = (i - i0) / sr;
          const u = t / pDur;
          const env = Math.sin(Math.PI * u);
          // Harsh rectified 120 Hz + odd/even harmonics + electrical contact crackle
          const buzz = 0.55 * Math.sin(2 * Math.PI * baseF * t)
            + 0.38 * Math.sin(2 * Math.PI * baseF * 2 * t)
            + 0.30 * Math.sin(2 * Math.PI * baseF * 3 * t)
            + 0.22 * Math.sin(2 * Math.PI * baseF * 5 * t)
            + 0.18 * Math.sin(2 * Math.PI * baseF * 7 * t);
          const s = buzz * env * 0.65;
          L[i] += s;
          R[i] += s;
        }
        // Crisp electrical ballast arc crackle
        addSplashGrain(L, R, pStart, randRange(0.008, 0.022), randRange(2200, 5200), 1.6, 0.55, randRange(-0.2, 0.2));
      }
      bank.push(finalizeBuffer(buf, 0.78));
    }
    return bank;
  }

  const wadingBank = buildWadingStepBank(6);
  const carpetBank = buildCarpetStepBank(6);
  const tileBank = buildTileStepBank(6);
  const dropletBank = buildDropletBank(6);
  const stillLapBank = buildStillLapBank(4);
  const flickerBank = buildBallastFlickerBank(6);

  // =========================================================================
  // 3. ARCHITECTURAL ROOM AIR & ICONIC LEVEL 0 HARSH FLUORESCENT BALLAST HUM
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
  airFilter.frequency.value = 320;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.024;
  airSrc.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(master);
  airGain.connect(reverb);
  pending.push(airSrc);

  // Dedicated harsh Backrooms fluorescent ballast engine:
  //   - Dual slightly-detuned 120 Hz sawtooth cores (119.78 Hz L / 120.24 Hz R -> mismatched ceiling fixtures beating!)
  //   - 60 Hz AC mains transformer fundamental + 240.4 Hz harsh square metallic chassis rattle
  //   - Faint constant 3120 Hz piercing tube filament whine
  //   - Resonant 360 Hz + 960 Hz metallic troffer peaking EQ -> unmistakable loud, harsh, abrupt Level 0 buzz!
  const ballastBus = ctx.createGain();
  ballastBus.gain.value = 0.008;
  ballastBus.connect(master);

  const ballastRevSend = ctx.createGain();
  ballastRevSend.gain.value = 0.22;
  ballastBus.connect(ballastRevSend);
  ballastRevSend.connect(reverb);

  const ballastHP = ctx.createBiquadFilter();
  ballastHP.type = "highpass";
  ballastHP.frequency.value = 54;

  const ballastMidPeak = ctx.createBiquadFilter();
  ballastMidPeak.type = "peaking";
  ballastMidPeak.frequency.value = 360;
  ballastMidPeak.Q.value = 1.4;
  ballastMidPeak.gain.value = 5.5;

  const ballastBitePeak = ctx.createBiquadFilter();
  ballastBitePeak.type = "peaking";
  ballastBitePeak.frequency.value = 960;
  ballastBitePeak.Q.value = 2.3;
  ballastBitePeak.gain.value = 7.5;

  const ballastLP = ctx.createBiquadFilter();
  ballastLP.type = "lowpass";
  ballastLP.frequency.value = 240;

  ballastHP.connect(ballastMidPeak);
  ballastMidPeak.connect(ballastBitePeak);
  ballastBitePeak.connect(ballastLP);
  ballastLP.connect(ballastBus);

  function mkBallastOsc(type, freq, gainVal, panVal = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    const p = ctx.createStereoPanner();
    p.pan.value = panVal;
    o.connect(g);
    g.connect(p);
    p.connect(ballastHP);
    pending.push(o);
    return { o, g };
  }

  const humCore60 = mkBallastOsc("triangle", 60.0, 0.34, 0);
  const humBuzzL = mkBallastOsc("sawtooth", 119.78, 0.36, -0.35);
  const humBuzzR = mkBallastOsc("sawtooth", 120.24, 0.36, 0.35);
  const humChassis = mkBallastOsc("square", 240.35, 0.14, 0.08);
  const humWhine = mkBallastOsc("sine", 3120.0, 0.032, -0.15);

  let started = false;
  let paused = false;
  let muted = false;
  let profile = "backrooms";
  let nextDripTime = 2.0;
  let nextLapTime = 3.2;
  let nextFlickerTime = 2.6;
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
      applyProfile(false);
    }
    refreshStatus();
  }
  ctx.addEventListener("statechange", startPending);
  startPending();

  function applyProfile(applyBgmDefault = false) {
    const now = ctx.currentTime;
    if (profile === "backrooms") {
      // Iconic Backrooms Level 0: loud, harsh, piercing, slightly inconsistent overhead fluorescent buzz!
      wet.gain.setTargetAtTime(0.18, now, 0.22);
      airGain.gain.setTargetAtTime(0.032, now, 0.22);
      airFilter.frequency.setTargetAtTime(420, now, 0.22);

      ballastBus.gain.setTargetAtTime(0.215, now, 0.20);
      ballastLP.frequency.setTargetAtTime(3800, now, 0.20);
      ballastMidPeak.gain.setTargetAtTime(5.5, now, 0.20);
      ballastBitePeak.gain.setTargetAtTime(7.5, now, 0.20);

      humCore60.o.frequency.setTargetAtTime(60.0, now, 0.15);
      humCore60.g.gain.setTargetAtTime(0.36, now, 0.15);
      humBuzzL.o.frequency.setTargetAtTime(119.78, now, 0.15);
      humBuzzL.g.gain.setTargetAtTime(0.40, now, 0.15);
      humBuzzR.o.frequency.setTargetAtTime(120.24, now, 0.15);
      humBuzzR.g.gain.setTargetAtTime(0.40, now, 0.15);
      humChassis.o.frequency.setTargetAtTime(240.35, now, 0.15);
      humChassis.g.gain.setTargetAtTime(0.16, now, 0.15);
      humWhine.g.gain.setTargetAtTime(0.034, now, 0.15);
    } else {
      // Poolrooms: hushed glazed-tile natatorium stillness (long soft hall reverb, barely audible distant pump hum)
      wet.gain.setTargetAtTime(0.56, now, 0.25);
      airGain.gain.setTargetAtTime(0.020, now, 0.25);
      airFilter.frequency.setTargetAtTime(300, now, 0.25);

      ballastBus.gain.setTargetAtTime(0.008, now, 0.25);
      ballastLP.frequency.setTargetAtTime(180, now, 0.25);
      ballastMidPeak.gain.setTargetAtTime(0.0, now, 0.25);
      ballastBitePeak.gain.setTargetAtTime(0.0, now, 0.25);

      humCore60.o.frequency.setTargetAtTime(54.0, now, 0.2);
      humCore60.g.gain.setTargetAtTime(0.50, now, 0.2);
      humBuzzL.o.frequency.setTargetAtTime(81.1, now, 0.2);
      humBuzzL.g.gain.setTargetAtTime(0.18, now, 0.2);
      humBuzzR.o.frequency.setTargetAtTime(108.3, now, 0.2);
      humBuzzR.g.gain.setTargetAtTime(0.08, now, 0.2);
      humChassis.g.gain.setTargetAtTime(0.0, now, 0.2);
      humWhine.g.gain.setTargetAtTime(0.0, now, 0.2);
    }
    bgm.setProfile(profile, { applyDefault: applyBgmDefault });
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
    src.playbackRate.value = Math.max(0.68, Math.min(1.40, rate));

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
    const pan = side * (0.22 + rand() * 0.08);
    const sideRate = (side > 0 ? 1.03 : 0.96) * randRange(0.95, 1.05);

    if (inWater) {
      const normSpd = Math.max(0.25, Math.min(1.65, speed));
      const energy = Math.max(0.45, Math.min(1.42, Math.pow(normSpd / 0.85, 0.85)));
      playFoleyBuffer(pickVariation(wadingBank), {
        gain: 0.34 * energy,
        rate: sideRate * (0.84 + Math.min(0.30, normSpd * 0.18)),
        pan,
        reverbSend: 0.72,
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
    } else {
      playFoleyBuffer(pickVariation(tileBank), {
        gain: 0.22 * dryEnergy,
        rate: sideRate,
        pan,
        reverbSend: 0.46,
      });
    }
  }

  return {
    setProfile(name) {
      profile = name || "poolrooms";
      applyProfile(true);
    },
    unlock() {
      if (!paused && ctx.state === "suspended") {
        ctx.resume().then(() => { applyProfile(false); refreshStatus(); }).catch(refreshStatus);
      }
    },
    toggle() {
      this.unlock();
      muted = !muted;
      master.gain.setTargetAtTime(muted ? 0 : 0.64, ctx.currentTime, 0.06);
      refreshStatus();
    },
    setBgmEnabled(v) {
      if (v) this.unlock();
      const next = bgm.setEnabled(v);
      refreshStatus();
      return next;
    },
    toggleBgm() {
      return this.setBgmEnabled(!bgm.inspect().enabled);
    },
    setBgmVolume(v) {
      bgm.setVolume(v);
    },
    setPaused(v) {
      if (paused === v) return;
      paused = v;
      if (v) ctx.suspend().catch(refreshStatus);
      else ctx.resume().then(refreshStatus).catch(refreshStatus);
      refreshStatus();
    },
    playFootstep,
    // Ambient room acoustics & procedural BGM scheduler — zero continuous movement-volume loops!
    update(t) {
      if (ctx.state !== "running" || muted) return;
      bgm.update();

      // Level 0: irregular overhead flickering fluorescent ballast arc/stutter bursts!
      if (profile === "backrooms" && t >= nextFlickerTime) {
        playFoleyBuffer(pickVariation(flickerBank), {
          gain: randRange(0.055, 0.125),
          rate: randRange(0.94, 1.06),
          pan: randRange(-0.85, 0.85),
          reverbSend: 0.30,
        });
        nextFlickerTime = t + randRange(2.4, 7.2);
      }

      // Poolrooms: occasional distant echoing ceiling water droplets
      if (profile === "poolrooms" && t >= nextDripTime) {
        const pan = randRange(-0.80, 0.80);
        const gain = randRange(0.048, 0.092);
        const rate = randRange(0.86, 1.22);
        playFoleyBuffer(pickVariation(dropletBank), { gain, rate, pan, reverbSend: 0.92 });
        nextDripTime = t + randRange(2.8, 6.8);
      }

      // Poolrooms: ultra-gentle occasional water-wall stillness lap
      if (profile === "poolrooms" && t >= nextLapTime) {
        playFoleyBuffer(pickVariation(stillLapBank), {
          gain: randRange(0.026, 0.052),
          rate: randRange(0.88, 1.12),
          pan: randRange(-0.75, 0.75),
          reverbSend: 0.85,
        });
        nextLapTime = t + randRange(3.8, 7.6);
      }
    },
    inspect: () => ({ state: ctx.state, muted, profile, bgm: bgm.inspect() }),
  };
}
