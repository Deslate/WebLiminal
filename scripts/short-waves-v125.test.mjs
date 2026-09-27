import test from 'node:test';import assert from 'node:assert/strict';
import {shortWaveUniforms,SHORT_WAVE_MODES,SHORT_WAVE_TIME_SCALE} from '../src/render/short-waves.js';
const config={waterLevel:.42,waveAmplitude:.052,waveSpeed:.28};
test('finite-depth band has the accepted motion frequencies and amplitude budget',()=>{
 const a=shortWaveUniforms(config,0),b=shortWaveUniforms(config,1);
 const expected=[1.2650367673,1.0940025884,.9787531693];let variance=0;
 for(let i=0;i<3;i++){assert(Math.abs((a[i*4+2]-b[i*4+2])/(2*Math.PI)-expected[i]*.1)<1e-6);variance+=a[i*4+3]**2/2;}
 assert(Math.abs(Math.sqrt(variance)-.00038/Math.sqrt(2))<1e-10);
});
test('zero-amplitude water has no short band, and user amplitude cannot exceed budget',()=>{
 for(const amp of [0,.052,.5]){const a=shortWaveUniforms({...config,waveAmplitude:amp},0);for(let i=0;i<3;i++)assert(a[i*4+3]<.00038/Math.sqrt(3)+1e-11);if(!amp)assert.equal(a[3]+a[7]+a[11],0);}
});
test('finite-depth law approaches shallow limit only when kh is small; phase follows speed',()=>{
 const d=1e-6,a=shortWaveUniforms({...config,waterLevel:d,waveSpeed:1},0),b=shortWaveUniforms({...config,waterLevel:d,waveSpeed:1},1);
 SHORT_WAVE_MODES.forEach((m,i)=>{const k=2*Math.PI/m.wavelength,expected=Math.sqrt(d*(9.81*k*k+.000073*k**4));assert(Math.abs((a[i*4+2]-b[i*4+2])/(expected*SHORT_WAVE_TIME_SCALE)-1)<1e-4);});
 assert.deepEqual(shortWaveUniforms({...config,waveSpeed:0},0),shortWaveUniforms({...config,waveSpeed:0},100));
});
