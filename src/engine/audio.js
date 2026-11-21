// Procedural Web Audio soundscape synthesizer tailored to each liminal environment.
// Zero audio files: generates reverb impulses, fluorescent ballast hum, HVAC drone,
// water drips, and surface-appropriate footsteps in real time.

export function createAudioEngine(statusEl) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) {
    return {
      setProfile() {},
      unlock() {},
      toggle() {},
      setPaused() {},
      update() {},
      inspect: () => ({ state: "unsupported", muted: true, profile: "none" }),
    };
  }

  const ctx = new Context();
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // Long architectural tiled/concrete convolution reverb tail.
  const reverb = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 3.2);
  const impulse = ctx.createBuffer(2, irLen, ctx.sampleRate);
  let seed = 9137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      d[i] = (rand() * 2 - 1) * Math.exp((-i / ctx.sampleRate) * 1.9) * 0.34;
    }
  }
  reverb.buffer = impulse;

  const wet = ctx.createGain();
  wet.gain.value = 0.52;
  reverb.connect(wet);
  wet.connect(master);

  // Continuous filtered brown-noise room air bed.
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < nd.length; i++) {
    brown = (brown + (rand() * 2 - 1) * 0.024) / 1.024;
    nd[i] = brown * 2.8;
  }
  const airSrc = ctx.createBufferSource();
  airSrc.buffer = noiseBuf;
  airSrc.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "lowpass";
  airFilter.frequency.value = 620;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.09;
  airSrc.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(master);
  airGain.connect(reverb);

  // Harmonic hum bank (switches smoothly between 60Hz fluorescent buzz & low room resonance).
  const humGain = ctx.createGain();
  humGain.gain.value = 0.03;
  humGain.connect(master);
  humGain.connect(reverb);
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 420;
  humFilter.connect(humGain);
  const oscs = [60, 120, 180.3].map((f, idx) => {
    const o = ctx.createOscillator();
    o.type = idx === 2 ? "sawtooth" : "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = idx === 0 ? 0.6 : idx === 1 ? 0.35 : 0.08;
    o.connect(g);
    g.connect(humFilter);
    return { o, g };
  });

  const pending = [airSrc, ...oscs.map((x) => x.o)];
  let started = false;
  let paused = false;
  let muted = false;
  let profile = "poolrooms";
  let lastDrip = -10;
  let lastStep = 0;

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
      for (const n of pending) n.start();
    }
    refreshStatus();
  }
  ctx.addEventListener("statechange", startPending);
  startPending();

  function applyProfile() {
    const now = ctx.currentTime;
    if (profile === "backrooms") {
      // Iconic 60Hz fluorescent ballast buzz + dry carpeted space
      wet.gain.setTargetAtTime(0.24, now, 0.25);
      airGain.gain.setTargetAtTime(0.055, now, 0.25);
      airFilter.frequency.setTargetAtTime(480, now, 0.25);
      humGain.gain.setTargetAtTime(0.075, now, 0.25);
      humFilter.frequency.setTargetAtTime(520, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(60, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(120, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(240.4, now, 0.2);
    } else if (profile === "parking") {
      // Deep concrete ventilation sub-drone + long echoing space
      wet.gain.setTargetAtTime(0.68, now, 0.25);
      airGain.gain.setTargetAtTime(0.11, now, 0.25);
      airFilter.frequency.setTargetAtTime(340, now, 0.25);
      humGain.gain.setTargetAtTime(0.055, now, 0.25);
      humFilter.frequency.setTargetAtTime(210, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(46, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(92.2, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(138.5, now, 0.2);
    } else {
      // Poolrooms tiled hall resonance + gentle water acoustics
      wet.gain.setTargetAtTime(0.62, now, 0.25);
      airGain.gain.setTargetAtTime(0.10, now, 0.25);
      airFilter.frequency.setTargetAtTime(820, now, 0.25);
      humGain.gain.setTargetAtTime(0.025, now, 0.25);
      humFilter.frequency.setTargetAtTime(260, now, 0.25);
      oscs[0].o.frequency.setTargetAtTime(54, now, 0.2);
      oscs[1].o.frequency.setTargetAtTime(81.1, now, 0.2);
      oscs[2].o.frequency.setTargetAtTime(108.3, now, 0.2);
    }
  }

  function pingTone(gain, freq0, freq1, dur, pan = 0) {
    if (ctx.state !== "running" || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const panner = ctx.createStereoPanner();
    osc.frequency.setValueAtTime(freq0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq1), now + dur * 0.4);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    panner.pan.value = pan;
    osc.connect(env);
    env.connect(panner);
    panner.connect(master);
    panner.connect(reverb);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      panner.disconnect();
    };
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
      master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.06);
      refreshStatus();
    },
    setPaused(v) {
      if (paused === v) return;
      paused = v;
      if (v) ctx.suspend().catch(refreshStatus);
      else ctx.resume().then(refreshStatus).catch(refreshStatus);
      refreshStatus();
    },
    update(t, moving, inWater) {
      if (ctx.state !== "running" || muted) return;
      if (profile === "poolrooms" && t - lastDrip > 4.6) {
        pingTone(0.055, 680 + Math.sin(t * 1.7) * 160, 240, 0.55, Math.sin(t * 0.43) * 0.7);
        lastDrip = t;
      }
      const stepPeriod = inWater ? 0.62 : 0.46;
      if (moving && t - lastStep > stepPeriod) {
        const pan = Math.sin(t * 6.0) * 0.25;
        if (inWater) pingTone(0.05, 220, 95, 0.35, pan);
        else if (profile === "backrooms") pingTone(0.025, 115, 60, 0.12, pan);
        else pingTone(0.045, 185, 70, 0.24, pan);
        lastStep = t;
      }
    },
    inspect: () => ({ state: ctx.state, muted, profile }),
  };
}
