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
  const result=buildLightAtlases([{lo:[-.026,0,-.506],hi:[.026,1.706,.506],radius:.48,tubeRadius:.026,spring:1.2,kind:5,material:3}]);
  assert([...result.cellSurfaces].every(v=>v>>>16===0));
  assert([...result.probeSurfaces].every(v=>v>>>16===0));
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
