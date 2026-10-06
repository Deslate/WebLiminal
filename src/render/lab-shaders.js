// Specialize real transport kernels. The default returns the original shader verbatim.
export function labShader(kind,source,lab){
 let s=source;
 if(kind==='sky'&&lab.gridScale>1)s=s.replace('@workgroup_size(64)','@workgroup_size(128)');
 if(kind==='water'&&lab.waterMode==='transmission')s=s.replace('for(var branch=0u;branch<2u;branch++)','for(var branch=1u;branch<2u;branch++)').replace('const ENABLE_SKY_REFLECTION:bool=true','const ENABLE_SKY_REFLECTION:bool=false');
 if(kind==='diffuse'&&lab.diffuseDirections!==128)s=s.replace('DIFFUSE_DIRECTIONS:u32=128u',`DIFFUSE_DIRECTIONS:u32=${lab.diffuseDirections}u`);
 if(kind==='sky'&&lab.skySamples!==1024)s=s.replace('SKY_SIDE:u32=32u',`SKY_SIDE:u32=${Math.sqrt(lab.skySamples)}u`);
 // Keep physical support approximately fixed when receiver density changes.
 const scale=lab.filterScale*lab.gridScale;
 if(kind==='resolve'&&scale!==1){const broad=Math.max(1,Math.round(6*scale)),fine=Math.max(1,Math.round(4*scale));s=s.replaceAll('-6','-'+broad).replaceAll('<=6','<='+broad).replaceAll('7-abs',`${broad+1}-abs`).replaceAll('5-abs',`${fine+1}-abs`);}
 if(kind==='water'&&(scale!==1||lab.gridScale!==1)){
  const wall=Math.max(0,Math.round(3*scale)),floor=Math.max(0,Math.round(scale)),max=Math.max(wall,floor);
  s=s.replaceAll('select(3,1,s.metric.w>4.)',`select(${wall},${floor},s.metric.w>${4*lab.gridScale}.)`).replaceAll('=-3','=-'+max).replaceAll('<=3','<='+max);
 }
 if(kind==='camera'&&lab.reflectionDepth===1){
 const helper=`
fn terminalEnvironment(h:Hit,rd:vec3f,wet:bool)->vec3f {
 if(h.material!=9u){return shadeHit(h,rd,wet);}
 let n=select(h.n,-h.n,dot(h.n,rd)>0.);let ni=select(1.,1.333,wet);let nt=select(1.333,1.,wet);let f=fresnel(-dot(rd,n),ni,nt);
 let a=reflect(rd,n);var c=shadeHit(traceDynamicSolid(h.p+a*EPS*3.,a,INF),a,wet)*f;
 if(f<.99999){let b=refract(rd,n,ni/nt);c+=shadeHit(traceDynamicSolid(h.p+b*EPS*3.,b,INF),b,!wet)*(1.-f)*(ni*ni/(nt*nt));}
 return c*select(vec3f(exp(-.004*h.t)),waterTransmittance(h.t),wet);
}
fn continuedHit(h:Hit,rd:vec3f,wet:bool)->vec3f {
 if(h.t>=INF||h.material==10u){return shadeHit(h,rd,wet);}
 var m=filteredMaterial(h);if(dot(m.normal,rd)>0.){m.normal=-m.normal;}
 var c=shadeMaterial(h,rd,wet,m,false);let v=-rd;let nv=max(dot(m.normal,v),.001);let alpha=max(m.roughness*m.roughness,.001);let frame=basis(m.normal);
 for(var j=0u;j<4u;j++){
  let u=(f32(j)+.5)/4.;let phi=2.*PI*fract(f32(j)*.61803398875);let radius=alpha*sqrt(u/(1.-u));let hn=normalize(frame*vec3f(radius*cos(phi),radius*sin(phi),1.));let vh=max(dot(v,hn),0.);let reflected=reflect(rd,hn);let nl=dot(m.normal,reflected);
  if(nl>0.&&vh>0.){let hit=trace(h.p+h.n*.01,reflected,INF);let weight=smithG1(nv,alpha)*smithG1(nl,alpha)*vh/max(nv*dot(m.normal,hn),.00001);c+=terminalEnvironment(hit,reflected,wet)*schlick(vh,m.coat)*weight/4.*select(vec3f(exp(-.004*h.t)),waterTransmittance(h.t),wet);}
 }return c;
}
`;
 s=s.replace('fn shadeSolid(',helper+'fn shadeSolid(').replace('return shadeHit(traceDynamicSolid(ro,rd,INF),rd,underwater);','return continuedHit(traceDynamicSolid(ro,rd,INF),rd,underwater);').replace('if(h.material!=9u){return shadeHit(h,rd,false);}','if(h.material!=9u){return continuedHit(h,rd,false);}').replace('let a=shadeHit(receiver,reflected,false)*f*tr;','let a=continuedHit(receiver,reflected,false)*f*tr;');
 }
 return s;
}
