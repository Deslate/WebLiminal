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

  // Multi-stage physical wading footstep splash (synchronized 1:1 with wakeTrail footsteps!)
  // or surface-appropriate dry tile / damp carpet / echoing concrete footstep.
  function playFootstep({ inWater = false, speed = 0.9, side = 1 } = {}) {
    if (ctx.state !== "running" || muted) return;
    const pan = side * (0.18 + rand() * 0.12);

    if (inWater) {
      const energy = Math.max(0.45, Math.min(1.5, speed / 0.95));

      // Stage 1 (0 ms): submerged hydraulic displacement surge + muffled tile foot plant
      playNoiseBurst({
        delay: 0,
        dur: 0.15 + rand() * 0.04,
        attack: 0.016,
        gain: 0.085 * energy,
        f0: 150 + rand() * 40,
        fPeak: 340 + rand() * 70,
        fEnd: 170,
        q: 1.25,
        pan,
        reverbSend: 0.72,
      });
      playHeelThud({
        delay: 0.005,
        gain: 0.024 * energy,
        f0: 120 + rand() * 20,
        f1: 68,
        dur: 0.065,
        pan,
        reverbSend: 0.45,
      });

      // Stage 2 (25-45 ms): forward shin-kick slosh + crisp frothy surface splash!
      const kickDelay = 0.024 + rand() * 0.022;
      playNoiseBurst({
        delay: kickDelay,
        dur: 0.20 + rand() * 0.08,
        attack: 0.018,
        gain: 0.115 * energy,
        f0: 440 + rand() * 140,
        fPeak: 1180 + rand() * 340 * energy,
        fEnd: 480 + rand() * 120,
        q: 1.55,
        pan: pan * 1.15,
        reverbSend: 0.85,
      });
      playNoiseBurst({
        delay: kickDelay + 0.012,
        dur: 0.14 + rand() * 0.06,
        attack: 0.012,
        gain: 0.062 * energy,
        f0: 1750 + rand() * 450,
        fPeak: 3300 + rand() * 700,
        fEnd: 1350,
        q: 1.3,
        pan: pan * 1.25,
        reverbSend: 0.80,
      });

      // Stage 3 (110-390 ms): 4 staggered Minnaert rising-pitch droplets pattering back onto the pool!
      const dropCount = energy > 1.15 ? 5 : 3;
      for (let i = 0; i < dropCount; i++) {
        playBubbleDrip({
          delay: 0.105 + i * 0.055 + rand() * 0.045,
          gain: (0.012 + rand() * 0.016) * energy,
          baseFreq: 950 + rand() * 1650,
          pan: pan + (rand() - 0.5) * 0.42,
          reverbSend: 0.90,
          withClick: i < 2,
        });
      }
      return;
    }

    // Dry-surface footsteps tailored to active environment material
    if (profile === "backrooms") {
      // Soft muffled damp carpet step
      playNoiseBurst({
        delay: 0,
        dur: 0.075,
        attack: 0.008,
        gain: 0.036,
        f0: 260,
        fPeak: 540,
        fEnd: 220,
        q: 1.0,
        pan,
        reverbSend: 0.18,
      });
      playHeelThud({ delay: 0, gain: 0.022, f0: 98, f1: 54, dur: 0.055, pan, reverbSend: 0.14 });
    } else if (profile === "parking") {
      // Echoing damp subterranean concrete step
      playNoiseBurst({
        delay: 0,
        dur: 0.048,
        attack: 0.004,
        gain: 0.058,
        f0: 750,
        fPeak: 1850,
        fEnd: 620,
        q: 1.4,
        pan,
        reverbSend: 0.88,
      });
      playHeelThud({ delay: 0, gain: 0.036, f0: 145, f1: 62, dur: 0.06, pan, reverbSend: 0.72 });
    } else {
      // Poolrooms wet porcelain deck tap with tiled hall reverb
      playNoiseBurst({
        delay: 0,
        dur: 0.036,
        attack: 0.003,
        gain: 0.054,
        f0: 1100,
        fPeak: 2350,
        fEnd: 900,
        q: 1.8,
        pan,
        reverbSend: 0.85,
      });
      playHeelThud({ delay: 0, gain: 0.028, f0: 175, f1: 86, dur: 0.05, pan, reverbSend: 0.65 });
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

      // Continuous speed-driven wading water drag & froth (smoothly settles when stopping!)
      const wadeNorm = inWater ? Math.min(1.0, speed / 1.45) : 0.0;
      const tau = wadeNorm > 0.05 ? 0.08 : 0.28;
      wadeSwirlGain.gain.setTargetAtTime(wadeNorm * 0.105, now, tau);
      wadeSwirlBP.frequency.setTargetAtTime(240 + wadeNorm * 380, now, 0.09);
      wadeFrothGain.gain.setTargetAtTime(wadeNorm * wadeNorm * 0.048, now, tau);
      wadeFrothBP.frequency.setTargetAtTime(1350 + wadeNorm * 1650, now, 0.09);

      // Organic distant Minnaert water droplets echoing across tiled Poolrooms halls
      if (profile === "poolrooms" && t >= nextDripTime) {
        const pan = (rand() * 2 - 1) * 0.78;
        const baseFreq = 780 + rand() * 1150;
        const gain = 0.022 + rand() * 0.032;
        playBubbleDrip({ delay: 0, gain, baseFreq, pan, reverbSend: 0.96, withClick: true });
        // Occasional soft double-drip echo (classic ceiling condensation drop)
        if (rand() < 0.28) {
          playBubbleDrip({
            delay: 0.18 + rand() * 0.22,
            gain: gain * 0.65,
            baseFreq: baseFreq * (0.92 + rand() * 0.22),
            pan: pan + (rand() - 0.5) * 0.15,
            reverbSend: 0.96,
            withClick: true,
          });
        }
        nextDripTime = t + 2.2 + rand() * 3.8;
      }

      // Dry-surface rhythmic footsteps (in-water footsteps fire directly from wakeTrail contact!)
      if (!inWater && moving) {
        const cadence = Math.max(0.32, Math.min(0.54, 0.92 / Math.max(speed, 0.5)));
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
