// Current-frame photon beam mesh. Each source triangle carries its incident
// power to the floor; rasterized receiver area supplies the Jacobian. Additive
// overlap handles folds without a camera-dependent gather or image history.
struct BeamNode { landing:vec4f, flux:vec4f };
@group(0) @binding(3) var<storage,read_write> beamOutput:array<BeamNode>;
@group(0) @binding(4) var<storage,read> beamInput:array<BeamNode>;
const BEAM_N:u32=384u;
fn beamBounds()->vec4f {
 let l=sunDirection();let shift=-l.xz/l.y*(6.101-U.state.y);
 return vec4f(U.opening.xz+shift-vec2f(.3),U.opening.yw+shift+vec2f(.3));
}
fn atlasBounds()->vec4f {
 let b=beamBounds();let rd=refract(-sunDirection(),vec3f(0,1,0),1./1.333);
 let shift=rd.xz*(-U.state.y/rd.y);
 return vec4f(b.xy+shift-vec2f(.5),b.zw+shift+vec2f(.5));
}
@compute @workgroup_size(128)
fn beamNodes(@builtin(global_invocation_id) gid:vec3u) {
 let i=gid.x;let count=(BEAM_N+1u)*(BEAM_N+1u);if(i>=count*3u){return;}
 let j=i%count;let disc=i/count;let b=beamBounds();
 let xz=mix(b.xy,b.zw,vec2f(f32(j%(BEAM_N+1u)),f32(j/(BEAM_N+1u)))/f32(BEAM_N));
 let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
 // Three fixed equal-area angular quadrature points of the finite solar disc.
 let angle=(f32(disc)+.5)*2.*PI/3.;let l=normalize(sunDirection()+basis(sunDirection())*vec3f(cos(angle),sin(angle),0.)*(.00465*.70710678));
 let rd=refract(-l,n,1./1.333);let t=-p.y/rd.y;let landing=p+rd*t;
 let sourceDistance=(6.102-p.y)/l.y;
 let clear=all(xz>vec2f(-7,-17))&&all(xz<vec2f(7,10))&&t>0.&&dot(l,n)>0.&&traceDynamicSolid(p+l*EPS*2.,l,sourceDistance).t>=sourceDistance-.005;
 let receiver=traceDynamicSolid(p+rd*EPS*2.,rd,INF);
 let valid=clear&&receiver.sid==3u;
 let flux=sunIrradiance()*max(dot(n,l),0.)/n.y*(1.-fresnel(dot(l,n),1.,1.333))*waterTransmittance(t)*exp(-.004*sourceDistance)*(1.-schlick(abs(rd.y),.043))/3.;
 beamOutput[i]=BeamNode(vec4f(landing.xz,select(0.,1.,valid),0.),vec4f(flux,0.));
}
struct BeamVertex { @builtin(position) position:vec4f, @location(0) energy:vec3f };
// Interpolate the local differential density within each beam, then normalize
// its mean back to that triangle's exact transported power. This removes
// flat-shaded beam facets without blurring neighbouring receiver pixels.
fn nodeDensity(id:u32)->f32 {
 let count=(BEAM_N+1u)*(BEAM_N+1u);let local=id%count;let x=local%(BEAM_N+1u);let y=local/(BEAM_N+1u);
 let a=beamInput[id-select(0u,1u,x>0u)].landing.xy;
 let b=beamInput[id+select(0u,1u,x<BEAM_N)].landing.xy;
 let c=beamInput[id-select(0u,BEAM_N+1u,y>0u)].landing.xy;
 let d=beamInput[id+select(0u,BEAM_N+1u,y<BEAM_N)].landing.xy;
 let dx=(b-a)/select(1.,2.,x>0u&&x<BEAM_N);let dy=(d-c)/select(1.,2.,y>0u&&y<BEAM_N);
 return 1./max(abs(dx.x*dy.y-dx.y*dy.x),1e-8);
}
@vertex fn beamVertex(@builtin(vertex_index) vertex:u32)->BeamVertex {
 let triangle=vertex/3u;let cell=triangle/2u;let disc=cell/(BEAM_N*BEAM_N);let local=cell%(BEAM_N*BEAM_N);
 let base=disc*(BEAM_N+1u)*(BEAM_N+1u)+(local/BEAM_N)*(BEAM_N+1u)+local%BEAM_N;
 var ids=vec3u(base,base+1u,base+BEAM_N+1u);
 if(triangle%2u==1u){ids=vec3u(base+1u,base+BEAM_N+2u,base+BEAM_N+1u);}
 let a=beamInput[ids.x];let b=beamInput[ids.y];let c=beamInput[ids.z];
 let ab=b.landing.xy-a.landing.xy;let ac=c.landing.xy-a.landing.xy;
 let area=abs(ab.x*ac.y-ab.y*ac.x)*.5;
 let bounds=beamBounds();let sourceArea=(bounds.z-bounds.x)*(bounds.w-bounds.y)/(2.*f32(BEAM_N*BEAM_N));
 var energy=(a.flux.rgb+b.flux.rgb+c.flux.rgb)/3.*sourceArea/max(area,1e-12);
 let density=vec3f(nodeDensity(ids.x),nodeDensity(ids.y),nodeDensity(ids.z));
 energy*=3.*density[vertex%3u]/(density.x+density.y+density.z);
 if(a.landing.z*b.landing.z*c.landing.z==0.){energy=vec3f(0);}
 let p=beamInput[ids[vertex%3u]].landing.xy;let atlas=atlasBounds();let uv=(p-atlas.xy)/(atlas.zw-atlas.xy);
 return BeamVertex(vec4f(uv*vec2f(2,-2)+vec2f(-1,1),0.,1.),energy);
}
@fragment fn beamFragment(v:BeamVertex)->@location(0) vec4f {return vec4f(v.energy,0.);}
