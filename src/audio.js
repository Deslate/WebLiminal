// Entire soundscape is synthesized locally: ventilation, water and a long tiled-room tail.
export function createSoundscape(status) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) {
    status.textContent = "此浏览器无法播放空间声音";
    return {
      update() {},
      unlock() {},
      toggle() {},
      inspect: () => ({ state: "unsupported" }),
    };
  }
  const ctx = new Context();
  const pending = [];
  const master = ctx.createGain();
  master.gain.value = 0.62;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  master.connect(analyser);
  analyser.connect(ctx.destination);
  const reverb = ctx.createConvolver();
  const impulse = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
  let seed = 7182;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < data.length; i++)
      data[i] = (rand() * 2 - 1) * Math.exp((-i / ctx.sampleRate) * 1.6) * 0.38;
  }
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.6;
  reverb.connect(wet);
  wet.connect(master);
  const room = ctx.createGain();
  room.gain.value = 0.12;
  room.connect(master);
  room.connect(reverb);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    brown = (brown + (rand() * 2 - 1) * 0.022) / 1.022;
    data[i] = brown * 3;
  }
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 850;
  source.connect(filter);
  filter.connect(room);
  pending.push(source);
  const hum = ctx.createGain();
  hum.gain.value = 0.038;
  hum.connect(master);
  hum.connect(reverb);
  for (const f of [54, 81.15, 108.3]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.connect(hum);
    pending.push(osc);
  }
  const pressure = ctx.createOscillator();
  pressure.frequency.value = 32;
  const pressureGain = ctx.createGain();
  pressureGain.gain.value = 0;
  pressure.connect(pressureGain);
  pressureGain.connect(master);
  pending.push(pressure);
  let muted = false,
    lastDrop = -10,
    lastStep = 0,
    eventTriggered = false;
  function refresh() {
    status.textContent = muted
      ? "声音已关闭 · M 开启"
      : ctx.state === "running"
        ? ""
        : "任意键 / 点击 · 唤醒声音";
  }
  function startSources() {
    if (ctx.state === "running") {
      for (const node of pending.splice(0)) node.start();
    }
    refresh();
  }
  ctx.addEventListener("statechange", startSources);
  startSources();
  function unlock() {
    if (ctx.state === "suspended") ctx.resume().then(refresh).catch(refresh);
  }
  // Calling resume before interaction produces a policy warning in Chrome. The running
  // state already tells us whether this origin has autoplay permission; unlock on input.
  function drop(gain = 0.07, freq = 680, pan = -0.4) {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(),
      envelope = ctx.createGain(),
      panner = ctx.createStereoPanner();
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.35, now + 0.22);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
    panner.pan.value = pan;
    osc.connect(envelope);
    envelope.connect(panner);
    panner.connect(master);
    panner.connect(reverb);
    osc.start(now);
    osc.stop(now + 0.7);
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
      panner.disconnect();
    };
  }
  return {
    unlock,
    toggle() {
      unlock();
      muted = !muted;
      master.gain.setTargetAtTime(muted ? 0 : 0.62, ctx.currentTime, 0.06);
      refresh();
    },
    update(t, moving, disturbance) {
      const now = ctx.currentTime;
      room.gain.setTargetAtTime(0.12 * (1 - disturbance * 0.88), now, 0.1);
      hum.gain.setTargetAtTime(0.038 * (1 - disturbance * 0.95), now, 0.1);
      pressureGain.gain.setTargetAtTime(disturbance * 0.15, now, 0.2);
      if (t - lastDrop > 4.8 && disturbance < 0.4) {
        drop(0.06, 650 + Math.sin(t) * 140, Math.sin(t * 0.37) * 0.75);
        lastDrop = t;
      }
      if (moving && t - lastStep > 0.65) {
        drop(0.045, 190, Math.sin(t * 5) * 0.3);
        lastStep = t;
      }
      if (disturbance > 0.8 && !eventTriggered) {
        drop(0.3, 92, 0.65);
        eventTriggered = true;
      }
    },
    inspect() {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return {
        state: ctx.state,
        muted,
        rms: Math.sqrt(samples.reduce((a, b) => a + b * b, 0) / samples.length),
      };
    },
  };
}
