import test from 'node:test';import assert from 'node:assert/strict';
import {kickImpacts} from '../src/kick-impacts.js';
import {createWakeTrail} from '../src/wake-trail.js';
test('kick landing times and momenta follow gravity, rotate with locomotion, and replay deterministically',()=>{
 const c={x:0,z:0,time:2,direction:[1,0],step:3},a=kickImpacts(c),b=kickImpacts({...c,direction:[0,1]});
 assert.deepEqual(a,kickImpacts(c));assert.equal(a.length,6);
 for(let i=0;i<a.length;i++){const t=a[i].time-c.time,up=t*9.81/2;assert(Math.abs(a[i].momentum-.003*up)<1e-12);assert(Math.abs(a[i].x-b[i].z)<1e-12);assert(Math.abs(a[i].z+b[i].x)<1e-12);assert(t>.36&&t<.56);assert(a[i].x>0);}
 assert.notDeepEqual(a,kickImpacts({...c,step:4}));assert.deepEqual(kickImpacts({}),[]);
});
test('no step at rest and no frame-driven repeated kick after stopping',()=>{
 const trail=createWakeTrail();let count=0,p={x:0,z:0};for(let i=1;i<=300;i++){const q={x:Math.min(3,i/60)*.8,z:0};if(trail.advance(p,q,i/60,.42))count++;p=q;}assert(count>=4&&count<=5);
});
