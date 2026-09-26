import * as THREE from "three";
export function createWaterMaterial({
  time,
  disturbance,
  reflection,
  textureMatrix,
}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: time,
      uDisturbance: disturbance,
      uReflection: { value: reflection },
      uTextureMatrix: { value: textureMatrix },
    },
    vertexShader: `uniform mat4 uTextureMatrix; varying vec4 vReflect; varying vec3 vWorld;
      void main(){ vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz; vReflect=uTextureMatrix*vec4(position,1.); gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float uTime; uniform float uDisturbance; uniform sampler2D uReflection; varying vec4 vReflect; varying vec3 vWorld;
      void main(){
        float t=uTime*.48; vec2 p=vWorld.xz;
        vec2 ripple=vec2(sin(p.x*3.1+p.y*2.5+t)+sin(p.y*7.1-t*1.6),cos(p.y*3.5-p.x*1.8+t)+cos(p.x*6.5+t*1.3));
        float expanding=sin(length(p-vec2(0.,-21.))*8.-uTime*4.);
        ripple+=expanding*uDisturbance*.8;
        vec3 normal=normalize(vec3(ripple.x*.043,1.,ripple.y*.043));
        vec3 eye=normalize(cameraPosition-vWorld);
        float fresnel=.15+.74*pow(1.-max(dot(eye,normal),0.),3.);
        vec2 projected=vReflect.xy/vReflect.w+ripple*.0015;
        vec3 refl=texture2D(uReflection,projected).rgb;
        vec3 water=vec3(.23,.52,.44);
        float light=pow(max(0.,dot(reflect(-normalize(vec3(-.5,1.,.3)),normal),eye)),130.);
        vec3 col=mix(water,refl,.86)+vec3(.9,.97,.65)*light*.8;
        gl_FragColor=vec4(col,clamp(fresnel+.13,.25,.94));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
