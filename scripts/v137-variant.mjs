import {execFileSync} from 'node:child_process';
export async function installVariant(page,name){
 if(name==='after')return;
 for(const file of ['levels/poolrooms.json','src/render/wave-simulation.js','src/render/wave-simulation.wgsl','src/render/body-waves.js','src/render/body-waves.wgsl','src/wake-trail.js','src/kick-impacts.js']){
  await page.route(u=>u.pathname==='/'+file,route=>{
   let s=execFileSync('git',['show','8bf4dfc:'+file],{encoding:'utf8'});
   if(file.endsWith('.json'))s='export default '+s;
   else if(file.endsWith('.wgsl'))s='export default '+JSON.stringify(s);
   else if(file.endsWith('.js'))s=s.replace(/'\.\/(body-waves|wave-simulation)\.wgsl\?raw'/g,"'/src/render/$1.wgsl?import&raw'");
   return route.fulfill({contentType:'text/javascript',body:s});
  });
 }
}
