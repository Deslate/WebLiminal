import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const root=process.env.EVIDENCE_DIR||'../workroom-v1.39-evidence/before';mkdirSync(root,{recursive:true});
const look=(eye,target)=>{const [x,y,z]=eye,dx=target[0]-x,dy=target[1]-y,dz=target[2]-z;return{x,y,z,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))}};
const views={
 ceiling_front_left:look([-3,1.62,7],[-4.5,5.8,5.8]),ceiling_front_right:look([1,1.62,7],[.3,5.8,5.8]),
 ceiling_rear_left:look([-3,1.62,-5],[-4.5,5.8,-5]),ceiling_rear_right:look([1,1.62,-5],[.3,5.8,-5]),
 ceiling_wall_left:look([-4,2,3],[-7,5.8,3]),ceiling_wall_right:look([4,2,3],[7,5.8,3]),
 ceiling_wall_rear:look([3,2,-14],[3,5.8,-17]),ceiling_wall_front:look([3,2,7],[3,5.8,10]),
 pillar_front:look([-2.335,2.8,.5],[-2.335,2.8,-2.85]),pillar_back:look([-2.335,2.8,-6],[-2.335,2.8,-3.65]),
 arch_spring:look([.4,2.7,-1],[1.78,2.5,-3.25]),arch_crown:look([0,2,-1],[0,4.28,-3.25]),
 arch_front_edge:look([2.6,2,-1],[1.78,2,-2.85]),arch_wall:look([-5.8,2.6,-1],[-7,4,-2.85]),
 wall_corner:look([4,2,6],[7,2,10]),floor_wall:look([4,.25,5],[7,.03,5]),
 floor_step:look([-4.5,.25,5],[-5.85,.05,5]),step_top:look([-4.5,1.62,5],[-6.1,.42,5]),
 rear_arch_spring:look([.6,2.7,-9],[2.1,2.5,-11.2]),rear_arch_wall:look([5,2,-9],[7,4,-10.8])};

const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage({viewport:{width:1280,height:832}});if(process.env.DIAG){const code=readFileSync('src/render/camera.wgsl','utf8').replace('  var m=material;if',`  return ${process.env.DIAG};
  var m=material;if`);await p.route(u=>u.pathname==='/src/render/camera.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(code)}));}await p.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await p.evaluate(()=>document.body.classList.add('evidence'));
for(const [name,view] of Object.entries(views)){if(process.env.ONLY&&!process.env.ONLY.split(',').includes(name))continue;if(process.env.DIAG&&name!=='front')continue;await p.evaluate(({view,name})=>__POOLROOMS_V1__.configure({view,body:!name.startsWith("floor"),exposure:name==="ceiling_wall_rear"?6:name.startsWith("floor")?1:.85,pause:true,freeze:true,scale:1,grain:0}),{view,name});const q=await p.evaluate(()=>__POOLROOMS_V1__.renderEvidence(12,{},false));writeFileSync(`${root}/${name}.png`,Buffer.from(q.png.split(',')[1],'base64'));const errors=await p.evaluate(()=>__POOLROOMS_V1__.snapshot().errors);if(errors.length)throw Error(JSON.stringify(errors));console.log(name);}writeFileSync(root+'/views.json',JSON.stringify(views,null,2));}finally{await b.close()}
