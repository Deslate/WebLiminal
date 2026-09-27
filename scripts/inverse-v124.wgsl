// Evaluation-only single-root refractive connection; not production.
fn landing124(x:vec2f,l:vec3f)->vec2f {
 let w=wave(x);let n=normalize(vec3f(-w.y,1,-w.z));let r=refract(-l,n,1./1.333);
 return x-r.xz*w.x/r.y;
}
fn inverse124(p:vec3f)->vec3f {
 var result=vec3f(0.);
 for(var disc=0u;disc<3u;disc++){
  let angle=(f32(disc)+.5)*2.*PI/3.;let l=normalize(sunDirection()+basis(sunDirection())*vec3f(cos(angle),sin(angle),0.)*(.00465*.70710678));
  let flat=refract(-l,vec3f(0,1,0),1./1.333);var x=p.xz+flat.xz*U.state.y/flat.y;var determinant=1.;
  for(var it=0u;it<6u;it++){
   let f=landing124(x,l);let e=f-p.xz;let dx=(landing124(x+vec2f(.0002,0),l)-f)/.0002;let dz=(landing124(x+vec2f(0,.0002),l)-f)/.0002;determinant=dx.x*dz.y-dx.y*dz.x;
   if(length(e)<.00001||abs(determinant)<.00001){break;}
   var delta=vec2f(dz.y*e.x-dz.x*e.y,-dx.y*e.x+dx.x*e.y)/determinant;delta*=min(1.,.05/max(length(delta),1e-8));x-=delta;
  }
  if(length(landing124(x,l)-p.xz)>.00005||abs(determinant)<.00001){continue;}
  let w=wave(x);let point=vec3f(x.x,w.x,x.y);let n=normalize(vec3f(-w.y,1,-w.z));let rd=refract(-l,n,1./1.333);let distance=-w.x/rd.y;let sourceDistance=(6.102-w.x)/l.y;
  if(any(x<vec2f(-7,-17))||any(x>vec2f(7,10))||traceDynamicSolid(point+l*EPS*2.,l,sourceDistance).t<sourceDistance-.005){continue;}
  if(traceDynamicSolid(point+rd*EPS*2.,rd,INF).sid!=3u){continue;}
  result+=sunIrradiance()*max(dot(n,l),0.)/n.y*(1.-fresnel(dot(l,n),1.,1.333))*waterTransmittance(distance)*exp(-.004*sourceDistance)*(1.-schlick(abs(rd.y),.043))/(3.*abs(determinant));
 }
 return result;
}
