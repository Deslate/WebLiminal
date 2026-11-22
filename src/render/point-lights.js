// Optional level specializations for dry scenes (water: null), non-tiled
// surfaces (tileRelief: false), emissive materials (hasEmission: true), custom
// sky/haze colors, and physically normalized point light sources.
// Scenes that omit all of these options retain byte-identical shader text.
import { replaceShaderHook } from './shader-hooks.js';

const f = (v) => (Number.isInteger(v) ? `${v}.` : String(v));
const vec3 = (a) => `vec3f(${a.map(f).join(',')})`;

export function sceneCommon(source, scene) {
  if (scene.water === null) {
    const start = source.indexOf('fn traceWater(ro:vec3f,rd:vec3f,maxT:f32)->Hit {');
    const end = source.indexOf('// Visible simplified immersed body.');
    if (start < 0 || end <= start) throw new Error('Missing traceWater shader hook');
    source = `${source.slice(0, start)}fn traceWater(ro:vec3f,rd:vec3f,maxT:f32)->Hit { return emptyHit(); }\n${source.slice(end)}`;
  }
  if (scene.tileRelief === false) {
    const rStart = source.indexOf('fn reliefHit(ro:vec3f,rd:vec3f,h:Hit)->Hit {');
    const rEnd = source.indexOf('// jointVisibility\'s setup');
    if (rStart < 0 || rEnd <= rStart) throw new Error('Missing reliefHit shader hook');
    source = `${source.slice(0, rStart)}fn reliefHit(ro:vec3f,rd:vec3f,h:Hit)->Hit { return h; }\n${source.slice(rEnd)}`;
    const jStart = source.indexOf('fn jointVisibilityPrepare(h:Hit)->JointPrep {');
    const jEnd = source.indexOf('fn jointVisibilityMarch(');
    if (jStart < 0 || jEnd <= jStart) throw new Error('Missing jointVisibilityPrepare shader hook');
    source = `${source.slice(0, jStart)}fn jointVisibilityPrepare(h:Hit)->JointPrep { return JointPrep(0.,0.,0.,vec3f(0),vec3f(0),vec2f(0),0u,0u,0u); }\n${source.slice(jEnd)}`;
  }
  if (scene.illumination?.skyHorizon && scene.illumination?.skyZenith) {
    // curvedShader replaces the legacy sky palette when scene.illumination is set.
    const horizon = vec3(scene.illumination.skyHorizon);
    const zenith = vec3(scene.illumination.skyZenith);
    source = replaceShaderHook(
      source,
      'vec3f(.76,.78,.72),vec3f(.68,.70,.66)',
      `${horizon},${zenith}`,
    );
  }
  return source;
}

export function pointLightPhotons(source, scene) {
  if (scene.water === null) {
    source = replaceShaderHook(
      source,
      '    if(U.sampling.z==1u){\n      let t=(U.state.y-ro.y)/rd.y;let p=ro+rd*t;\n      if(t>EPS&&t<h.t&&p.x>WATER_MIN.x&&p.x<WATER_MAX.x&&p.z>WATER_MIN.y&&p.z<WATER_MAX.y){h=Hit(t,p,vec3f(0,1,0),vec2f(0),0u,9u);}\n    }else{h=trace(ro,rd,INF);}',
      '    // Dry scene: skip water surface intersection.',
    );
  }
  const lights = scene.pointLights;
  if (!lights?.length) return source;
  const weights = lights.map((l) => Math.max(1e-4, 0.2126 * l.color[0] + 0.7152 * l.color[1] + 0.0722 * l.color[2]));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const pointProb = 0.8;
  let cdf = 0;
  const branches = lights.map((l, idx) => {
    const p = weights[idx] / totalW;
    cdf += p;
    const offset = Math.max(l.shadowOffset ?? 0.04, 0.02);
    const cond = idx === 0 ? `if(pick<${f(cdf)})` : idx === lights.length - 1 ? 'else' : `else if(pick<${f(cdf)})`;
    return `${cond}{ro=${vec3(l.pos)}+rd*${f(offset)};power=${vec3(l.color)}*(4.*PI/${f(pointProb * p)});}`;
  }).join('\n    ');
  const emitBlock = `  var ro=vec3f(U.opening.x+uv.x*dims.x,OPENING_Y+.001,U.opening.z+uv.y*dims.y);
  var rd=-sampleSun(&seed);var power=sunIrradiance()*dims.x*dims.y*abs(rd.y)/.75;
  if(rnd(&seed)>.75){rd=cosineDirection(vec3f(0,-1,0),&seed);power=skyRadiance(-rd)*PI*dims.x*dims.y/.25;}`;
  const specializedEmit = `  var ro=vec3f(0);var rd=vec3f(0,-1,0);var power=vec3f(0);
  if(rnd(&seed)<${f(pointProb)}){
    let z=1.-2.*rnd(&seed);let phi=2.*PI*rnd(&seed);let rxy=sqrt(max(0.,1.-z*z));
    rd=vec3f(rxy*cos(phi),z,rxy*sin(phi));
    let pick=rnd(&seed);
    ${branches}
  }else{
    ro=vec3f(U.opening.x+uv.x*dims.x,OPENING_Y+.001,U.opening.z+uv.y*dims.y);
    if(rnd(&seed)>.75){rd=cosineDirection(vec3f(0,-1,0),&seed);power=skyRadiance(-rd)*PI*dims.x*dims.y/(.25*${f(1 - pointProb)});}
    else{rd=-sampleSun(&seed);power=sunIrradiance()*dims.x*dims.y*abs(rd.y)/(.75*${f(1 - pointProb)});}
  }`;
  return replaceShaderHook(source, emitBlock, specializedEmit);
}

export function pointLightCamera(source, scene) {
  if (scene.water === null) {
    source = replaceShaderHook(
      source,
      `fn environmentHit(h:Hit,ro:vec3f,rd:vec3f,sampleIndex:u32)->vec3f {
  if(h.material!=9u){return shadeHit(h,rd,false);}
  let n=h.n;let f=fresnel(-dot(rd,n),1.,1.333);
  let reflected=reflect(rd,n);let transmitted=refract(rd,n,1./1.333);
  // Secondary water also uses the single physical specular direction.
  // Both dielectric branches remain deterministic; no temporal sampling.
  let a=shadeSolid(h.p+reflected*EPS*3.,reflected,false);
  let b=shadeSolid(h.p+transmitted*EPS*3.,transmitted,true)/(1.333*1.333);
  return (a*f+b*(1.-f))*exp(-.004*h.t);
}`,
      'fn environmentHit(h:Hit,ro:vec3f,rd:vec3f,sampleIndex:u32)->vec3f { return shadeHit(h,rd,false); }',
    );
    source = replaceShaderHook(
      source,
      `  if(base.material==9u){
    let reflected=reflect(rd,base.n);let transmitted=refract(rd,base.n,1./1.333);
    let f=fresnel(-dot(rd,base.n),1.,1.333);let tr=exp(-.004*base.t);
    let receiver=traceDynamicSolid(base.p+reflected*EPS*3.,reflected,INF);
    let a=shadeHit(receiver,reflected,false)*f*tr;
    let b=shadeSolid(base.p+transmitted*EPS*3.,transmitted,true)*(1.-f)*tr/(1.333*1.333);
    let radius=U.lighting.y*(.65+.35*(1.-abs(rd.y)));
    return CameraLayers(b,a,vec4f(10000.,base.t,reflectionSigma(radius,base.t,receiver.t,.8),1.));
  }`,
      '  // Dry scene: skip water surface shading.',
    );
  }
  if (scene.illumination?.haze && source.includes('vec3f(.065,.085,.09)')) {
    source = replaceShaderHook(
      source,
      'vec3f(.065,.085,.09)',
      vec3(scene.illumination.haze),
    );
  }
  if (scene.hasEmission) {
    source = replaceShaderHook(
      source,
      '  if(underwater){return c*waterTransmittance(h.t);}',
      '  c+=materialEmission(h);\n  if(underwater){return c*waterTransmittance(h.t);}',
    );
  }
  const lights = scene.pointLights;
  if (!lights?.length) return source;
  const n = lights.length;
  const posArr = lights.map((l) => vec3(l.pos)).join(',');
  const colArr = lights.map((l) => vec3(l.color)).join(',');
  const metaArr = lights.map((l) => {
    const r = l.radius ?? 0.02;
    const off = l.shadowOffset ?? 0.04;
    const amp = l.flicker?.[0] ?? 0;
    const freq = l.flicker?.[1] ?? 0;
    return `vec4f(${f(r)},${f(off)},${f(amp)},${f(freq)})`;
  }).join(',');
  const phaseArr = lights.map((l) => f(l.flicker?.[2] ?? 0)).join(',');
  const helper = `const PL_COUNT:u32=${n}u;
const PL_POS=array<vec3f,${n}>(${posArr});
const PL_COL=array<vec3f,${n}>(${colArr});
const PL_META=array<vec4f,${n}>(${metaArr});
const PL_PHASE=array<f32,${n}>(${phaseArr});
fn pointLightDirect(h:Hit,m:Material,v:vec3f,soft:bool)->vec3f {
  let n=m.normal;let nv=max(dot(n,v),.001);let fv=schlick(nv,m.coat);
  let ro=h.p+h.n*.008;var sum=vec3f(0);
  let offs=array<vec3f,4>(vec3f(1.,1.,1.),vec3f(1.,-1.,-1.),vec3f(-1.,1.,-1.),vec3f(-1.,-1.,1.));
  for(var li=0u;li<PL_COUNT;li++){
    let lpos=PL_POS[li];let lcol=PL_COL[li];let pm=PL_META[li];let ph=PL_PHASE[li];
    let toL=lpos-h.p;let d2=dot(toL,toL);let d=sqrt(d2);let l=toL/max(d,.0001);
    let nl=max(dot(n,l),0.);
    if(nl<=0.){continue;}
    let r=pm.x;let off=pm.y;
    var vis=0.;
    if(soft&&r>.004){
      for(var k=0u;k<4u;k++){
        let lp=lpos+offs[k]*(r*.45);let dl=lp-ro;let dist=length(dl);
        if(!traceSolidAny(ro,dl/max(dist,.0001),max(EPS,dist-off))){vis+=.25;}
      }
    }else if(!traceSolidAny(ro,l,max(EPS,d-off))){vis=1.;}
    if(vis<=0.){continue;}
    let fl=1.+pm.z*(.58*sin(U.state.x*pm.w+ph)+.28*sin(U.state.x*pm.w*2.17+ph*1.73)+.14*cos(U.state.x*pm.w*4.09+ph*.61));
    let att=1./(d2+max(r*r,.0004));
    let hv=normalize(l+v);let nh=max(dot(n,hv),0.);let vh=max(dot(v,hv),0.);
    let a=max(m.roughness*m.roughness,.02);
    let spec=ggxD(nh,a)*smithG1(nl,a)*smithG1(nv,a)*schlick(vh,m.coat)/max(4.*nl*nv,.00001);
    sum+=vis*lcol*fl*att*nl*(m.albedo/PI*(1.-fv)*(1.-schlick(nl,m.coat))+vec3f(spec));
  }
  return sum;
}
fn directLighting(h:Hit,m:Material,v:vec3f,softPoint:bool)->vec3f {`;
  source = replaceShaderHook(source, 'fn directLighting(h:Hit,m:Material,v:vec3f)->vec3f {', helper);
  source = replaceShaderHook(source, '  return result;\n}\nfn shadeMaterial(', '  result+=pointLightDirect(h,m,v,softPoint);\n  return result;\n}\nfn shadeMaterial(');
  source = replaceShaderHook(source, 'if(!underwater){c+=directLighting(h,m,-rd);}', 'if(!underwater){c+=directLighting(h,m,-rd,!approximateEnvironment);}');
  return source;
}
