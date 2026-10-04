// Optional single scattering in the air of a window (`scene.air`). A fixed
// world-space grid stores, per voxel, the sun's visibility and the sky
// radiance arriving through the roof and wall apertures; camera rays march it
// and add light scattered towards the viewer. Only windows that declare air
// are specialised; others keep their shader text and bindings.
const f = v => (Number.isInteger(v) ? `${v}.` : String(v));

export function airGrid(scene) {
  if (!scene.air) return null;
  const { bounds } = scene, cell = scene.air.cell ?? 1 / 3;
  const lo = [bounds.minX, 0, bounds.minZ], hi = [bounds.maxX, bounds.ceiling, bounds.maxZ];
  const n = lo.map((v, k) => Math.max(2, Math.ceil((hi[k] - v) / cell)));
  return { lo, hi, n, count: n[0] * n[1] * n[2] };
}

function constants(scene) {
  const g = airGrid(scene), a = scene.air;
  return `const AIR_MIN=vec3f(${g.lo.map(f).join(',')});
const AIR_MAX=vec3f(${g.hi.map(f).join(',')});
const AIR_N=vec3u(${g.n.join('u,')}u);
const AIR_SCATTERING:f32=${f(a.scattering)};
const AIR_ANISOTROPY:f32=${f(a.anisotropy)};
`;
}

// Bake: one invocation per voxel. Sun visibility from four fixed sub-voxel
// points; sky radiance integrated over every aperture with visibility.
export function airBakeSource(scene) {
  const walls = scene.wallApertures?.length ? `
  for(var k=0u;k<WALL_APERTURES;k++){
    for(var i=0u;i<16u;i++){
      let q=vec2f((f32(i%4u)+.5)/4.,(f32(i/4u)+.5)/4.);let lp=WALL_O[k]+WALL_U[k]*q.x+WALL_V[k]*q.y+WALL_OUT[k]*.002;
      let delta=lp-p;let d=length(delta);let l=delta/d;let ca=dot(l,WALL_OUT[k]);
      if(ca>0. && !traceSolidAny(p,l,d-.004)){sky+=skyRadiance(l)*ca*wallArea(k)/(d*d)/16.;}
    }
  }` : '';
  return `${constants(scene)}
@group(0) @binding(3) var<storage,read_write> air:array<vec4f>;
@compute @workgroup_size(64)
fn bakeAir(@builtin(global_invocation_id) gid:vec3u){
  let count=AIR_N.x*AIR_N.y*AIR_N.z;let idx=gid.x;if(idx>=count){return;}
  let ijk=vec3u(idx%AIR_N.x,(idx/AIR_N.x)%AIR_N.y,idx/(AIR_N.x*AIR_N.y));
  let p=AIR_MIN+(vec3f(ijk)+.5)/vec3f(AIR_N)*(AIR_MAX-AIR_MIN);let cell=(AIR_MAX-AIR_MIN)/vec3f(AIR_N);
  var visible=0.;
  for(var s=0u;s<4u;s++){
    let o=p+(vec3f(f32(s&1u),f32((s>>1u)&1u),f32(((s+1u)>>1u)&1u))-.5)*cell*.5;
    if(!traceSolidAny(o,sunDirection(),INF)){visible+=.25;}
  }
  // Solid angle-weighted sky radiance: integral of L over visible apertures.
  var sky=vec3f(0);let area=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);
  for(var i=0u;i<16u;i++){
    let q=vec2f((f32(i%4u)+.5)/4.,(f32(i/4u)+.5)/4.);
    let lp=vec3f(mix(U.opening.x,U.opening.y,q.x),OPENING_Y+.002,mix(U.opening.z,U.opening.w,q.y));
    let delta=lp-p;let d=length(delta);let l=delta/d;
    if(l.y>0. && !traceSolidAny(p,l,d-.004)){sky+=skyRadiance(l)*l.y*area/(d*d)/16.;}
  }${walls}
  air[idx]=vec4f(sky,visible);
}
`;
}

export function airCamera(source, scene) {
  if (!scene.air) return source;
  const haze = 'return c*tr+vec3f(.065,.085,.09)*(1.-tr);';
  const entry = 'fn radiance(ro:vec3f,rd:vec3f,sampleIndex:u32)->CameraLayers {';
  for (const hook of [haze, entry]) if (!source.includes(hook)) throw Error('Missing air scattering shader hook');
  // Extinction stays the existing 0.004/m; the light-independent haze term is
  // replaced by light actually scattered out of the sun and sky.
  return source.replace(haze, 'return c*tr;').replace(entry, `${constants(scene)}
@group(0) @binding(10) var<storage,read> air:array<vec4f>;
fn airSample(p:vec3f)->vec4f {
  let q=clamp((p-AIR_MIN)/(AIR_MAX-AIR_MIN)*vec3f(AIR_N)-.5,vec3f(0),vec3f(AIR_N)-1.001);
  let b=vec3u(floor(q));let t=fract(q);var sum=vec4f(0);
  for(var c=0u;c<8u;c++){
    let o=vec3u(c&1u,(c>>1u)&1u,c>>2u);let k=min(b+o,AIR_N-1u);
    let w=select(1.-t.x,t.x,o.x==1u)*select(1.-t.y,t.y,o.y==1u)*select(1.-t.z,t.z,o.z==1u);
    sum+=air[k.x+AIR_N.x*(k.y+AIR_N.y*k.z)]*w;
  }
  return sum;
}
// Single scattering along the camera ray up to its first surface or the water.
fn airScatter(ro:vec3f,rd:vec3f)->vec3f {
  let h=traceDynamicSolid(ro,rd,INF);var end=min(h.t,60.);
  if(rd.y<0.){let tw=(U.state.y-ro.y)/rd.y;if(tw>0.){end=min(end,tw);}}
  let mu=dot(rd,sunDirection());let g=AIR_ANISOTROPY;
  let phase=(1.-g*g)/(4.*PI*pow(1.+g*g-2.*g*mu,1.5));
  let steps=24u;let ds=end/f32(steps);var sum=vec3f(0);
  for(var i=0u;i<steps;i++){
    let s=(f32(i)+.5)*ds;let a=airSample(ro+rd*s);
    sum+=exp(-.004*s)*(sunIrradiance()*a.w*phase+a.rgb/(4.*PI))*ds;
  }
  return sum*AIR_SCATTERING;
}
fn radiance(ro:vec3f,rd:vec3f,sampleIndex:u32)->CameraLayers {
  var layers=surfaceRadiance(ro,rd,sampleIndex);layers.base+=airScatter(ro,rd);return layers;
}
fn surfaceRadiance(ro:vec3f,rd:vec3f,sampleIndex:u32)->CameraLayers {`);
}
