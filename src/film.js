import * as THREE from "three";
export function createFilm(renderer, time) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    samples: 2,
  });
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const resolution = new THREE.Vector2(1, 1);
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: target.texture },
      uTime: time,
      uResolution: { value: resolution },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `uniform sampler2D tScene; uniform float uTime; uniform vec2 uResolution; varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        float intro=1.-smoothstep(.6,2.6,uTime);
        vec2 uv=vUv;
        float band=exp(-pow((uv.y-fract(uTime*.62))*32.,2.));
        uv.x+=(sin(uv.y*680.+uTime*70.)*.00065+band*.003)*intro;
        vec2 fringe=vec2((.35+intro*1.6)/uResolution.x,0.);
        vec3 col=vec3(texture2D(tScene,uv+fringe).r,texture2D(tScene,uv).g,texture2D(tScene,uv-fringe).b);
        vec3 glow=vec3(0.);
        for(int i=0;i<8;i++) {float a=float(i)*.785398;vec2 off=vec2(cos(a),sin(a))*7./uResolution;glow+=max(texture2D(tScene,uv+off).rgb-vec3(1.1),0.);}
        col+=glow*.013;
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float noise=hash(gl_FragCoord.xy+fract(uTime)*937.);
        gl_FragColor.rgb+=(noise-.5)*(.019+intro*.085);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(dot(gl_FragColor.rgb,vec3(.299,.587,.114))),intro*.18);
        gl_FragColor.rgb-=band*intro*.035;
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return {
    resize(w, h) {
      target.setSize(w, h);
      resolution.set(w, h);
    },
    render(world, view) {
      renderer.setRenderTarget(target);
      renderer.render(world, view);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
