// Linear finite-depth gravity-capillary initial-value problem. The only forcing
// is the compact moving body pressure; no wake angle, arms, or time carrier.
struct Params { clock:vec4f, body:vec4f, motion:vec4f, fft:vec4u };
@group(0) @binding(0) var<uniform> P:Params;
@group(0) @binding(1) var<storage,read> input:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> output:array<vec4f>;
const NX:u32=256u;const NZ:u32=512u;const N:u32=131072u;
fn cmul(a:vec2f,b:vec2f)->vec2f{return vec2f(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
fn reverse(v:u32,bits:u32)->u32{return reverseBits(v)>>(32u-bits);}
@compute @workgroup_size(128) fn fft(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}let axis=P.fft.x;let stage=P.fft.y;
 let length=select(NX,NZ,axis==1u);let bits=select(8u,9u,axis==1u);
 let coordinate=select(i%NX,i/NX,axis==1u);let half=1u<<stage;let width=half*2u;
 let j=coordinate%half;let base=coordinate/width*width;
 var a=base+j;var b=a+half;
 if(stage==0u){a=reverse(a,bits);b=reverse(b,bits);}
 let ia=select(i/NX*NX+a,a*NX+i%NX,axis==1u);
 let ib=select(i/NX*NX+b,b*NX+i%NX,axis==1u);
 let angle=select(-1.,1.,P.fft.z==1u)*6.283185307*f32(j)/f32(width);
 let twiddle=vec2f(cos(angle),sin(angle));let av=input[ia];let bv=input[ib];
 let rotated=vec4f(cmul(bv.xy,twiddle),cmul(bv.zw,twiddle));
 var value=av+select(1.,-1.,coordinate%width>=half)*rotated;
 if(P.fft.z==1u&&stage==bits-1u){value/=f32(length);}
 output[i]=value;
}
@compute @workgroup_size(128) fn evolve(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}
 let ix=i%NX;let iz=i/NX;
 // Nyquist modes cannot represent arbitrary translations as a real field.
 if(ix==128u||iz==256u){output[i]=vec4f(0.);return;}
 let k=6.283185307*vec2f(f32(select(i32(ix),i32(ix)-256,ix>128u))/32.,f32(select(i32(iz),i32(iz)-512,iz>256u))/64.);
 let km=length(k);if(km<.00001){output[i]=vec4f(0.);return;}
 let omega=sqrt((9.81*km+.000073*km*km*km)*tanh(km*max(.04,P.clock.z)));
 var h=input[i].xy;var v=input[i].zw;
 let substeps=max(1u,u32(ceil(P.clock.y*240.)));let dt=P.clock.y/f32(substeps);
 let speed=length(P.motion.xy);let direction=P.motion.xy/max(speed,.0001);
 // Soft excluded-volume equilibrium plus velocity-dependent dynamic pressure.
 // The pressure has a fore/aft dipole, confined to <1m about the body. V arms
 // are entirely the dispersive initial-value response, never prescribed here.
 let radius=.24;let gaussian=6.283185307*radius*radius/(.125*.125)*exp(-.5*radius*radius*km*km);
 let dipole=dot(k,direction)*.20;
 let amplitude=P.body.z;
 let dynamicGaussian=6.283185307*.17*.17/(.125*.125)*exp(-.5*.17*.17*km*km);
 for(var j=0u;j<substeps;j++){
  // Calibrated soft-pressure footprint leads the cylinder at its wet front.
  let position=P.body.xy+P.motion.xy*.225-P.motion.xy*(P.clock.y-(f32(j)+.5)*dt)+vec2f(16.,32.);
  let phase=-dot(k,position);let phaseRotation=vec2f(cos(phase),sin(phase));
  let pressure=vec2f(gaussian*amplitude*.30,-dynamicGaussian*amplitude*.24*speed*speed*dipole);
  let equilibrium=cmul(phaseRotation,pressure);
  if(P.clock.w>.5){h=equilibrium;v=vec2f(0.);}
  let c=cos(omega*dt);let s=sin(omega*dt);
  let nh=h*c+v*(s/omega)+equilibrium*(1.-c);
  v=v*c-h*(omega*s)+equilibrium*(omega*s);h=nh;
 }
 // Physical modal dissipation, increasing only towards unresolved short waves.
 let attenuation=exp(-P.clock.y*(.035+.0007*km*km));
 output[i]=vec4f(h,v)*attenuation;
}
@compute @workgroup_size(128) fn absorb(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}
 let world=vec2f(f32(i%NX),f32(i/NX))*.125-vec2f(16.,32.);
 // Broad exterior sponge: the padded FFT domain is computational, not a
 // periodic pool. Waves are absorbed before reaching its periodic seam.
 let exterior=max(max(abs(world.x)-7.,-world.y-17.),world.y-10.);
 let damping=exp(-P.clock.y*8.*pow(smoothstep(0.,5.,exterior),2.));
 output[i]=input[i]*damping;
}
