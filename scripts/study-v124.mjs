// Isolated browser routes only: production sources remain untouched.
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const variant=process.env.VARIANT||'baseline';const amp={short015:.00015,short05:.0005,short1:.001,inverseShort05:.0005}[variant]||0;
let s=readFileSync('scripts/compare-v123.mjs','utf8');
s=s.replace("for(const file of ['renderer.js','solar-atlas.wgsl','camera.wgsl','common.wgsl'])", "for(const file of ['renderer.js','solar-atlas.wgsl','camera.wgsl','common.wgsl','wave-simulation.wgsl'])");
s=s.replace("for(const file of", `await p.route(u=>u.pathname==='/src/main.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('if (!holdTime && frameMs.length > 60 && done - lastResize > 900)','if (false)')});});\nfor(const file of`);
s=s.replace("process.env.WORKING?readFileSync('src/render/'+file,'utf8'):execFileSync('git',['show','ca09c32:src/render/'+file],{encoding:'utf8'})", "execFileSync('git',['show','8ce969c:src/render/'+file],{encoding:'utf8'})");
const inverseCode=readFileSync('scripts/inverse-v124.wgsl','utf8');
const injection=`
 if('${variant}'.startsWith('inverse')){
  if(file==='camera.wgsl')s=${JSON.stringify(inverseCode)}+s.replace('fn fineSolar(p:vec3f)->vec3f {','fn fineSolar(p:vec3f)->vec3f { if(U.state.z>=0.){return inverse124(p); }');
  if(file==='renderer.js')s=s.replace(/      compute\\(waterEncoder,beamCompute,[\\s\\S]*?beams.end\\(\\);/,'');
 }

 if(file==='wave-simulation.wgsl' && '${variant}'==='undamped')s=s.replace('acceleration+=.00008*velocityLaplacian;','acceleration+=0.*velocityLaplacian;');
 if(file==='solar-atlas.wgsl' && '${variant}'==='noFootprint')s=s.replace('let scale=sqrt(max(low,1./12.)/max(low,1e-12));','let scale=1.;');
 if(file==='common.wgsl' && ${amp}>0){s=s.replace('return vec3f(U.state.y+dot(row,x),32.*dot(row,dx),32.*dot((3.*d*t.y+2.*c)*t.y+b,x));',\`var result=vec3f(U.state.y+dot(row,x),32.*dot(row,dx),32.*dot((3.*d*t.y+2.*c)*t.y+b,x));
 // Experimental actual surface displacement and its exact gradient, shared
 // by camera intersections, photon refraction, and all water lighting paths.
 let angles=array<f32,3>(.37,2.11,4.28);let lengths=array<f32,3>(.08,.105,.13);
 for(var j=0u;j<3u;j++){let k=2.*PI/lengths[j];let dir=vec2f(cos(angles[j]),sin(angles[j]));let omega=sqrt((9.81*k+.000073*k*k*k)*tanh(k*U.state.y));let phase=k*dot(p,dir)-omega*U.state.x*.28+f32(j)*1.71;let a=${amp}/sqrt(3.);result+=vec3f(a*cos(phase),-a*k*sin(phase)*dir);}
 return result;\`);}
`;
s=s.replace(" if(directions!==3){",injection+" if(directions!==3){");
s=s.replace(" const a=await p.evaluate(focus=>", ` if('${variant}'==='baseline'){const sim=await p.evaluate(()=>window.__POOLROOMS_V1__.audit({simulation:true}));writeFileSync(out+'/water.json',JSON.stringify(sim.simulation));}
 const a=await p.evaluate(focus=>`);
if(process.env.SEQUENCE){s=s.replace(" const a=await p.evaluate(focus=>", ` mkdirSync(out+'/'+name+'-frames',{recursive:true});for(let i=0;i<90;i++){const frame=await p.evaluate(t=>window.__POOLROOMS_V1__.renderEvidence(t,{},false,true),6+i/30);writeFileSync(out+'/'+name+'-frames/frame-'+String(i).padStart(4,'0')+'.png',Buffer.from(frame.png.split(',')[1],'base64'));}\n const a=await p.evaluate(focus=>`);}
process.env.WORKING='1';process.env.EVIDENCE_DIR ||= '../workroom-v1.24-evidence/study';process.env.CASES=JSON.stringify([[variant,Number(process.env.GRID||640),2048]]);
// Preserve fixed baseline focus across experiments.
mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});writeFileSync(process.env.EVIDENCE_DIR+'/previous.json',JSON.stringify({solar:{peakXZ:[2.0551747585890534,-3.8104139901079854]}}));
const path=new URL('./.study-v124-run.mjs',import.meta.url);writeFileSync(path,s);try{await import(path.href+'?v='+Date.now())}finally{(await import('node:fs')).unlinkSync(path)}
