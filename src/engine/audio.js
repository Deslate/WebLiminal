// Procedural Web Audio soundscape synthesizer tailored to each liminal environment.
// Zero audio files: synthesizes frequency-damped architectural convolution reverb,
// stereo LFO-modulated pool lapping, Minnaert rising-pitch water droplets, continuous
// speed-driven wading water drag, multi-stage wading splashes, and surface footsteps.

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
  const master = ctx.createGain();
  master.gain.value = 0.58;
  master.connect(ctx.destination);

  let seed = 9137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Frequency-damped stereo architectural convolution reverb (crisp tiled early reflections
  // transitioning smoothly into a warm, air-damped 3.4 s indoor natatorium tail).
  const reverb = ctx.createConvolver();
  const sr = ctx.sampleRate;
  const irLen = Math.floor(sr * 3.4);
  const impulse = ctx.createBuffer(2, irLen, sr);
  const earlyTaps = [
    [0.011, 0.34, 0.22],
    [0.019, 0.20, 0.31],
    [0.029, 0.26, 0.16],
    [0.041, 0.14, 0.25],
    [0.056, 0.20, 0.18],
    [0.074, 0.13, 0.16],
    [0.092, 0.11, 0.12],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      const t = i / sr;
      // Air + surface absorption darkens high frequencies progressively across the tail.
      const alpha = Math.max(0.06, 0.42 * Math.exp(-t * 0.72));
      const w = (rand() * 2 - 1) * Math.exp(-t * 1.65);
      lp += (w - lp) * alpha;
      const onset = Math.min(1, t / 0.035);
      d[i] = lp * onset * 0.44;
    }
    for (const [delayS, gainL, gainR] of earlyTaps) {
      const idx = Math.floor(delayS * sr);
      if (idx >= 0 && idx < irLen - 4) {
        const g = (ch === 0 ? gainL : gainR) * (rand() > 0.5 ? 1 : -1);
        d[idx] += g;
        d[idx + 1] += g * 0.45;
      }
    }
  }
  reverb.buffer = impulse;

  const wet = ctx.createGain();
  wet.gain.value = 0.56;
  reverb.connect(wet);
  wet.connect(master);

  // Shared 4-second broadband pink-weighted noise buffer for all water, splash & footstep layers.
  const pinkLen = Math.floor(sr * 4.0);
  const pinkBuf = ctx.createBuffer(1, pinkLen, sr);
  const pd = pinkBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < pinkLen; i++) {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    pd[i] = Math.max(-1, Math.min(1, pink));
  }

  // Smooth brown-noise buffer for distant HVAC / room air bed.
  const airBuf = ctx.createBuffer(1, pinkLen, sr);
  const ad = airBuf.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < pinkLen; i++) {
    brown = (brown + (rand() * 2 - 1) * 0.022) / 1.022;
    ad[i] = brown * 2.6;
  }

  const pending = [];

  // 1. Room Air / HVAC Bed
  const airSrc = ctx.createBufferSource();
  airSrc.buffer = airBuf;
  airSrc.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "lowpass";
  airFilter.frequency.value = 520;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.055;
  airSrc.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(master);
  airGain.connect(reverb);
  pending.push(airSrc);

  // 2. Subtle Harmonic Room / Ballast Hum Bank
  const humGain = ctx.createGain();
  humGain.gain.value = 0.016;
  humGain.connect(master);
  humGain.connect(reverb);
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 260;
  humFilter.connect(humGain);
  const oscs = [54, 81.15, 108.3].map((f, idx) => {
    const o = ctx.createOscillator();
    o.type = idx === 2 ? "sawtooth" : "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = idx === 0 ? 0.6 : idx === 1 ? 0.35 : 0.08;
    o.connect(g);
    g.connect(humFilter);
    pending.push(o);
    return { o, g };
  });

  // 3. Poolrooms Continuous Stereo Water Lapping Bed (two slow LFO-modulated liquid bands + gentle shimmer)
  const lapMaster = ctx.createGain();
  lapMaster.gain.value = 0.0;
  lapMaster.connect(master);
  lapMaster.connect(reverb);

  const makeLapBand = (baseFreq, modHz, modDepth, q, panVal, baseGain, offsetS) => {
    const src = ctx.createBufferSource();
    src.buffer = pinkBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = baseFreq;
    bp.Q.value = q;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = modHz;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = modDepth;
    lfo.connect(lfoDepth);
    lfoDepth.connect(bp.frequency);

    const g = ctx.createGain();
    g.gain.value = baseGain;
    const ampLfo = ctx.createOscillator();
    ampLfo.type = "sine";
    ampLfo.frequency.value = modHz * 1.43;
    const ampDepth = ctx.createGain();
    ampDepth.gain.value = baseGain * 0.42;
    ampLfo.connect(ampDepth);
    ampDepth.connect(g.gain);

    const pan = ctx.createStereoPanner();
    pan.pan.value = panVal;

    src.connect(bp);
    bp.connect(g);
    g.connect(pan);
    pan.connect(lapMaster);
    pending.push({ node: src, offset: offsetS }, lfo, ampLfo);
  };

  makeLapBand(360, 0.13, 145, 1.7, -0.45, 0.045, 0.0);
  makeLapBand(590, 0.19, 210, 1.9, 0.45, 0.036, 1.3);
  makeLapBand(1850, 0.27, 520, 2.3, 0.0, 0.014, 2.6);

  // 4. Continuous Speed-Driven Wading Body Drag / Swish (smooth hydraulic push + surface foam froth)
  const wadeSwirlSrc = ctx.createBufferSource();
  wadeSwirlSrc.buffer = pinkBuf;
  wadeSwirlSrc.loop = true;
  const wadeSwirlBP = ctx.createBiquadFilter();
  wadeSwirlBP.type = "bandpass";
  wadeSwirlBP.frequency.value = 320;
  wadeSwirlBP.Q.value = 1.25;
  const wadeSwirlGain = ctx.createGain();
  wadeSwirlGain.gain.value = 0.0;
  wadeSwirlSrc.connect(wadeSwirlBP);
  wadeSwirlBP.connect(wadeSwirlGain);
  wadeSwirlGain.connect(master);
  wadeSwirlGain.connect(reverb);

  const wadeFrothSrc = ctx.createBufferSource();
  wadeFrothSrc.buffer = pinkBuf;
  wadeFrothSrc.loop = true;
  const wadeFrothBP = ctx.createBiquadFilter();
  wadeFrothBP.type = "bandpass";
  wadeFrothBP.frequency.value = 1650;
  wadeFrothBP.Q.value = 1.05;
  const wadeFrothGain = ctx.createGain();
  wadeFrothGain.gain.value = 0.0;
  wadeFrothSrc.connect(wadeFrothBP);
  wadeFrothBP.connect(wadeFrothGain);
  wadeFrothGain.connect(master);
  wadeFrothGain.connect(reverb);

  pending.push({ node: wadeSwirlSrc, offset: 0.7 }, { node: wadeFrothSrc, offset: 2.1 });

  let started = false;
  let paused = false;
  let muted = false;
  let profile = "poolrooms";
  let nextDripTime = 1.6;
  let lastDryStep = -10;
  let dryFootSide = 1;

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
      for (const item of pending) {
        if (item.node) item.node.start(0, item.offset ?? 0);
        else item.start();
      }
      applyProfile();
    }
    refreshStatus();
  }
  ctx.addEventListener("statechange", startPending);
  startPending();

  function applyProfile() {
    const now = ctx.currentTime;
    if (profile === "backrooms") {
      // Iconic 60Hz fluorescent ballast buzz + dry carpeted space
      wet.gain.setTargetAtTime(0.20, now, 0.25);
      airGain.gain.setTargetAtTime(0.050, now, 0.25);
      airFilter.frequency.setTargetAtTime(460, now, 0.25);
      humGain.gain.setTargetAtTime(0.072, now, 0.25);
      humFilter.frequency.setTargetAtTime(520, now, 0.25);
      lapMaster.gain.setTargetAtTime(0.0, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(60, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(120, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(240.4, now, 0.2);
    } else if (profile === "parking") {
      // Deep concrete ventilation sub-drone + long echoing space
      wet.gain.setTargetAtTime(0.68, now, 0.25);
      airGain.gain.setTargetAtTime(0.10, now, 0.25);
      airFilter.frequency.setTargetAtTime(320, now, 0.25);
      humGain.gain.setTargetAtTime(0.050, now, 0.25);
      humFilter.frequency.setTargetAtTime(210, now, 0.25);
      lapMaster.gain.setTargetAtTime(0.0, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(46, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(92.2, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(138.5, now, 0.2);
    } else {
      // Poolrooms tiled hall resonance + gentle stereo water lapping bed
      wet.gain.setTargetAtTime(0.64, now, 0.25);
      airGain.gain.setTargetAtTime(0.042, now, 0.25);
      airFilter.frequency.setTargetAtTime(480, now, 0.25);
      humGain.gain.setTargetAtTime(0.014, now, 0.25);
      humFilter.frequency.setTargetAtTime(210, now, 0.25);
      lapMaster.gain.setTargetAtTime(1.0, now, 0.35);
      oscs[0].o.frequency.setTargetAtTime(54, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(81.15, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(108.3, now, 0.2);
    }
  }

  // Helper: filtered broadband noise burst with arbitrary frequency sweep (splashes, sloshes, taps).
  function playNoiseBurst({
    delay = 0,
    dur = 0.16,
    attack = 0.008,
    gain = 0.08,
    f0 = 800,
    fPeak = 1400,
    fEnd = 600,
    q = 1.6,
    pan = 0,
    reverbSend = 0.75,
  }) {
    if (ctx.state !== "running" || muted) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = pinkBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(Math.max(50, f0), t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(50, fPeak), t0 + Math.max(attack, dur * 0.28));
    bp.frequency.exponentialRampToValueAtTime(Math.max(50, fEnd), t0 + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const wetSend = ctx.createGain();
    wetSend.gain.value = reverbSend;

    src.connect(bp);
    bp.connect(env);
    env.connect(panner);
    panner.connect(master);
    panner.connect(wetSend);
    wetSend.connect(reverb);

    src.start(t0, rand() * 3.2);
    src.stop(t0 + dur + 0.03);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      env.disconnect();
      panner.disconnect();
      wetSend.disconnect();
    };
  }

  // Real physical Minnaert water droplet: tiny surface impact click + RISING-pitch entrained bubble resonance!
  function playBubbleDrip({
    delay = 0,
    gain = 0.045,
    baseFreq = 1150,
    pan = 0,
    reverbSend = 0.95,
    withClick = true,
  }) {
    if (ctx.state !== "running" || muted) return;
    const t0 = ctx.currentTime + delay;
    const dur = 0.055 + rand() * 0.045;

    if (withClick) {
      playNoiseBurst({
        delay,
        dur: 0.012,
        attack: 0.0015,
        gain: gain * 0.55,
        f0: 2600 + rand() * 1400,
        fPeak: 3800,
        fEnd: 1800,
        q: 2.2,
        pan,
        reverbSend: reverbSend * 0.6,
      });
    }

    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Minnaert bubble physics: frequency RISES sharply (~1.42x-1.60x) as the cavity pinches off and rises!
    const riseRatio = 1.42 + rand() * 0.18;
    osc.frequency.setValueAtTime(baseFreq, t0 + 0.003);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * riseRatio, t0 + dur * 0.72);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.setValueAtTime(0.0001, t0 + 0.003);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.007);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    const wetSend = ctx.createGain();
    wetSend.gain.value = reverbSend;

    osc.connect(env);
    env.connect(panner);
    panner.connect(master);
    panner.connect(wetSend);
    wetSend.connect(reverb);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      panner.disconnect();
      wetSend.disconnect();
    };
  }

  // Soft low thud helper for submerged tile contact or dry heel strike.
  function playHeelThud({ delay = 0, gain = 0.03, f0 = 150, f1 = 72, dur = 0.075, pan = 0, reverbSend = 0.5 }) {
    if (ctx.state !== "running" || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const wetSend = ctx.createGain();
    wetSend.gain.value = reverbSend;

    osc.connect(env);
    env.connect(panner);
    panner.connect(master);
    panner.connect(wetSend);
    wetSend.connect(reverb);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      panner.disconnect();
      wetSend.disconnect();
    };
  }

  // Multi-stage physical wading footstep (synchronized 1:1 with wakeTrail footsteps!)
  // Designed for unmistakable rhythmic left-right step-by-step water traversal ("一脚一脚涉水"),
  // with strong dry near-field presence and moderate room reverb rather than muddy reverb wash.
  function playFootstep({ inWater = false, speed = 0.9, side = 1 } = {}) {
    if (ctx.state !== "running" || muted) return;
    const pan = side * (0.28 + rand() * 0.08);
    const pitchBias = side > 0 ? 1.06 : 0.94;

    if (inWater) {
      const energy = Math.max(0.55, Math.min(1.45, speed / 0.88));

      // Beat 0 (0 ms): rear foot lifting & breaking water surface tension (hollow suction + sheet rattle)
      playNoiseBurst({
        delay: 0,
        dur: 0.078 + rand() * 0.022,
        attack: 0.012,
        gain: 0.105 * energy,
        f0: (205 + rand() * 45) * pitchBias,
        fPeak: (580 + rand() * 110) * pitchBias,
        fEnd: 245 * pitchBias,
        q: 2.25,
        pan: pan * 0.95,
        reverbSend: 0.28,
      });

      // Beat 1 (28 ms): heavy shin-plow through 60 cm deep water — signature rhythmic "shhh-LOOSH" stroke!
      const plowDelay = 0.026 + rand() * 0.012;
      playNoiseBurst({
        delay: plowDelay,
        dur: 0.21 + rand() * 0.045,
        attack: 0.024,
        gain: 0.245 * energy,
        f0: (135 + rand() * 25) * pitchBias,
        fPeak: (490 + rand() * 90 * energy) * pitchBias,
        fEnd: (180 + rand() * 35) * pitchBias,
        q: 1.9,
        pan,
        reverbSend: 0.34,
      });
      playNoiseBurst({
        delay: plowDelay + 0.016,
        dur: 0.18 + rand() * 0.04,
        attack: 0.020,
        gain: 0.185 * energy,
        f0: (480 + rand() * 110) * pitchBias,
        fPeak: (1380 + rand() * 280 * energy) * pitchBias,
        fEnd: (520 + rand() * 90) * pitchBias,
        q: 1.75,
        pan: pan * 1.1,
        reverbSend: 0.40,
      });

      // Beat 2 (110-125 ms): submerged ceramic sole plant + crisp dry near-field forward splash spray!
      const plantDelay = 0.105 + rand() * 0.02;
      playHeelThud({
        delay: plantDelay,
        gain: 0.062 * energy,
        f0: (118 + rand() * 18) * pitchBias,
        f1: 50,
        dur: 0.075,
        pan,
        reverbSend: 0.24,
      });
      playNoiseBurst({
        delay: plantDelay + 0.008,
        dur: 0.135 + rand() * 0.04,
        attack: 0.010,
        gain: 0.118 * energy,
        f0: (1650 + rand() * 350) * pitchBias,
        fPeak: (3950 + rand() * 650) * pitchBias,
        fEnd: 1220,
        q: 1.35,
        pan: pan * 1.18,
        reverbSend: 0.44,
      });

      // Beat 3 (200-355 ms): brief pocket slosh settle + 2-3 trailing Minnaert calf drips in the stride gap
      playNoiseBurst({
        delay: 0.195 + rand() * 0.025,
        dur: 0.105 + rand() * 0.03,
        attack: 0.020,
        gain: 0.062 * energy,
        f0: 195 * pitchBias,
        fPeak: 330 * pitchBias,
        fEnd: 165,
        q: 2.1,
        pan: -pan * 0.35,
        reverbSend: 0.42,
      });
      const dropCount = energy > 1.15 ? 3 : 2;
      for (let i = 0; i < dropCount; i++) {
        playBubbleDrip({
          delay: 0.215 + i * 0.065 + rand() * 0.035,
          gain: (0.016 + rand() * 0.016) * energy,
          baseFreq: 860 + rand() * 1450,
          pan: pan + (rand() - 0.5) * 0.36,
          reverbSend: 0.68,
          withClick: i === 0,
        });
      }
      return;
    }

    // Dry-surface footsteps tailored to active environment material
    if (profile === "backrooms") {
      // Muffled damp commercial loop carpet step (soft heel + subtle damp fabric squelch)
      playNoiseBurst({
        delay: 0,
        dur: 0.082,
        attack: 0.008,
        gain: 0.048,
        f0: 250 * pitchBias,
        fPeak: 640 * pitchBias,
        fEnd: 210,
        q: 1.15,
        pan,
        reverbSend: 0.16,
      });
      playNoiseBurst({
        delay: 0.022,
        dur: 0.055,
        attack: 0.006,
        gain: 0.024,
        f0: 620 * pitchBias,
        fPeak: 1120 * pitchBias,
        fEnd: 460,
        q: 1.8,
        pan,
        reverbSend: 0.14,
      });
      playHeelThud({ delay: 0, gain: 0.034, f0: 96 * pitchBias, f1: 50, dur: 0.058, pan, reverbSend: 0.12 });
    } else if (profile === "parking") {
      // Echoing damp subterranean concrete step (crisp hard heel click + subtle wet-film splash nuance)
      const wetPatch = rand() < 0.42;
      playNoiseBurst({
        delay: 0,
        dur: wetPatch ? 0.095 : 0.048,
        attack: 0.003,
        gain: wetPatch ? 0.082 : 0.068,
        f0: (wetPatch ? 880 : 760) * pitchBias,
        fPeak: (wetPatch ? 2650 : 1920) * pitchBias,
        fEnd: 640,
        q: wetPatch ? 1.35 : 1.55,
        pan,
        reverbSend: 0.72,
      });
      playHeelThud({ delay: 0, gain: 0.048, f0: 152 * pitchBias, f1: 60, dur: 0.062, pan, reverbSend: 0.62 });
      if (wetPatch) {
        playBubbleDrip({
          delay: 0.065 + rand() * 0.04,
          gain: 0.011,
          baseFreq: 1350 + rand() * 900,
          pan,
          reverbSend: 0.75,
          withClick: false,
        });
      }
    } else {
      // Poolrooms wet porcelain deck tap with tiled hall reverb
      playNoiseBurst({
        delay: 0,
        dur: 0.042,
        attack: 0.003,
        gain: 0.062,
        f0: 1120 * pitchBias,
        fPeak: 2450 * pitchBias,
        fEnd: 880,
        q: 1.75,
        pan,
        reverbSend: 0.62,
      });
      playHeelThud({ delay: 0, gain: 0.036, f0: 175 * pitchBias, f1: 84, dur: 0.052, pan, reverbSend: 0.50 });
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
      master.gain.setTargetAtTime(muted ? 0 : 0.58, ctx.currentTime, 0.06);
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
    update(t, moveSpeed, inWater) {
      if (ctx.state !== "running" || muted) return;
      const now = ctx.currentTime;
      const speed = typeof moveSpeed === "number" ? moveSpeed : moveSpeed ? 1.0 : 0.0;
      const moving = speed > 0.08;

      // Very subtle ankle-flow background drag (kept 6x quieter than individual wading strides so the
      // unmistakable left-right step-by-step cadence dominates clearly!).
      const wadeNorm = inWater ? Math.min(1.0, speed / 1.45) : 0.0;
      const tau = wadeNorm > 0.05 ? 0.09 : 0.24;
      wadeSwirlGain.gain.setTargetAtTime(wadeNorm * 0.015, now, tau);
      wadeSwirlBP.frequency.setTargetAtTime(220 + wadeNorm * 280, now, 0.10);
      wadeFrothGain.gain.setTargetAtTime(wadeNorm * wadeNorm * 0.007, now, tau);
      wadeFrothBP.frequency.setTargetAtTime(1400 + wadeNorm * 1200, now, 0.10);

      // Organic distant Minnaert water droplets echoing across Poolrooms halls AND subterranean Level 1 puddles!
      if ((profile === "poolrooms" || profile === "parking") && t >= nextDripTime) {
        const pan = (rand() * 2 - 1) * 0.80;
        const isParking = profile === "parking";
        const baseFreq = isParking ? 540 + rand() * 760 : 780 + rand() * 1150;
        const gain = isParking ? 0.018 + rand() * 0.024 : 0.022 + rand() * 0.032;
        playBubbleDrip({ delay: 0, gain, baseFreq, pan, reverbSend: 0.96, withClick: true });
        if (rand() < 0.28) {
          playBubbleDrip({
            delay: 0.18 + rand() * 0.24,
            gain: gain * 0.65,
            baseFreq: baseFreq * (0.92 + rand() * 0.22),
            pan: pan + (rand() - 0.5) * 0.15,
            reverbSend: 0.96,
            withClick: true,
          });
        }
        nextDripTime = t + (isParking ? 3.2 + rand() * 4.8 : 2.2 + rand() * 3.8);
      }

      // Dry-surface rhythmic footsteps (in-water footsteps fire directly from wakeTrail contact!)
      if (!inWater && moving) {
        const cadence = Math.max(0.34, Math.min(0.56, 0.96 / Math.max(speed, 0.5)));
        if (t - lastDryStep >= cadence) {
          lastDryStep = t;
          dryFootSide = -dryFootSide;
          playFootstep({ inWater: false, speed, side: dryFootSide });
        }
      }
    },
    inspect: () => ({ state: ctx.state, muted, profile }),
  };
}
