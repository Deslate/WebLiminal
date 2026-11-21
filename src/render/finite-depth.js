import code from './finite-depth.wgsl?raw';
// Fit G(s)/s, where G(s)=sqrt(s)*tanh(H*sqrt(s)). The zero mode is
// applied as L*h before the polynomial, so constant height is exactly null.
export function dispersionPolynomial(depth,degree=32,dx=1/32){
 const limit=16/(3*dx*dx),n=degree+1,A=Array.from({length:n},()=>new Float64Array(n+1));
 for(let sample=0;sample<4096;sample++){
  const j=sample%2048,s=sample<2048?.001*Math.pow(limit/.001,j/2047):(1+Math.cos(Math.PI*(j+.5)/2048))*limit/2;
  const target=Math.tanh(depth*Math.sqrt(s))/Math.sqrt(s),x=2*s/limit-1,t=new Float64Array(n);t[0]=1;if(n>1)t[1]=x;for(let k=2;k<n;k++)t[k]=2*x*t[k-1]-t[k-2];
  for(let a=0;a<n;a++){const u=t[a]/target;A[a][n]+=u;for(let b=0;b<n;b++)A[a][b]+=u*t[b]/target;}
 }
 for(let k=0;k<n;k++){let pivot=k;for(let j=k+1;j<n;j++)if(Math.abs(A[j][k])>Math.abs(A[pivot][k]))pivot=j;[A[k],A[pivot]]=[A[pivot],A[k]];const d=A[k][k];for(let j=k;j<=n;j++)A[k][j]/=d;for(let i=0;i<n;i++)if(i!==k){const v=A[i][k];for(let j=k;j<=n;j++)A[i][j]-=v*A[k][j];}}
 return {limit,coefficients:A.map(r=>r[n]),degree,depth};
}
export async function createFiniteDepth(device,{params,states,count,nx,nz,dx,prelude,pressurePasses=8}){
 let degree=32;const maxDegree=80,module=device.createShaderModule({label:'finite depth on the wet-domain Neumann graph',code:prelude+code});
 for(const m of(await module.getCompilationInfo()).messages)if(m.type==='error')throw Error(`finite depth ${m.lineNum}: ${m.message}`);
 const storage=size=>device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const potential=storage(count*4),rhs=storage(count*4),recurrence=[storage(count*8),storage(count*8)],mask=storage(count*4);
 const controls=device.createBuffer({size:(maxDegree+1)*256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const layout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',hasDynamicOffset:true}},
  ...[1,2,3,4,5,6,7,8].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:[1,3,6,8].includes(binding)?'read-only-storage':'storage'}})),
  {binding:9,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',hasDynamicOffset:true}}
 ]});
 const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
 const pipelines=await Promise.all(['prepare','beginPolynomial','recur','finish','seedPressure','diffusePressure','initializeState'].map(entryPoint=>device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}})));
 const groups=states.map((state,i)=>recurrence.map((r,j)=>device.createBindGroup({layout,entries:[
 {binding:0,resource:{buffer:params,size:832}},...[state,states[1-i],r,potential,rhs,r,recurrence[1-j],mask].map((buffer,k)=>({binding:k+1,resource:{buffer}})),{binding:9,resource:{buffer:controls,size:16}}
 ]})));
 let fit=null;
 function reset(depth,depthField){
  degree=Math.max(12,Math.min(maxDegree,Math.ceil(32*depth/.42)));
  fit=dispersionPolynomial(depth,degree,dx);const bytes=new ArrayBuffer((degree+1)*256),f=new Float32Array(bytes),u=new Uint32Array(bytes);
  for(let k=0;k<=degree;k++){f[k*64]=fit.coefficients[k];f[k*64+1]=fit.limit;u[k*64+2]=k;}
  device.queue.writeBuffer(controls,0,bytes);
  const bits=new Uint32Array(count),off=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  const wet=(x,y)=>x>=0&&y>=0&&x<nx&&y<nz&&depthField[y*nx+x]>0;
  for(let y=0;y<nz;y++)for(let x=0;x<nx;x++){const i=y*nx+x;if(!wet(x,y))continue;bits[i]=0x80000000;off.forEach(([a,b],j)=>{if(wet(x+a,y+b)&&(j<4||(wet(x+a,y)&&wet(x,y+b))))bits[i]|=1<<j;});}
  device.queue.writeBuffer(mask,0,bits);
 }
 function dispatch(encoder,active,slot,pipeline,j,k=0){
  const p=encoder.beginComputePass();p.setPipeline(pipelines[pipeline]);p.setBindGroup(0,groups[active][j],[slot*1024,k*256]);p.dispatchWorkgroups(Math.ceil(count/128));p.end();
 }
 function pressure(encoder,active,slot){
  dispatch(encoder,active,slot,4,0);let j=1;
  // Opt-in previews broaden excitation for visual preference, not measured
  // environmental forcing. Gravity, capillarity and dissipation stay fixed.
  for(let i=0;i<pressurePasses;i++){dispatch(encoder,active,slot,5,j);j=1-j;}
  return j;
 }
 function initialize(encoder,active,slot){const j=pressure(encoder,active,slot);dispatch(encoder,active,slot,6,j);}
 function step(encoder,active,slot){
  const noise=pressure(encoder,active,slot);
  dispatch(encoder,active,slot,0,noise,degree);dispatch(encoder,active,slot,1,0,degree);let j=1;
  for(let k=degree-1;k>=1;k--){dispatch(encoder,active,slot,2,j,k);j=1-j;}
  dispatch(encoder,active,slot,3,j,0);
 }
 return {reset,initialize,step,get info(){return {method:'G(L)=sqrt(L)tanh(H sqrt(L)), Neumann wet-domain graph',...fit,uniformDepth:true,pressurePasses,forcing:'homogeneous band-limited stochastic pressure'}}};
}
