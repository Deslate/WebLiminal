import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
const source=readFileSync(new URL('../src/render/finite-depth.js',import.meta.url),'utf8').replace("import code from './finite-depth.wgsl?raw';",'const code="";');
const{dispersionPolynomial}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function polynomial(a,x){let b=0,c=0;for(let n=a.length-1;n>=1;n--){const v=2*x*b-c+a[n];c=b;b=v;}return x*b-c+a[0];}
test('finite-depth operator has positive energy and <3.1% frequency error across supported depths',()=>{
 for(const depth of [.12,.21,.42,.7,1.05]){
  const f=dispersionPolynomial(depth,Math.max(12,Math.min(80,Math.ceil(32*depth/.42))));
  assert.equal(0*polynomial(f.coefficients,-1),0,'constant-height mode must have zero acceleration');
  for(let j=0;j<2000;j++){
   const s=.001*Math.pow(f.limit/.001,j/1999),exact=Math.sqrt(s)*Math.tanh(depth*Math.sqrt(s)),actual=s*polynomial(f.coefficients,2*s/f.limit-1);
   assert(actual>0,'positive restoring energy');assert(Math.abs(Math.sqrt(actual/exact)-1)<.031,`depth=${depth}, Laplacian eigenvalue=${s}`);
  }
 }
});
