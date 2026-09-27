import code from './body-waves.wgsl?raw';
export async function createBodyWaves(device){
 const module=device.createShaderModule({code,label:'finite-depth dispersive body wake'});
 for(const m of(await module.getCompilationInfo()).messages)if(m.type==='error')throw Error(`body waves ${m.lineNum}: ${m.message}`);
 const pipelines=await Promise.all(['fft','evolve','absorb'].map(entryPoint=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})));
 const size=256*512*16,states=[0,1].map(i=>device.createBuffer({label:`body wake state ${i}`,size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}));
 const params=device.createBuffer({size:256*36,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const groups=pipelines.map(p=>states.map((_,i)=>Array.from({length:36},(_,slot)=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:params,offset:slot*256,size:64}},{binding:1,resource:{buffer:states[i]}},{binding:2,resource:{buffer:states[1-i]}}]}))));
 let last=null,previous=null,config={};
 function reset(c){config=c;last=null;previous=null;for(const s of states)device.queue.writeBuffer(s,0,new Float32Array(size/4));}
 function advance(time,body){
  // Camera re-renders at the same physical time must not mutate FFT state.
  if(last!==null&&time===last)return;
  const initializing=last===null;
  const delta=last===null?0:Math.min(.05,Math.max(0,time-last));last=time;
  const velocity=body&&previous&&delta>0?[(body.x-previous.x)/delta,(body.z-previous.z)/delta]:[0,0];
  // Teleports are diagnostic resets, not a supersonic body impulse.
  if(Math.hypot(...velocity)>2)velocity.fill(0);
  previous=body?{...body}:null;
  const data=new ArrayBuffer(256*36),f=new Float32Array(data),u=new Uint32Array(data);let slot=0,active=0;
  const e=device.createCommandEncoder();
  function pass(pipe,axis=0,stage=0,inverse=0){const o=slot*64;f.set([time,delta,config.waterLevel,initializing?1:0,body?.x||0,body?.z||0,body&&config.bodyDisplacement!==false?Math.min(.10,config.waterLevel*.24)*(config.bodyWaveStrength??1):0,0,...velocity,0,0],o);u.set([axis,stage,inverse,0],o+12);const p=e.beginComputePass();p.setPipeline(pipelines[pipe]);p.setBindGroup(0,groups[pipe][active][slot]);p.dispatchWorkgroups(1024);p.end();active=1-active;slot++;}
  for(let axis=0;axis<2;axis++)for(let stage=0;stage<8+axis;stage++)pass(0,axis,stage,0);
  pass(1);
  for(let axis=0;axis<2;axis++)for(let stage=0;stage<8+axis;stage++)pass(0,axis,stage,1);
  pass(2); // 36 passes return to state 0.
  device.queue.writeBuffer(params,0,data);device.queue.submit([e.finish()]);
 }
 return{field:states[0],reset,advance,get info(){return{method:'finite-depth gravity-capillary spectral initial-value solver',grid:[256,512],dx:.125,domain:[32,64],last}}};
}
