import{execFileSync,spawn}from'node:child_process';import{writeFileSync}from'node:fs';
const root='../workroom-v1.29-evidence';
export const utilization=()=>{const s=execFileSync('ioreg',['-r','-c','AGXAccelerator','-l'],{encoding:'utf8'});return Number(s.match(/"Device Utilization %"=(\d+)/)?.[1]??NaN)};
export async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(pending.has(x.id)){const[r,j]=pending.get(x.id);pending.delete(x.id);x.error?j(Error(JSON.stringify(x.error))):r(x.result)}};return{send(method,params={}){return new Promise((r,j)=>{const n=++id;pending.set(n,[r,j]);ws.send(JSON.stringify({id:n,method,params}))})},close:()=>ws.close()}}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const targets=await(await fetch((process.env.CDP_URL||'http://127.0.0.1:49316')+'/json/list')).json();const pages=targets.filter(t=>t.title==='LUNAR — See it closer'||t.title==='HoloLab'||t.title==='Electron + React');
if(pages.length!==4)throw Error('Expected four identified background pages; inspect targets before benchmarking.');
const clients=[];const result={targets:[],before:[],isolated:[],after:[],restoreErrors:[]};
try{
 for(let i=0;i<3;i++){result.before.push(utilization());await delay(1000)}
 for(const t of pages){const c=await connect(t.webSocketDebuggerUrl);clients.push(c);const info=await c.send('Runtime.evaluate',{expression:'JSON.stringify({title:document.title,visibility:document.visibilityState,canvases:document.querySelectorAll("canvas").length})',returnByValue:true});result.targets.push({id:t.id,...JSON.parse(info.result.value)});await c.send('Page.setWebLifecycleState',{state:'frozen'});}
 await delay(2000);for(let i=0;i<5;i++){result.isolated.push(utilization());await delay(1000)}
 console.log(JSON.stringify(result));
 if(process.argv[2])await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[process.argv[2]],{stdio:'inherit',env:process.env});p.on('exit',c=>c===0?resolve():reject(Error('child exit '+c)));});
}finally{
 for(const c of clients){await c.send('Page.setWebLifecycleState',{state:'active'}).catch(e=>result.restoreErrors.push(e.message));c.close()}
 await delay(2000);for(let i=0;i<3;i++){result.after.push(utilization());await delay(1000)}
 writeFileSync(root+'/'+(process.env.ISOLATION_NAME||'isolation')+'.json',JSON.stringify(result,null,2));console.log('restored',result.after);if(result.restoreErrors.length)throw Error('Some pages failed to resume: '+result.restoreErrors.join('; '));
}
