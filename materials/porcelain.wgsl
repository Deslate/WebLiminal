// Material slot: surfaceMaterial(Hit) -> Material. All details are generated in metres.
fn surfaceMaterial(h:Hit)->Material {
  let n=h.n;var uv=h.p.xy;if(abs(n.x)>.7){uv=h.p.zy;}if(abs(n.y)>.7){uv=h.p.xz;}
  let curved=abs(n.z)<.001&&abs(n.x)>.001&&abs(n.y)>.001;
  if(curved){uv=h.uv*surfaces[h.sid].metric.xy;}
  if(h.material==1u){let dirt=fbm(uv*.61);return Material(vec3f(.71,.69,.62)*(.86+.14*dirt),.7,n,.025);}
  let scale=select(4.0,3.33333,h.material==2u);let g=uv*scale;let tile=floor(g);let st=fract(g);
  let dist=min(st,1.-st)/scale;let edge=min(dist.x,dist.y);let id=hash2(tile+vec2f(f32(h.sid)*17.19,0));
  // Integrate subpixel detail over an approximate world-space pixel footprint.
  // This filters only features smaller than a pixel, not the rendered image.
  let viewDirection=normalize(U.camera.xyz-h.p);
  let footprint=select(.00012,clamp(length(U.camera.xyz-h.p)*U.lens.y/f32(U.render.y)/max(abs(dot(h.n,viewDirection)),.25),.00012,.06),U.sampling.y==1u);
  let detail=1.-smoothstep(.0015,.012,footprint);
  let edgeWear=noise(uv*71.3+vec2f(id*93.))*0.0008;
  let halfWidth=.0025+edgeWear;
  let coverage=clamp((min(dist+vec2f(footprint),vec2f(halfWidth))-max(dist-vec2f(footprint),vec2f(-halfWidth)))/(2.*footprint),vec2f(0),vec2f(1));
  let grout=1.-(1.-coverage.x)*(1.-coverage.y);
  var color=mix(vec3f(.64,.62,.50),vec3f(.80,.78,.68),id*.65+.17);
  if(h.material==2u){color=mix(vec3f(.42,.60,.54),vec3f(.49,.66,.59),id);}
  let broad=fbm(uv*.38+vec2f(f32(h.sid)*4.9));
  let stain=smoothstep(.62,.82,broad)*.15;
  color*=1.-stain;
  let grain=noise(uv*153.7);color*=1.+(.018*grain-.009)*detail;
  let chip=smoothstep(.7,.88,noise(uv*39.7+vec2f(id*81.)))*(1.-smoothstep(.005,.016,edge));
  color=mix(color,vec3f(.37,.35,.28),chip*.32*detail);
  let waterline=exp(-abs(h.p.y-U.state.y-.035)/.06)*(0.45+0.55*fbm(uv*6.7));
  color*=1.-waterline*.27;
  color=mix(color,vec3f(.26,.27,.235)*(.65+.35*noise(uv*31.)),grout);
  let bevel=(1.-smoothstep(.003,.011+footprint,edge))*(1.-grout)*mix(.3,1.,detail);
  let gx=select(-1.,1.,st.x>.5)*select(1.,0.,dist.x>dist.y);
  let gy=select(-1.,1.,st.y>.5)*select(0.,1.,dist.x>dist.y);
  var tangent=vec3f(1,0,0);var bitangent=vec3f(0,1,0);
  if(abs(n.x)>.7){tangent=vec3f(0,0,1);}if(abs(n.y)>.7){bitangent=vec3f(0,0,1);}
  // Rare hairline fracture, local to an independently seeded tile.
  let crackLine=st.y-(.21+.53*id)-.07*sin(st.x*15.+id*31.);
  let crack=select(0.,exp(-abs(crackLine)*1300.)*(1.-smoothstep(.16,.42,abs(st.x-.5))),id>.95);
  color*=1.-crack*.55*detail;
  let orange=(noise(uv*119.)-.5)*.035*detail;
  if(curved){tangent=vec3f(n.y,-n.x,0);bitangent=vec3f(0,0,1);}
  let normal=normalize(n+tangent*(gx*bevel*.22+orange)+bitangent*(gy*bevel*.22+orange*.7));
  let wet=1.-smoothstep(U.state.y-.01,U.state.y+.06,h.p.y);
  let rough=mix(.19+id*.10,.095,wet);
  return Material(color,mix(rough,.85,grout),normal,mix(.045,.012,grout));
}
