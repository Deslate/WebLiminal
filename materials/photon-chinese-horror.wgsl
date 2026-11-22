// Area-average transport BRDF for photon GI in the Chinese horror corridor.
fn surfaceMaterial(h:Hit)->Material {
  if(h.material==0u){
    let farWall=smoothstep(-1.75,-2.15,h.p.z)*smoothstep(.5,1.,abs(h.n.z));
    return Material(mix(vec3f(.28,.22,.15),vec3f(.28,.28,.27),farWall),.90,h.n,.004);
  }
  if(h.material==1u){return Material(vec3f(.042,.036,.030),.40,h.n,.028);}
  if(h.material==2u){return Material(vec3f(.010,.009,.009),.96,h.n,.002);}
  if(h.material==3u){return Material(vec3f(.065,.058,.050),.78,h.n,.006);}
  if(h.material==4u){return Material(vec3f(.38,.052,.068),.88,h.n,.004);}
  if(h.material==5u){return Material(vec3f(.82,.70,.46),.44,h.n,.022);}
  if(h.material==6u){return Material(vec3f(.02),.95,h.n,0.);}
  if(h.material==7u){return Material(vec3f(.015),.38,h.n,.22);}
  return Material(vec3f(.014,.012,.011),.42,h.n,.018);
}
