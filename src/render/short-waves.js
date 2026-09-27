// Low-amplitude, finite-depth short-wave band shared by every optical path.
// A is the combined modal amplitude, not the amplitude of each direction.
export const SHORT_WAVE_AMPLITUDE = 0.00022;
// Slow only the short band; the base simulation and walking remain live.
export const SHORT_WAVE_TIME_SCALE = 0.03;
// Seeded spectral quadrature: fixed realization, never resampled per frame.
// Broad log-wavelength spectrum and stratified full-circle directions.
let state = 0x27a19d3;
const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
const bands = Array.from({length:16},(_,i)=>i);
for(let i=bands.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bands[i],bands[j]]=[bands[j],bands[i]];}
export const SHORT_WAVE_MODES = Object.freeze(bands.map((band,i)=>Object.freeze({
 wavelength: .06 * Math.pow(3, (band + random()) / 16),
 angle: 2 * Math.PI * (i + random()) / 16,
 phase: random() * 2 * Math.PI,
})));
export function shortWaveUniforms({ waterLevel, waveAmplitude, waveSpeed = .28 }, time) {
  const modes = new Float32Array(SHORT_WAVE_MODES.length * 4);
  const amplitude = SHORT_WAVE_AMPLITUDE / Math.sqrt(SHORT_WAVE_MODES.length) * Math.max(0, Math.min(1, waveAmplitude / .052));
  SHORT_WAVE_MODES.forEach(({ wavelength, angle, phase }, i) => {
    const k = 2 * Math.PI / wavelength;
    const omega = Math.sqrt((9.81 * k + .000073 * k ** 3) * Math.tanh(k * Math.max(0, waterLevel)));
    modes.set([k * Math.cos(angle), k * Math.sin(angle), phase - omega * time * waveSpeed * SHORT_WAVE_TIME_SCALE, amplitude], i * 4);
  });
  return modes;
}
