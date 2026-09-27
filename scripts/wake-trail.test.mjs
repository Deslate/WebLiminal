import test from 'node:test';import assert from 'node:assert/strict';import {createWakeTrail} from '../src/wake-trail.js';
test('turning, blocked movement and teleporting cannot generate a wake',()=>{const t=createWakeTrail();for(let i=0;i<100;i++)assert.equal(t.advance({x:0,z:0},{x:0,z:0},i/60,.42),null);assert.equal(t.advance({x:0,z:0},{x:4,z:0},2,.42),null)});
test('walking produces bounded alternating foot contacts along the resolved path',()=>{const t=createWakeTrail(),e=[];for(let i=1;i<=600;i++){const a=t.advance({x:(i-1)/60,z:0},{x:i/60,z:0},i/60,.42);if(a)e.push(a)}assert(e.length>=9&&e.length<=11);for(let i=1;i<e.length;i++){assert(e[i].time-e[i-1].time>=.8);assert(e[i].x>e[i-1].x);assert(e[i].z*e[i-1].z<0)}});
test('dry floor creates no disturbances',()=>{const t=createWakeTrail();for(let i=1;i<100;i++)assert.equal(t.advance({x:(i-1)/60,z:0},{x:i/60,z:0},i/60,0),null)});
import {wave} from './optical-audit.mjs';
test('simulated-field bicubic slopes agree with independent height differences',()=>{
 const nx=24,nz=20,dx=1/32,values=new Float32Array(nx*nz*4);for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)values[(j*nx+i)*4]=.01*Math.sin(i*.71+j*.37)+.003*Math.cos(i*.19-j*.4);
 const c={waterLevel:.42,simulation:{grid:{nx,nz,dx},values}};
 for(let i=0;i<100;i++){const p=[-7+(3.1+i*.12)*dx,-17+(3.2+i*.1)*dx],w=wave(p,c);for(let j=0;j<2;j++){let a=[...p],b=[...p];a[j]-=1e-6;b[j]+=1e-6;const fd=(wave(b,c).h-wave(a,c).h)/2e-6;assert(Math.abs(fd+w.n[j===0?0:2]/w.n[1])<1e-6);}}
});
