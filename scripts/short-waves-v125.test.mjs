import test from 'node:test';import assert from 'node:assert/strict';
import {shortWaveUniforms,SHORT_WAVE_MODES,SHORT_WAVE_TIME_SCALE,SHORT_WAVE_AMPLITUDE} from '../src/render/short-waves.js';
const config={waterLevel:.42,waveAmplitude:.052,waveSpeed:.28};
test('finite-depth band has the accepted motion frequencies and amplitude budget',()=>{
 const a=shortWaveUniforms(config,0),b=shortWaveUniforms(config,1);
 let variance=0;
 for(let i=0;i<SHORT_WAVE_MODES.length;i++){const k=2*Math.PI/SHORT_WAVE_MODES[i].wavelength;const expected=Math.sqrt((9.81*k+.000073*k**3)*Math.tanh(k*config.waterLevel))*config.waveSpeed*SHORT_WAVE_TIME_SCALE;assert(Math.abs(a[i*4+2]-b[i*4+2]-expected)<1e-6);variance+=a[i*4+3]**2/2;}
 assert(Math.abs(Math.sqrt(variance)-SHORT_WAVE_AMPLITUDE/Math.sqrt(2))<1e-10);
});
test('zero-amplitude water has no short band, and user amplitude cannot exceed budget',()=>{
 for(const amp of [0,.052,.5]){const a=shortWaveUniforms({...config,waveAmplitude:amp},0);for(let i=0;i<SHORT_WAVE_MODES.length;i++)assert(a[i*4+3]<=Math.fround(SHORT_WAVE_AMPLITUDE/Math.sqrt(SHORT_WAVE_MODES.length)));if(!amp)assert.equal(a[3]+a[7]+a[11],0);}
});
test('finite-depth law approaches shallow limit only when kh is small; phase follows speed',()=>{
 const d=1e-6,a=shortWaveUniforms({...config,waterLevel:d,waveSpeed:1},0),b=shortWaveUniforms({...config,waterLevel:d,waveSpeed:1},1);
 SHORT_WAVE_MODES.forEach((m,i)=>{const k=2*Math.PI/m.wavelength,expected=Math.sqrt(d*(9.81*k*k+.000073*k**4));assert(Math.abs((a[i*4+2]-b[i*4+2])/(expected*SHORT_WAVE_TIME_SCALE)-1)<1e-4);});
 assert.deepEqual(shortWaveUniforms({...config,waveSpeed:0},0),shortWaveUniforms({...config,waveSpeed:0},100));
});
test('spectral realization is deterministic, broad in scale and full-circle in direction',()=>{
 assert.equal(SHORT_WAVE_MODES.length,16);
 assert.deepEqual(shortWaveUniforms(config,6),shortWaveUniforms(config,6));
 const wavelengths=SHORT_WAVE_MODES.map(m=>m.wavelength);assert(Math.max(...wavelengths)/Math.min(...wavelengths)>2.5);
 assert.equal(new Set(SHORT_WAVE_MODES.map(m=>Math.floor(m.angle/(2*Math.PI)*16))).size,16);
 assert.equal(new Set(SHORT_WAVE_MODES.map(m=>m.phase)).size,16);
});
