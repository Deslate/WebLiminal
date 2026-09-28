export function variant(path,s,v){
 const has=k=>v===k||v==='all'||(v==='recommended'&&['photons','sky'].includes(k))||(v==='balanced'&&k==='sky');
 if(path==='/src/main.js')s=s.replace('if (!paused && !holdTime && frameMs.length > 60 && done - lastResize > 900)','if (false)');
 if(path==='/src/render/renderer.js'&&v==='balanced')s=s.replace('photonCount: 49152','photonCount: 196608');
 if(path==='/src/render/renderer.js'&&has('photons'))s=s.replace('photonCount: 49152','photonCount: 196608').replace('sunGrid:384,skyGridX:256,skyGridY:512','sunGrid:768,skyGridX:512,skyGridY:1024');
 if(path==='/src/render/water-caustics.wgsl'&&has('receiver'))s=s.replaceAll('s.metric.w>4.','s.metric.w>6.');
 if(path==='/src/render/renderer.js'&&has('receiver'))s=s.replace('geometry.totalCells,64);device.queue.submit([skyEncoder.finish()])','geometry.totalCells,128);device.queue.submit([skyEncoder.finish()])');
 if(path==='/src/render/sky.wgsl'&&has('receiver'))s=s.replace('@workgroup_size(64)','@workgroup_size(128)');
 if(path==='/src/render/light-atlas.js'&&has('receiver'))s=s.replace('g.nx=Math.max','g.density*=1.5;g.nx=Math.max').replace('totalCells+=g.nx*g.ny','g.stride*=1.5;totalCells+=g.nx*g.ny');
 if(path==='/src/render/sky.wgsl'&&has('sky'))s=s.replaceAll('64u','256u').replaceAll('8u','16u').replaceAll('/8.','/16.').replaceAll('/64.','/256.');
 if(path==='/src/render/camera.wgsl'){
 if(has('angular'))s=s.replace('j<8u','j<32u').replace('(f32(k)+.5)/16.','(f32(k)+.5)/64.').replace('weight/8.','weight/32.');
 if(has('spp'))s=s.replace('var count=2u','var count=8u').replace('if(i==1u){','if(false){').replace('if(i==3u && contrast>.3)','if(false)');
 if(has('path')){
 const helper=`fn continuedHit(h:Hit,rd:vec3f,underwater:bool)->vec3f {
 var c=shadeHit(h,rd,underwater);
 if(h.t>=INF||h.material==10u){return c;}
 let m=filteredMaterial(h);let v=-rd;let nv=max(dot(m.normal,v),.001);let alpha=max(m.roughness*m.roughness,.001);let frame=basis(m.normal);
 for(var j=0u;j<4u;j++){
 let u=(f32(j)+.5)/4.;let phi=2.*PI*fract(f32(j)*.61803398875);let radius=alpha*sqrt(u/(1.-u));let hn=normalize(frame*vec3f(radius*cos(phi),radius*sin(phi),1.));let vh=max(dot(v,hn),0.);let reflected=reflect(rd,hn);let nl=dot(m.normal,reflected);
 if(nl>0.&&vh>0.){let r=traceDynamicSolid(h.p+h.n*.01,reflected,INF);let w=smithG1(nv,alpha)*smithG1(nl,alpha)*vh/max(nv*dot(m.normal,hn),.00001);c+=shadeHit(r,reflected,underwater)*schlick(vh,m.coat)*w/4.*select(vec3f(1),waterTransmittance(h.t),underwater);}
 }return c;
}\n`;
 s=s.replace('fn shadeSolid(',helper+'fn shadeSolid(').replace('return shadeHit(traceDynamicSolid(ro,rd,INF),rd,underwater);','return continuedHit(traceDynamicSolid(ro,rd,INF),rd,underwater);').replace('if(h.material!=9u){return shadeHit(h,rd,false);}','if(h.material!=9u){return continuedHit(h,rd,false);}').replace('let a=shadeHit(receiver,reflected,false)*f*tr;','let a=continuedHit(receiver,reflected,false)*f*tr;').replace('c+=photons.rgb*m.coat*.08*U.settings.z;','// Omit bounded environment residual in the continuation experiment.');
 }
 }
 return s;
}
