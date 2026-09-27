// Offline shader variants only; no temporal scrambling or material changes.
import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';
const out='../workroom-v1.20-evidence/experiments';mkdirSync(out,{recursive:true});
const original=execFileSync('git',['show','1cca7f3:src/render/water-caustics.wgsl'],{encoding:'utf8'});
const hash=`fn sampleHash(a:u32)->u32 {var v=a;v^=v>>16u;v*=0x7feb352du;v^=v>>15u;v*=0x846ca68bu;return v^(v>>16u);}\nfn sample01(a:u32)->f32{return (f32(sampleHash(a)>>8u)+.5)/16777216.;}\n`;
const variants={before:original};
for(const [name,n,jitter]of [['hash4',2,false],['hash16',4,false],['jitter16',4,true],['hash36',6,false],['hash64',8,false]]){
 let s=hash+original;s=s.replace('let apertureN=select(2u,8u,U.sampling.w==2u);',`let apertureN=select(${n}u,8u,U.sampling.w==2u);`);
 s=s.replace('let shift=fract(vec2f(f32(i%nx)*.754877666+f32(i/nx)*.569840296, f32(i%nx)*.438579021+f32(i/nx)*.819172513));','let shift=vec2f(sample01(i*67u+k*991u+17u),sample01(i*67u+k*991u+3241u));');
 if(jitter)s=s.replace('(vec2f(f32(i%nx),f32(i/nx))+.5)/vec2f(f32(nx),f32(ny))','(vec2f(f32(i%nx),f32(i/nx))+vec2f(sample01(i*67u+123u),sample01(i*67u+9321u)))/vec2f(f32(nx),f32(ny))');variants[name]=s;
}
// Four-dimensional Sobol net: two water coordinates and two aperture coordinates.
const dirs=Array.from({length:32},()=>[0,0,0,0]);for(let j=0;j<32;j++)dirs[j][0]=(2**(31-j))>>>0;
for(const [dim,degree,a,m]of [[1,1,0,[1]],[2,2,1,[1,3]],[3,3,1,[1,3,1]]]){for(let j=0;j<degree;j++)dirs[j][dim]=(m[j]*2**(31-j))>>>0;for(let j=degree;j<32;j++){let v=(dirs[j-degree][dim]^(dirs[j-degree][dim]>>>degree))>>>0;for(let k=1;k<degree;k++)if((a>>>(degree-1-k))&1)v^=dirs[j-k][dim];dirs[j][dim]=v>>>0;}}
const sobol=`const SKY_DIRECTIONS=array<vec4u,32>(${dirs.map(d=>'vec4u('+d.map(v=>v+'u').join(',')+')').join(',')});
fn skyNet(index:u32)->vec4f {var bits=index;var v=vec4u(0);var bit=0u;loop{if(bits==0u){break;}if((bits&1u)!=0u){v^=SKY_DIRECTIONS[bit];}bits>>=1u;bit++;}
 // Fixed fast Owen digit scrambling; PBRT 4e Sobol Samplers (Laine-Karras).
 v=reverseBits(v);v^=v*0x3d20adeau;let seed=vec4u(0x92c9d7abu,0x5e2d58d1u,0xa68371e5u,0x38f57ac9u);v+=seed;v*=(seed>>vec4u(16u))|vec4u(1u);v^=v*0x05526c56u;v^=v*0x53a22864u;v=reverseBits(v);
 return (vec4f(v>>vec4u(8u))+.5)/16777216.;}
`;
for(const [name,n]of [['sobol4',2],['sobol16',4],['sobol32',8],['sobol64',8]]){let s=sobol+original;
 s=s.replace('    let xz=mix(vec2f(-7,-17),vec2f(7,10),(vec2f(f32(i%nx),f32(i/nx))+.5)/vec2f(f32(nx),f32(ny)));\n    let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));','');
 s=s.replace('let apertureN=select(2u,8u,U.sampling.w==2u);',`let apertureN=select(${n}u,8u,U.sampling.w==2u);`);
 const start=s.indexOf('      // A fixed, spatially distributed');const end=s.indexOf('      let lp=',start);
 s=s.slice(0,start)+`      let sample=skyNet(i*apertureN*apertureN+k);let xz=mix(vec2f(-7,-17),vec2f(7,10),sample.xy);let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));let uv=sample.zw;\n`+s.slice(end);if(name==='sobol32')s=s.replace('let apertureN=select(8u,8u,U.sampling.w==2u);','let sampleCount=select(32u,128u,U.sampling.w==2u);').replaceAll('apertureN*apertureN','sampleCount');variants[name]=s;}
const selected=process.env.SAMPLING_CASES?.split(',');if(selected)for(const name of Object.keys(variants))if(!selected.includes(name))delete variants[name];
const b=await chromium.launch({channel:'chrome',headless:true});try{for(const[name,shader]of Object.entries(variants)){
 const p=await b.newPage({viewport:{width:1280,height:832}});await p.route(/\/src\/render\/water-caustics\.wgsl\?/,r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(shader)}));const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await p.evaluate(()=>window.__POOLROOMS_V1__.configure({view:{x:-4,y:1.3,z:-6,yaw:0,pitch:-1.35},body:false,pause:true,freeze:false,grain:0,scale:1,waterLevel:.85,waveAmplitude:.052}));
 for(let i=0;i<=30;i++){const r=await p.evaluate(i=>window.__POOLROOMS_V1__.renderEvidence(i/30,{},false,i===30),i);if(i===30)writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'))}
 const a=await p.evaluate(async()=>{const a=(await window.__POOLROOMS_V1__.audit({receivers:[3]})).receivers[3];const rgb=[];for(let y=480;y<576;y++)for(let x=96;x<192;x++)rgb.push(...a.irradiance.slice((y*a.nx+x)*4,(y*a.nx+x)*4+3));return{rgb,errors:window.__POOLROOMS_V1__.snapshot().errors}});writeFileSync(`${out}/${name}.json`,JSON.stringify(a));writeFileSync(`${out}/${name}.wgsl`,shader);console.log(name,errors,a.errors);await p.close();
}}finally{await b.close()}
