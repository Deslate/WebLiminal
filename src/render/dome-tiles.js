// Spherical ceramic charts are separate from the equal-area lighting atlas.
// Ring courses follow meridian arc length. Each closes with an integer number
// of tiles; the polar disk has fixed x/z axes instead of a longitude singularity.
export function domeTiles(source,scene) {
 if(!scene.shapes.some(s=>s.kind===3))return source;
 const module=scene.shapes.some(s=>s.tileSize!==undefined)?'tileModule(sid)':String(scene.tileSize??.25);
 const replace=(a,b)=>{if(!source.includes(a))throw Error('Missing dome tile hook');source=source.replace(a,b);};
 replace('let shape=shapes[h.sid/9u];let face=h.sid%9u;',`let shape=shapes[h.sid/9u];let face=h.sid%9u;
 if(shape.info.y==3u&&face==6u){return select(5u,6u,domeArc(h.p,shape)<domeModule(h.sid));}`);
 replace('let q=h.p.xy-vec2f',`if(mode==5u||mode==6u){return domeTileUV(h.p,h.sid,mode);}
 let q=h.p.xy-vec2f`);
 replace('var t=vec3f(1,0,0);var b=vec3f(0,1,0);',`if(tileMode(h)==5u||tileMode(h)==6u){return domeTileFrame(h);}
 var t=vec3f(1,0,0);var b=vec3f(0,1,0);`);
 replace('var cell=floor(uv/size);var center=(cell+.5)*size;',`if(mode==5u){size=domeTileSize(uv,sid,size.x);}
  var cell=floor(uv/size);var center=(cell+.5)*size;
  if(mode==5u){let count=round(2.*PI*shape.params.x/size.x);cell.x=cell.x-count*floor(cell.x/count);}
  if(mode==6u){cell=vec2f(0);center=vec2f(0);}`);
 replace('let q=uv-center;',`var metric=vec2f(1);if(mode==5u){metric.x=domeCourseRadius(uv.y,shape,domeModule(sid))/shape.params.x;}
  let q=(uv-center)*metric;`);
 replace('let halfSize=size*.5-vec2f(GROUT_HALF_WIDTH);','let halfSize=size*.5*metric-vec2f(GROUT_HALF_WIDTH);');
 replace('return TileProfile(height,edge,id,bevel,slope);','return TileProfile(height,edge,id,bevel,slope*metric);');
 replace('let joint=openingJoint(uv,sid,mode);let openingEdge=',`if(mode==6u){edge=domeModule(sid)-length(uv)-GROUT_HALF_WIDTH;}
  let joint=openingJoint(uv,sid,mode);let openingEdge=`);
 replace('if(atOpening){ge=joint.yz;}',`if(mode==6u){ge=-uv/max(length(uv),.000001);}
  if(atOpening){ge=joint.yz;}`);
 // The generic rectangular early-out is invalid on the polar disk and on
 // ring courses whose widths differ. The existing profile decides visibility.
 replace('if(clear>.010){return none;}','if(clear>.010&&mode!=5u&&mode!=6u){return none;}');
 return source+`
fn domeModule(sid:u32)->f32 {return ${module};}
fn domeArc(p:vec3f,s:Shape)->f32 {
 return s.params.x*atan2(length(p.xz-shapeCenter(s)),max(0.,p.y-s.params.y));
}
fn domeCourseRadius(arc:f32,s:Shape,spacing:f32)->f32 {
 let center=(floor(arc/spacing)+.5)*spacing;
 return s.params.x*sin(min(center/s.params.x,PI*.5));
}
fn domeTileSize(uv:vec2f,sid:u32,spacing:f32)->vec2f {
 let circumference=2.*PI*domeCourseRadius(uv.y,shapes[sid/9u],spacing);
 return vec2f(2.*PI*shapes[sid/9u].params.x/max(1.,round(circumference/spacing)),spacing);
}
fn domeTileUV(p:vec3f,sid:u32,mode:u32)->vec2f {
 let s=shapes[sid/9u];let d=p.xz-shapeCenter(s);let rho=length(d);let arc=domeArc(p,s);
 if(mode==6u){return d*(arc/max(rho,.000001));}
 let radius=s.params.x;
 let angle=atan2(d.y,d.x)+PI;
 return vec2f((angle-2.*PI*floor(angle/(2.*PI)))*radius,arc);
}
fn domeTileFrame(h:Hit)->mat3x3f {
 let s=shapes[h.sid/9u];let d=h.p.xz-shapeCenter(s);let rho=length(d);
 if(rho<.000001){return mat3x3f(vec3f(1,0,0),vec3f(0,0,1),h.n);}
 let q=d/rho;let t=vec3f(-q.y,0,q.x);
 let arc=domeArc(h.p,s);let angle=arc/s.params.x;
 let meridian=vec3f(q.x*cos(angle),-sin(angle),q.y*cos(angle));
 if(tileMode(h)==6u){return mat3x3f(q.x*meridian-q.y*arc/rho*t,q.y*meridian+q.x*arc/rho*t,h.n);}
 // These are chart gradients, not merely unit tangent directions. Every
 // relief ray and slope moment therefore uses the true metres-to-UV Jacobian.
 return mat3x3f(t*s.params.x/rho,meridian,h.n);
}
`;
}
