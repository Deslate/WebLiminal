// Sub-grid splash momentum closure. No visible particle layer or prescribed
// wave shape: these events feed the shared finite-depth wave equation.
// A foot sweep ejects 18 litres in six parcels (calibrated swept-water budget), with forward velocity
// and flight time determined at contact. Gravity determines landing positions.
export function kickImpacts(contact){
 if(!contact.direction)return [];
 const [dx,dz]=contact.direction,events=[];
 let seed=(contact.step??1)*2654435761>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<6;i++){
  const angle=(random()-.5)*1.1,forward=2.8+random()*1.8,up=1.8+random()*.9;
  const vx=forward*(dx*Math.cos(angle)-dz*Math.sin(angle));
  const vz=forward*(dz*Math.cos(angle)+dx*Math.sin(angle));
  const flight=2*up/9.81;
  events.push({x:contact.x+vx*flight,z:contact.z+vz*flight,time:contact.time+flight,momentum:.003*up});
 }
 return events;
}
