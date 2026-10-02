// Optional primitive specialization. Box/arch-only windows retain their exact
// historical shader text, including compiler arithmetic and sampling behavior.
export function curvedShader(source, scene) {
  if (!scene.shapes.some(s => s.kind >= 2)) return source;
  const replace = (a, b) => {
    if (!source.includes(a)) throw Error('Missing curved primitive shader hook');
    source = source.replace(a, b);
  };
  replace('let a=surfaces[sid];let face=sid%9u;var q=p.xy;', `let a=surfaces[sid];let face=sid%9u;var q=p.xy;
 if(a.topology.y>=2u){let s=shapes[sid/9u];let v=p.xz-(s.lo.xz+s.hi.xz)*.5;return vec2f((atan2(v.y,v.x)+PI)/(2.*PI),(p.y-a.chart.y)/(a.chart.w-a.chart.y));}`);
  replace('let s=shapes[i];let aa=', `let s=shapes[i];
    if(s.info.y>=2u){let h=traceCurved(ro,rd,bestT,s);if(h.t<bestT){bestT=h.t;bestN=h.n;bestFace=h.sid%9u;bestShape=s;found=true;}continue;}
    let aa=`);
  replace('let s=shapes[i];let aa=', `let s=shapes[i];
    if(s.info.y>=2u){if(traceCurved(ro,rd,maxT,s).t<maxT){return true;}continue;}
    let aa=`);
  replace('if(a.topology.y==1u){\n  let angle=', `if(a.topology.y>=2u){
  let chartRadius=select(s.params.x,s.params.z,a.topology.y==4u);
  let angle=q.x/chartRadius-PI;let radial=vec3f(cos(angle),0,sin(angle));
  let center=(s.lo.xz+s.hi.xz)*.5;
  var radius=chartRadius;
  if(a.topology.y==3u){radius=sqrt(max(0.,radius*radius-(q.y-s.params.y)*(q.y-s.params.y)));}
  p=vec3f(center.x,q.y,center.y)+radial*radius;n=radial;
  if(a.topology.y==4u){n=-radial;}
  if(a.topology.y==3u){n=-normalize(p-vec3f(center.x,s.params.y,center.y));}
 }else if(a.topology.y==1u){
  let angle=`);
  replace('if(shape.info.y!=1u){return 0u;}', 'if(shape.info.y>=2u&&face>=6u){return 3u;}\n if(shape.info.y!=1u){return 0u;}');
  replace('let q=h.p.xy-vec2f', `if(mode==3u){let v=h.p.xz-(shape.lo.xz+shape.hi.xz)*.5;let r=select(shape.params.x,shape.params.z,h.sid%9u==7u);return vec2f(atan2(v.y,v.x)*r,h.p.y);}
 let q=h.p.xy-vec2f`);
  replace('return mat3x3f(t,b,h.n);', `if(mode==3u){let v=normalize(h.p.xz-(shape.lo.xz+shape.hi.xz)*.5);t=vec3f(-v.y,0,v.x);b=normalize(cross(h.n,t));if(b.y<0.){b=-b;}}
 return mat3x3f(t,b,h.n);`);
  return source + `
// Capped cylinder (2), or box with an upper hemisphere removed (3).
fn traceCurved(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->Hit {
 var hit=emptyHit();hit.t=maxT;
 let c=vec3f((s.lo.x+s.hi.x)*.5,s.params.y,(s.lo.z+s.hi.z)*.5);
 let r=s.params.x;let o=ro-c;
 if(s.info.y==2u){
  let a=dot(rd.xz,rd.xz);let b=dot(o.xz,rd.xz);let disc=b*b-a*(dot(o.xz,o.xz)-r*r);
  if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.y>=s.lo.y&&p.y<=s.hi.y){hit=makeHit(t,ro,rd,normalize(vec3f(p.x-c.x,0,p.z-c.z)),s,6u);}
  }}
  if(abs(rd.y)>.000001){for(var k=0u;k<2u;k++){
   let y=select(s.lo.y,s.hi.y,k==1u);let t=(y-ro.y)/rd.y;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&dot(p.xz-c.xz,p.xz-c.xz)<=r*r){hit=makeHit(t,ro,rd,vec3f(0,select(-1.,1.,k==1u),0),s,2u+k);}
  }}
 }else{
  let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
  let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
  let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
  if(tf<max(tn,EPS)){return hit;}
  for(var k=0u;k<2u;k++){
   let t=select(tn,tf,k==1u);let p=ro+rd*t;
   if(t<=EPS||t>=hit.t||dot(p-c,p-c)<r*r||dot(p.xz-c.xz,p.xz-c.xz)<s.params.z*s.params.z){continue;}
   let ns=select(near,far,k==1u);var axis=0u;if(abs(ns.y-t)<.0005){axis=1u;}if(abs(ns.z-t)<.0005){axis=2u;}
   var n=vec3f(0);n[axis]=select(-sign(rd[axis]),sign(rd[axis]),k==1u);
   hit=makeHit(t,ro,rd,n,s,axis*2u+select(0u,1u,n[axis]>0.));
  }
  let a=dot(rd,rd);let b=dot(o,rd);let disc=b*b-a*(dot(o,o)-r*r);
  if(disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&all(p>=s.lo.xyz)&&all(p<=s.hi.xyz)&&dot(p.xz-c.xz,p.xz-c.xz)>=s.params.z*s.params.z){hit=makeHit(t,ro,rd,normalize(c-p),s,6u);}
  }}
  let shaft=s.params.z;let ca=dot(rd.xz,rd.xz);let cb=dot(o.xz,rd.xz);let cd=cb*cb-ca*(dot(o.xz,o.xz)-shaft*shaft);
  if(shaft>0.&&ca>.000001&&cd>=0.){for(var k=0u;k<2u;k++){
   let t=(-cb+select(-sqrt(cd),sqrt(cd),k==1u))/ca;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.y>=c.y+sqrt(r*r-shaft*shaft)&&p.y<=s.hi.y){hit=makeHit(t,ro,rd,normalize(vec3f(c.x-p.x,0,c.z-p.z)),s,7u);}
  }}
 }
 return hit;
}
`;
}
