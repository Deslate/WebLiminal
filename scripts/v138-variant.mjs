import {execFileSync} from 'node:child_process';
export async function installVariant(page,name){
 if(name!=='before')return;
 for(const file of ['common.wgsl','camera.wgsl','resolve.wgsl','compose-light.wgsl'])await page.route(u=>u.pathname==='/src/render/'+file,r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(execFileSync('git',['show','ba381e7:src/render/'+file],{encoding:'utf8'}))}));
 await page.route(u=>u.pathname==='/src/render/renderer.js',async r=>{const q=await r.fetch();const s=(await q.text()).replace('horizontalGroup=bindings(pipelines[5],[[0,uniforms],[1,buffers.geometry],[2,','horizontalGroup=bindings(pipelines[5],[[0,uniforms],[2,').replace('composeGroup=bindings(pipelines[11],[[0,uniforms],[1,buffers.geometry],[2,','composeGroup=bindings(pipelines[11],[[0,uniforms],[2,');await r.fulfill({response:q,body:s});});
}
