import {kickImpacts} from '../kick-impacts.js';
import code from './body-waves.wgsl?raw';
export async function createBodyWaves(device,prelude,sourceMode=0){
 const module=device.createShaderModule({code:prelude+`const BODY_SOURCE_MODE:u32=${sourceMode}u;\n`+code,label:'finite-depth dispersive body wake'});
 for(const m of(await module.getCompilationInfo()).messages)if(m.type==='error')throw Error(`body waves ${m.lineNum}: ${m.message}`);
 const pipelines=await Promise.all(['fft','evolve','absorb'].map(entryPoint=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})));
 const size=256*512*16,states=[0,1].map(i=>device.createBuffer({label:`body wake state ${i}`,size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}));
 const params=device.createBuffer({size:512*36,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const groups=pipelines.map(p=>states.map((_,i)=>Array.from({length:36},(_,slot)=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:params,offset:slot*512,size:272}},{binding:1,resource:{buffer:states[i]}},{binding:2,resource:{buffer:states[1-i]}}]}))));
 let last=null,previous=null,config={},contact=null,impacts=[];
 function reset(c){config=c;last=null;previous=null;contact=null;impacts=[];for(const s of states)device.queue.writeBuffer(s,0,new Float32Array(size/4));}
 function advance(time,body){
  // Camera re-renders at the same physical time must not mutate FFT state.
  if(last!==null&&time===last)return;
  const initializing=last===null;
  const start=last??time;
  const delta=last===null?0:Math.min(.05,Math.max(0,time-last));last=time;
  const velocity=body&&previous&&delta>0?[(body.x-previous.x)/delta,(body.z-previous.z)/delta]:[0,0];
  // Teleports are diagnostic resets, not a supersonic body impulse.
  if(Math.hypot(...velocity)>2)velocity.fill(0);
  previous=body?{...body}:null;
  // The ordinary-wading pressure gain fades at rest and at 1.6m/s.
  const speed=Math.hypot(...velocity);
  const wakeGain=1+(config.bodyWakeBoost??0)*Math.min(1,speed/.8)*Math.max(0,Math.min(1,(1.6-speed)/.8));
  const hits=impacts.filter(v=>v.time>start&&v.time<=time).slice(0,12);
  impacts=impacts.filter(v=>v.time>time);
  const data=new ArrayBuffer(512*36),f=new Float32Array(data),u=new Uint32Array(data);let slot=0,active=0;
  const e=device.createCommandEncoder();
  function pass(pipe,axis=0,stage=0,inverse=0){const o=slot*128;f.set([time,delta,config.waterLevel,initializing?1:0,body?.x||0,body?.z||0,body&&config.bodyDisplacement!==false?Math.min(.025,config.waterLevel*.06)*wakeGain:0,0,...velocity,hits.length,0],o);u.set([axis,stage,inverse,0],o+12);if(contact)f.set([contact.x,contact.z,contact.time,contact.amplitude*20],o+16);for(let n=0;n<hits.length;n++){const hit=hits[n];f.set([hit.x,hit.z,hit.time,hit.momentum],o+20+n*4);}
  const p=e.beginComputePass();p.setPipeline(pipelines[pipe]);p.setBindGroup(0,groups[pipe][active][slot]);p.dispatchWorkgroups(1024);p.end();active=1-active;slot++;}
  for(let axis=0;axis<2;axis++)for(let stage=0;stage<8+axis;stage++)pass(0,axis,stage,0);
  pass(1);
  for(let axis=0;axis<2;axis++)for(let stage=0;stage<8+axis;stage++)pass(0,axis,stage,1);
  pass(2); // 36 passes return to state 0.
  device.queue.writeBuffer(params,0,data);device.queue.submit([e.finish()]);
 }
 // The .14s pressure pulse ends before the next allowed contact (.4s).
 // Its radiated height/velocity remain in the state after the source expires.
 return{field:states[0],reset,advance,addWake(w){contact={...w,time:w.time??last??0};if(config.kickImpacts)impacts.push(...kickImpacts(contact));},get info(){return{method:'finite-depth gravity-capillary spectral initial-value solver',sourceMode,grid:[256,512],dx:.125,domain:[32,64],last}}};
}
