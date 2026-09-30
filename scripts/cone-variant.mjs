// "head" serves the committed fragmented-kick wake sources; "after" is the working tree.
import {execFileSync} from 'node:child_process';
export const EVIDENCE=process.env.EVIDENCE_ROOT||'../workroom-cone-evidence';
export async function installVariant(page,name){
 if(name==='after')return;
 // "bowR<radius>" keeps the working tree but narrows the bow pressure radius.
 if(name.startsWith('bowR')){const radius=name.slice(4);await page.route(u=>u.pathname==='/src/render/body-waves.wgsl',async route=>{const q=await route.fetch();const body=(await q.text()).replace('.23+max(.04,P.clock.z)',radius);return route.fulfill({response:q,body});});return;}
 for(const file of ['src/render/body-waves.js','src/render/body-waves.wgsl','src/wake-trail.js','src/kick-impacts.js']){
  await page.route(u=>u.pathname==='/'+file,route=>{
   let s=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
   if(file.endsWith('.wgsl'))s='export default '+JSON.stringify(s);
   else s=s.replace(/'\.\/body-waves\.wgsl\?raw'/g,"'/src/render/body-waves.wgsl?import&raw'");
   return route.fulfill({contentType:'text/javascript',body:s});
  });
 }
}
