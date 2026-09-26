import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='/Users/steven/Projects/workroom-v1.1-evidence/consecutive';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try{
const p=await b.newPage({viewport:{width:1512,height:982}});await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().completedFrames>3);await p.waitForTimeout(3000);await p.evaluate(()=>document.body.classList.add('evidence'));await p.evaluate(()=>window.__POOLROOMS_V1__.configure({freeze:true}));await p.waitForTimeout(700);
const cdp=await p.context().newCDPSession(p);const records=[];
for(const scenario of ['turn-and-walk','dark-exposure-stress']){
 let count=0,finish;const done=new Promise(r=>finish=r);
 await p.evaluate(async name=>{await window.__POOLROOMS_V1__.configure({freeze:true,exposure:name==='dark-exposure-stress'?3.4:.85});window.__motionActive=true;const start=performance.now();const tick=now=>{if(!window.__motionActive)return;const t=(now-start)/1000;if(name==='dark-exposure-stress')window.__POOLROOMS_V1__.setView({x:0,y:1.62,z:-14,yaw:1.7+t*.9,pitch:-.08});else window.__POOLROOMS_V1__.setView({x:-3.6+t*.15,y:1.62,z:8-t*.6,yaw:-.6+t*.35,pitch:-.12});requestAnimationFrame(tick);};requestAnimationFrame(tick);},scenario);
 await p.waitForTimeout(500);
 const handler=async e=>{
   const i=count++;
   if(i<16){const file=`${scenario}-${String(i).padStart(2,'0')}.png`;writeFileSync(`${out}/${file}`,Buffer.from(e.data,'base64'));records.push({scenario,file,metadata:e.metadata});}
   await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId});
   if(count>=16)finish();
 };
 cdp.on('Page.screencastFrame',handler);await cdp.send('Page.startScreencast',{format:'png',maxWidth:1512,maxHeight:982,everyNthFrame:1});
 let timer;await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Screencast timeout')),30000);})]);clearTimeout(timer);
 await cdp.send('Page.stopScreencast');cdp.off('Page.screencastFrame',handler);await p.evaluate(()=>window.__motionActive=false);
 console.log('Consecutive frames',scenario,count);
}
const report={browser:await b.version(),method:'CDP Page.startScreencast PNG everyNthFrame=1; each compositor frame acknowledged immediately. No intentional frame skipping. Capture overhead makes this unsuitable for performance reporting.',records};writeFileSync(`${out}/manifest.json`,JSON.stringify(report,null,2));
}finally{await b.close();}
