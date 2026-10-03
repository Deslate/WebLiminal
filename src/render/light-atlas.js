// Shared receiving domains are derived from geometry, not object order.
// Planar connected components share one lattice; a smooth arch intrados uses
// one unfolded chart. True creases and disconnected surfaces remain separate.
export const SURFACE_WORDS=16;
// Per-face receiver density (cells per metre) and diffuse probe stride (cells)
// come from the scene description; these are the defaults for unset faces.
export const DEFAULT_DENSITY=12,DEFAULT_PROBE_STRIDE=4;
// Drum-bay (8) and ring (9) helpers: points on their curved charts.
const drumPoint=(s,u,y)=>{const a=u/s.drumRadius-Math.PI;return [s.center[0]+Math.cos(a)*s.drumRadius,y,s.center[1]+Math.sin(a)*s.drumRadius];};
const ringPoint=(s,r,u,z)=>{const a=u/r-Math.PI;return [(s.lo[0]+s.hi[0])/2+Math.cos(a)*r,s.spring+Math.sin(a)*r,z];};
const inBox=(s,p)=>p.every((v,k)=>v>=s.lo[k]-1e-7&&v<=s.hi[k]+1e-7);
const inArch=(s,p)=>{const x=p[0]-(s.lo[0]+s.hi[0])/2,y=p[1]-s.spring;return Math.abs(x)<s.radius&&(y<0||x*x+y*y<s.radius*s.radius);};
const inDrum=(s,p)=>(p[0]-s.center[0])**2+(p[2]-s.center[1])**2<s.drumRadius**2;
// Point on a cylinder, basin cutout or dome chart (u: arc length, v: height).
const curvedPoint=(s,face,u,v)=>{const c=s.center??[(s.lo[0]+s.hi[0])/2,(s.lo[2]+s.hi[2])/2];
 const R=s.kind===3&&face===7?s.oculus:s.radius,rr=s.kind===3&&face===6?Math.sqrt(Math.max(0,R*R-(v-s.spring)**2)):R,a=u/R-Math.PI;
 return [c[0]+Math.cos(a)*rr,v,c[1]+Math.sin(a)*rr];};
const ringRadius=(s,p)=>Math.hypot(p[0]-(s.lo[0]+s.hi[0])/2,p[1]-s.spring);
// Angular extent, as arc length (atan2 + pi) * R, of the drum inside the bay box.
function drumSector(s){
 let lo=Infinity,hi=-Infinity;const n=8192;
 for(let i=0;i<=n;i++){const u=i/n*2*Math.PI*s.drumRadius,p=drumPoint(s,u,(s.lo[1]+s.hi[1])/2);if(inBox(s,p)){lo=Math.min(lo,u);hi=Math.max(hi,u);}}
 const pad=2*Math.PI*s.drumRadius/n;return [Math.max(0,lo-pad),Math.min(2*Math.PI*s.drumRadius,hi+pad)];
}
// Chart topology codes read by the shaders: 1 arch intrados and jambs,
// 2 cylinder, 3 dome, 4 oculus shaft, 6 basin cutout, 8 drum, 9/10 ring.
function topology(s,face){
 if(s.kind===8)return face===4?8:1;
 if(s.kind===9)return face===6?9:10;
 return s.kind===3&&face===7?4:s.kind===4?6:s.kind;
}
export function buildLightAtlases(shapes,gridScale=1){
 const faces=[];
 for(let i=0;i<shapes.length;i++)for(let face=0;face<9;face++){
  const s=shapes[i],d=s.hi.map((v,k)=>v-s.lo[k]),axis=Math.floor(face/2),uvAxes=face<2?[2,1]:face<4?[0,2]:[0,1];
  let bounds=face<6?[...uvAxes.map(k=>s.lo[k]),...uvAxes.map(k=>s.hi[k])]:[-s.spring,s.lo[2],Math.PI*s.radius+s.spring,s.hi[2]];
  const arch=s.kind===1||s.kind===8,curved=face>=6||(s.kind===8&&face===4);
  if(s.kind===8&&face>=6&&!(s.radius>0))bounds=[0,0,.01,.01];
  else if(s.kind===8&&face>=6)bounds=[-(s.spring-s.lo[1]),s.lo[2],Math.PI*s.radius+s.spring-s.lo[1],s.hi[2]];
  let disabled=face>=6&&!(arch&&s.radius>0);
  if(s.kind===8&&face===4){const [u0,u1]=drumSector(s);bounds=[u0,s.lo[1],u1,s.hi[1]];}
  if(s.kind===9){disabled=![4,5,6,7].includes(face);if(face===6||face===7)bounds=[0,s.lo[2],2*Math.PI*(face===6?s.radius:s.outerRadius),s.hi[2]];}
  if(s.kind>=2&&s.kind<=7){
   disabled=face>=7||(s.kind===2&&[0,1,4,5].includes(face));
   // Equal-area cylinder/sphere chart: arc length at radius R by height.
   // For a sphere, dA = R d(phi) dy, including the shrinking polar rings.
   if(face===6)bounds=[0,s.lo[1],2*Math.PI*s.radius,s.kind===3?s.spring+Math.sqrt(s.radius*s.radius-(s.oculus??0)**2):s.hi[1]];
   if(s.kind===3&&face===7&&s.oculus>0){disabled=false;bounds=[0,s.spring+Math.sqrt(s.radius*s.radius-s.oculus*s.oculus),2*Math.PI*s.oculus,s.hi[1]];}
   if(s.kind>=5)disabled=true;
  }
  if(disabled)bounds=[0,0,.01,.01];
   const density=s.density?.[face]??DEFAULT_DENSITY,probeStride=s.probeStride?.[face]??DEFAULT_PROBE_STRIDE;
  faces.push({sid:i*9+face,i,face,axis,uvAxes,bounds,plane:face<6?s[face%2?'hi':'lo'][axis]:0,material:s.material,density,probeStride,disabled,curved});
 }
 const parent=faces.map((_,i)=>i);const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 const union=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a};
 for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
  const a=faces[i],b=faces[j];if(a.disabled||b.disabled)continue;
  if(a.curved||b.curved){if(a.face>=6&&b.face>=6&&a.i===b.i&&[1,8].includes(shapes[a.i].kind))union(i,j);continue;}
  if(a.face!==b.face||a.material!==b.material||Math.abs(a.plane-b.plane)>1e-6)continue;
  const overlap=[0,1].map(k=>Math.min(a.bounds[k+2],b.bounds[k+2])-Math.max(a.bounds[k],b.bounds[k]));
  if(overlap.every(v=>v>=-1e-6)&&overlap.some(v=>v>1e-6))union(i,j);
 }
 const groups=[];const byRoot=new Map();for(const f of faces){const id=root(f.sid);if(!byRoot.has(id)){const g={sid:f.sid,members:[],bounds:[Infinity,Infinity,-Infinity,-Infinity],density:0,curved:f.curved&&!f.disabled};groups.push(g);byRoot.set(id,g);}const g=byRoot.get(id);g.members.push(f);g.density=Math.max(g.density,f.density);for(let k=0;k<2;k++){g.bounds[k]=Math.min(g.bounds[k],f.bounds[k]);g.bounds[k+2]=Math.max(g.bounds[k+2],f.bounds[k+2]);}}
 const surfaces=new ArrayBuffer(faces.length*64),f32=new Float32Array(surfaces),u32=new Uint32Array(surfaces);let totalCells=0,probeCount=0;
 const point=(g,u,v)=>{const f=g.members[0],s=shapes[f.i];if(g.curved){const a=Math.max(0,Math.min(Math.PI,u/s.radius));return [(s.lo[0]+s.hi[0])/2+Math.cos(a)*s.radius,s.spring+(u<0?u:u>Math.PI*s.radius?Math.PI*s.radius-u:Math.sin(a)*s.radius),v];}const p=[0,0,0];p[f.axis]=f.plane;p[f.uvAxes[0]]=u;p[f.uvAxes[1]]=v;return p;};
 const owner=(g,u,v)=>{
  if(g.curved){const m=g.members[0],s=shapes[m.i];
   if(s.kind===8&&m.face===4){const p=drumPoint(s,u,v);return inBox(s,p)&&!inArch(s,p)?m.sid:null;}
   if(s.kind===8&&inDrum(s,point(g,u,v)))return null;
   if(s.center&&(s.kind===3||s.kind===4)&&!inBox(s,curvedPoint(s,m.face,u,v)))return null;
   if(s.kind===9){const p=ringPoint(s,m.face===6?s.radius:s.outerRadius,u,v);return inBox(s,p)?m.sid:null;}
   return m.i*9+(s.kind>=2&&s.kind!==8?m.face:u<0?8:u>Math.PI*s.radius?7:6);}
  for(const m of g.members){if(m.disabled)continue;const b=m.bounds;if(u<b[0]-1e-7||u>b[2]+1e-7||v<b[1]-1e-7||v>b[3]+1e-7)continue;const p=point(g,u,v),s=shapes[m.i],x=p[0]-(s.lo[0]+s.hi[0])/2,y=p[1]-s.spring;
   if((s.kind===1||s.kind===8)&&Math.abs(x)<s.radius&&(y<0||x*x+y*y<s.radius*s.radius))continue;
   if(s.kind===8&&inDrum(s,p))continue;
   if(s.kind===9&&(ringRadius(s,p)<s.radius||ringRadius(s,p)>s.outerRadius))continue;
   const z=p[2]-(s.center?s.center[1]:(s.lo[2]+s.hi[2])/2);
   const cx=s.center?p[0]-s.center[0]:x;
   if(s.kind===2&&x*x+z*z>s.radius*s.radius)continue;
   if(s.kind===3&&cx*cx+y*y+z*z<s.radius*s.radius)continue;
   if(s.kind===3&&cx*cx+z*z<(s.oculus??0)**2)continue;
   if(s.kind===4&&cx*cx+z*z<s.radius*s.radius)continue;
   return m.sid;}
  return null;
 };
 for(const g of groups){const [u0,v0,u1,v1]=g.bounds;g.width=u1-u0;g.height=v1-v0;g.density*=gridScale;g.nx=Math.max(2,Math.ceil(g.width*g.density));g.ny=Math.max(2,Math.ceil(g.height*g.density));g.offset=totalCells;g.probeOffset=probeCount;g.stride=Math.max(...g.members.map(m=>m.probeStride))*gridScale;totalCells+=g.nx*g.ny;probeCount+=Math.ceil(g.nx/g.stride)*Math.ceil(g.ny/g.stride);
  for(const m of g.members){const o=m.sid*16;u32.set([g.offset,g.nx,g.ny,g.probeOffset],o);f32.set([g.width,g.height,g.width*g.height/(g.nx*g.ny),g.stride],o+4);f32.set(g.bounds,o+8);u32.set([g.sid,g.curved?topology(shapes[m.i],m.face):0,g.members.length,0],o+12);}
 }
 const cellSurfaces=new Uint32Array(totalCells),probeSurfaces=new Uint32Array(probeCount);
 for(const g of groups){const at=(x,y)=>[g.bounds[0]+x*g.width,g.bounds[1]+y*g.height];
  for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){let coverage=0;for(let k=0;k<4;k++){const [u,v]=at((x+.25+(k%2)*.5)/g.nx,(y+.25+Math.floor(k/2)*.5)/g.ny);if(owner(g,u,v)!==null)coverage++;}const [u,v]=at((x+.5)/g.nx,(y+.5)/g.ny);const sid=owner(g,u,v)??g.sid;cellSurfaces[g.offset+y*g.nx+x]=sid|(coverage<<16);}
  const nx=Math.ceil(g.nx/g.stride),ny=Math.ceil(g.ny/g.stride);for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const [u,v]=at((x+.5)/nx,(y+.5)/ny),sid=owner(g,u,v);probeSurfaces[g.probeOffset+y*nx+x]=(sid??g.sid)|(Number(sid!==null)<<16);}
 }
 return{surfaces,cellSurfaces,probeSurfaces,totalCells,probeCount,surfaceCount:faces.length,atlases:groups.map(g=>({...g,members:g.members.map(m=>m.sid)}))};
}
