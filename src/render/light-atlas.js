// Shared receiving domains are derived from geometry, not object order.
// Planar connected components share one lattice; a smooth arch intrados uses
// one unfolded chart. True creases and disconnected surfaces remain separate.
export const SURFACE_WORDS=16;
// Per-face receiver density (cells per metre) and diffuse probe stride (cells)
// come from the scene description; these are the defaults for unset faces.
export const DEFAULT_DENSITY=12,DEFAULT_PROBE_STRIDE=4;
export function buildLightAtlases(shapes,gridScale=1){
 const faces=[];
 for(let i=0;i<shapes.length;i++)for(let face=0;face<9;face++){
  const s=shapes[i],d=s.hi.map((v,k)=>v-s.lo[k]),axis=Math.floor(face/2),uvAxes=face<2?[2,1]:face<4?[0,2]:[0,1];
  let bounds=face<6?[...uvAxes.map(k=>s.lo[k]),...uvAxes.map(k=>s.hi[k])]:[-s.spring,s.lo[2],Math.PI*s.radius+s.spring,s.hi[2]];
  let disabled=face>=6&&s.kind!==1;
  if(s.kind>=2){
   disabled=face>=7||(s.kind===2&&[0,1,4,5].includes(face));
   // Equal-area cylinder/sphere chart: arc length at radius R by height.
   // For a sphere, dA = R d(phi) dy, including the shrinking polar rings.
   if(face===6)bounds=[0,s.lo[1],2*Math.PI*s.radius,s.kind===3?s.spring+Math.sqrt(s.radius*s.radius-(s.oculus??0)**2):s.hi[1]];
   if(s.kind===3&&face===7&&s.oculus>0){disabled=false;bounds=[0,s.spring+Math.sqrt(s.radius*s.radius-s.oculus*s.oculus),2*Math.PI*s.oculus,s.hi[1]];}
   if(s.kind===5)disabled=true;
  }
  if(disabled)bounds=[0,0,.01,.01];
   const density=s.density?.[face]??DEFAULT_DENSITY,probeStride=s.probeStride?.[face]??DEFAULT_PROBE_STRIDE;
  faces.push({sid:i*9+face,i,face,axis,uvAxes,bounds,plane:face<6?s[face%2?'hi':'lo'][axis]:0,material:s.material,density,probeStride,disabled});
 }
 const parent=faces.map((_,i)=>i);const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 const union=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a};
 for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
  const a=faces[i],b=faces[j];if(a.disabled||b.disabled)continue;
  if(a.face>=6||b.face>=6){if(a.face>=6&&b.face>=6&&a.i===b.i&&shapes[a.i].kind===1)union(i,j);continue;}
  if(a.face!==b.face||a.material!==b.material||Math.abs(a.plane-b.plane)>1e-6)continue;
  const overlap=[0,1].map(k=>Math.min(a.bounds[k+2],b.bounds[k+2])-Math.max(a.bounds[k],b.bounds[k]));
  if(overlap.every(v=>v>=-1e-6)&&overlap.some(v=>v>1e-6))union(i,j);
 }
 const groups=[];const byRoot=new Map();for(const f of faces){const id=root(f.sid);if(!byRoot.has(id)){const g={sid:f.sid,members:[],bounds:[Infinity,Infinity,-Infinity,-Infinity],density:0,curved:f.face>=6&&!f.disabled};groups.push(g);byRoot.set(id,g);}const g=byRoot.get(id);g.members.push(f);g.density=Math.max(g.density,f.density);for(let k=0;k<2;k++){g.bounds[k]=Math.min(g.bounds[k],f.bounds[k]);g.bounds[k+2]=Math.max(g.bounds[k+2],f.bounds[k+2]);}}
 const surfaces=new ArrayBuffer(faces.length*64),f32=new Float32Array(surfaces),u32=new Uint32Array(surfaces);let totalCells=0,probeCount=0;
 const point=(g,u,v)=>{const f=g.members[0],s=shapes[f.i];if(g.curved){const a=Math.max(0,Math.min(Math.PI,u/s.radius));return [(s.lo[0]+s.hi[0])/2+Math.cos(a)*s.radius,s.spring+(u<0?u:u>Math.PI*s.radius?Math.PI*s.radius-u:Math.sin(a)*s.radius),v];}const p=[0,0,0];p[f.axis]=f.plane;p[f.uvAxes[0]]=u;p[f.uvAxes[1]]=v;return p;};
 const owner=(g,u,v)=>{
  if(g.curved){const s=shapes[g.members[0].i];return g.members[0].i*9+(s.kind>=2?g.members[0].face:u<0?8:u>Math.PI*s.radius?7:6);}
  for(const m of g.members){if(m.disabled)continue;const b=m.bounds;if(u<b[0]-1e-7||u>b[2]+1e-7||v<b[1]-1e-7||v>b[3]+1e-7)continue;const p=point(g,u,v),s=shapes[m.i],x=p[0]-(s.lo[0]+s.hi[0])/2,y=p[1]-s.spring;
   if(s.kind===1&&Math.abs(x)<s.radius&&(y<0||x*x+y*y<s.radius*s.radius))continue;
   const z=p[2]-(s.lo[2]+s.hi[2])/2;
   if(s.kind===2&&x*x+z*z>s.radius*s.radius)continue;
   if(s.kind===3&&x*x+y*y+z*z<s.radius*s.radius)continue;
   if(s.kind===3&&x*x+z*z<(s.oculus??0)**2)continue;
   if(s.kind===4&&x*x+z*z<s.radius*s.radius)continue;
   return m.sid;}
  return null;
 };
 for(const g of groups){const [u0,v0,u1,v1]=g.bounds;g.width=u1-u0;g.height=v1-v0;g.density*=gridScale;g.nx=Math.max(2,Math.ceil(g.width*g.density));g.ny=Math.max(2,Math.ceil(g.height*g.density));g.offset=totalCells;g.probeOffset=probeCount;g.stride=Math.max(...g.members.map(m=>m.probeStride))*gridScale;totalCells+=g.nx*g.ny;probeCount+=Math.ceil(g.nx/g.stride)*Math.ceil(g.ny/g.stride);
  for(const m of g.members){const o=m.sid*16;u32.set([g.offset,g.nx,g.ny,g.probeOffset],o);f32.set([g.width,g.height,g.width*g.height/(g.nx*g.ny),g.stride],o+4);f32.set(g.bounds,o+8);u32.set([g.sid,g.curved?(shapes[m.i].kind===3&&m.face===7?4:shapes[m.i].kind===4?6:shapes[m.i].kind):0,g.members.length,0],o+12);}
 }
 const cellSurfaces=new Uint32Array(totalCells),probeSurfaces=new Uint32Array(probeCount);
 for(const g of groups){const at=(x,y)=>[g.bounds[0]+x*g.width,g.bounds[1]+y*g.height];
  for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){let coverage=0;for(let k=0;k<4;k++){const [u,v]=at((x+.25+(k%2)*.5)/g.nx,(y+.25+Math.floor(k/2)*.5)/g.ny);if(owner(g,u,v)!==null)coverage++;}const [u,v]=at((x+.5)/g.nx,(y+.5)/g.ny);const sid=owner(g,u,v)??g.sid;cellSurfaces[g.offset+y*g.nx+x]=sid|(coverage<<16);}
  const nx=Math.ceil(g.nx/g.stride),ny=Math.ceil(g.ny/g.stride);for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const [u,v]=at((x+.5)/nx,(y+.5)/ny),sid=owner(g,u,v);probeSurfaces[g.probeOffset+y*nx+x]=(sid??g.sid)|(Number(sid!==null)<<16);}
 }
 return{surfaces,cellSurfaces,probeSurfaces,totalCells,probeCount,surfaceCount:faces.length,atlases:groups.map(g=>({...g,members:g.members.map(m=>m.sid)}))};
}
