// Pure-Code Classic Backrooms / Liminal Space BGM Synthesizer (Web Audio API).
// Zero external audio files, zero dependencies.
//
// Faithful pure-code Web Audio arrangements of iconic Backrooms classics:
//   - poolrooms (default ON)  : "Hi — TEMPOREX" (76 BPM, warm lo-fi Dexed/DX7 FM electric piano
//                                & dreamy organ pad on the iconic Fmaj7 -> Dmaj7 -> Dm7 -> Am7 -> D7 sway)
//   - backrooms (default OFF) : "It's Just a Burning Memory (Heartaches, 1931)" (79 BPM Ab Major
//                                1930s muted-horn ballroom arrangement, vinyl crackle, distant hall reverb;
//                                Level 0 defaults to pure realistic fluorescent ballast ambience unless toggled ON)

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Pure declarative 16-bar track data (exported for deterministic validation in unit tests).
export const BGM_TRACKS = {
  // =========================================================================
  // POOLROOMS · "Hi" — TEMPOREX (Care, 2016) — Pure-Code DX7 / Dexed Lo-Fi Arrangement
  // 76 BPM (152 BPM double-time), 4/4 dreamy swaying meter (8 eighth-note steps/bar, 16 bars = 50.5 s)
  // Authentic Chordify harmonic progression: Fmaj7 -> Dmaj7 -> Dm7 -> Am7/Dm7 -> D7 -> Fmaj7/F7 -> D7
  // =========================================================================
  poolrooms: {
    id: "poolrooms",
    title: "Hi — TEMPOREX",
    style: "Classic Backrooms DX7 Lo-Fi",
    defaultEnabled: true,
    bpm: 76,
    stepsPerBar: 8, // 4 quarter beats x 2 eighth subdivisions
    bars: 16,
    filterLowHz: 62,
    filterHighHz: 3850,
    filterQ: 0.7,
    wowDepthCents: 12.5,
    wowRateHz: 0.28,
    flutterDepthCents: 3.4,
    vinylLevel: 0.010, // subtle warm bedroom-cassette air
    reverbSend: 0.80,
    delaySend: 0.36,
    baseGain: 0.38,
    chords: [
      { bass: 41, notes: [57, 60, 64, 69] }, // 1:  Fmaj7 (A3 C4 E4 A4)
      { bass: 41, notes: [57, 60, 64, 67] }, // 2:  Fmaj9 (A3 C4 E4 G4)
      { bass: 38, notes: [54, 57, 61, 66] }, // 3:  Dmaj7 (F#3 A3 C#4 F#4) — iconic nostalgic major lift!
      { bass: 38, notes: [54, 57, 60, 64] }, // 4:  D9    (F#3 A3 C4 E4)
      { bass: 38, notes: [53, 57, 60, 65] }, // 5:  Dm7   (F3 A3 C4 F4)
      { bass: 45, notes: [55, 60, 64, 67] }, // 6:  Am7   (G3 C4 E4 G4) -> softens into Dm7
      { bass: 38, notes: [54, 57, 60, 66] }, // 7:  D7    (F#3 A3 C4 F#4)
      { bass: 38, notes: [54, 57, 60, 64] }, // 8:  D9    (F#3 A3 C4 E4)
      { bass: 41, notes: [57, 60, 64, 69] }, // 9:  Fmaj7
      { bass: 41, notes: [57, 60, 63, 69] }, // 10: F7    (dreamy bluesy color turn from recording)
      { bass: 38, notes: [54, 57, 60, 66] }, // 11: D7
      { bass: 38, notes: [54, 57, 60, 64] }, // 12: D9
      { bass: 41, notes: [57, 60, 64, 69] }, // 13: Fmaj7
      { bass: 38, notes: [54, 57, 61, 66] }, // 14: Dmaj7
      { bass: 38, notes: [53, 57, 60, 65] }, // 15: Dm7
      { bass: 38, notes: [54, 57, 60, 64] }, // 16: D7(9) -> hypnotic loop back to Fmaj7
    ],
    // Gentle, hypnotic, nostalgic high DX7 bell-keyboard motif floating over the Fmaj7 <-> Dmaj7 sway
    melody: [
      // Bars 1-2 (Fmaj7): warm tender floating motif
      { step: 0, midi: 76, dur: 3, vel: 0.68 },  // E5
      { step: 3, midi: 72, dur: 2, vel: 0.56 },  // C5
      { step: 5, midi: 69, dur: 3, vel: 0.62 },  // A4
      { step: 8, midi: 76, dur: 3, vel: 0.66 },  // E5
      { step: 11, midi: 74, dur: 2, vel: 0.56 }, // D5
      { step: 13, midi: 72, dur: 3, vel: 0.60 }, // C5
      // Bars 3-4 (Dmaj7 -> D9): unmistakable uncanny bright F#5 lift!
      { step: 16, midi: 78, dur: 3, vel: 0.72 }, // F#5
      { step: 19, midi: 74, dur: 2, vel: 0.58 }, // D5
      { step: 21, midi: 73, dur: 3, vel: 0.64 }, // C#5
      { step: 24, midi: 76, dur: 3, vel: 0.66 }, // E5
      { step: 27, midi: 74, dur: 2, vel: 0.56 }, // D5
      { step: 29, midi: 72, dur: 3, vel: 0.58 }, // C5
      // Bars 5-6 (Dm7 -> Am7): bittersweet descending nostalgia
      { step: 32, midi: 77, dur: 3, vel: 0.68 }, // F5
      { step: 35, midi: 76, dur: 2, vel: 0.58 }, // E5
      { step: 37, midi: 72, dur: 3, vel: 0.60 }, // C5
      { step: 40, midi: 76, dur: 3, vel: 0.64 }, // E5
      { step: 43, midi: 72, dur: 2, vel: 0.54 }, // C5
      { step: 45, midi: 69, dur: 3, vel: 0.58 }, // A4
      // Bars 7-8 (D7 -> D9): luminous floating suspension
      { step: 48, midi: 78, dur: 4, vel: 0.70 }, // F#5
      { step: 52, midi: 76, dur: 4, vel: 0.62 }, // E5
      { step: 56, midi: 74, dur: 4, vel: 0.60 }, // D5
      { step: 60, midi: 72, dur: 4, vel: 0.56 }, // C5
      // Bars 9-10 (Fmaj7 -> F7): tender variation with Eb5 twist
      { step: 64, midi: 81, dur: 3, vel: 0.70 }, // A5
      { step: 67, midi: 76, dur: 2, vel: 0.60 }, // E5
      { step: 69, midi: 72, dur: 3, vel: 0.62 }, // C5
      { step: 72, midi: 75, dur: 3, vel: 0.68 }, // Eb5 (F7 color!)
      { step: 75, midi: 74, dur: 2, vel: 0.58 }, // D5
      { step: 77, midi: 72, dur: 3, vel: 0.60 }, // C5
      // Bars 11-12 (D7 -> D9)
      { step: 80, midi: 78, dur: 3, vel: 0.72 }, // F#5
      { step: 83, midi: 76, dur: 2, vel: 0.60 }, // E5
      { step: 85, midi: 74, dur: 3, vel: 0.62 }, // D5
      { step: 88, midi: 72, dur: 4, vel: 0.58 }, // C5
      { step: 92, midi: 69, dur: 4, vel: 0.54 }, // A4
      // Bars 13-16 (Fmaj7 -> Dmaj7 -> Dm7 -> D7): dreamy farewell cadence
      { step: 96, midi: 76, dur: 3, vel: 0.68 },  // E5
      { step: 99, midi: 79, dur: 2, vel: 0.62 },  // G5
      { step: 101, midi: 76, dur: 3, vel: 0.60 }, // E5
      { step: 104, midi: 78, dur: 4, vel: 0.70 }, // F#5
      { step: 108, midi: 73, dur: 4, vel: 0.58 }, // C#5
      { step: 112, midi: 77, dur: 4, vel: 0.64 }, // F5
      { step: 116, midi: 72, dur: 4, vel: 0.56 }, // C5
      { step: 120, midi: 74, dur: 4, vel: 0.60 }, // D5
      { step: 124, midi: 72, dur: 4, vel: 0.50 }, // C5
    ],
  },

  // =========================================================================
  // LEVEL 0 · "It's Just a Burning Memory" (Heartaches, 1931) — Optional Toggleable BGM
  // Default OFF so Level 0 plays pure harsh iconic fluorescent ballast hum!
  // 79 BPM, 4/4 ballroom slow foxtrot (8 eighth-note steps/bar, 16 bars = 48.6 s)
  // Authentic Al Bowlly / Ray Noble Ab Major harmonic chart & unmistakable muted-brass melody.
  // =========================================================================
  backrooms: {
    id: "backrooms",
    title: "It's Just a Burning Memory",
    style: "1931 Ballroom Gramophone (Heartaches)",
    defaultEnabled: false,
    bpm: 79,
    stepsPerBar: 8,
    bars: 16,
    filterLowHz: 230,
    filterHighHz: 2050,
    filterQ: 1.05,
    wowDepthCents: 16,
    wowRateHz: 0.33,
    flutterDepthCents: 4.8,
    vinylLevel: 0.042,
    reverbSend: 0.80,
    delaySend: 0.20,
    baseGain: 0.42,
    // Authentic Ab Major "Heartaches" 16-bar verse chord progression
    chords: [
      { bass: 44, notes: [56, 60, 63, 65] }, // 1:  Ab6
      { bass: 43, notes: [53, 55, 59, 62] }, // 2:  G7
      { bass: 44, notes: [56, 60, 63, 65] }, // 3:  Ab6
      { bass: 41, notes: [53, 57, 60, 63] }, // 4:  Ebm7 -> F7
      { bass: 46, notes: [53, 56, 58, 61] }, // 5:  Bbm7
      { bass: 39, notes: [54, 58, 60, 63] }, // 6:  Ebm6 -> Eb7
      { bass: 44, notes: [56, 60, 63, 65] }, // 7:  Ab6
      { bass: 39, notes: [55, 58, 61, 63] }, // 8:  Bb7 -> Eb7
      { bass: 44, notes: [56, 60, 63, 65] }, // 9:  Ab6
      { bass: 43, notes: [53, 55, 59, 62] }, // 10: G7
      { bass: 44, notes: [56, 60, 63, 65] }, // 11: Ab6
      { bass: 41, notes: [53, 57, 60, 63] }, // 12: Gb7 -> F7
      { bass: 46, notes: [53, 56, 58, 61] }, // 13: Bbm7
      { bass: 46, notes: [52, 56, 58, 61] }, // 14: Bbm7b5 -> Ab6
      { bass: 39, notes: [55, 58, 61, 63] }, // 15: Bbm7 -> Eb7
      { bass: 44, notes: [56, 60, 63, 65] }, // 16: Ab6 (homeward sigh)
    ],
    // Unmistakable "Heartaches" muted-horn melody in Ab Major (steps 0..127)
    melody: [
      // "Heart-aches..." (Ab6) / "heart-aches..." (G7)
      { step: 0, midi: 72, dur: 4, vel: 0.78 },  // C5
      { step: 4, midi: 75, dur: 4, vel: 0.72 },  // Eb5
      { step: 8, midi: 71, dur: 4, vel: 0.76 },  // B4
      { step: 12, midi: 74, dur: 4, vel: 0.70 }, // D5
      // "My lo-ving you meant on-ly heart-aches"
      { step: 16, midi: 72, dur: 3, vel: 0.74 }, // C5
      { step: 19, midi: 75, dur: 2, vel: 0.70 }, // Eb5
      { step: 21, midi: 77, dur: 3, vel: 0.76 }, // F5
      { step: 24, midi: 75, dur: 2, vel: 0.68 }, // Eb5
      { step: 26, midi: 72, dur: 2, vel: 0.66 }, // C5
      { step: 28, midi: 70, dur: 2, vel: 0.64 }, // Bb4
      { step: 30, midi: 68, dur: 2, vel: 0.62 }, // Ab4
      { step: 32, midi: 65, dur: 6, vel: 0.68 }, // F4 (lands on Bbm)
      // "Your kiss was such a sa-cred thing to me"
      { step: 40, midi: 65, dur: 2, vel: 0.62 }, // F4
      { step: 42, midi: 68, dur: 2, vel: 0.66 }, // Ab4
      { step: 44, midi: 70, dur: 2, vel: 0.68 }, // Bb4
      { step: 46, midi: 72, dur: 2, vel: 0.72 }, // C5
      { step: 48, midi: 73, dur: 2, vel: 0.74 }, // Db5
      { step: 50, midi: 72, dur: 2, vel: 0.68 }, // C5
      { step: 52, midi: 70, dur: 2, vel: 0.66 }, // Bb4
      { step: 54, midi: 75, dur: 4, vel: 0.74 }, // Eb5
      // "I can't be-lieve it's just a bur-ning me-mo-ry"
      { step: 58, midi: 74, dur: 2, vel: 0.66 }, // D5
      { step: 60, midi: 72, dur: 2, vel: 0.64 }, // C5
      { step: 62, midi: 70, dur: 2, vel: 0.62 }, // Bb4
      // Verse 2: "Heart-aches, heart-aches"
      { step: 64, midi: 72, dur: 4, vel: 0.78 }, // C5
      { step: 68, midi: 75, dur: 4, vel: 0.72 }, // Eb5
      { step: 72, midi: 71, dur: 4, vel: 0.76 }, // B4
      { step: 76, midi: 74, dur: 4, vel: 0.70 }, // D5
      // "What does it mat-ter how my heart breaks?"
      { step: 80, midi: 72, dur: 3, vel: 0.74 }, // C5
      { step: 83, midi: 75, dur: 2, vel: 0.70 }, // Eb5
      { step: 85, midi: 77, dur: 3, vel: 0.76 }, // F5
      { step: 88, midi: 75, dur: 2, vel: 0.68 }, // Eb5
      { step: 90, midi: 73, dur: 2, vel: 0.68 }, // Db5
      { step: 92, midi: 72, dur: 2, vel: 0.66 }, // C5
      { step: 94, midi: 69, dur: 2, vel: 0.64 }, // A4 (F7!)
      { step: 96, midi: 65, dur: 6, vel: 0.68 }, // F4 (Bbm)
      // "I should be hap-py with some-one new / But my heart aches for you"
      { step: 104, midi: 68, dur: 2, vel: 0.66 }, // Ab4
      { step: 106, midi: 70, dur: 2, vel: 0.68 }, // Bb4
      { step: 108, midi: 72, dur: 2, vel: 0.72 }, // C5
      { step: 110, midi: 73, dur: 2, vel: 0.74 }, // Db5
      { step: 112, midi: 75, dur: 3, vel: 0.74 }, // Eb5
      { step: 115, midi: 73, dur: 2, vel: 0.66 }, // Db5
      { step: 117, midi: 72, dur: 3, vel: 0.68 }, // C5
      { step: 120, midi: 70, dur: 2, vel: 0.64 }, // Bb4
      { step: 122, midi: 68, dur: 6, vel: 0.72 }, // Ab4 (resolves into fading hall echo)
    ],
  },
};

export function createBgmEngine(ctx, destination) {
  const sr = ctx.sampleRate;

  let seed = 42197;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // =========================================================================
  // 1. MASTER BGM TAPE & SPACE BUS
  // =========================================================================
  const bgmMaster = ctx.createGain();
  bgmMaster.gain.value = 0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.0;
  compressor.attack.value = 0.015;
  compressor.release.value = 0.28;

  // Warm analog tape saturation curve
  const shaper = ctx.createWaveShaper();
  const curveLen = 1024;
  const curve = new Float32Array(curveLen);
  for (let i = 0; i < curveLen; i++) {
    const x = (i * 2) / (curveLen - 1) - 1;
    curve[i] = Math.tanh(x * 1.38) / Math.tanh(1.38);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";

  const toneHP = ctx.createBiquadFilter();
  toneHP.type = "highpass";
  toneHP.frequency.value = 80;

  const toneLP = ctx.createBiquadFilter();
  toneLP.type = "lowpass";
  toneLP.frequency.value = 3400;
  toneLP.Q.value = 0.75;

  const synthBus = ctx.createGain();
  synthBus.gain.value = 1.0;
  synthBus.connect(shaper);
  shaper.connect(toneHP);
  toneHP.connect(toneLP);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.46;
  toneLP.connect(dryGain);
  dryGain.connect(compressor);

  // Lush 3.8 s natatorium / distant-ballroom stereo convolution reverb
  const bgmReverb = ctx.createConvolver();
  const irLen = Math.floor(sr * 3.8);
  const irBuf = ctx.createBuffer(2, irLen, sr);
  const preDelaySamples = Math.floor(sr * 0.024);
  for (let ch = 0; ch < 2; ch++) {
    const d = irBuf.getChannelData(ch);
    let lp = 0;
    for (let i = preDelaySamples; i < irLen; i++) {
      const t = (i - preDelaySamples) / sr;
      const alpha = Math.max(0.036, 0.30 * Math.exp(-t * 0.65));
      const w = (rand() * 2 - 1) * Math.exp(-t * 1.18);
      lp += (w - lp) * alpha;
      const swell = Math.min(1, t / 0.065);
      d[i] = lp * swell * 0.48;
    }
  }
  bgmReverb.buffer = irBuf;

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.78;
  toneLP.connect(reverbSend);
  reverbSend.connect(bgmReverb);
  bgmReverb.connect(compressor);

  // Warm stereo ping-pong tape echo (L = 395 ms, R = 525 ms — synced smoothly to ~76 BPM)
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.32;
  const delayL = ctx.createDelay(1.0);
  const delayR = ctx.createDelay(1.0);
  delayL.delayTime.value = 0.395;
  delayR.delayTime.value = 0.525;
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  fbL.gain.value = 0.34;
  fbR.gain.value = 0.34;
  const dlpL = ctx.createBiquadFilter();
  const dlpR = ctx.createBiquadFilter();
  dlpL.type = "lowpass";
  dlpR.type = "lowpass";
  dlpL.frequency.value = 1950;
  dlpR.frequency.value = 1950;
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  panL.pan.value = -0.58;
  panR.pan.value = 0.58;

  toneLP.connect(delaySend);
  delaySend.connect(delayL);
  delaySend.connect(delayR);
  delayL.connect(dlpL);
  dlpL.connect(fbL);
  fbL.connect(delayR);
  dlpL.connect(panL);
  panL.connect(compressor);
  panL.connect(bgmReverb);

  delayR.connect(dlpR);
  dlpR.connect(fbR);
  fbR.connect(delayL);
  dlpR.connect(panR);
  panR.connect(compressor);
  panR.connect(bgmReverb);

  compressor.connect(bgmMaster);
  bgmMaster.connect(destination);

  // =========================================================================
  // 2. PROCEDURAL VINYL CRACKLE & WARM CASSETTE TAPE HISS
  // =========================================================================
  const vinylLen = Math.floor(sr * 6.0);
  const vinylBuf = ctx.createBuffer(2, vinylLen, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = vinylBuf.getChannelData(ch);
    let pink = 0;
    for (let i = 0; i < vinylLen; i++) {
      const w = rand() * 2 - 1;
      pink = pink * 0.94 + w * 0.06;
      let s = pink * 0.14;
      const r = rand();
      if (r < 0.00026) s += (rand() * 2 - 1) * (0.28 + rand() * 0.52);
      else if (r < 0.0012) s += (rand() * 2 - 1) * 0.08;
      d[i] = s;
    }
  }
  const vinylSrc = ctx.createBufferSource();
  vinylSrc.buffer = vinylBuf;
  vinylSrc.loop = true;
  const vinylBP = ctx.createBiquadFilter();
  vinylBP.type = "bandpass";
  vinylBP.frequency.value = 2350;
  vinylBP.Q.value = 0.65;
  const vinylGain = ctx.createGain();
  vinylGain.gain.value = 0;
  vinylSrc.connect(vinylBP);
  vinylBP.connect(vinylGain);
  vinylGain.connect(compressor);

  let vinylStarted = false;
  let enabled = true;
  let volume = 0.72;
  let profile = "poolrooms";
  let stepIndex = 0;
  let loopCycle = 0;
  let nextStepTime = 0;
  let activeTrack = BGM_TRACKS.poolrooms;

  function activeGainTarget() {
    return enabled ? activeTrack.baseGain * volume : 0;
  }

  function applyTrackTone(immediate = false) {
    const now = ctx.currentTime;
    const tc = immediate ? 0.02 : 0.32;
    toneHP.frequency.setTargetAtTime(activeTrack.filterLowHz, now, tc);
    toneLP.frequency.setTargetAtTime(activeTrack.filterHighHz, now, tc);
    toneLP.Q.setTargetAtTime(activeTrack.filterQ, now, tc);
    reverbSend.gain.setTargetAtTime(activeTrack.reverbSend, now, tc);
    delaySend.gain.setTargetAtTime(activeTrack.delaySend, now, tc);
    vinylGain.gain.setTargetAtTime(enabled ? activeTrack.vinylLevel * volume : 0, now, tc);
    bgmMaster.gain.setTargetAtTime(activeGainTarget(), now, tc);
  }

  function tapeDetuneCents(t) {
    const wow = Math.sin(t * activeTrack.wowRateHz * Math.PI * 2) * activeTrack.wowDepthCents
      + Math.sin(t * activeTrack.wowRateHz * 0.57 * Math.PI * 2 + 1.3) * (activeTrack.wowDepthCents * 0.45);
    const flutter = Math.sin(t * 5.4 * Math.PI * 2 + 0.7) * activeTrack.flutterDepthCents;
    return wow + flutter;
  }

  // =========================================================================
  // 3. PURE-CODE INSTRUMENTS (Dexed/DX7 FM E-Piano, Warm Organ, 1930s Muted Horn)
  // =========================================================================

  // Authentic Yamaha DX7 / Dexed FM electric piano (signature Temporex "Hi" timbre!):
  // Dual chorused sine carriers + 2x warm FM body modulator + 7x/14x subtle bell tine transient.
  function playDx7Key(midi, t0, dur, vel, { tine = 1.0, cutoff = 3200, pan = 0, attack = 0.010, chorus = 5.5 } = {}) {
    const hz = midiToHz(midi);
    const det = tapeDetuneCents(t0);

    const c1 = ctx.createOscillator();
    const c2 = ctx.createOscillator();
    c1.type = "sine";
    c2.type = "sine";
    c1.frequency.setValueAtTime(hz, t0);
    c2.frequency.setValueAtTime(hz, t0);
    c1.detune.setValueAtTime(det - chorus, t0);
    c2.detune.setValueAtTime(det + chorus, t0);
    c1.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.8) - chorus, t0 + dur);
    c2.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.8) + chorus, t0 + dur);

    // Operator 2: warm 1x/2x FM electric piano bark decaying smoothly into pure round sustain
    const modWarm = ctx.createOscillator();
    modWarm.type = "sine";
    modWarm.frequency.setValueAtTime(hz * 2.0, t0);
    const modWarmG = ctx.createGain();
    modWarmG.gain.setValueAtTime(Math.max(0.05, hz * 0.48 * vel), t0);
    modWarmG.gain.exponentialRampToValueAtTime(Math.max(0.02, hz * 0.04), t0 + Math.min(0.65, dur * 0.75));
    modWarm.connect(modWarmG);
    modWarmG.connect(c1.frequency);
    modWarmG.connect(c2.frequency);

    // Operator 3: glassy DX7 tine bell chime transient (7x harmonic ratio -> signature dreamy sparkle!)
    const modTine = ctx.createOscillator();
    modTine.type = "sine";
    modTine.frequency.setValueAtTime(hz * 7.0, t0);
    const modTineG = ctx.createGain();
    modTineG.gain.setValueAtTime(Math.max(0.05, hz * 0.32 * tine * vel), t0);
    modTineG.gain.exponentialRampToValueAtTime(0.01, t0 + 0.14);
    modTine.connect(modTineG);
    modTineG.connect(c1.frequency);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(cutoff, t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(520, cutoff * 0.42), t0 + dur + 0.35);

    const env = ctx.createGain();
    const peak = Math.max(0.002, vel * 0.145);
    const rel = Math.max(0.45, Math.min(1.6, dur * 0.7));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.30), t0 + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    c1.connect(lp);
    c2.connect(lp);
    lp.connect(env);
    env.connect(panner);
    panner.connect(synthBus);

    const stopAt = t0 + dur + rel + 0.05;
    c1.start(t0); c2.start(t0); modWarm.start(t0); modTine.start(t0);
    c1.stop(stopAt); c2.stop(stopAt); modWarm.stop(stopAt); modTine.stop(stopAt);
    c1.onended = () => {
      c1.disconnect(); c2.disconnect();
      modWarm.disconnect(); modWarmG.disconnect();
      modTine.disconnect(); modTineG.disconnect();
      lp.disconnect(); env.disconnect(); panner.disconnect();
    };
  }

  // Dreamy lo-fi DX7 / bedroom-pop sustained synth organ pad
  function playWarmPad(notes, t0, dur, vel, { cutoff = 1280, spread = 8, attack = 0.55, release = 1.0 } = {}) {
    const det = tapeDetuneCents(t0);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(cutoff * 0.72, t0);
    filt.frequency.linearRampToValueAtTime(cutoff * 1.12, t0 + dur * 0.55);
    filt.frequency.linearRampToValueAtTime(cutoff * 0.75, t0 + dur + release);
    filt.Q.value = 0.75;

    const env = ctx.createGain();
    const peak = Math.max(0.002, (vel * 0.13) / Math.sqrt(Math.max(1, notes.length)));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.setValueAtTime(peak * 0.88, t0 + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);

    filt.connect(env);
    env.connect(synthBus);

    const stopAt = t0 + dur + release + 0.05;
    const spawned = [];
    notes.forEach((midi, idx) => {
      const hz = midiToHz(midi);
      for (const side of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = side < 0 ? "triangle" : "sine";
        o.frequency.setValueAtTime(hz, t0);
        o.detune.setValueAtTime(det + side * spread + (idx - 1.5) * 1.4, t0);
        o.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.75) + side * spread, t0 + dur);
        const og = ctx.createGain();
        og.gain.value = side < 0 ? 0.45 : 0.55;
        o.connect(og);
        og.connect(filt);
        o.start(t0);
        o.stop(stopAt);
        spawned.push(o, og);
      }
    });
    if (spawned[0]) {
      spawned[0].onended = () => {
        for (const n of spawned) n.disconnect();
        filt.disconnect();
        env.disconnect();
      };
    }
  }

  // 1930s muted ballroom horn (Heartaches / It's Just a Burning Memory lead voice)
  function playBallroomHorn(midi, t0, dur, vel, { cutoff = 1220, pan = 0.1 } = {}) {
    const hz = midiToHz(midi);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(cutoff, t0);
    filt.frequency.exponentialRampToValueAtTime(cutoff * 0.62, t0 + dur);
    filt.Q.value = 1.6;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "triangle";
    o2.type = "sawtooth";
    o1.frequency.setValueAtTime(hz, t0);
    o2.frequency.setValueAtTime(hz, t0);

    const baseDet = tapeDetuneCents(t0);
    o1.detune.setValueAtTime(baseDet - 12, t0);
    o1.detune.linearRampToValueAtTime(baseDet, t0 + 0.14);
    o1.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.7), t0 + dur);
    o2.detune.setValueAtTime(baseDet + 7, t0);
    o2.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.7) + 7, t0 + dur);

    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    vib.frequency.value = 5.2;
    vibG.gain.setValueAtTime(0, t0);
    vibG.gain.linearRampToValueAtTime(12.5, t0 + Math.min(0.42, dur * 0.45));
    vib.connect(vibG);
    vibG.connect(o1.detune);
    vibG.connect(o2.detune);

    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    g1.gain.value = 0.68;
    g2.gain.value = 0.28;

    const atk = 0.085;
    const rel = 0.40;
    const peak = Math.max(0.002, vel * 0.22);
    const holdEnd = t0 + Math.max(atk + 0.02, dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.linearRampToValueAtTime(peak * 0.64, holdEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, holdEnd + rel);

    o1.connect(g1); o2.connect(g2);
    g1.connect(filt); g2.connect(filt);
    filt.connect(g); g.connect(panner); panner.connect(synthBus);

    const stopAt = holdEnd + rel + 0.04;
    o1.start(t0); o2.start(t0); vib.start(t0);
    o1.stop(stopAt); o2.stop(stopAt); vib.stop(stopAt);
    o1.onended = () => {
      o1.disconnect(); o2.disconnect(); vib.disconnect(); vibG.disconnect();
      g1.disconnect(); g2.disconnect(); filt.disconnect(); g.disconnect(); panner.disconnect();
    };
  }

  // Deep warm electric/upright bass
  function playBass(midi, t0, dur, vel, { plucked = false } = {}) {
    const hz = midiToHz(midi);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(hz, t0);
    o.detune.setValueAtTime(tapeDetuneCents(t0) * 0.5, t0);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(plucked ? 320 : 220, t0);

    const env = ctx.createGain();
    const peak = Math.max(0.002, vel * 0.22);
    const atk = plucked ? 0.020 : 0.12;
    const rel = plucked ? 0.32 : 0.50;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + atk);
    if (plucked) {
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.18), t0 + dur);
    } else {
      env.gain.setValueAtTime(peak * 0.86, t0 + dur);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);

    o.connect(lp); lp.connect(env); env.connect(synthBus);
    const stopAt = t0 + dur + rel + 0.04;
    o.start(t0); o.stop(stopAt);
    o.onended = () => { o.disconnect(); lp.disconnect(); env.disconnect(); };
  }

  // =========================================================================
  // 4. LOOKAHEAD STEP SCHEDULER
  // =========================================================================
  function scheduleStep(track, step, t) {
    const stepDur = (60 / track.bpm) * 0.5; // eighth-note duration
    const bar = Math.floor(step / track.stepsPerBar);
    const beatSlot = step % track.stepsPerBar;
    const chord = track.chords[bar % track.chords.length];
    const humanize = (rand() - 0.5) * 0.014;
    const t0 = Math.max(ctx.currentTime + 0.005, t + humanize);

    if (track.id === "poolrooms") {
      // --- POOLROOMS: "Hi" — TEMPOREX (Warm swaying lo-fi DX7 electric piano!) ---
      // Beat 1: warm rolling DX7 chord + soft bass root
      if (beatSlot === 0) {
        playBass(chord.bass, t0, stepDur * 7.2, 0.68, { plucked: false });
        chord.notes.forEach((n, idx) => {
          playDx7Key(n, t0 + idx * 0.024, stepDur * 3.8, 0.52, {
            tine: 0.72,
            cutoff: 2750,
            pan: -0.26 + idx * 0.17,
            attack: 0.012,
            chorus: 6.2,
          });
        });
        // Dreamy organ swell entering softly on phrases (bars 8..15 or loopCycle > 0)
        if (bar >= 8 || loopCycle > 0) {
          playWarmPad(chord.notes, t0, stepDur * 7.6, 0.46, {
            cutoff: 1220, spread: 9, attack: 0.65, release: 1.15,
          });
        }
      } else if (beatSlot === 4) {
        // Beat 3 gentle swaying re-articulation (that unmistakable Temporex rocking pulse!)
        chord.notes.forEach((n, idx) => {
          playDx7Key(n, t0 + idx * 0.018, stepDur * 3.6, 0.40, {
            tine: 0.55,
            cutoff: 2350,
            pan: 0.24 - idx * 0.16,
            attack: 0.016,
            chorus: 5.4,
          });
        });
      } else if (beatSlot === 2 || beatSlot === 6) {
        // Delicate soft inner-voice DX7 shimmer
        const inner = chord.notes[beatSlot === 2 ? 2 : 1];
        playDx7Key(inner, t0, stepDur * 2.0, 0.28, {
          tine: 0.85,
          cutoff: 2900,
          pan: beatSlot === 2 ? 0.32 : -0.32,
          attack: 0.012,
          chorus: 5.0,
        });
      }

      // Singing high nostalgic DX7 melody line
      for (const note of track.melody) {
        if (note.step === step) {
          playDx7Key(note.midi, t0, stepDur * note.dur * 1.15, note.vel, {
            tine: 1.25,
            cutoff: 3450,
            pan: Math.sin(step * 0.35) * 0.24,
            attack: 0.010,
            chorus: 6.5,
          });
        }
      }
    } else {
      // --- LEVEL 0 (optional when toggled ON): "It's Just a Burning Memory" (Heartaches, 1931) ---
      if (beatSlot === 0) {
        playBass(chord.bass, t0, stepDur * 3.6, 0.76, { plucked: true });
        playWarmPad(chord.notes, t0, stepDur * 7.4, 0.44, {
          cutoff: 880, spread: 11, attack: 0.42, release: 0.85,
        });
      } else if (beatSlot === 4) {
        playBass(chord.bass + 7, t0, stepDur * 3.2, 0.56, { plucked: true });
      }
      // Classic 1930s ballroom foxtrot stride piano off-beat chords (beats 2 & 4)
      if (beatSlot === 2 || beatSlot === 6) {
        const vel = beatSlot === 2 ? 0.46 : 0.38;
        chord.notes.forEach((n, idx) => {
          playDx7Key(n, t0 + idx * 0.014, stepDur * 1.8, vel, {
            tine: 0.28,
            cutoff: 1480,
            pan: -0.20 + idx * 0.13,
            attack: 0.016,
            chorus: 4.0,
          });
        });
      }
      // Unmistakable muted ballroom trumpet melody
      for (const note of track.melody) {
        if (note.step === step) {
          playBallroomHorn(note.midi, t0, stepDur * note.dur, note.vel, { cutoff: 1220, pan: 0.12 });
        }
      }
    }
  }

  function ensureVinylStarted() {
    if (!vinylStarted && ctx.state === "running") {
      vinylStarted = true;
      try { vinylSrc.start(); } catch { /* already started */ }
    }
  }

  return {
    setProfile(name, { applyDefault = false } = {}) {
      const nextProf = BGM_TRACKS[name] ? name : "poolrooms";
      const changed = nextProf !== profile;
      profile = nextProf;
      activeTrack = BGM_TRACKS[profile];
      if (applyDefault) {
        enabled = Boolean(activeTrack.defaultEnabled);
      }
      if (changed) {
        stepIndex = 0;
        loopCycle = 0;
        nextStepTime = ctx.currentTime + 0.08;
      }
      ensureVinylStarted();
      applyTrackTone(false);
    },
    setEnabled(v) {
      enabled = Boolean(v);
      ensureVinylStarted();
      if (enabled) {
        nextStepTime = ctx.currentTime + 0.06;
      }
      applyTrackTone(false);
      return enabled;
    },
    toggle() {
      return this.setEnabled(!enabled);
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      applyTrackTone(true);
    },
    update() {
      if (ctx.state !== "running") return;
      ensureVinylStarted();
      if (!enabled) return;

      const now = ctx.currentTime;
      const stepDur = (60 / activeTrack.bpm) * 0.5;
      const totalSteps = activeTrack.bars * activeTrack.stepsPerBar;

      if (nextStepTime < now - 0.5 || nextStepTime === 0) {
        nextStepTime = now + 0.05;
      }

      const horizon = now + 0.22;
      let guard = 0;
      while (nextStepTime < horizon && guard < 8) {
        scheduleStep(activeTrack, stepIndex, nextStepTime);
        stepIndex++;
        if (stepIndex >= totalSteps) {
          stepIndex = 0;
          loopCycle++;
        }
        nextStepTime += stepDur;
        guard++;
      }
    },
    inspect() {
      return {
        enabled,
        volume,
        profile,
        track: activeTrack.title,
        style: activeTrack.style,
        bpm: activeTrack.bpm,
        bar: Math.floor(stepIndex / activeTrack.stepsPerBar) + 1,
      };
    },
  };
}
