// Four-point Gauss-Legendre integrates a straight smoothstep shoulder's
// squared slope (quartic) exactly within each correctly split interval.
export const TILE_GAUSS_NODES = [-.861136312,-.339981044,.339981044,.861136312];
export const TILE_GAUSS_WEIGHTS = [.347854845,.652145155,.652145155,.347854845];
// Optional construction-aware quadrature. Unauthored legacy material source
// remains byte-identical; dimensions come from the resident scene, not a level.
export function integratedTiles(source, scene) {
  // A quality fallback must still use the spherical chart Jacobian. This
  // changes no legacy scene, and precedes either quadrature implementation.
  if(scene.shapes.some(s=>s.kind===3))source=source
    .replace('sqrt(1.+pow(dot(v,f[0])','sqrt(dot(f[0],f[0])+pow(dot(v,f[0])')
    .replace('sqrt(1.+pow(dot(v,f[1])','sqrt(dot(f[1],f[1])+pow(dot(v,f[1])')
    .replace('moments.z+moments.w','moments.z*dot(f[0],f[0])+moments.w*dot(f[1],f[1])');
  if (scene.tileSampling !== 'integrated') return source;
  const module = scene.shapes.some(s=>s.tileSize!==undefined) ? 'tileModule(h.sid)' : String(scene.tileSize ?? .25);
  const start=source.indexOf('fn glazeMoments('),end=source.indexOf('fn surfaceMaterial(',start);
  if(start<0||end<0)return source;
  return source.slice(0,start)+`
struct TileAxis { samples:array<vec2f,24>, count:u32 };
// Split at the actual joint bed and the conservative shoulder/corner band.
// Gaussian nodes integrate the height-field slopes within each piece; no
// screen-space convolution, darkening or independent normal layer is applied.
fn tileAxis(center:f32,extent:f32,spacing:f32,metric:f32)->TileAxis {
 var out:TileAxis;
 let half=min(extent,spacing*.5);let c=select(center,round(center/spacing)*spacing,extent>=spacing*.5);
 let lo=c-half;let hi=c+half;let joint=round(c/spacing)*spacing;
 let gap=GROUT_HALF_WIDTH/metric;let band=(GROUT_HALF_WIDTH+${.0052*(scene.tileBevelScale??1)})/metric;
 if(hi<joint-band||lo>joint+band){out.samples[0]=vec2f(c-half*.577350269,.5);out.samples[1]=vec2f(c+half*.577350269,.5);out.count=2u;return out;}
 let boundaries=array<f32,7>(lo,clamp(joint-band,lo,hi),clamp(joint-gap,lo,hi),clamp(joint,lo,hi),clamp(joint+gap,lo,hi),clamp(joint+band,lo,hi),hi);
 let nodes=array<f32,4>(${TILE_GAUSS_NODES.join(",")});
 let weights=array<f32,4>(${TILE_GAUSS_WEIGHTS.join(",")});
 for(var k=0u;k<6u;k++){let a=boundaries[k];let b=boundaries[k+1u];if(b<=a){continue;}
  for(var j=0u;j<4u;j++){out.samples[out.count]=vec2f((a+b)*.5+nodes[j]*(b-a)*.5,weights[j]*(b-a)/(4.*half));out.count++;}
 }
 return out;
}
fn glazeMoments(h:Hit)->vec4f {
 let v=normalize(U.camera.xyz-h.p);let f=tileFrame(h);
 let halfPixel=length(U.camera.xyz-h.p)*U.lens.y/f32(U.render.y);
 let nv=max(abs(dot(v,h.n)),.1);
 let width=max(vec2f(.000001),halfPixel*vec2f(sqrt(dot(f[0],f[0])+pow(dot(v,f[0])/nv,2.)),sqrt(dot(f[1],f[1])+pow(dot(v,f[1])/nv,2.))));
 let uv=tileUV(h);var spacing=vec2f(${module});var metric=vec2f(1);
 ${scene.shapes.some(s=>s.kind===3)?'if(tileMode(h)==5u){metric.x=domeCourseRadius(uv.y,shapes[h.sid/9u],spacing.x)/shapes[h.sid/9u].params.x;spacing=domeTileSize(uv,h.sid,spacing.x);}':''}
 let x=tileAxis(uv.x,width.x,spacing.x,metric.x);let y=tileAxis(uv.y,width.y,spacing.y,metric.y);
 var mean=vec2f(0);var second=vec2f(0);
 for(var i=0u;i<x.count;i++){for(var j=0u;j<y.count;j++){
  let weight=x.samples[i].y*y.samples[j].y;
  let slope=glazeSlopeAt(vec2f(x.samples[i].x,y.samples[j].x),h);
  mean+=slope*weight;second+=slope*slope*weight;
 }}
 return vec4f(mean,max(second-mean*mean,vec2f(0)));
}
`+source.slice(end).replace('moments.z+moments.w', 'moments.z*dot(f[0],f[0])+moments.w*dot(f[1],f[1])');
}
