// Pure-Code Procedural Backrooms / Liminal Space BGM Synthesizer (Web Audio API).
// Zero external audio files, zero dependencies.
//
// Three 16-bar original procedural compositions tailored to each liminal realm:
//   - backrooms (Level 0)   : "Ballroom Tape Loop (1934)" — haunted 3/4 Caretaker-style waltz,
//                             muted 1930s horn & Rhodes, vinyl crackle, tape wow/flutter, distant hall reverb.
//   - poolrooms (Level 37)  : "Submerged Sunbeam" — dreamy floating Db Maj9/Lydian aquatic ambient,
//                             DX7 glassy electric piano, crystalline water-bells, Juno pad, stereo tape echo.
//   - parking   (Level 1)   : "Concrete Echoes" — dusty Boards-of-Canada / VHS D-Dorian tape synth,
//                             detuned cassette pads, echoing kalimba/Rhodes ostinato, mournful analog lead.

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Pure declarative 16-bar track data (exported for deterministic validation in unit tests).
export const BGM_TRACKS = {
  // =========================================================================
  // LEVEL 0 · "Ballroom Tape Loop (1934)" — Haunted 3/4 Vintage Ballroom Waltz
  // 72 BPM, 3/4 meter (stepsPerBar = 6 eighth-note slots, 16 bars = 96 steps = 40.0 s)
  // Key: Eb Major / C Minor with bittersweet minor-iv (Abm6) & dom7b9 nostalgic turns.
  // =========================================================================
  backrooms: {
    id: "backrooms",
    title: "Ballroom Tape Loop (1934)",
    style: "Haunted 3/4 Gramophone Waltz",
    bpm: 72,
    stepsPerBar: 6, // 3 beats x 2 eighth-note subdivisions
    bars: 16,
    filterLowHz: 155,
    filterHighHz: 2150,
    filterQ: 0.9,
    wowDepthCents: 15,
    wowRateHz: 0.34,
    flutterDepthCents: 4.5,
    vinylLevel: 0.036,
    reverbSend: 0.78,
    delaySend: 0.24,
    baseGain: 0.44,
    // 16-bar harmonic progression: bass root + warm close-voiced ballroom chords
    chords: [
      { bass: 39, notes: [55, 58, 62, 65] }, // 1:  Ebmaj9
      { bass: 43, notes: [53, 59, 63, 67] }, // 2:  G7(b13)
      { bass: 48, notes: [55, 58, 62, 63] }, // 3:  Cm9
      { bass: 46, notes: [53, 56, 61, 63] }, // 4:  Bbm7 -> Eb7 color
      { bass: 44, notes: [55, 56, 60, 63] }, // 5:  Abmaj7
      { bass: 44, notes: [53, 56, 59, 63] }, // 6:  Abm6 (signature nostalgic heartache)
      { bass: 43, notes: [55, 58, 62, 63] }, // 7:  Ebmaj7/G
      { bass: 46, notes: [53, 56, 59, 62] }, // 8:  Bb7(b9)
      { bass: 48, notes: [55, 58, 62, 63] }, // 9:  Cm9
      { bass: 47, notes: [53, 55, 59, 62] }, // 10: G7/B
      { bass: 46, notes: [53, 56, 60, 61] }, // 11: Bbm9
      { bass: 41, notes: [51, 55, 57, 60] }, // 12: F9
      { bass: 44, notes: [55, 56, 60, 63] }, // 13: Abmaj7
      { bass: 44, notes: [53, 56, 59, 63] }, // 14: Abm6
      { bass: 39, notes: [55, 58, 62, 63] }, // 15: Ebmaj7
      { bass: 46, notes: [53, 56, 60, 62] }, // 16: Bb13sus4 -> gentle loop back to Eb
    ],
    // Expressive slow waltz melody (step index 0..95, midi pitch, durSteps, vel)
    melody: [
      // Section A: aching, half-remembered sighing ballroom motif
      { step: 0, midi: 74, dur: 4, vel: 0.72 }, // D5
      { step: 4, midi: 75, dur: 2, vel: 0.62 }, // Eb5
      { step: 6, midi: 74, dur: 3, vel: 0.74 }, // D5
      { step: 9, midi: 71, dur: 3, vel: 0.60 }, // B4 (G7 tension)
      { step: 12, midi: 72, dur: 4, vel: 0.70 }, // C5
      { step: 16, midi: 70, dur: 2, vel: 0.56 }, // Bb4
      { step: 18, midi: 68, dur: 5, vel: 0.54 }, // Ab4 (breath)
      // Section A': tender climb into heartbreaking Abm6 fall
      { step: 24, midi: 75, dur: 4, vel: 0.76 }, // Eb5
      { step: 28, midi: 77, dur: 2, vel: 0.66 }, // F5
      { step: 30, midi: 75, dur: 3, vel: 0.74 }, // Eb5
      { step: 33, midi: 71, dur: 3, vel: 0.62 }, // Cb5 / B4 (Abm6 sigh!)
      { step: 36, midi: 70, dur: 4, vel: 0.68 }, // Bb4
      { step: 40, midi: 67, dur: 2, vel: 0.54 }, // G4
      { step: 42, midi: 65, dur: 5, vel: 0.56 }, // F4
      // Section B: hazy upper-register recollection
      { step: 48, midi: 79, dur: 4, vel: 0.74 }, // G5
      { step: 52, midi: 77, dur: 2, vel: 0.64 }, // F5
      { step: 54, midi: 74, dur: 4, vel: 0.68 }, // D5
      { step: 58, midi: 72, dur: 2, vel: 0.58 }, // C5
      { step: 60, midi: 73, dur: 4, vel: 0.66 }, // Db5
      { step: 64, midi: 72, dur: 2, vel: 0.56 }, // C5
      { step: 66, midi: 69, dur: 5, vel: 0.58 }, // A4 (F9 warm lift)
      // Section A": dissolving homeward cadence
      { step: 72, midi: 75, dur: 4, vel: 0.72 }, // Eb5
      { step: 76, midi: 72, dur: 2, vel: 0.60 }, // C5
      { step: 78, midi: 71, dur: 4, vel: 0.68 }, // Cb5 (Abm6 echo)
      { step: 82, midi: 68, dur: 2, vel: 0.54 }, // Ab4
      { step: 84, midi: 67, dur: 6, vel: 0.66 }, // G4 (resting on Ebmaj7)
      { step: 90, midi: 70, dur: 4, vel: 0.48 }, // Bb4 (fading into tape echo)
    ],
  },

  // =========================================================================
  // POOLROOMS · "Submerged Sunbeam" — Dreamcore / Aquatic Ambience
  // 62 BPM, 4/4 floating meter (stepsPerBar = 8 eighth-note slots, 16 bars = 128 steps = 61.9 s)
  // Key: Db Major / Bb Minor9 — shimmering Lydian & Maj9 voicings in liquid reverb.
  // =========================================================================
  poolrooms: {
    id: "poolrooms",
    title: "Submerged Sunbeam",
    style: "Dreamcore · Aquatic Ambience",
    bpm: 62,
    stepsPerBar: 8,
    bars: 16,
    filterLowHz: 52,
    filterHighHz: 4600,
    filterQ: 0.65,
    wowDepthCents: 9,
    wowRateHz: 0.22,
    flutterDepthCents: 2.2,
    vinylLevel: 0.0,
    reverbSend: 0.88,
    delaySend: 0.52,
    baseGain: 0.34,
    chords: [
      { bass: 37, notes: [56, 60, 61, 63, 65] }, // 1:  Dbmaj9
      { bass: 41, notes: [56, 60, 63, 65, 68] }, // 2:  Fm11
      { bass: 42, notes: [58, 60, 61, 65, 66] }, // 3:  Gbmaj9(#11)
      { bass: 44, notes: [56, 60, 63, 65, 68] }, // 4:  Ab6/9
      { bass: 46, notes: [56, 60, 61, 65, 68] }, // 5:  Bbm9
      { bass: 41, notes: [55, 56, 60, 63, 68] }, // 6:  Fm9
      { bass: 42, notes: [58, 61, 65, 68, 70] }, // 7:  Gbmaj9
      { bass: 41, notes: [56, 60, 61, 63, 65] }, // 8:  Dbmaj9/F
      { bass: 39, notes: [54, 58, 61, 65, 68] }, // 9:  Ebm9
      { bass: 44, notes: [54, 58, 61, 65, 66] }, // 10: Ab13sus4
      { bass: 37, notes: [56, 60, 61, 63, 65] }, // 11: Dbmaj9
      { bass: 46, notes: [56, 60, 61, 65, 68] }, // 12: Bbm9
      { bass: 42, notes: [58, 61, 65, 68, 70] }, // 13: Gbmaj9
      { bass: 42, notes: [57, 61, 65, 66, 69] }, // 14: Gbm(maj7) dreamlike shimmer
      { bass: 37, notes: [56, 60, 61, 63, 65] }, // 15: Dbmaj9
      { bass: 44, notes: [56, 60, 63, 65, 68] }, // 16: Ab6/9
    ],
    // Sparse glistening high water-bell / celesta melody floating over arpeggios
    melody: [
      { step: 0, midi: 77, dur: 6, vel: 0.64 },  // F5
      { step: 6, midi: 80, dur: 4, vel: 0.58 },  // Ab5
      { step: 10, midi: 75, dur: 6, vel: 0.56 }, // Eb5
      { step: 16, midi: 77, dur: 5, vel: 0.66 }, // F5
      { step: 21, midi: 82, dur: 5, vel: 0.60 }, // Bb5
      { step: 26, midi: 80, dur: 6, vel: 0.54 }, // Ab5
      { step: 32, midi: 73, dur: 6, vel: 0.62 }, // Db5
      { step: 38, midi: 75, dur: 4, vel: 0.56 }, // Eb5
      { step: 42, midi: 77, dur: 6, vel: 0.58 }, // F5
      { step: 48, midi: 80, dur: 6, vel: 0.66 }, // Ab5
      { step: 54, midi: 84, dur: 6, vel: 0.62 }, // C6 (sunbeam peak!)
      { step: 60, midi: 80, dur: 4, vel: 0.50 }, // Ab5
      { step: 64, midi: 78, dur: 6, vel: 0.64 }, // Gb5
      { step: 70, midi: 77, dur: 4, vel: 0.56 }, // F5
      { step: 74, midi: 75, dur: 6, vel: 0.58 }, // Eb5
      { step: 80, midi: 73, dur: 6, vel: 0.62 }, // Db5
      { step: 88, midi: 80, dur: 6, vel: 0.60 }, // Ab5
      { step: 96, midi: 82, dur: 6, vel: 0.66 }, // Bb5
      { step: 104, midi: 81, dur: 6, vel: 0.62 },// A5 (Gbm maj7 luminescence!)
      { step: 112, midi: 80, dur: 8, vel: 0.64 },// Ab5
      { step: 120, midi: 75, dur: 7, vel: 0.48 },// Eb5
    ],
  },

  // =========================================================================
  // LEVEL 1 · "Concrete Echoes" — Boards of Canada / Kane Pixels VHS Liminal Synth
  // 68 BPM, 4/4 hypnotic meter (stepsPerBar = 8 eighth-note slots, 16 bars = 128 steps = 56.5 s)
  // Key: D Dorian / A Minor9 — dusty analog cassette synths & echoing concrete ostinato.
  // =========================================================================
  parking: {
    id: "parking",
    title: "Concrete Echoes",
    style: "VHS Liminal Analog Ambient",
    bpm: 68,
    stepsPerBar: 8,
    bars: 16,
    filterLowHz: 68,
    filterHighHz: 2550,
    filterQ: 0.85,
    wowDepthCents: 18,
    wowRateHz: 0.27,
    flutterDepthCents: 5.5,
    vinylLevel: 0.018,
    reverbSend: 0.84,
    delaySend: 0.48,
    baseGain: 0.34,
    chords: [
      { bass: 38, notes: [53, 57, 60, 64] }, // 1:  Dm9
      { bass: 40, notes: [52, 55, 59, 62] }, // 2:  Cmaj7/E (Em7 color)
      { bass: 41, notes: [52, 57, 60, 64] }, // 3:  Fmaj7
      { bass: 45, notes: [52, 55, 59, 60] }, // 4:  Am9
      { bass: 38, notes: [53, 57, 60, 64] }, // 5:  Dm9
      { bass: 43, notes: [52, 57, 59, 62] }, // 6:  G6/9 (Dorian melancholic lift)
      { bass: 46, notes: [53, 57, 60, 62] }, // 7:  Bbmaj9
      { bass: 45, notes: [52, 55, 57, 62] }, // 8:  A7sus4
      { bass: 41, notes: [52, 57, 60, 64] }, // 9:  Fmaj9
      { bass: 40, notes: [50, 55, 59, 62] }, // 10: Em7
      { bass: 38, notes: [53, 57, 60, 64] }, // 11: Dm9
      { bass: 36, notes: [52, 55, 59, 62] }, // 12: Cmaj9
      { bass: 43, notes: [53, 57, 58, 62] }, // 13: Gm9
      { bass: 41, notes: [53, 57, 60, 64] }, // 14: Dm9/F
      { bass: 40, notes: [50, 55, 58, 62] }, // 15: Em7(b5)
      { bass: 45, notes: [52, 57, 59, 64] }, // 16: Asus2
    ],
    // Sparse mournful VHS analog synth lead entering over the echoing concrete ostinato
    melody: [
      { step: 8, midi: 69, dur: 6, vel: 0.56 },  // A4
      { step: 16, midi: 72, dur: 6, vel: 0.62 }, // C5
      { step: 22, midi: 71, dur: 4, vel: 0.54 }, // B4
      { step: 26, midi: 69, dur: 6, vel: 0.52 }, // A4
      { step: 32, midi: 74, dur: 7, vel: 0.66 }, // D5
      { step: 40, midi: 76, dur: 6, vel: 0.64 }, // E5 (G6/9 Dorian glow)
      { step: 48, midi: 74, dur: 6, vel: 0.60 }, // D5
      { step: 54, midi: 72, dur: 5, vel: 0.54 }, // C5
      { step: 59, midi: 69, dur: 5, vel: 0.50 }, // A4
      { step: 64, midi: 76, dur: 6, vel: 0.68 }, // E5
      { step: 70, midi: 74, dur: 4, vel: 0.58 }, // D5
      { step: 74, midi: 71, dur: 6, vel: 0.56 }, // B4
      { step: 80, midi: 72, dur: 6, vel: 0.62 }, // C5
      { step: 88, midi: 69, dur: 7, vel: 0.54 }, // A4
      { step: 96, midi: 70, dur: 6, vel: 0.62 }, // Bb4 (Gm9 shadow)
      { step: 104, midi: 69, dur: 6, vel: 0.58 },// A4
      { step: 112, midi: 67, dur: 6, vel: 0.52 },// G4
      { step: 120, midi: 64, dur: 7, vel: 0.48 },// E4 (fading into concrete vault)
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
  // 1. MASTER BGM TAPE & SPACE BUS (independent from SFX footstep wet level!)
  // =========================================================================
  const bgmMaster = ctx.createGain();
  bgmMaster.gain.value = 0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.015;
  compressor.release.value = 0.28;

  // Soft analog tape saturation curve (even warmth, zero harsh digital clipping)
  const shaper = ctx.createWaveShaper();
  const curveLen = 1024;
  const curve = new Float32Array(curveLen);
  for (let i = 0; i < curveLen; i++) {
    const x = (i * 2) / (curveLen - 1) - 1;
    curve[i] = Math.tanh(x * 1.45) / Math.tanh(1.45);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";

  // Profile-tuned tape / gramophone / VHS tone shaping filters
  const toneHP = ctx.createBiquadFilter();
  toneHP.type = "highpass";
  toneHP.frequency.value = 120;

  const toneLP = ctx.createBiquadFilter();
  toneLP.type = "lowpass";
  toneLP.frequency.value = 2600;
  toneLP.Q.value = 0.8;

  // Voice summing bus -> tape saturation -> tone filters -> dry + delay + lush hall reverb
  const synthBus = ctx.createGain();
  synthBus.gain.value = 1.0;
  synthBus.connect(shaper);
  shaper.connect(toneHP);
  toneHP.connect(toneLP);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.42;
  toneLP.connect(dryGain);
  dryGain.connect(compressor);

  // Dedicated 4.2 s dark dreamcore / distant-ballroom stereo convolution reverb
  const bgmReverb = ctx.createConvolver();
  const irLen = Math.floor(sr * 4.2);
  const irBuf = ctx.createBuffer(2, irLen, sr);
  const preDelaySamples = Math.floor(sr * 0.028);
  for (let ch = 0; ch < 2; ch++) {
    const d = irBuf.getChannelData(ch);
    let lp = 0;
    for (let i = preDelaySamples; i < irLen; i++) {
      const t = (i - preDelaySamples) / sr;
      const alpha = Math.max(0.032, 0.28 * Math.exp(-t * 0.62));
      const w = (rand() * 2 - 1) * Math.exp(-t * 1.12);
      lp += (w - lp) * alpha;
      const swell = Math.min(1, t / 0.085);
      d[i] = lp * swell * 0.52;
    }
  }
  bgmReverb.buffer = irBuf;

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.78;
  toneLP.connect(reverbSend);
  reverbSend.connect(bgmReverb);
  bgmReverb.connect(compressor);

  // Stereo dotted-eighth tape echo delay (L = 355 ms, R = 480 ms, warm 1850 Hz feedback damping)
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.35;
  const delayL = ctx.createDelay(1.0);
  const delayR = ctx.createDelay(1.0);
  delayL.delayTime.value = 0.355;
  delayR.delayTime.value = 0.480;
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  fbL.gain.value = 0.36;
  fbR.gain.value = 0.36;
  const dlpL = ctx.createBiquadFilter();
  const dlpR = ctx.createBiquadFilter();
  dlpL.type = "lowpass";
  dlpR.type = "lowpass";
  dlpL.frequency.value = 1850;
  dlpR.frequency.value = 1850;
  const panL = ctx.createStereoPanner();
  const panR = ctx.createStereoPanner();
  panL.pan.value = -0.62;
  panR.pan.value = 0.62;

  toneLP.connect(delaySend);
  delaySend.connect(delayL);
  delaySend.connect(delayR);
  delayL.connect(dlpL);
  dlpL.connect(fbL);
  fbL.connect(delayR); // ping-pong cross-feedback for spacious liquid stereo echoes!
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
  // 2. SUBTLE PROCEDURAL VINYL CRACKLE & WARM CASSETTE HISS BED (Level 0 / Level 1)
  // =========================================================================
  const vinylLen = Math.floor(sr * 6.0);
  const vinylBuf = ctx.createBuffer(2, vinylLen, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = vinylBuf.getChannelData(ch);
    let pink = 0;
    for (let i = 0; i < vinylLen; i++) {
      const w = rand() * 2 - 1;
      pink = pink * 0.94 + w * 0.06;
      let s = pink * 0.16;
      // Sparse soft vinyl dust ticks & shellac crackles
      const r = rand();
      if (r < 0.00028) {
        s += (rand() * 2 - 1) * (0.28 + rand() * 0.55);
      } else if (r < 0.0014) {
        s += (rand() * 2 - 1) * 0.09;
      }
      d[i] = s;
    }
  }
  const vinylSrc = ctx.createBufferSource();
  vinylSrc.buffer = vinylBuf;
  vinylSrc.loop = true;
  const vinylBP = ctx.createBiquadFilter();
  vinylBP.type = "bandpass";
  vinylBP.frequency.value = 2400;
  vinylBP.Q.value = 0.6;
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
    const tc = immediate ? 0.02 : 0.35;
    toneHP.frequency.setTargetAtTime(activeTrack.filterLowHz, now, tc);
    toneLP.frequency.setTargetAtTime(activeTrack.filterHighHz, now, tc);
    toneLP.Q.setTargetAtTime(activeTrack.filterQ, now, tc);
    reverbSend.gain.setTargetAtTime(activeTrack.reverbSend, now, tc);
    delaySend.gain.setTargetAtTime(activeTrack.delaySend, now, tc);
    vinylGain.gain.setTargetAtTime(enabled ? activeTrack.vinylLevel * volume : 0, now, tc);
    bgmMaster.gain.setTargetAtTime(activeGainTarget(), now, tc);
  }

  // Deterministic organic analog tape pitch drift (wow + flutter) in cents at time t
  function tapeDetuneCents(t) {
    const wow = Math.sin(t * activeTrack.wowRateHz * Math.PI * 2) * activeTrack.wowDepthCents
      + Math.sin(t * activeTrack.wowRateHz * 0.57 * Math.PI * 2 + 1.3) * (activeTrack.wowDepthCents * 0.45);
    const flutter = Math.sin(t * 5.6 * Math.PI * 2 + 0.7) * activeTrack.flutterDepthCents;
    return wow + flutter;
  }

  // =========================================================================
  // 3. PURE-CODE ANALOG INSTRUMENT VOICES
  // =========================================================================

  // Soft 1930s muted ballroom horn / haunting tape lead (Level 0 & Level 1 lead)
  function playTapeLead(midi, t0, dur, vel, opts = {}) {
    const hz = midiToHz(midi);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(opts.cutoff ?? 1280, t0);
    filt.frequency.exponentialRampToValueAtTime((opts.cutoff ?? 1280) * 0.62, t0 + dur);
    filt.Q.value = opts.q ?? 1.4;

    const panner = ctx.createStereoPanner();
    panner.pan.value = opts.pan ?? 0;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = opts.wave1 ?? "triangle";
    o2.type = opts.wave2 ?? "sawtooth";
    o1.frequency.setValueAtTime(hz, t0);
    o2.frequency.setValueAtTime(hz, t0);

    // Subtle vintage tape sag pitch-in on note onset + analog wow/flutter (linear ramp handles bipolar detune safely!)
    const baseDetune = tapeDetuneCents(t0);
    o1.detune.setValueAtTime(baseDetune - 11, t0);
    o1.detune.linearRampToValueAtTime(baseDetune, t0 + 0.16);
    o1.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.7), t0 + dur);
    o2.detune.setValueAtTime(baseDetune + (opts.detuneSpread ?? 7), t0);
    o2.detune.linearRampToValueAtTime(tapeDetuneCents(t0 + dur * 0.7) + (opts.detuneSpread ?? 7), t0 + dur);

    // Delayed warm vocal vibrato
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vib.frequency.value = opts.vibRate ?? 5.1;
    vibGain.gain.setValueAtTime(0.0, t0);
    vibGain.gain.linearRampToValueAtTime(opts.vibDepth ?? 11.0, t0 + Math.min(0.45, dur * 0.45));
    vib.connect(vibGain);
    vibGain.connect(o1.detune);
    vibGain.connect(o2.detune);

    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    g1.gain.value = 0.72;
    g2.gain.value = opts.sawMix ?? 0.24;

    const atk = opts.attack ?? 0.085;
    const rel = opts.release ?? 0.42;
    const peak = Math.max(0.002, vel * 0.22);
    const holdEnd = t0 + Math.max(atk + 0.02, dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.linearRampToValueAtTime(peak * 0.62, holdEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, holdEnd + rel);

    o1.connect(g1);
    o2.connect(g2);
    g1.connect(filt);
    g2.connect(filt);
    filt.connect(g);
    g.connect(panner);
    panner.connect(synthBus);

    const stopAt = holdEnd + rel + 0.04;
    o1.start(t0);
    o2.start(t0);
    vib.start(t0);
    o1.stop(stopAt);
    o2.stop(stopAt);
    vib.stop(stopAt);
    o1.onended = () => {
      o1.disconnect(); o2.disconnect(); vib.disconnect(); vibGain.disconnect();
      g1.disconnect(); g2.disconnect(); filt.disconnect(); g.disconnect(); panner.disconnect();
    };
  }

  // Warm vintage Rhodes / DX7 glassy electric piano (FM bell transient + warm sine fundamental)
  function playElectricPiano(midi, t0, dur, vel, { bell = 0.9, cutoff = 2600, pan = 0, attack = 0.012 } = {}) {
    const hz = midiToHz(midi);
    const det = tapeDetuneCents(t0);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(hz, t0);
    carrier.detune.setValueAtTime(det, t0);

    // Subtle 2x / 3x FM tine shimmer decaying rapidly into liquid sine sustain
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.setValueAtTime(hz * (bell > 1.2 ? 3.0 : 2.0), t0);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(hz * 0.42 * bell * vel, t0);
    modGain.gain.exponentialRampToValueAtTime(0.01, t0 + Math.min(0.45, dur * 0.6));
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Warm subtle triangle undertone for body
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(hz, t0);
    body.detune.setValueAtTime(det + 3.5, t0);
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0.22;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(cutoff, t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(420, cutoff * 0.35), t0 + dur + 0.3);

    const env = ctx.createGain();
    const peak = Math.max(0.002, vel * 0.16);
    const rel = Math.max(0.35, Math.min(1.4, dur * 0.65));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.22), t0 + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    carrier.connect(lp);
    body.connect(bodyG);
    bodyG.connect(lp);
    lp.connect(env);
    env.connect(panner);
    panner.connect(synthBus);

    const stopAt = t0 + dur + rel + 0.04;
    carrier.start(t0);
    mod.start(t0);
    body.start(t0);
    carrier.stop(stopAt);
    mod.stop(stopAt);
    body.stop(stopAt);
    carrier.onended = () => {
      carrier.disconnect(); mod.disconnect(); modGain.disconnect();
      body.disconnect(); bodyG.disconnect(); lp.disconnect(); env.disconnect(); panner.disconnect();
    };
  }

  // Lush slow-breathing analog Juno / VHS tape chord pad (multi-note detuned warm voices)
  function playAnalogPad(notes, t0, dur, vel, { cutoff = 1150, spread = 9, attack = 0.65, release = 1.1 } = {}) {
    const det = tapeDetuneCents(t0);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(cutoff * 0.68, t0);
    filt.frequency.linearRampToValueAtTime(cutoff * 1.18, t0 + dur * 0.55);
    filt.frequency.linearRampToValueAtTime(cutoff * 0.72, t0 + dur + release);
    filt.Q.value = 0.9;

    const env = ctx.createGain();
    const peak = Math.max(0.002, (vel * 0.14) / Math.sqrt(Math.max(1, notes.length)));
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
        o.type = side < 0 ? "sawtooth" : "triangle";
        o.frequency.setValueAtTime(hz, t0);
        o.detune.setValueAtTime(det + side * spread + (idx - 1.5) * 1.6, t0);
        // Gentle slow tape pitch drift across sustained pad duration
        o.detune.linearRampToValueAtTime(
          tapeDetuneCents(t0 + dur * 0.75) + side * spread,
          t0 + dur,
        );
        const og = ctx.createGain();
        og.gain.value = side < 0 ? 0.36 : 0.64;
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

  // Deep warm velvet sub-bass / muted upright ballroom bass
  function playBass(midi, t0, dur, vel, { plucked = false } = {}) {
    const hz = midiToHz(midi);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(hz, t0);
    o.detune.setValueAtTime(tapeDetuneCents(t0) * 0.5, t0);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(plucked ? 340 : 210, t0);

    const env = ctx.createGain();
    const peak = Math.max(0.002, vel * 0.24);
    const atk = plucked ? 0.022 : 0.14;
    const rel = plucked ? 0.35 : 0.55;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + atk);
    if (plucked) {
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.18), t0 + dur);
    } else {
      env.gain.setValueAtTime(peak * 0.85, t0 + dur);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);

    o.connect(lp);
    lp.connect(env);
    env.connect(synthBus);

    const stopAt = t0 + dur + rel + 0.04;
    o.start(t0);
    o.stop(stopAt);
    o.onended = () => { o.disconnect(); lp.disconnect(); env.disconnect(); };
  }

  // Crystalline high dreamcore water-bell / celesta droplet (Poolrooms)
  function playWaterBell(midi, t0, dur, vel, pan = 0) {
    const hz = midiToHz(midi);
    const det = tapeDetuneCents(t0);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.setValueAtTime(hz, t0);
    o2.frequency.setValueAtTime(hz * 2.0, t0);
    o1.detune.setValueAtTime(det, t0);
    o2.detune.setValueAtTime(det + 4, t0);

    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    const peak = Math.max(0.002, vel * 0.12);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.linearRampToValueAtTime(peak, t0 + 0.014);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.9);
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.linearRampToValueAtTime(peak * 0.34, t0 + 0.010);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.55 + 0.25);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    o1.connect(g1);
    o2.connect(g2);
    g1.connect(panner);
    g2.connect(panner);
    panner.connect(synthBus);

    const stopAt = t0 + dur + 0.95;
    o1.start(t0);
    o2.start(t0);
    o1.stop(stopAt);
    o2.stop(stopAt);
    o1.onended = () => { o1.disconnect(); o2.disconnect(); g1.disconnect(); g2.disconnect(); panner.disconnect(); };
  }

  // Soft muted subterranean lo-fi tape heartbeat pulse (Level 1)
  function playSoftPulse(t0, vel) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(84, t0);
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(vel * 0.13, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);

    o.connect(env);
    env.connect(synthBus);
    o.start(t0);
    o.stop(t0 + 0.25);
    o.onended = () => { o.disconnect(); env.disconnect(); };
  }

  // =========================================================================
  // 4. LOOKAHEAD STEP SCHEDULER (exact Web Audio clock, zero frame-rate jitter)
  // =========================================================================
  function scheduleStep(track, step, t) {
    const stepDur = (60 / track.bpm) * 0.5; // eighth-note duration in seconds
    const bar = Math.floor(step / track.stepsPerBar);
    const beatSlot = step % track.stepsPerBar;
    const chord = track.chords[bar % track.chords.length];
    const humanize = (rand() - 0.5) * 0.014; // organic human / worn-tape micro-timing
    const t0 = Math.max(ctx.currentTime + 0.005, t + humanize);

    if (track.id === "backrooms") {
      // --- LEVEL 0: 3/4 HAUNTED BALLROOM WALTZ ("oom - pah - pah") ---
      if (beatSlot === 0) {
        // Beat 1: warm upright ballroom bass + ghostly hollow string pad swell every bar
        playBass(chord.bass, t0, stepDur * 3.2, 0.78, { plucked: true });
        if (bar % 2 === 0 || loopCycle > 0) {
          playAnalogPad(chord.notes, t0, stepDur * 5.6, 0.44, {
            cutoff: 920, spread: 12, attack: 0.45, release: 0.85,
          });
        }
      } else if (beatSlot === 2 || beatSlot === 4) {
        // Beats 2 & 3: tender brushed vintage ballroom Rhodes chord pulses
        const vel = beatSlot === 2 ? 0.52 : 0.42;
        chord.notes.forEach((n, idx) => {
          playElectricPiano(n, t0 + idx * 0.014, stepDur * 1.7, vel, {
            bell: 0.55,
            cutoff: 1650,
            pan: -0.22 + idx * 0.14,
            attack: 0.018,
          });
        });
      }
      // Expressive muted ballroom horn melody
      for (const note of track.melody) {
        if (note.step === step) {
          // On repeat cycles, occasionally drop a grace note an octave for dreamy memory decay
          const octaveShift = loopCycle > 0 && (bar === 14 || bar === 15) && rand() < 0.35 ? -12 : 0;
          playTapeLead(note.midi + octaveShift, t0, stepDur * note.dur, note.vel, {
            cutoff: 1250,
            q: 1.5,
            sawMix: 0.24,
            vibRate: 5.0,
            vibDepth: 12,
            pan: 0.14,
          });
        }
      }
    } else if (track.id === "poolrooms") {
      // --- POOLROOMS: FLOATING DREAMCORE / AQUATIC AMBIENCE ---
      if (beatSlot === 0) {
        // Warm sub-bass & wide lush Juno pad blooming at bar start
        playBass(chord.bass, t0, stepDur * 7.5, 0.72, { plucked: false });
        playAnalogPad(chord.notes.slice(0, 4), t0, stepDur * 7.6, 0.62, {
          cutoff: 1450, spread: 8, attack: 0.85, release: 1.4,
        });
      }
      // Liquid rising & falling DX7 glassy electric piano arpeggio droplets
      const arpOrder = [0, 2, 1, 3, 4, 2, 3, 1];
      const arpIdx = arpOrder[beatSlot % arpOrder.length];
      if (beatSlot !== 6 || bar % 2 === 1) {
        const arpNote = chord.notes[arpIdx % chord.notes.length] + (beatSlot === 4 ? 12 : 0);
        playElectricPiano(arpNote, t0, stepDur * 2.4, 0.44 + (beatSlot === 0 ? 0.10 : 0), {
          bell: 1.45,
          cutoff: 3200,
          pan: Math.sin(step * 0.65) * 0.48,
          attack: 0.010,
        });
      }
      // High crystalline sunlit water-bell melody
      for (const note of track.melody) {
        if (note.step === step) {
          playWaterBell(note.midi, t0, stepDur * note.dur, note.vel, Math.cos(step * 0.4) * 0.36);
        }
      }
    } else {
      // --- LEVEL 1: D-DORIAN VHS SUBTERRANEAN ANALOG AMBIENT ---
      if (beatSlot === 0) {
        playBass(chord.bass, t0, stepDur * 7.4, 0.76, { plucked: false });
        playAnalogPad(chord.notes, t0, stepDur * 7.6, 0.64, {
          cutoff: 1020, spread: 14, attack: 0.65, release: 1.25,
        });
        playSoftPulse(t0, 0.62);
      } else if (beatSlot === 5 && bar % 2 === 0) {
        playSoftPulse(t0, 0.36);
      }
      // Hypnotic echoing concrete kalimba / Rhodes ostinato (asymmetric 3-3-2 / sparse echoes)
      if (beatSlot === 0 || beatSlot === 3 || beatSlot === 6) {
        const ostMap = [0, 3, 2, 1];
        const pick = chord.notes[ostMap[(bar + beatSlot) % ostMap.length]] + (beatSlot === 3 ? 12 : 0);
        playElectricPiano(pick, t0, stepDur * 2.2, beatSlot === 0 ? 0.52 : 0.42, {
          bell: 1.15,
          cutoff: 2050,
          pan: beatSlot === 3 ? 0.42 : -0.34,
          attack: 0.008,
        });
      }
      // Sparse mournful VHS weeping analog lead
      for (const note of track.melody) {
        if (note.step === step) {
          playTapeLead(note.midi, t0, stepDur * note.dur, note.vel, {
            wave1: "sawtooth",
            wave2: "triangle",
            sawMix: 0.42,
            cutoff: 1480,
            q: 1.2,
            detuneSpread: 11,
            vibRate: 4.3,
            vibDepth: 15,
            attack: 0.14,
            release: 0.65,
            pan: -0.16,
          });
        }
      }
    }
  }

  function ensureVinylStarted() {
    if (!vinylStarted && ctx.state === "running") {
      vinylStarted = true;
      vinylSrc.start();
      applyTrackTone(true);
    }
  }

  function resetClock() {
    stepIndex = 0;
    loopCycle = 0;
    nextStepTime = ctx.currentTime + 0.12;
  }

  return {
    setProfile(name) {
      const next = BGM_TRACKS[name] ? name : "poolrooms";
      if (next !== profile) {
        profile = next;
        activeTrack = BGM_TRACKS[profile];
        resetClock();
      }
      applyTrackTone(false);
    },
    setEnabled(v) {
      const next = Boolean(v);
      if (enabled === next) return enabled;
      enabled = next;
      if (enabled && ctx.state === "running") {
        ensureVinylStarted();
        nextStepTime = ctx.currentTime + 0.08;
      }
      applyTrackTone(false);
      return enabled;
    },
    toggle() {
      return this.setEnabled(!enabled);
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      applyTrackTone(false);
    },
    update() {
      if (ctx.state !== "running" || !enabled) return;
      ensureVinylStarted();
      const now = ctx.currentTime;
      const stepDur = (60 / activeTrack.bpm) * 0.5;
      const totalSteps = activeTrack.bars * activeTrack.stepsPerBar;

      // Guard against huge catch-up bursts after tab switch / pause resume
      if (nextStepTime < now - 0.35) {
        nextStepTime = now + 0.06;
      }
      const horizon = now + 0.22;
      while (nextStepTime < horizon) {
        scheduleStep(activeTrack, stepIndex, nextStepTime);
        stepIndex += 1;
        if (stepIndex >= totalSteps) {
          stepIndex = 0;
          loopCycle += 1;
        }
        nextStepTime += stepDur;
      }
    },
    inspect: () => ({
      enabled,
      volume,
      profile,
      track: activeTrack.title,
      style: activeTrack.style,
      bpm: activeTrack.bpm,
      bar: Math.floor(stepIndex / activeTrack.stepsPerBar) + 1,
    }),
  };
}
