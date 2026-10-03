import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLightAtlases } from '../src/render/light-atlas.js';
import { curvedShader } from '../src/render/curved-shapes.js';
const primitive = kind => ({lo:[-2,0,-2],hi:[2,3,2],kind,material:0,radius:2,spring:0});
test('curved receiver charts integrate exact analytic surface area', () => {
  for (const kind of [2,3]) {
    const result = buildLightAtlases([primitive(kind)]);
    const f = new Float32Array(result.surfaces), u = new Uint32Array(result.surfaces);
    const o = 6*16;
    const area = f[o+6]*u[o+1]*u[o+2];
    const expected = kind === 2 ? 2*Math.PI*2*3 : 2*Math.PI*4;
    assert(Math.abs(area-expected)<1e-5);
    assert.equal(u[o+13],kind);
    for(let i=u[o];i<u[o]+u[o+1]*u[o+2];i++)assert.equal(result.cellSurfaces[i]>>>16,4);
  }
});
test('cylinder cap coverage excludes its surrounding box corners', () => {
  const result=buildLightAtlases([primitive(2)]),u=new Uint32Array(result.surfaces),f=new Float32Array(result.surfaces);
  const o=3*16;let area=0;
  for(let i=u[o];i<u[o]+u[o+1]*u[o+2];i++)area+=(result.cellSurfaces[i]>>>16)*.25*f[o+6];
  assert(Math.abs(area-Math.PI*4)<.08);
});

test('circular basin deck excludes its hole from planar receiver area', () => {
  const s={lo:[-3,0,-3],hi:[3,.6,3],radius:2,spring:0,kind:4,material:0};
  const result=buildLightAtlases([s]),u=new Uint32Array(result.surfaces),f=new Float32Array(result.surfaces);
  const o=3*16;let area=0;
  for(let i=u[o];i<u[o]+u[o+1]*u[o+2];i++)area+=(result.cellSurfaces[i]>>>16)*.25*f[o+6];
  assert(Math.abs(area-(36-Math.PI*4))<.08);
  const wall=6*16;assert.equal(u[wall+13],6);
  assert(Math.abs(f[wall+6]*u[wall+1]*u[wall+2]-2*Math.PI*2*.6)<1e-5);
});

test('conductor tube has no diffuse receiving surface', () => {
  for(const shape of [
    {lo:[-.026,0,-.506],hi:[.026,1.706,.506],radius:.48,tubeRadius:.026,spring:1.2,kind:5,material:3},
    {lo:[-.022,1,-3],hi:[.022,1.044,3],radius:.022,axis:2,spring:0,kind:6,material:3},
    {lo:[-2.022,1,-2.022],hi:[2.022,1.044,2.022],radius:2,tubeRadius:.022,spring:0,kind:7,material:3},
  ]) {
    const result=buildLightAtlases([shape]);
    assert([...result.cellSurfaces].every(v=>v>>>16===0));
    assert([...result.probeSurfaces].every(v=>v>>>16===0));
  }
});
test('dome oculus removes polar receiver area and adds its physical shaft wall', () => {
  const result=buildLightAtlases([{...primitive(3),oculus:.5}]);
  const f=new Float32Array(result.surfaces),u=new Uint32Array(result.surfaces);
  const area=face=>f[face*16+6]*u[face*16+1]*u[face*16+2];
  const y=Math.sqrt(4-.25);
  assert(Math.abs(area(6)-2*Math.PI*2*y)<1e-5);
  assert(Math.abs(area(7)-2*Math.PI*.5*(3-y))<1e-5);
  assert.equal(u[7*16+13],4);
  assert.notEqual(u[6*16],u[7*16]);
});
test('original windows keep byte-identical shared WGSL', () => {
  const source=readFileSync(new URL('../src/render/common.wgsl',import.meta.url),'utf8');
  assert.equal(curvedShader(source,{shapes:[{kind:0},{kind:1}]}),source);
  const curved=curvedShader(source,{shapes:[primitive(2)]});
  assert(curved.includes('traceCurved(ro,rd,bestT,s)'));
  assert(curved.includes('traceCurved(ro,rd,maxT,s)'));
});

test('full ring charts cover only the ring inside its clipping box', () => {
  // Inner radius 2, outer 2.4, axis 1 m above the floor: the box clips the lower arc.
  const s={lo:[-2.4,0,-.2],hi:[2.4,3.4,.2],radius:2,outerRadius:2.4,spring:1,kind:9,material:0};
  const result=buildLightAtlases([s]),u=new Uint32Array(result.surfaces),f=new Float32Array(result.surfaces);
  for(const [face,r,code] of [[6,2,9],[7,2.4,10]]){
    const o=face*16;assert.equal(u[o+13],code);
    let area=0;for(let i=u[o];i<u[o]+u[o+1]*u[o+2];i++)area+=(result.cellSurfaces[i]>>>16)*.25*f[o+6];
    // Arc above y = 0: total angle minus the clipped arc below the floor.
    const clipped=2*Math.acos(1/r),expected=(2*Math.PI-clipped)*r*.4;
    assert(Math.abs(area-expected)/expected<.03,`face ${face}`);
  }
  const cap=5*16;let area=0;
  for(let i=u[cap];i<u[cap]+u[cap+1]*u[cap+2];i++)area+=(result.cellSurfaces[i]>>>16)*.25*f[cap+6];
  assert(area>0&&area<Math.PI*(2.4*2.4-4));
  for(const face of [0,1,2,3])assert.equal(u[face*16+1]*u[face*16+2],4,'box sides do not receive');
});

test('drum bays receive on their curved face and opening, not inside the drum', () => {
  const s={lo:[-1,0,0],hi:[1,3,7],radius:.5,spring:1.5,drumRadius:6,center:[0,0],kind:8,material:0};
  const result=buildLightAtlases([s]),u=new Uint32Array(result.surfaces),f=new Float32Array(result.surfaces);
  const drum=4*16;assert.equal(u[drum+13],8);
  const [u0,,u1]=[f[drum+8],f[drum+9],f[drum+10]];
  assert(u0>Math.PI*6&&u1<2*Math.PI*6,'drum chart is the sector inside the bay');
  let area=0;for(let i=u[drum];i<u[drum]+u[drum+1]*u[drum+2];i++)area+=(result.cellSurfaces[i]>>>16)*.25*f[drum+6];
  // Drum face: 2 * asin(1/6) * 6 wide, 3 m high, minus the round-headed opening.
  const opening=1*1.5+Math.PI*.25/2,expected=2*Math.asin(1/6)*6*3-opening;
  assert(Math.abs(area-expected)/expected<.05);
  assert.equal(u[6*16+13],1,'opening uses the arch chart');
  const plain=buildLightAtlases([{...s,radius:0,spring:0}]),pu=new Uint32Array(plain.surfaces);
  for(const face of [6,7,8])assert.equal(pu[face*16+1]*pu[face*16+2],4,'no opening without a radius');
});

test('drum bay and ring intersection is specialised only when present', () => {
  const common=readFileSync(new URL('../src/render/common.wgsl',import.meta.url),'utf8');
  const box={lo:[0,0,0],hi:[1,1,1],kind:2,material:0,radius:.5,spring:0};
  assert(!curvedShader(common,{shapes:[box]}).includes('return traceCut('));
  assert(curvedShader(common,{shapes:[{...box,kind:9}]}).includes('return traceCut('));
});
