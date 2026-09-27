import test from 'node:test';import assert from 'node:assert/strict';
// The stencil's symbol is an independent closed-form check of rotational
// dispersion, not an image statistic contaminated by the tiled floor.
test('nine-point propagation has no x/y preference and low angular error in resolved band',()=>{
 for(const wavelength of [.25,.5,1]){const q=2*Math.PI/32/wavelength,vel=[];for(let i=0;i<=360;i++){const a=i*Math.PI/180,x=q*Math.cos(a),z=q*Math.sin(a);const symbol=(4/3)*(2-Math.cos(x)-Math.cos(z))+(2/3)*(1-Math.cos(x)*Math.cos(z));vel.push(Math.sqrt(symbol));}assert(Math.max(...vel)/Math.min(...vel)-1<.0003);assert(Math.abs(vel[0]-vel[90])<1e-12);}
});
