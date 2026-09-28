// A pressure pulse must have temporal bandwidth at the water mode it drives.
// Diagnostic candidate only; same spatial radii, event density and amplitudes.
import {execFileSync} from 'node:child_process';
export async function installForcing(page,name){
if(name==='after')return;
for(const path of ['src/render/wave-simulation.js','src/render/wave-simulation.wgsl'])await page.route(u=>u.pathname==='/'+path,async r=>{
 let s=execFileSync('git',['show','846c649:'+path],{encoding:'utf8'});
 if(name==='balanced-pressure')s=s.replace('duration:.35+radius*.9','duration:Math.PI*radius/(2*Math.sqrt(9.81*config.waterLevel))').replace('/(radius*radius+.06)','/Math.max(radius*radius,4*dx*dx)').replace('nextAmbient+=.07+random()*.12','nextAmbient+=(.07+random()*.12)*.25').replace('let pulse=16.*a*a*(1.-a)*(1.-a);','let pulse=select(16.*a*a*(1.-a)*(1.-a),32.*a*(1.-a)*(1.-2.*a)/3.14159265,j>=12u);');if(name==='stationary-budget')s=s.replace('duration:.35+radius*.9','duration:Math.PI*radius/(2*Math.sqrt(9.81*config.waterLevel))').replace('/(radius*radius+.06)','/Math.max(radius*radius,4*dx*dx)').replace('nextAmbient+=.07+random()*.12','nextAmbient+=(.07+random()*.12)*.25');if(name==='energy-budget')s=s.replace('duration:.35+radius*.9','duration:Math.PI*radius/(2*Math.sqrt(9.81*config.waterLevel))').replace('/(radius*radius+.06)','/Math.max(radius*radius,4*dx*dx)');
 if(name==='bandwidth')s=s.replace('duration:.35+radius*.9','duration:Math.PI*radius/(2*Math.sqrt(9.81*config.waterLevel))');
 if(path.endsWith('.wgsl'))s='export default '+JSON.stringify(s);else s=s.replace("'./wave-simulation.wgsl?raw'","'/src/render/wave-simulation.wgsl?import&raw'");
 await r.fulfill({contentType:'text/javascript',body:s});
});}
