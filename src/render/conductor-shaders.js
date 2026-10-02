// Optional achromatic conductor transport. Legacy windows retain shader text.
export function conductorCommon(source,scene) {
  const ids=scene.conductorMaterials;
  if(!ids?.length)return source;
  const condition=ids.map(id=>`material==${id}u`).join('||');
  return `fn isConductor(material:u32)->bool {return ${condition};}\n`+source
    .replace('h.material==1u || h.material==9u', 'h.material==1u || isConductor(h.material) || h.material==9u')
    .replace('detail<=0.||h.material==1u', 'detail<=0.||h.material==1u||isConductor(h.material)');
}

export function conductorShader(kind, source, scene) {
  if(kind==='camera'&&scene.reflectionSamples){
    const {glaze,rough}=scene.reflectionSamples;
    const ceramic=`select(${glaze}u,${rough}u,h.material==1u)`;
    const rays=scene.conductorMaterials?.length?`select(${ceramic},48u,isConductor(h.material))`:ceramic;
    source=source.replace('let rays=select(48u,64u,h.material==1u);', `let rays=${rays};`);
  }
  if (!scene.conductorMaterials?.length) return source;
  if (kind === 'photons') return source
    .replace('if(bounce>0u &&', 'if(!isConductor(h.material) && bounce>0u &&')
    .replace('let ps=clamp(fres,.08,.8);', 'let ps=select(clamp(fres,.08,.8),1.,isConductor(h.material));');
  if (kind !== 'camera') return source;
  return source.replace('if(approximateEnvironment){', 'if(approximateEnvironment&&h.material!=3u){')
    .replace('let origin=h.p+h.n*.010;', 'let origin=h.p+h.n*select(.010,.0001,h.material==3u);')
    .replace('fn shadeHit(h:Hit,rd:vec3f,underwater:bool)->vec3f {', `
// A conductor seen through a water reflection also needs real reflected rays.
// One additional metal bounce, deterministic GGX quadrature, terminal receiver
// shading; no screen-space, painted or cached-irradiance substitute for metal.
fn conductorReceiver(h:Hit,rd:vec3f,underwater:bool)->vec3f {
 if(h.t>=INF){return skyRadiance(rd);}
 if(h.material==10u){return shadeBody(h,rd,underwater);}
 return shadeMaterial(h,rd,underwater,filteredMaterial(h),h.material!=3u);
}
fn conductorContinuation(ro:vec3f,rd:vec3f,underwater:bool)->vec3f {
 if(underwater){return conductorReceiver(traceDynamicSolid(ro,rd,INF),rd,true);}
 let h=trace(ro,rd,INF);
 if(h.material!=9u){return conductorReceiver(h,rd,false);}
 let reflected=reflect(rd,h.n);let transmitted=refract(rd,h.n,1./1.333);let f=fresnel(-dot(rd,h.n),1.,1.333);
 let a=conductorReceiver(traceDynamicSolid(h.p+reflected*EPS*3.,reflected,INF),reflected,false);
 let b=conductorReceiver(traceDynamicSolid(h.p+transmitted*EPS*3.,transmitted,INF),transmitted,true)/(1.333*1.333);
 return (a*f+b*(1.-f))*exp(-.004*h.t);
}
fn shadeConductor(h:Hit,rd:vec3f,underwater:bool)->vec3f {
 let m=filteredMaterial(h);let v=-rd;let nv=max(dot(m.normal,v),.001);
 let alpha=m.roughness*m.roughness;let frame=basis(m.normal);
 var sum=vec3f(0);let origin=h.p+h.n*.0001;
 for(var j=0u;j<4u;j++){
  let u=(f32(j)+.5)/4.;let phi=2.*PI*fract(f32(j)*.61803398875);
  let radius=alpha*sqrt(u/(1.-u));let hn=normalize(frame*vec3f(radius*cos(phi),radius*sin(phi),1.));
  let vh=max(dot(v,hn),0.);let reflected=reflect(rd,hn);let nl=dot(m.normal,reflected);
  if(nl<=0.||vh<=0.){continue;}
  let color=conductorContinuation(origin,reflected,underwater);
  let weight=smithG1(nv,alpha)*smithG1(nl,alpha)*vh/max(nv*dot(m.normal,hn),.00001);
  sum+=color*schlick(vh,m.coat)*weight/4.;
 }
 return shadeMaterial(h,rd,underwater,m,false)+sum*select(vec3f(1),waterTransmittance(h.t),underwater);
}
fn shadeHit(h:Hit,rd:vec3f,underwater:bool)->vec3f {
 if(h.t<INF&&h.material==3u){return shadeConductor(h,rd,underwater);}`)
    .replaceAll('h.material==3u','isConductor(h.material)')
    .replaceAll('h.material!=3u','!isConductor(h.material)');
}
