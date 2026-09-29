// Evidence-only integrator variants. No material/exposure/wave changes.
export function ggxVariant(source,{ceiling=8,tile=8,visible=false}={}){
 if(!source.includes('for(var j=0u;j<8u;j++){'))throw Error('Variant requires the original bfb1dbc 8-direction camera source');
 let s=source.replace('for(var j=0u;j<8u;j++){',`let rays=select(${tile}u,${ceiling}u,h.material==1u);\n    for(var j=0u;j<rays;j++){`).replace('(f32(k)+.5)/16.','(f32(k)+.5)/f32(rays*2u)').replace('*weight/8.','*weight/f32(rays)');
 if(visible){
  s=s.replace('let phi=2.*PI*fract(f32(k)*.61803398875);let radius=alpha*sqrt(u/(1.-u));\n      let hn=normalize(frame*vec3f(radius*cos(phi),radius*sin(phi),1.));',`let phi=2.*PI*fract(f32(k)*.61803398875);
      let vl=transpose(frame)*v;let vhLocal=normalize(vec3f(alpha*vl.xy,vl.z));
      let lensq=dot(vhLocal.xy,vhLocal.xy);var t1=vec3f(1,0,0);if(lensq>0.){t1=vec3f(-vhLocal.y,vhLocal.x,0)/sqrt(lensq);}let t2=cross(vhLocal,t1);
      let diskX=sqrt(u)*cos(phi);let diskY=mix(sqrt(max(0.,1.-diskX*diskX)),sqrt(u)*sin(phi),.5*(1.+vhLocal.z));
      let nh=diskX*t1+diskY*t2+sqrt(max(0.,1.-diskX*diskX-diskY*diskY))*vhLocal;
      let hn=normalize(frame*normalize(vec3f(alpha*nh.xy,max(.000001,nh.z))));`);
  s=s.replace('smithG1(nv,alpha)*smithG1(nl,alpha)*vh/max(nv*dot(m.normal,hn),.00001)','smithG1(nl,alpha)');
 }
 return s;
}
