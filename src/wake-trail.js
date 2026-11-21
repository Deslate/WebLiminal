// Foot contacts come from collision-resolved locomotion, never camera rotation.
export function createWakeTrail(){
 let distance=0,last=-Infinity,foot=0;
 return {reset(){distance=0;last=-Infinity;foot=0;},advance(from,to,time,waterLevel){
  const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);
  if(waterLevel<=(to.y??1.62)-1.62+.04||d<1e-6||d>.25)return null;
  distance+=d;if(distance<.48||time-last<.4)return null;
  distance=0;last=time;foot++;const side=foot%2?1:-1;
  // The planted foot is ahead of the body centre, not inside its cylinder.
  return {x:to.x+dx/d*.30-dz/d*.10*side,z:to.z+dz/d*.30+dx/d*.10*side,time,amplitude:.012,direction:[dx/d,dz/d],step:foot};
 }};
}
