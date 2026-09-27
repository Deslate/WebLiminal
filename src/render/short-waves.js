// Low-amplitude, finite-depth short-wave band shared by every optical path.
// A is the combined modal amplitude, not the amplitude of each direction.
export const SHORT_WAVE_AMPLITUDE = 0.00015;
export const SHORT_WAVE_MODES = Object.freeze([
  { wavelength: .08, angle: .37, phase: 0 },
  { wavelength: .105, angle: 2.11, phase: 1.71 },
  { wavelength: .13, angle: 4.28, phase: 3.42 },
]);
export function shortWaveUniforms({ waterLevel, waveAmplitude, waveSpeed = .28 }, time) {
  const modes = new Float32Array(12);
  const amplitude = SHORT_WAVE_AMPLITUDE / Math.sqrt(3) * Math.max(0, Math.min(1, waveAmplitude / .052));
  SHORT_WAVE_MODES.forEach(({ wavelength, angle, phase }, i) => {
    const k = 2 * Math.PI / wavelength;
    const omega = Math.sqrt((9.81 * k + .000073 * k ** 3) * Math.tanh(k * Math.max(0, waterLevel)));
    modes.set([k * Math.cos(angle), k * Math.sin(angle), phase - omega * time * waveSpeed, amplitude], i * 4);
  });
  return modes;
}
