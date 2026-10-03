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
 if(a.topology.y==11u){let s=shapes[sid/9u];let d=p.xz-shapeCenter(s);let ax=arcadeAxis(d,s);let n=f32(s.info.w>>8u);
  let q=vec2f(archAlong(vec2f(dot(d,vec2f(-ax.y,ax.x)),p.y-s.params.y),s.params.w),(ax.z-n*floor(ax.z/n))*arcadeDepth(s)+dot(d,ax.xy)-arcadeStart(s));
  return (q-a.chart.xy)/(a.chart.zw-a.chart.xy);}
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
  replace('if(a.topology.y==1u){\n  let angle=', `if(a.topology.y==11u){
  let len=arcadeDepth(s);let k=floor(q.y/len);let along=arcadeStart(s)+q.y-k*len;
  let ang=k*2.*PI/f32(s.info.w>>8u)-PI*.5;let ax=vec3f(cos(ang),0,sin(ang));let px=vec3f(-ax.z,0,ax.x);
  let r=s.params.w;var lat=0.;var h=0.;
  if(q.x<0.){lat=r;h=q.x;n=-px;}else if(q.x>PI*r){lat=-r;h=PI*r-q.x;n=px;}
  else{let w=q.x/r;lat=r*cos(w);h=r*sin(w);n=-(cos(w)*px+vec3f(0,sin(w),0));}
  let c=shapeCenter(s);p=vec3f(c.x,s.params.y+h,c.y)+ax*along+px*lat;
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
  replace('if(shape.info.y!=1u){return 0u;}', 'if(shape.info.y==10u){return select(select(0u,3u,face==6u),4u,face==8u);}\n if(shape.info.y>=2u&&face>=6u){return 3u;}\n if(shape.info.y!=1u){return 0u;}');
  replace('let q=h.p.xy-vec2f', `if(mode==4u){let d=h.p.xz-shapeCenter(shape);let ax=arcadeAxis(d,shape);return vec2f(archAlong(vec2f(dot(d,vec2f(-ax.y,ax.x)),h.p.y-shape.params.y),shape.params.w),dot(d,ax.xy));}
 if(mode==3u&&shape.info.y==9u){let v=h.p.xy-vec2f((shape.lo.x+shape.hi.x)*.5,shape.params.y);let r=select(shape.params.x,shape.params.z,h.sid%9u==7u);return vec2f(atan2(v.y,v.x)*r,h.p.z);}
 if(mode==3u){let v=h.p.xz-shapeCenter(shape);let r=select(shape.params.x,shape.params.z,h.sid%9u==7u);return vec2f(atan2(v.y,v.x)*r,h.p.y);}
 let q=h.p.xy-vec2f`);
  replace('return mat3x3f(t,b,h.n);', `if(mode==4u){let ax=arcadeAxis(h.p.xz-shapeCenter(shape),shape);b=vec3f(ax.x,0,ax.y);t=normalize(cross(b,h.n));}
 else if(mode==3u&&shape.info.y==9u){let v=normalize(h.p.xy-vec2f((shape.lo.x+shape.hi.x)*.5,shape.params.y));t=vec3f(-v.y,v.x,0);b=vec3f(0,0,1);}
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
// Ring (9): a box within an annulus whose axis runs along z through
// (box centre x, params.y); a large outer radius makes a wall with a round hole.
// Arcade drum (10): an annular wall about a vertical axis through its centre,
// inner radius params.x, outer params.z, pierced by N equal radial openings
// (half-width params.w, round heads springing at params.y). The first opening
// faces -z; N is stored above bit 8 of info.w. Every candidate surface is
// classified against the other bounding surfaces of the same solid.
fn ringVoid(p:vec3f,s:Shape)->bool {
 let d=p.xy-vec2f((s.lo.x+s.hi.x)*.5,s.params.y);let q=dot(d,d);
 return q<s.params.x*s.params.x||q>s.params.z*s.params.z;
}
// Curved shapes default to their box centre; bit 0 of info.w selects an
// explicit (lo.w, hi.w) centre so a box can clip a dome or basin.
fn shapeCenter(s:Shape)->vec2f {return select((s.lo.xz+s.hi.xz)*.5,vec2f(s.lo.w,s.hi.w),(s.info.w&1u)==1u);}
fn inBox(p:vec3f,s:Shape)->bool {return all(p>=s.lo.xyz)&&all(p<=s.hi.xyz);}
// Axis (xy) and index (z) of the opening angularly nearest to offset d.
fn arcadeAxis(d:vec2f,s:Shape)->vec3f {
 let step=2.*PI/f32(s.info.w>>8u);let k=round((atan2(d.y,d.x)+PI*.5)/step);let a=k*step-PI*.5;
 return vec3f(cos(a),sin(a),k);
}
fn arcadeStart(s:Shape)->f32 {return sqrt(max(0.,s.params.x*s.params.x-s.params.w*s.params.w));}
fn arcadeDepth(s:Shape)->f32 {return s.params.z-arcadeStart(s);}
fn arcadeOpening(d:vec2f,y:f32,s:Shape)->bool {
 let ax=arcadeAxis(d,s);let lat=dot(d,vec2f(-ax.y,ax.x));let r=s.params.w;let h=y-s.params.y;
 return dot(d,ax.xy)>0.&&abs(lat)<r&&(h<0.||lat*lat+h*h<r*r);
}
fn inAnnulus(d:vec2f,s:Shape)->bool {let q=dot(d,d);return q>=s.params.x*s.params.x&&q<=s.params.z*s.params.z;}
fn traceArcade(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 var hit=CurveHit(maxT,vec3f(0),0u);
 let c=shapeCenter(s);let o=ro.xz-c;
 if(abs(rd.y)>.000001){for(var k=0u;k<2u;k++){
  let y=select(s.lo.y,s.hi.y,k==1u);let t=(y-ro.y)/rd.y;let d=ro.xz+rd.xz*t-c;
  if(t>EPS&&t<hit.t&&inAnnulus(d,s)&&!arcadeOpening(d,y,s)){hit=CurveHit(t,vec3f(0,select(-1.,1.,k==1u),0),2u+k);}
 }}
 let a=dot(rd.xz,rd.xz);let b=dot(o,rd.xz);
 for(var side=0u;side<2u;side++){
  let R=select(s.params.x,s.params.z,side==1u);let disc=b*b-a*(dot(o,o)-R*R);
  if(a>.000001&&disc>=0.){for(var k=0u;k<2u;k++){
   let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;let d=p.xz-c;
   if(t>EPS&&t<hit.t&&p.y>=s.lo.y&&p.y<=s.hi.y&&!arcadeOpening(d,p.y,s)){let radial=normalize(vec3f(d.x,0,d.y));hit=CurveHit(t,select(-radial,radial,side==1u),6u+side);}
  }}
 }
 let n=s.info.w>>8u;let step=2.*PI/f32(n);let r=s.params.w;
 for(var i=0u;i<n;i++){
  let ang=f32(i)*step-PI*.5;let ax=vec2f(cos(ang),sin(ang));let px=vec2f(-ax.y,ax.x);
  let ol=dot(o,px);let dl=dot(rd.xz,px);
  if(abs(dl)>.000001){for(var side=0u;side<2u;side++){
   let lat=select(-r,r,side==1u);let t=(lat-ol)/dl;let p=ro+rd*t;let d=p.xz-c;
   if(t>EPS&&t<hit.t&&p.y>=s.lo.y&&p.y<s.params.y&&dot(d,ax)>0.&&inAnnulus(d,s)){hit=CurveHit(t,-sign(lat)*vec3f(px.x,0,px.y),8u);}
  }}
  let hy=ro.y-s.params.y;let A=dl*dl+rd.y*rd.y;let B=ol*dl+hy*rd.y;let C=ol*ol+hy*hy-r*r;let D=B*B-A*C;
  if(A>.000001&&D>=0.){for(var k=0u;k<2u;k++){
   let t=(-B+select(-sqrt(D),sqrt(D),k==1u))/A;let p=ro+rd*t;let d=p.xz-c;
   if(t>EPS&&t<hit.t&&p.y>=s.params.y&&p.y<=s.hi.y&&dot(d,ax)>0.&&inAnnulus(d,s)){
    hit=CurveHit(t,-normalize(dot(d,px)*vec3f(px.x,0,px.y)+vec3f(0,p.y-s.params.y,0)),8u);}
  }}
 }
 return hit;
}
fn traceRing(ro:vec3f,rd:vec3f,maxT:f32,s:Shape)->CurveHit {
 var hit=CurveHit(maxT,vec3f(0),0u);
 let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
 let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;let near=min(aa,bb);let far=max(aa,bb);
 let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
 if(tf<max(tn,EPS)){return hit;}
 for(var k=0u;k<2u;k++){
  let t=select(tn,tf,k==1u);let p=ro+rd*t;
  if(t<=EPS||t>=hit.t||ringVoid(p,s)){continue;}
  let ns=select(near,far,k==1u);var axis=0u;if(abs(ns.y-t)<.0005){axis=1u;}if(abs(ns.z-t)<.0005){axis=2u;}
  var n=vec3f(0);n[axis]=select(-sign(rd[axis]),sign(rd[axis]),k==1u);
  hit=CurveHit(t,n,axis*2u+select(0u,1u,n[axis]>0.));
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
 ${scene.shapes.some(s=>s.kind===9)?'if(s.info.y==9u){return traceRing(ro,rd,maxT,s);}':''}
 ${scene.shapes.some(s=>s.kind===10)?'if(s.info.y==10u){return traceArcade(ro,rd,maxT,s);}':''}
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
