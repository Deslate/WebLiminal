// Versioned metres/radians/seconds. All movement is <= .8 m/s; no random camera.
export const FPS=30, WIDTH=640, HEIGHT=416, DURATION=76;
const pose=(x,z,yaw=0,pitch=0,y=1.62)=>({x,y,z,yaw,pitch});
export const segments=[
 {name:'water-body',start:0,end:4,actor:[0,7,0,7],camera:[pose(2,9,.65,-.65,3.8),pose(2,9,.65,-.65,3.8)],hold:true},
 {name:'bright-walk',start:4,end:17,actor:[0,7,0,-3.25],follow:true},
 {name:'door-turn',start:17,end:19,actor:[0,-3.25,0,-3.25],camera:[pose(2,-1,.65,-.45,3.8),pose(1.2,-3.25,-Math.PI/2,.45)]},
 {name:'door-interior',start:19,end:25,actor:[0,-3.25,0,-3.25],camera:[pose(1.2,-3.25,-Math.PI/2,.45),pose(1.2,-3.25,-Math.PI/2,.45)],hold:true},
 {name:'look-back',start:25,end:31,actor:[0,-3.25,0,-3.25],camera:[pose(0,-4.5,Math.PI,.55),pose(0,-4.5,Math.PI,.55)],hold:true},
 {name:'dark-walk',start:31,end:41,actor:[0,-3.25,0,-11.2],follow:true},
 {name:'deep-door-interior',start:41,end:47,actor:[0,-11.2,0,-11.2],camera:[pose(1.5,-11.2,-Math.PI/2,.45),pose(1.5,-11.2,-Math.PI/2,.45)],hold:true},
 {name:'return-walk',start:47,end:66,actor:[0,-11.2,0,4],follow:true,back:true},
 {name:'dark-wall-ceiling',start:66,end:72,actor:[0,4,0,4],camera:[pose(-3.6,8,-.29,.55),pose(-3.6,8,-.29,.55)],hold:true},
 {name:'close-grout',start:72,end:76,actor:[0,4,0,4],camera:[pose(6.65,2,-Math.PI/2,.12),pose(6.65,2,-Math.PI/2,.12)],hold:true}
];
export function sample(t){
 const s=segments.find(s=>t>=s.start&&t<s.end)||segments.at(-1),u=Math.min(1,(t-s.start)/(s.end-s.start));
 const [x,z,X,Z]=s.actor,actor=pose(x+(X-x)*u,z+(Z-z)*u,s.back?Math.PI:0);
 let camera;
 if(s.follow){camera=pose(actor.x+2,actor.z+(s.back?-2:2),s.back?2.36:.785,-.55,3.8)}
 else {camera={};for(const k of Object.keys(s.camera[0]))camera[k]=s.camera[0][k]+(s.camera[1][k]-s.camera[0][k])*u;}
 return {actor,camera,segment:s.name,moving:!s.hold,cut:Math.abs(t-s.start)<1/FPS};
}
