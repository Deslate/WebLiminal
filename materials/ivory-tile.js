import * as THREE from "three";
// Material slot signature: createMaterial({ time, disturbance, waterHeight, color }) → Material.
export function createMaterial({
  time,
  disturbance,
  waterHeight,
  color = "#e1dec0",
}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.31,
    metalness: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uDisturbance = disturbance;
    shader.uniforms.uWaterHeight = { value: waterHeight };
    shader.vertexShader = `varying vec3 vRoomPosition; varying vec3 vRoomNormal;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>\nvRoomPosition=(modelMatrix*vec4(transformed,1.)).xyz; vRoomNormal=normalize(mat3(modelMatrix)*objectNormal);`,
    );
    shader.fragmentShader = `varying vec3 vRoomPosition; varying vec3 vRoomNormal; uniform float uTime; uniform float uDisturbance; uniform float uWaterHeight;
      float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 an=abs(normalize(vRoomNormal));
      vec2 uv=an.y>.65?vRoomPosition.xz:(an.x>.65?vRoomPosition.zy:vRoomPosition.xy);
      vec2 grid=uv*3.5; vec2 cell=fract(grid);
      vec2 edge=min(cell,1.-cell); vec2 fw=fwidth(grid);
      float grout=1.-smoothstep(.009,.009+max(fw.x,fw.y)*.75,min(edge.x,edge.y));
      float variation=hash21(floor(grid));
      diffuseColor.rgb*=mix(.96,1.04,variation);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.66,grout*.43);
      float wet=1.-smoothstep(uWaterHeight-.04,uWaterHeight+.15,vRoomPosition.y);
      diffuseColor.rgb*=mix(vec3(1.),vec3(.47,.76,.69),wet*.6);
      diffuseColor.rgb*=mix(.66,1.,smoothstep(-35.,-2.,vRoomPosition.z));
      float foot=smoothstep(0.,.65,vRoomPosition.y);
      if(an.y<.5) diffuseColor.rgb*=mix(.73,1.,foot);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float ct=uTime*.42;
      vec2 cp=uv*5.2;
      float wave=sin(cp.x*1.8+sin(cp.y*1.4+ct)*1.8+ct)+sin(cp.y*2.1+sin(cp.x*1.3-ct)*1.6-ct);
      float caustic=pow(1.-abs(wave)*.5,12.);
      float low=1.-smoothstep(.0,2.4,vRoomPosition.y);
      totalEmissiveRadiance+=vec3(.11,.18,.12)*caustic*low*(1.-uDisturbance*.75);
    `,
    );
  };
  material.customProgramCacheKey = () => "ivory-tile-v1";
  return material;
}
