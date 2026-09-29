import {createFiniteDepth} from './finite-depth.js';
import code from './wave-simulation.wgsl?raw';
import {createBodyWaves} from './body-waves.js';
export const WAVE_GRID={nx:448,nz:864,dx:1/32,dt:1/120};
export async function createWaveSimulation(device){
 const bodyWaves=await createBodyWaves(device);
 const {nx,nz,dx,dt}=WAVE_GRID,count=nx*nz,size=count*8;
 const module=device.createShaderModule({label:'shared water initial state and reconstruction',code});
 const info=await module.getCompilationInfo();for(const m of info.messages)if(m.type==='error')throw Error(`wave simulation ${m.lineNum}: ${m.message}`);
 const pipelines=await Promise.all(['reconstruct','interpolate'].map(entryPoint=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint}})));
 const storage=(label,size)=>device.createBuffer({label,size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
 const state=[storage('wave height velocity A',size),storage('wave height velocity B',size)];
 const field=storage('shared physical water surface',count*16),depth=storage('water domain and local depth',count*4);
 const coefficients=storage('C1 bicubic water polynomials',count*64);
 const stride=1024,params=device.createBuffer({size:stride*32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const finiteDepth=await createFiniteDepth(device,{params,states:state,count,nx,nz,dx});
 const bind=(pipeline,entries,slot)=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:entries.map(([binding,buffer])=>({binding,resource:buffer===params?{buffer,offset:slot*stride,size:832}:{buffer}}))});
 const packs=state.map(s=>bind(pipelines[0],[[0,params],[1,s],[3,depth],[4,field],[12,bodyWaves.field]],31));
 const interpolation=bind(pipelines[1],[[5,field],[6,coefficients]],0);
 let body=null,previousBody=null;
 let active=0,time=0,origin=null,lastClock=null,ready=false,stepsDone=0,config={},injections=0;
 function reset(c,geometry){bodyWaves.reset(c);previousBody=null;config={...c};active=0;time=0;origin=null;lastClock=null;ready=false;stepsDone=0;injections=0;
  const values=new Float32Array(count);for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const px=-7+(x+.5)*dx,pz=-17+(z+.5)*dx;let bottom=0;for(const s of geometry.shapes){if(s.lo[1]>c.waterLevel||s.hi[1]<=0||px<=s.lo[0]||px>=s.hi[0]||pz<=s.lo[2]||pz>=s.hi[2])continue;if(s.kind===1&&Math.abs(px-(s.lo[0]+s.hi[0])*.5)<s.radius)continue;bottom=Math.max(bottom,s.hi[1]);}values[z*nx+x]=Math.max(0,c.waterLevel-bottom);}device.queue.writeBuffer(depth,0,values);finiteDepth.reset(c.waterLevel,values);
 }
 function addWake(w){bodyWaves.addWake(w);injections++;}
 function block(t,delta=dt,remainder=0,bodyPose=body){const f=new Float32Array(208);f.set([t,delta,remainder,0,config.waveAmplitude,0,config.seed,config.waveForcing===false?0:1]);if(bodyPose)f.set([bodyPose.x,bodyPose.z,.27,config.bodyDisplacement===false?0:Math.min(.10,config.waterLevel*.24)],200);return f;}
 const dispatch=(encoder,pipeline,group)=>{const p=encoder.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(Math.ceil(count/128));p.end();};
 function advance(clock){
  if(!config.freeze&&lastClock!==null&&clock<lastClock-1e-7)throw Error('Stateful water cannot seek backwards: reset and replay the simulation.');
  bodyWaves.advance(config.freeze?0:clock,body);
  lastClock=clock;
  if(origin===null)origin=clock;
  const target=config.freeze?time:Math.max(time,(clock-origin)*(config.waveSpeed??1));
  const encoder=device.createCommandEncoder();
  const initializing=!ready;
  if(!ready){device.queue.writeBuffer(params,0,block(0));finiteDepth.initialize(encoder,active,0);active=1-active;ready=true;}
  // Runtime supplies <=50ms deltas. A diagnostic seek
  // must replay, never synthesize a surface directly at the requested time.
  const n=Math.min(30,Math.max(0,Math.floor((target-time+1e-8)/dt)));
  const data=new Float32Array(stride/4*32);
  for(let k=0;k<n;k++){const blend=(k+1)/Math.max(1,n);const bodyAtStep=body&&previousBody?{x:previousBody.x+(body.x-previousBody.x)*blend,z:previousBody.z+(body.z-previousBody.z)*blend}:body;const paramsAtStep=block(time+dt,dt,0,bodyAtStep);data.set(paramsAtStep,k*stride/4);finiteDepth.step(encoder,active,k);active=1-active;time+=dt;stepsDone++;}
  data.set(block(time,dt,Math.min(dt,Math.max(0,target-time))),31*stride/4);
  // initialize shares slot 0: preserve initial-condition parameters when n=0.
  if(n===0&&initializing){data.set(block(0),0);}
  device.queue.writeBuffer(params,0,data);dispatch(encoder,pipelines[0],packs[active]);dispatch(encoder,pipelines[1],interpolation);device.queue.submit([encoder.finish()]);previousBody=body?{...body}:null;
 }
 async function audit(){await device.queue.onSubmittedWorkDone();const rb=device.createBuffer({size:count*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});const e=device.createCommandEncoder();e.copyBufferToBuffer(field,0,rb,0,count*16);device.queue.submit([e.finish()]);await rb.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(rb.getMappedRange()));rb.unmap();rb.destroy();return {grid:WAVE_GRID,time,stepsDone,injections,values};}
 return {field:coefficients,reset,advance,addWake,audit,setBody(p){body=p?{...p}:null;},get info(){return {method:'finite-depth gravity-capillary Neumann-graph wave equation',propagation:finiteDepth.info,...WAVE_GRID,time,stepsDone,injections,body,bodyWaves:bodyWaves.info,forcing:config.waveForcing!==false}}};
}
