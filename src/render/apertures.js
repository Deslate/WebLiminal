// Optional vertical wall apertures. A scene may let daylight in through
// rectangles in its walls as well as through the roof aperture; sky, photon
// and live water sources then integrate every aperture. Windows without wall
// apertures keep their shader text unchanged.
const f = v => (Number.isInteger(v) ? `${v}.` : String(v));
const vec = v => `vec3f(${v.map(f).join(',')})`;

// Each aperture as an origin, two edges and the outward unit normal.
export function wallApertureFrames(scene) {
  return (scene.wallApertures ?? []).map(({ axis, at, from, to, outward }) => {
    const [u0, y0] = from, [u1, y1] = to;
    return axis === 0
      ? { o: [at, y0, u0], u: [0, 0, u1 - u0], v: [0, y1 - y0, 0], out: [outward, 0, 0], area: (u1 - u0) * (y1 - y0) }
      : { o: [u0, y0, at], u: [u1 - u0, 0, 0], v: [0, y1 - y0, 0], out: [0, 0, outward], area: (u1 - u0) * (y1 - y0) };
  });
}

export function apertureCommon(source, scene) {
  const frames = wallApertureFrames(scene), n = frames.length;
  if (!n) return source;
  const array = key => `var<private> WALL_${key}:array<vec3f,${n}>=array<vec3f,${n}>(${frames.map(a => vec(a[key])).join(',')});`;
  return `${source}
// Vertical wall apertures: origin, edges and outward unit normal.
const WALL_APERTURES:u32=${n}u;
${array('o').replace('WALL_o', 'WALL_O')}
${array('u').replace('WALL_u', 'WALL_U')}
${array('v').replace('WALL_v', 'WALL_V')}
${array('out').replace('WALL_out', 'WALL_OUT')}
fn wallArea(k:u32)->f32{return length(cross(WALL_U[k],WALL_V[k]));}
`;
}

function hook(source, a, b) {
  if (!source.includes(a)) throw Error('Missing wall aperture shader hook');
  return source.replace(a, b);
}

export function apertureShader(kind, source, scene) {
  if (!scene.wallApertures?.length) return source;
  if (kind === 'sky') return hook(source, '  skyIntegral[idx]=vec4f(sum,f32(cellSurface[idx]>>16u)*.25);', `  for(var k=0u;k<WALL_APERTURES;k++){
    for(var i=0u;i<64u;i++){
      let p=vec2f((f32(i%8u)+.5)/8.,(f32(i/8u)+.5)/8.);
      let lp=WALL_O[k]+WALL_U[k]*p.x+WALL_V[k]*p.y+WALL_OUT[k]*.002;
      let delta=lp-ro;let dist=length(delta);let l=delta/dist;let nl=max(dot(h.n,l),0.);let ca=dot(l,WALL_OUT[k]);
      if(nl>0. && ca>0. && !traceSolidAny(ro,l,dist-.004)){sum+=skyRadiance(l)*nl*(1.-pow(1.-nl,5.))*ca*wallArea(k)/(dist*dist)/64.;}
    }
  }
  skyIntegral[idx]=vec4f(sum,f32(cellSurface[idx]>>16u)*.25);`);
  if (kind === 'photons') return hook(source, `  var ro=vec3f(U.opening.x+uv.x*dims.x,OPENING_Y+.001,U.opening.z+uv.y*dims.y);
  var rd=-sampleSun(&seed);var power=sunIrradiance()*dims.x*dims.y*abs(rd.y)/.75;
  if(rnd(&seed)>.75){rd=cosineDirection(vec3f(0,-1,0),&seed);power=skyRadiance(-rd)*PI*dims.x*dims.y/.25;}`,
  `  // Choose the roof or a wall aperture in proportion to the power it admits.
  let sun0=sunDirection();let roofArea=dims.x*dims.y;
  var sunTotal=roofArea*max(sun0.y,0.);var skyTotal=roofArea;
  for(var k=0u;k<WALL_APERTURES;k++){sunTotal+=wallArea(k)*max(dot(sun0,WALL_OUT[k]),0.);skyTotal+=wallArea(k);}
  let isSun=rnd(&seed)<=.75;var pick=rnd(&seed)*select(skyTotal,sunTotal,isSun)-select(roofArea,roofArea*max(sun0.y,0.),isSun);
  var ro=vec3f(U.opening.x+uv.x*dims.x,OPENING_Y+.001,U.opening.z+uv.y*dims.y);var inward=vec3f(0,-1,0);
  for(var k=0u;k<WALL_APERTURES;k++){
    let w=select(wallArea(k),wallArea(k)*max(dot(sun0,WALL_OUT[k]),0.),isSun);
    if(pick>=0. && pick<w){ro=WALL_O[k]+WALL_U[k]*uv.x+WALL_V[k]*uv.y+WALL_OUT[k]*.001;inward=-WALL_OUT[k];}
    pick-=w;
  }
  var rd=-sampleSun(&seed);var power=sunIrradiance()*sunTotal/.75;
  if(!isSun){rd=cosineDirection(inward,&seed);power=skyRadiance(-rd)*PI*skyTotal/.25;}`);
  if (kind === 'water') {
    source = hook(source, `    solarWaterPacket(i,nSun,solarDiskDirection(k+2u));`, `    solarWaterPacket(i,nSun,solarDiskDirection(k+2u));
    for(var a=0u;a<WALL_APERTURES;a++){solarWallPacket(i,nSun,solarDiskDirection(k),a);solarWallPacket(i,nSun,solarDiskDirection(k+2u),a);}`);
    source = hook(source, `      skyWaterPacket(p,n,waterArea,lightArea,uv,4.,footprint,2u);
      atomicAdd(&packetCounts[0],1u);
    }`, `      skyWaterPacket(p,n,waterArea,lightArea,uv,4.,footprint,2u);
      atomicAdd(&packetCounts[0],1u);
    }
    for(var a=0u;a<WALL_APERTURES;a++){for(var k=0u;k<4u;k++){
      let uv=vec2f(.25+f32(k%2u)*.5,.25+f32(k/2u)*.5);
      let lp=WALL_O[a]+WALL_U[a]*uv.x+WALL_V[a]*uv.y+WALL_OUT[a]*.002;let delta=lp-p;let d=length(delta);let l=delta/d;let ca=dot(l,WALL_OUT[a]);
      if(dot(n,l)>0. && ca>0. && !traceDynamicSolidAny(p+l*EPS*2.,l,d-.005)){
        waterPacket(p,n,l,skyRadiance(l)*max(dot(n,l),0.)/n.y*waterArea*ca*wallArea(a)/(4.*d*d)*exp(-.004*d),99999u,footprint,3u);
      }
    }}`);
    return source + `
// Sun through a wall aperture: sample its footprint projected along the sun
// onto the mean water plane, and keep only paths that cross the aperture.
fn solarWallPacket(i:u32,nSun:u32,l:vec3f,a:u32){
  let cosA=dot(l,WALL_OUT[a]);if(cosA<=0. || l.y<=0.){return;}
  var lo=vec2f(1e9);var hi=vec2f(-1e9);
  for(var c=0u;c<4u;c++){let q=WALL_O[a]+WALL_U[a]*f32(c&1u)+WALL_V[a]*f32(c>>1u);let xz=q.xz-l.xz/l.y*(q.y-U.state.y);lo=min(lo,xz);hi=max(hi,xz);}
  let margin=max(vec2f(.12),(U.state.z*1.07+U.lighting.x)*abs(l.xz/l.y)+.005);lo-=margin;hi+=margin;
  let xz=mix(lo,hi,(vec2f(f32(i%nSun),f32(i/nSun))+.5)/f32(nSun));
  if(xz.x<=WATER_MIN.x||xz.x>=WATER_MAX.x||xz.y<=WATER_MIN.y||xz.y>=WATER_MAX.y){return;}
  let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
  let t=dot(WALL_O[a]-p,WALL_OUT[a])/cosA;let hit=p+l*t-WALL_O[a];
  let su=dot(hit,WALL_U[a])/dot(WALL_U[a],WALL_U[a]);let sv=dot(hit,WALL_V[a])/dot(WALL_V[a],WALL_V[a]);
  if(t>0. && su>=0. && su<=1. && sv>=0. && sv<=1. && dot(n,l)>0. && !traceDynamicSolidAny(p+l*EPS*2.,l,t-.005)){
    let area=(hi.x-lo.x)*(hi.y-lo.y)/f32(nSun*nSun*2u);
    waterPacket(p,n,l,sunIrradiance()*max(dot(n,l),0.)/n.y*area*exp(-.004*t),99999u,0.,3u);
  }
}`;
  }
  return source;
}
