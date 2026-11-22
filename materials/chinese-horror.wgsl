// Procedural WGSL materials for the Chinese horror corridor.
// Zero bitmap textures: plaster flaking, damp stone sheen, weathered timber
// planks, traditional Chinese calligraphy strokes, wax glow and flame emission
// are evaluated analytically in world/local metres.

fn sdSeg(p:vec2f,a:vec2f,b:vec2f)->f32 {
  let pa=p-a;let ba=b-a;
  let h=clamp(dot(pa,ba)/max(dot(ba,ba),.00001),0.,1.);
  return length(pa-ba*h);
}

// Compact brush-stroke table for the 8 traditional couplet glyphs (富贵由天平安是福).
const GLYPH_RANGES=array<vec2u,8>(
  vec2u(0u,15u),vec2u(15u,27u),vec2u(27u,33u),vec2u(33u,38u),
  vec2u(38u,43u),vec2u(43u,51u),vec2u(51u,61u),vec2u(61u,77u)
);
const GLYPH_SEGS=array<vec4f,77>(
  // 0: 富
  vec4f(.50,.93,.50,.85),vec4f(.18,.83,.82,.83),vec4f(.18,.83,.15,.72),vec4f(.82,.83,.85,.73),
  vec4f(.28,.72,.72,.72),vec4f(.30,.62,.70,.62),vec4f(.30,.48,.70,.48),vec4f(.30,.62,.30,.48),
  vec4f(.70,.62,.70,.48),vec4f(.22,.39,.78,.39),vec4f(.22,.10,.78,.10),vec4f(.22,.39,.22,.10),
  vec4f(.78,.39,.78,.10),vec4f(.22,.25,.78,.25),vec4f(.50,.39,.50,.10),
  // 1: 贵
  vec4f(.26,.86,.74,.86),vec4f(.26,.69,.74,.69),vec4f(.26,.86,.26,.69),vec4f(.74,.86,.74,.69),
  vec4f(.50,.94,.50,.58),vec4f(.14,.58,.86,.58),vec4f(.26,.48,.74,.48),vec4f(.26,.48,.26,.22),
  vec4f(.74,.48,.74,.22),vec4f(.50,.42,.47,.21),vec4f(.44,.20,.20,.08),vec4f(.56,.20,.82,.08),
  // 2: 由
  vec4f(.50,.92,.50,.14),vec4f(.20,.68,.80,.68),vec4f(.20,.42,.80,.42),
  vec4f(.20,.14,.80,.14),vec4f(.20,.68,.20,.14),vec4f(.80,.68,.80,.14),
  // 3: 天
  vec4f(.22,.82,.78,.82),vec4f(.16,.54,.84,.54),vec4f(.50,.82,.48,.48),
  vec4f(.48,.48,.18,.10),vec4f(.48,.48,.84,.10),
  // 4: 平
  vec4f(.22,.84,.78,.84),vec4f(.14,.46,.86,.46),vec4f(.50,.84,.50,.08),
  vec4f(.26,.72,.34,.56),vec4f(.74,.72,.66,.56),
  // 5: 安
  vec4f(.50,.93,.50,.84),vec4f(.18,.82,.82,.82),vec4f(.18,.82,.15,.70),vec4f(.82,.82,.85,.70),
  vec4f(.48,.74,.34,.36),vec4f(.34,.36,.74,.14),vec4f(.66,.58,.22,.10),vec4f(.14,.54,.86,.54),
  // 6: 是
  vec4f(.28,.88,.72,.88),vec4f(.28,.74,.72,.74),vec4f(.28,.60,.72,.60),vec4f(.28,.88,.28,.60),
  vec4f(.72,.88,.72,.60),vec4f(.14,.48,.86,.48),vec4f(.50,.48,.50,.18),vec4f(.50,.34,.76,.34),
  vec4f(.30,.36,.18,.12),vec4f(.28,.26,.84,.10),
  // 7: 福
  vec4f(.24,.88,.28,.78),vec4f(.12,.70,.34,.70),vec4f(.34,.70,.12,.42),vec4f(.24,.54,.24,.10),
  vec4f(.24,.52,.36,.44),vec4f(.44,.84,.86,.84),vec4f(.48,.70,.82,.70),vec4f(.48,.56,.82,.56),
  vec4f(.48,.70,.48,.56),vec4f(.82,.70,.82,.56),vec4f(.44,.44,.86,.44),vec4f(.44,.12,.86,.12),
  vec4f(.44,.44,.44,.12),vec4f(.86,.44,.86,.12),vec4f(.44,.28,.86,.28),vec4f(.65,.44,.65,.12)
);

fn glyphDist(u:vec2f,id:u32)->f32 {
  let r=GLYPH_RANGES[id&7u];
  var d=10.;
  for(var i=r.x;i<r.y;i++){
    let seg=GLYPH_SEGS[i];
    d=min(d,sdSeg(u,seg.xy,seg.zw));
  }
  return d;
}

fn paperCoupletColor(h:Hit)->vec3f {
  let s=shapes[h.sid/9u];
  let span=max(s.hi.xy-s.lo.xy,vec2f(.001));
  let uv=clamp((h.p.xy-s.lo.xy)/span,vec2f(0.),vec2f(1.));
  let aspect=span.x/span.y;
  let age=fbm(h.p.xy*4.8+vec2f(3.1,7.4));
  let fade=fbm(h.p.xy*14.3-vec2f(1.7,2.9));
  let edgeDist=min(min(uv.x,1.-uv.x)*span.x,min(uv.y,1.-uv.y)*span.y);
  let frayed=smoothstep(0.,.022,edgeDist+(age-.5)*.014);
  // Sun-bleached, damp-faded crimson/magenta paper with dusty pale mottling.
  var paper=mix(vec3f(.30,.032,.052),vec3f(.52,.068,.092),age*.65+.18);
  paper=mix(paper,vec3f(.54,.30,.33),smoothstep(.54,.84,fade)*.48);
  paper=mix(vec3f(.20,.08,.09),paper,frayed);
  // Subtle weathered dull-gold decorative border frame.
  let bDist=abs(edgeDist-.014);
  let border=1.-smoothstep(.002,.005,bDist);
  paper=mix(paper,vec3f(.44,.32,.14)*(.7+.3*fade),border*.42);
  // Darken the upper horizontal scroll slightly into ceiling shadow patina.
  if(aspect>1.6){paper*=.68;}
  // Brush calligraphy mask.
  var d=10.;
  if(aspect<.35){
    // Vertical couplet (4 stacked characters, top to bottom).
    let row=clamp(floor((1.-uv.y)*4.),0.,3.);
    let cell=vec2f((uv.x-.08)/.84,fract((1.-uv.y)*4.));
    if(all(cell>=vec2f(0.))&&all(cell<=vec2f(1.))){
      let baseId=select(4u,0u,s.lo.x<0.);
      d=glyphDist(vec2f(cell.x,1.-cell.y),baseId+u32(row));
    }
  }else if(aspect>1.6){
    // Horizontal scroll banner above the door (4 characters left to right).
    let col=clamp(floor(uv.x*4.),0.,3.);
    let cell=vec2f(fract(uv.x*4.),(uv.y-.10)/.80);
    if(all(cell>=vec2f(0.))&&all(cell<=vec2f(1.))){
      d=glyphDist(cell,(u32(col)*2u+1u)%8u);
    }
  }else{
    // Smaller vertical red blessing talisman strips pasted on the door panels.
    let innerBorder=1.-smoothstep(.002,.005,abs(edgeDist-.024));
    paper=mix(paper,vec3f(.52,.38,.16),innerBorder*.55);
    let row=clamp(floor((1.-uv.y)*3.),0.,2.);
    let cell=vec2f((uv.x-.16)/.68,fract((1.-uv.y)*3.));
    if(all(cell>=vec2f(0.))&&all(cell<=vec2f(1.))){
      let baseId=select(5u,0u,s.lo.x<.42);
      d=glyphDist(vec2f(cell.x,1.-cell.y),(baseId+u32(row))%8u);
    }
  }
  let brushNoise=(fbm(h.p.xy*42.+vec2f(5.2,1.9))-.5)*.022;
  let ink=1.-smoothstep(.038,.062,d+brushNoise);
  let inkCol=vec3f(.025,.020,.022)*(.8+.4*fade);
  return mix(paper,inkCol,ink*.94);
}

fn plasterMaterial(h:Hit,detailed:bool)->Material {
  let uv=select(h.p.xy,h.p.zy,abs(h.n.x)>.7);
  let broad=fbm(uv*.90+vec2f(2.3,1.1));
  let stain=fbm(vec2f(uv.x*2.2,uv.y*.60)+vec2f(8.1,4.7));
  let fine=fbm(uv*11.5-vec2f(3.7,6.2));
  // Far end wall around the door is cool weathered ash-grey lime plaster;
  // foreground/corridor side walls are warmer aged mud-ochre plaster.
  let onFarWall=smoothstep(-1.75,-2.15,h.p.z)*smoothstep(.5,1.,abs(h.n.z));
  let warmCol=mix(vec3f(.21,.16,.11),vec3f(.40,.31,.21),broad*.72+.18);
  let coolCol=mix(vec3f(.22,.22,.21),vec3f(.38,.37,.35),broad*.65+.20);
  var col=mix(warmCol,coolCol,onFarWall);
  col*=1.-smoothstep(.52,.82,stain)*.34;
  // Damp flaking/peeling plaster concentrated along the lower 0.52m band.
  let lowMask=1.-smoothstep(.04,.52,h.p.y+(broad-.5)*.16);
  let peelField=fbm(uv*6.8+vec2f(11.4,2.8))+.32*fbm(uv*22.0);
  let peel=smoothstep(.47,.60,peelField)*lowMask;
  let peelEdge=smoothstep(.41,.49,peelField)*(1.-smoothstep(.55,.65,peelField))*lowMask;
  let underLayer=vec3f(.15,.12,.09)*(.70+.55*fine);
  col=mix(col,underLayer,peel*.82);
  col=mix(col,vec3f(.50,.42,.30),peelEdge*.40);
  // Dark damp soot along ceiling edge and lower-left corner beside the left couplet.
  let ceilingSoot=smoothstep(1.95,2.95,h.p.y)*.68;
  let cornerSoot=smoothstep(-.48,-1.15,h.p.x)*smoothstep(-1.5,-2.2,h.p.z)*(1.-smoothstep(.3,1.3,h.p.y))*.72;
  col*=1.-clamp(ceilingSoot+cornerSoot,0.,.82);
  // Prominent vertical cracked plaster ridge near the protruding partition edge.
  let edgeCrack=exp(-abs(h.p.x+0.96)/.075)*smoothstep(.5,1.,abs(h.n.z))*smoothstep(-.2,.1,h.p.z)*smoothstep(.55,2.35,h.p.y);
  let crackTex=smoothstep(.32,.68,fbm(uv*12.+vec2f(0.,3.5)));
  col*=1.-edgeCrack*crackTex*.48;

  var n=h.n;
  if(detailed){
    let f=tileFrame(h);
    let e=.012;
    // Keep upper plaster smooth; concentrate crisp relief on peeling lower band & vertical crack.
    let baseAmp=.0045;
    let h0=fbm(uv*9.+vec2f(1.2,4.8))*baseAmp+peel*.032+edgeCrack*crackTex*.028;
    let px=uv+vec2f(e,0.);
    let py=uv+vec2f(0.,e);
    let peelX=smoothstep(.47,.60,fbm(px*6.8+vec2f(11.4,2.8))+.32*fbm(px*22.0))*lowMask;
    let peelY=smoothstep(.47,.60,fbm(py*6.8+vec2f(11.4,2.8))+.32*fbm(py*22.0))*lowMask;
    let hx=fbm(px*9.+vec2f(1.2,4.8))*baseAmp+peelX*.032+edgeCrack*smoothstep(.32,.68,fbm(px*12.+vec2f(0.,3.5)))*.028;
    let hy=fbm(py*9.+vec2f(1.2,4.8))*baseAmp+peelY*.032+edgeCrack*smoothstep(.32,.68,fbm(py*12.+vec2f(0.,3.5)))*.028;
    n=normalize(h.n-f[0]*((hx-h0)/e*.42)-f[1]*((hy-h0)/e*.42));
  }
  return Material(col,mix(.88,.96,peel),n,.004);
}

fn floorMaterial(h:Hit,detailed:bool)->Material {
  let uv=h.p.xz;
  let broad=fbm(uv*1.25+vec2f(4.2,9.1));
  let grit=fbm(uv*9.5-vec2f(1.9,5.3));
  let micro=fbm(uv*32.0+vec2f(6.7,2.4));
  // Patchy dampness across rough, dark worn concrete/stone floor.
  let wetRaw=fbm(uv*1.85+vec2f(7.3,-2.4))+.26*fbm(uv*6.4);
  let wet=smoothstep(.38,.66,wetRaw);
  var col=mix(vec3f(.028,.024,.020),vec3f(.068,.058,.048),broad*.60+grit*.40);
  col*=mix(1.,.55,wet);
  // Subtle scattered ash/gravel grit catching grazing candlelight near the corner.
  let ash=smoothstep(.64,.86,micro)*exp(-length(uv-vec2f(-.44,.28))*.75);
  col=mix(col,vec3f(.13,.105,.082),ash*.38);

  var n=h.n;
  if(detailed){
    let f=tileFrame(h);
    let e=.008;
    let amp=mix(.022,.009,wet);
    let h0=fbm(uv*18.+vec2f(2.1,7.3))*amp+fbm(uv*48.)*amp*.45;
    let hx=fbm((uv+vec2f(e,0.))*18.+vec2f(2.1,7.3))*amp+fbm((uv+vec2f(e,0.))*48.)*amp*.45;
    let hy=fbm((uv+vec2f(0.,e))*18.+vec2f(2.1,7.3))*amp+fbm((uv+vec2f(0.,e))*48.)*amp*.45;
    n=normalize(h.n-f[0]*((hx-h0)/e*.46)-f[1]*((hy-h0)/e*.46));
  }
  let rough=mix(.56,.15,wet)+grit*.09;
  let coat=mix(.014,.048,wet);
  return Material(col,clamp(rough,.11,.90),n,coat);
}

fn woodMaterial(h:Hit,detailed:bool)->Material {
  let uv=select(h.p.xy,select(h.p.zy,h.p.xz,abs(h.n.y)>.7),abs(h.n.x)>.7);
  // Elongated vertical timber grain and dark plank seams on the double doors.
  let grain=fbm(vec2f(uv.x*28.,uv.y*2.8)+vec2f(3.7,1.4));
  let fineGrain=fbm(vec2f(uv.x*72.,uv.y*6.5));
  let plankPhase=fract((h.p.x+0.24)/.128);
  let onDoor=smoothstep(-2.0,-2.28,h.p.z)*smoothstep(.5,1.,abs(h.n.z));
  let plankGap=(1.-smoothstep(.0,.042,min(plankPhase,1.-plankPhase)))*onDoor;
  let wear=fbm(uv*3.6+vec2f(9.1,2.3));
  var col=mix(vec3f(.032,.028,.025),vec3f(.092,.082,.072),grain*.62+fineGrain*.28);
  // Dry pale ash-silver weathering on lower/middle door boards; top drops into black shadow.
  col=mix(col,vec3f(.16,.155,.145),smoothstep(.50,.78,wear)*onDoor*(1.-smoothstep(1.2,2.1,h.p.y))*.45);
  col*=1.-plankGap*.82;
  col*=1.-smoothstep(1.35,2.22,h.p.y)*onDoor*.65;
  var n=h.n;
  if(detailed && onDoor>.5){
    let f=tileFrame(h);
    let slope=(select(-1.,1.,plankPhase>.5))*plankGap*.34;
    let micro=(fineGrain-.5)*.08;
    n=normalize(h.n+f[0]*(slope+micro));
  }
  return Material(col,mix(.72,.90,plankGap),n,.006);
}

fn filteredMaterial(h:Hit)->Material {
  if(h.material==0u){return plasterMaterial(h,false);}
  if(h.material==1u){return floorMaterial(h,false);}
  if(h.material==2u){
    // Pitch-dark soot-stained ceiling and dark foreground silhouette.
    let g=fbm(h.p.xz*1.8+vec2f(2.1,5.7));
    return Material(vec3f(.009,.008,.008)*(.7+.5*g),.96,h.n,.002);
  }
  if(h.material==3u){return woodMaterial(h,false);}
  if(h.material==4u){return Material(vec3f(.38,.052,.068),.88,h.n,.004);}
  if(h.material==5u){return Material(vec3f(.84,.72,.48),.44,h.n,.022);}
  if(h.material==6u){return Material(vec3f(.02),.95,h.n,0.);}
  if(h.material==7u){return Material(vec3f(.015),.38,h.n,.22);}
  // Material 8: matte charred dark stoneware (offering bowl & corner jar).
  let soot=fbm(h.p.xz*14.+vec2f(h.p.y*12.));
  return Material(vec3f(.014,.012,.011)*(.8+.4*soot),.42,h.n,.018);
}

fn surfaceBaseMaterial(h:Hit)->Material {
  if(h.material==0u){return plasterMaterial(h,true);}
  if(h.material==1u){return floorMaterial(h,true);}
  if(h.material==3u){return woodMaterial(h,true);}
  if(h.material==4u){return Material(paperCoupletColor(h),.88,h.n,.004);}
  return filteredMaterial(h);
}

fn surfaceMaterial(h:Hit)->Material {
  return surfaceBaseMaterial(h);
}

// Physical emission for the candle flame, glowing upper wax and smoldering ember.
fn materialEmission(h:Hit)->vec3f {
  let fl=1.+.055*(.58*sin(U.state.x*7.3+.4)+.28*sin(U.state.x*15.84+.69)+.14*cos(U.state.x*29.85+.24));
  if(h.material==6u){
    if(h.p.x>-.55){
      // Candle flame: bright golden-white core tapering to warm amber tip.
      let t=clamp((h.p.y-.158)/.057,0.,1.);
      let core=mix(vec3f(30.,19.,6.5),vec3f(22.,6.5,.85),pow(t,.75));
      let bright=1.+.50*exp(-pow((t-.32)/.22,2.));
      return core*bright*fl;
    }
    // Smoldering crimson-orange vigil ember behind the dark offering vessel.
    let efl=1.+.08*sin(U.state.x*4.1+1.9);
    let pulse=.78+.22*fbm(h.p.xz*65.+vec2f(U.state.x*.6));
    return vec3f(5.5,.75,.10)*pulse*efl;
  }
  if(h.material==5u){
    // Subsurface glow inside the translucent paraffin wax right under the wick.
    let glow=smoothstep(.04,.155,h.p.y);
    return vec3f(2.2,.86,.16)*glow*glow*fl;
  }
  return vec3f(0);
}
