import{execFileSync}from'node:child_process';
export async function installVariant(page,name){
 if(name==='after')return;
 if(name==='base'||name==='steep')await page.route(u=>u.pathname==='/src/render/renderer.js',async r=>{const q=await r.fetch();await r.fulfill({response:q,body:(await q.text()).replace('const wakeEnvelope=.34;','const wakeEnvelope=.28;')});});
 for(const file of ['wake-trail.js','render/body-waves.js','render/body-waves.wgsl'])await page.route(u=>u.pathname==='/src/'+file,r=>{
  let raw=execFileSync('git',['show',(name==='base'?'249dd10':'candidate/ripples-steep')+':src/'+file],{encoding:'utf8'});
  if(name.startsWith('bow')&&file.endsWith('wgsl')){
   const gain=Number(name.match(/^bow([0-9.]+)/)[1]);
   if(name.endsWith('safe')) {
    raw=raw.replace('let footRadius=.14;',`let bowRadius=.65;
 let bowGaussian=6.283185307*bowRadius*bowRadius/(.125*.125)*exp(-.5*bowRadius*bowRadius*km*km);
 let bowHead=(speed*speed/(2.*9.81))*${gain.toFixed(1)}*(1.-smoothstep(.8,1.2,speed));
 let bowPressure=bowGaussian*1.64872127*bowHead*dot(k,direction)*bowRadius*select(0.,1.,amplitude>0.);
 let footRadius=.14;`).replace('-dynamicGaussian*amplitude*.24*speed*speed*dipole','-dynamicGaussian*amplitude*.24*speed*speed*dipole-bowPressure');
   } else {
    raw=raw.replace('let dipole=dot(k,direction)*.20;',`let dipole=dot(k,direction)*.65;`)
     .replace('let dynamicGaussian=6.283185307*.16*.16/(.125*.125)*exp(-.5*.16*.16*km*km);','let dynamicGaussian=6.283185307*.65*.65/(.125*.125)*exp(-.5*.65*.65*km*km);')
     .replace('-dynamicGaussian*amplitude*.24*speed*speed*dipole',`-dynamicGaussian*(speed*speed/(2.*9.81))*1.64872127*${gain.toFixed(1)}*dipole*select(0.,1.,amplitude>0.)`);
   }
  }
  return r.fulfill({contentType:'text/javascript',body:file.endsWith('.wgsl')?'export default '+JSON.stringify(raw):raw.replace("'./body-waves.wgsl?raw'","'/src/render/body-waves.wgsl?import&raw'")});
 });
}
