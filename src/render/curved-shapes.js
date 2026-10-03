// Optional primitive specialization. Box/arch-only windows retain their exact
// historical shader text, including compiler arithmetic and sampling behavior.
export function curvedShader(source, scene) {
  if (scene.groutHalfWidth !== undefined) source=source.replace('const GROUT_HALF_WIDTH:f32=.0028;', `const GROUT_HALF_WIDTH:f32=${scene.groutHalfWidth};`);
  if (scene.tileSize !== undefined) {
    const size=String(scene.tileSize);
    const start=source.indexOf('fn archCourse('),end=source.indexOf('fn tileMode(');
    source=source.slice(0,start)+source.slice(start,end).replaceAll('.25',size)+source.slice(end);
    source=source.replace('var size=vec2f(.25);',`var size=vec2f(${size});`)
      .replace('min(fract(uv/.25),1.-fract(uv/.25))*.25',`min(fract(uv/${size}),1.-fract(uv/${size}))*${size}`);
  }
  if (scene.illumination) {
    source=source.replace('vec3f(19.8,18.4,15.5)*U.settings.z', `vec3f(${scene.illumination.sun.map(v=>Number.isInteger(v)?`${v}.`:v).join(',')})*U.settings.z`)
      .replace('pow(max(d.y,0.),.45))*.62', `pow(max(d.y,0.),.45))*${.62*scene.illumination.skyScale}`)
      .replace('vec3f(.68,.80,.97),vec3f(.31,.52,.88)', 'vec3f(.76,.78,.72),vec3f(.68,.70,.66)');
    // One sun position per resident window; every pass shares sunDirection().
    if (scene.illumination.sunDirection) source=source.replace('normalize(vec3f(-.66,.69,.295))',
      `normalize(vec3f(${scene.illumination.sunDirection.map(v=>Number.isInteger(v)?`${v}.`:v).join(',')}))`);
  }
  if (!scene.shapes.some(s => s.kind >= 2)) return source;
  const replace = (a, b) => {
    if (!source.includes(a)) throw Error('Missing curved primitive shader hook');
    source = source.replace(a, b);
  };
  replace('let a=surfaces[sid];let face=sid%9u;var q=p.xy;', `let a=surfaces[sid];let face=sid%9u;var q=p.xy;
 if(a.topology.y==8u){let s=shapes[sid/9u];let v=p.xz-vec2f(s.lo.w,s.hi.w);return vec2f(((atan2(v.y,v.x)+PI)*s.params.z-a.chart.x)/(a.chart.z-a.chart.x),(p.y-a.chart.y)/(a.chart.w-a.chart.y));}
 if(a.topology.y==9u||a.topology.y==10u){let s=shapes[sid/9u];let v=p.xy-vec2f((s.lo.x+s.hi.x)*.5,s.params.y);let r=select(s.params.x,s.params.z,a.topology.y==10u);return vec2f(((atan2(v.y,v.x)+PI)*r-a.chart.x)/(a.chart.z-a.chart.x),(p.z-a.chart.y)/(a.chart.w-a.chart.y));}
 if(a.topology.y>=2u){let s=shapes[sid/9u];let v=p.xz-shapeCenter(s);return vec2f((atan2(v.y,v.x)+PI)/(2.*PI),(p.y-a.chart.y)/(a.chart.w-a.chart.y));}`);
  replace('let s=shapes[i];let aa=', `let s=shapes[i];
    if(s.info.y>=2u){
     let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
     let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
     if(tf<max(tn,EPS)||tn>bestT){continue;}
     let h=traceCurved(ro,rd,bestT,s);if(h.t<bestT){bestT=h.t;bestN=h.n;bestFace=h.face;bestShape=s;found=true;}continue;}
    let aa=`);
  replace('let s=shapes[i];let aa=', `let s=shapes[i];
    if(s.info.y>=2u){
     let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
     let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
     if(tf<max(tn,EPS)||tn>maxT){continue;}
     if(traceCurved(ro,rd,maxT,s).t<maxT){return true;}continue;}
    let aa=`);
  replace('if(a.topology.y==1u){\n  let angle=', `if(a.topology.y==8u){
  let angle=q.x/s.params.z-PI;let radial=vec3f(cos(angle),0,sin(angle));
  p=vec3f(s.lo.w,q.y,s.hi.w)+radial*s.params.z;n=-radial;
 }else if(a.topology.y==9u||a.topology.y==10u){
  let r=select(s.params.x,s.params.z,a.topology.y==10u);let angle=q.x/r-PI;let radial=vec3f(cos(angle),sin(angle),0);
  p=vec3f((s.lo.x+s.hi.x)*.5,s.params.y,q.y)+radial*r;n=select(-radial,radial,a.topology.y==10u);
 }else if(a.topology.y>=2u){
  let chartRadius=select(s.params.x,s.params.z,a.topology.y==4u);
  let angle=q.x/chartRadius-PI;let radial=vec3f(cos(angle),0,sin(angle));
  let center=shapeCenter(s);
  var radius=chartRadius;
  if(a.topology.y==3u){radius=sqrt(max(0.,radius*radius-(q.y-s.params.y)*(q.y-s.params.y)));}
  p=vec3f(center.x,q.y,center.y)+radial*radius;n=radial;
  if(a.topology.y==4u||a.topology.y==6u){n=-radial;}
  if(a.topology.y==3u){n=-normalize(p-vec3f(center.x,s.params.y,center.y));}
 }else if(a.topology.y==1u){
  let angle=`);
  replace('if(shape.info.y!=1u){return 0u;}', 'if(shape.info.y==8u){return select(select(0u,1u,face>=6u),3u,face==4u);}\n if(shape.info.y>=2u&&face>=6u){return 3u;}\n if(shape.info.y!=1u){return 0u;}');
  replace('let q=h.p.xy-vec2f', `if(mode==3u&&shape.info.y==8u){let v=h.p.xz-vec2f(shape.lo.w,shape.hi.w);return vec2f(atan2(v.y,v.x)*shape.params.z,h.p.y);}
 if(mode==3u&&shape.info.y==9u){let v=h.p.xy-vec2f((shape.lo.x+shape.hi.x)*.5,shape.params.y);let r=select(shape.params.x,shape.params.z,h.sid%9u==7u);return vec2f(atan2(v.y,v.x)*r,h.p.z);}
 if(mode==3u){let v=h.p.xz-shapeCenter(shape);let r=select(shape.params.x,shape.params.z,h.sid%9u==7u);return vec2f(atan2(v.y,v.x)*r,h.p.y);}
 let q=h.p.xy-vec2f`);
  replace('return mat3x3f(t,b,h.n);', `if(mode==3u&&shape.info.y==9u){let v=normalize(h.p.xy-vec2f((shape.lo.x+shape.hi.x)*.5,shape.params.y));t=vec3f(-v.y,v.x,0);b=vec3f(0,0,1);}
 else if(mode==3u){let center=shapeCenter(shape);let v=normalize(h.p.xz-center);t=vec3f(-v.y,0,v.x);b=normalize(cross(h.n,t));if(b.y<0.){b=-b;}}
 return mat3x3f(t,b,h.n);`);
  return source + `
struct CurveHit { t:f32, n:vec3f, face:u32 };
// Distance to a continuous round tube: two vertical legs joined by a half torus.
// The closest point supplies the geometric normal, including tangent joins.
fn tubeCenter(p:vec3f,s:Shape)->vec3f {
 let c=vec3f((s.lo.x+s.hi.x)*.5,s.params.y,(s.lo.z+s.hi.z)*.5);
 let v=p.yz-c.yz;var q=vec2f(0);
 if(v.x>=0.){q=normalize(select(vec2f(1,0),v,length(v)>.000001))*s.params.x;}
 else{q=vec2f(clamp(p.y,s.lo.y+s.params.z,c.y)-c.y,select(-s.params.x,s.params.x,v.y>=0.));}
 return c+vec3f(0,q);
}
fn traceTube(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 var hit=CurveHit(maxT,vec3f(0),0u);
 let cx=(s.lo.x+s.hi.x)*.5;let cz=(s.lo.z+s.hi.z)*.5;
 let minor=s.params.z;let radius=s.params.x;let spring=s.params.y;
 // Straight portions are exact cylinders, not iterative distance queries.
 let a=dot(rd.xz,rd.xz);
 for(var side=0u;side<2u;side++){
  let z=cz+select(-radius,radius,side==1u);let o=ro.xz-vec2f(cx,z);
  let b=dot(o,rd.xz);let disc=b*b-a*(dot(o,o)-minor*minor);
  if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.y>=s.lo.y&&p.y<=spring){hit=CurveHit(t,normalize(vec3f(p.x-cx,0,p.z-z)),6u);}
  }}
 }
 // Only the upper half torus requires bounded distance root finding.
 let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
 let lo=vec3f(s.lo.x,spring,s.lo.z);let aa=(lo-ro)*inv;let bb=(s.hi.xyz-ro)*inv;
 let near=min(aa,bb);let far=max(aa,bb);
 var t=max(EPS,max(max(near.x,near.y),near.z));let end=min(hit.t,min(min(far.x,far.y),far.z));
 if(t>end){return hit;}
 for(var i=0u;i<64u;i++){
  let p=ro+rd*t;let v=p-tubeCenter(p,s);let d=length(v)-minor;
  if(abs(d)<.00001){return CurveHit(t,normalize(v),6u);}
  t+=max(abs(d),.000005);if(t>end){break;}
 }
 return hit;
}
// Capped cylinder (2), or box with an upper hemisphere removed (3).
// Horizontal rail cylinders intersect analytically, with exact circular caps.
fn traceRail(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 var hit=CurveHit(maxT,vec3f(0),0u);
 let c=(s.lo.xyz+s.hi.xyz)*.5;let alongX=s.params.w<1.;
 let offset=ro-c;let o=select(offset.xy,offset.zy,alongX);let d=select(rd.xy,rd.zy,alongX);
 let a=dot(d,d);let b=dot(o,d);let r=s.params.x;let disc=b*b-a*(dot(o,o)-r*r);
 let lo=select(s.lo.z,s.lo.x,alongX);let hi=select(s.hi.z,s.hi.x,alongX);
 if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
  let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
  let coordinate=select(p.z,p.x,alongX);
  if(t>EPS&&t<hit.t&&coordinate>=lo&&coordinate<=hi){
   let v=p-c;let n=select(vec3f(v.xy,0),vec3f(0,v.yz),alongX);hit=CurveHit(t,normalize(n),6u);
  }
 }}
 let along=select(rd.z,rd.x,alongX);let origin=select(ro.z,ro.x,alongX);
 if(abs(along)>.000001){for(var k=0u;k<2u;k++){
  let t=(select(lo,hi,k==1u)-origin)/along;let v=o+d*t;
  if(t>EPS&&t<hit.t&&dot(v,v)<=r*r){let sign=select(-1.,1.,k==1u);let n=select(vec3f(0,0,sign),vec3f(sign,0,0),alongX);hit=CurveHit(t,n,6u);}
 }}
 return hit;
}
// A horizontal circular centerline produces a smooth, continuous curved rail.
// Bounded signed-distance stepping locates the actual tube, not its bounding box.
fn traceRingRail(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 let c=(s.lo.xyz+s.hi.xyz)*.5;
 let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
 let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
 var t=max(EPS,max(max(near.x,near.y),near.z));var end=min(maxT,min(min(far.x,far.y),far.z));
 // Restrict the query to the exact radial annulus before distance stepping.
 // Most rays through the large bounding square never approach the thin tube.
 let o=ro.xz-c.xz;let a=dot(rd.xz,rd.xz);let b=dot(o,rd.xz);
 let outer=s.params.x+s.params.z+.00005;let inner=s.params.x-s.params.z-.00005;
 var holeLo=INF;var holeHi=INF;
 let convex=s.params.x>s.params.z+.0001&&rd.y*rd.y>(s.params.z+.0001)/max(.0001,s.params.x-s.params.z-.0001)*a;
 if(a>.000001){
  let disc=b*b-a*(dot(o,o)-outer*outer);if(disc<0.){return CurveHit(maxT,vec3f(0),0u);}
  t=max(t,(-b-sqrt(disc))/a);end=min(end,(-b+sqrt(disc))/a);
  let hole=b*b-a*(dot(o,o)-inner*inner);
  if(hole>=0.){holeLo=(-b-sqrt(hole))/a;holeHi=(-b+sqrt(hole))/a;}
 }else if(a==0.&&(length(o)<inner||length(o)>outer)){return CurveHit(maxT,vec3f(0),0u);}
 for(var i=0u;i<96u;i++){
  if(t>holeLo&&t<holeHi){t=holeHi;}
  if(t>end){break;}
  let p=ro+rd*t;let q=p-c;let rho=length(q.xz);let radial=normalize(select(vec2f(1,0),q.xz,rho>.000001));
  let v=q-vec3f(radial.x*s.params.x,0,radial.y*s.params.x);let distance=length(v)-s.params.z;
  if(abs(distance)<.00001){return CurveHit(t,normalize(v),6u);}
  var advance=max(abs(distance),.000005);
  // On a certified convex annulus segment, the squared-distance tangent
  // underestimates the first root. Its Newton step cannot jump over that hit.
  let derivative=2.*dot(v,rd);
  if(convex&&rho>=inner&&distance>0.&&derivative<-.000001){advance=max(advance,-(dot(v,v)-s.params.z*s.params.z)/derivative);}
  t+=advance;
 }
 return CurveHit(maxT,vec3f(0),0u);
}
// Drum bay (8): a box outside a vertical drum cylinder centred at (lo.w, hi.w),
// minus a round-topped opening along z. Ring (9): a box within an annulus whose
// axis runs along z through (box centre x, params.y). Every candidate surface
// is classified against the other bounding surfaces of the same solid.
fn bayArch(p:vec3f,s:Shape)->bool {
 let x=p.x-(s.lo.x+s.hi.x)*.5;let y=p.y-s.params.y;let r=s.params.x;
 return abs(x)<r&&(y<0.||x*x+y*y<r*r);
}
fn bayDrum(p:vec3f,s:Shape)->bool {let d=p.xz-vec2f(s.lo.w,s.hi.w);return dot(d,d)<s.params.z*s.params.z;}
fn ringVoid(p:vec3f,s:Shape)->bool {
 let d=p.xy-vec2f((s.lo.x+s.hi.x)*.5,s.params.y);let q=dot(d,d);
 return q<s.params.x*s.params.x||q>s.params.z*s.params.z;
}
// Curved shapes default to their box centre; info.w selects an explicit
// (lo.w, hi.w) centre so a box can clip a dome, basin or drum.
fn shapeCenter(s:Shape)->vec2f {return select((s.lo.xz+s.hi.xz)*.5,vec2f(s.lo.w,s.hi.w),s.info.w==1u);}
fn inBox(p:vec3f,s:Shape)->bool {return all(p>=s.lo.xyz)&&all(p<=s.hi.xyz);}
fn traceCut(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 var hit=CurveHit(maxT,vec3f(0),0u);
 let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
 let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
 let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
 if(tf<max(tn,EPS)){return hit;}
 let bay=s.info.y==8u;
 for(var k=0u;k<2u;k++){
  let t=select(tn,tf,k==1u);let p=ro+rd*t;
  if(t<=EPS||t>=hit.t){continue;}
  if(select(ringVoid(p,s),bayArch(p,s)||bayDrum(p,s),bay)){continue;}
  let ns=select(near,far,k==1u);var axis=0u;if(abs(ns.y-t)<.0005){axis=1u;}if(abs(ns.z-t)<.0005){axis=2u;}
  var n=vec3f(0);n[axis]=select(-sign(rd[axis]),sign(rd[axis]),k==1u);
  hit=CurveHit(t,n,axis*2u+select(0u,1u,n[axis]>0.));
 }
 if(bay){
  let dc=vec2f(s.lo.w,s.hi.w);let R=s.params.z;let o=ro.xz-dc;
  let a=dot(rd.xz,rd.xz);let b=dot(o,rd.xz);let disc=b*b-a*(dot(o,o)-R*R);
  if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&inBox(p,s)&&!bayArch(p,s)){hit=CurveHit(t,normalize(vec3f(dc.x-p.x,0,dc.y-p.z)),4u);}
  }}
  let cx=(s.lo.x+s.hi.x)*.5;let r=s.params.x;let spring=s.params.y;
  if(r<=0.){return hit;}
  for(var side=0u;side<2u;side++){
   let t=(cx+select(-r,r,side==1u)-ro.x)*inv.x;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.z>=s.lo.z&&p.z<=s.hi.z&&p.y>=s.lo.y&&p.y<spring&&!bayDrum(p,s)){hit=CurveHit(t,vec3f(select(1.,-1.,side==1u),0,0),select(7u,8u,side==1u));}
  }
  let oa=ro.xy-vec2f(cx,spring);let a2=dot(rd.xy,rd.xy);let b2=dot(oa,rd.xy);let d2=b2*b2-a2*(dot(oa,oa)-r*r);
  if(a2>.000001&&d2>=0.){for(var k=0u;k<2u;k++){
   let t=(-b2+select(-sqrt(d2),sqrt(d2),k==1u))/a2;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.y>=spring&&p.y<=s.hi.y&&p.z>=s.lo.z&&p.z<=s.hi.z&&!bayDrum(p,s)){hit=CurveHit(t,normalize(vec3f(cx-p.x,spring-p.y,0)),6u);}
  }}
  return hit;
 }
 let c=vec2f((s.lo.x+s.hi.x)*.5,s.params.y);let o=ro.xy-c;
 let a=dot(rd.xy,rd.xy);let b=dot(o,rd.xy);
 for(var side=0u;side<2u;side++){
  let r=select(s.params.x,s.params.z,side==1u);let disc=b*b-a*(dot(o,o)-r*r);
  if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&inBox(p,s)){let radial=normalize(vec3f(p.xy-c,0));hit=CurveHit(t,select(-radial,radial,side==1u),6u+side);}
  }}
 }
 return hit;
}
fn traceCurved(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 if(s.info.y==5u){return traceTube(ro,rd,maxT,s);}
 ${scene.shapes.some(s=>s.kind===8||s.kind===9)?'if(s.info.y>=8u){return traceCut(ro,rd,maxT,s);}':''}
 ${scene.shapes.some(s=>s.kind===6)?'if(s.info.y==6u){return traceRail(ro,rd,maxT,s);}':''}
 ${scene.shapes.some(s=>s.kind===7)?'if(s.info.y==7u){return traceRingRail(ro,rd,maxT,s);}':''}
 var hit=CurveHit(maxT,vec3f(0),0u);
 let center=shapeCenter(s);let c=vec3f(center.x,s.params.y,center.y);
 let r=s.params.x;let o=ro-c;
 if(s.info.y==2u){
  let a=dot(rd.xz,rd.xz);let b=dot(o.xz,rd.xz);let disc=b*b-a*(dot(o.xz,o.xz)-r*r);
  if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.y>=s.lo.y&&p.y<=s.hi.y){hit=CurveHit(t,normalize(vec3f(p.x-c.x,0,p.z-c.z)),6u);}
  }}
  if(abs(rd.y)>.000001){for(var k=0u;k<2u;k++){
   let y=select(s.lo.y,s.hi.y,k==1u);let t=(y-ro.y)/rd.y;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&dot(p.xz-c.xz,p.xz-c.xz)<=r*r){hit=CurveHit(t,vec3f(0,select(-1.,1.,k==1u),0),2u+k);}
  }}
 }else{
  let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
  let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
  let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
  if(tf<max(tn,EPS)){return hit;}
  for(var k=0u;k<2u;k++){
   let t=select(tn,tf,k==1u);let p=ro+rd*t;
   if(t<=EPS||t>=hit.t){continue;}
   if(s.info.y==4u){if(dot(p.xz-c.xz,p.xz-c.xz)<r*r){continue;}}
   else if(dot(p-c,p-c)<r*r||dot(p.xz-c.xz,p.xz-c.xz)<s.params.z*s.params.z){continue;}
   let ns=select(near,far,k==1u);var axis=0u;if(abs(ns.y-t)<.0005){axis=1u;}if(abs(ns.z-t)<.0005){axis=2u;}
   var n=vec3f(0);n[axis]=select(-sign(rd[axis]),sign(rd[axis]),k==1u);
   hit=CurveHit(t,n,axis*2u+select(0u,1u,n[axis]>0.));
  }
  if(s.info.y==4u){
   let a=dot(rd.xz,rd.xz);let b=dot(o.xz,rd.xz);let disc=b*b-a*(dot(o.xz,o.xz)-r*r);
   if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
    let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
    if(t>EPS&&t<hit.t&&p.y>=s.lo.y&&p.y<=s.hi.y){hit=CurveHit(t,normalize(vec3f(c.x-p.x,0,c.z-p.z)),6u);}
   }}
   return hit;
  }
  let a=dot(rd,rd);let b=dot(o,rd);let disc=b*b-a*(dot(o,o)-r*r);
  if(disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&all(p>=s.lo.xyz)&&all(p<=s.hi.xyz)&&dot(p.xz-c.xz,p.xz-c.xz)>=s.params.z*s.params.z){hit=CurveHit(t,normalize(c-p),6u);}
  }}
  let shaft=s.params.z;let ca=dot(rd.xz,rd.xz);let cb=dot(o.xz,rd.xz);let cd=cb*cb-ca*(dot(o.xz,o.xz)-shaft*shaft);
  if(shaft>0.&&ca>.000001&&cd>=0.){for(var k=0u;k<2u;k++){
   let t=(-cb+select(-sqrt(cd),sqrt(cd),k==1u))/ca;let p=ro+rd*t;
   if(t>EPS&&t<hit.t&&p.y>=c.y+sqrt(r*r-shaft*shaft)&&p.y<=s.hi.y){hit=CurveHit(t,normalize(vec3f(c.x-p.x,0,c.z-p.z)),7u);}
  }}
 }
 return hit;
}
`;
}
