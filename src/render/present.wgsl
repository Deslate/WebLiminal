struct Display { size:vec4f, style:vec4f };
@group(0) @binding(0) var<storage,read> image:array<vec4f>;
@group(0) @binding(1) var<uniform> D:Display;
struct Out { @builtin(position) position:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->Out {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:Out;o.position=vec4f(p[i],0,1);o.uv=p[i]*vec2f(.5,-.5)+.5;return o;}
fn load(p:vec2f)->vec3f {let q=clamp(p*D.size.xy-.5,vec2f(0),D.size.xy-1.);let b=vec2u(q);let f=fract(q);let r=min(b+vec2u(1),vec2u(D.size.xy)-1u);let a=image[b.y*u32(D.size.x)+b.x].rgb;let c=image[b.y*u32(D.size.x)+r.x].rgb;let d=image[r.y*u32(D.size.x)+b.x].rgb;let e=image[r.y*u32(D.size.x)+r.x].rgb;return mix(mix(a,c,f.x),mix(d,e,f.x),f.y);}
fn aces(x:vec3f)->vec3f {let a=x*(2.51*x+.03);let b=x*(2.43*x+.59)+.14;return clamp(a/b,vec3f(0),vec3f(1));}
fn linearToSRGB(c:vec3f)->vec3f{return select(c*12.92,1.055*pow(max(c,vec3f(0)),vec3f(1./2.4))-.055,c>vec3f(.0031308));}
fn grainHash(p:vec2f,k:f32)->f32 {
  let q=vec2u(p);var x=q.x*1973u+q.y*9277u+u32(k)*26699u;
  x=(x^(x>>16u))*0x7feb352du;x=(x^(x>>15u))*0x846ca68bu;
  return f32(x^(x>>16u))/4294967296.-.5;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
  var uv=o.uv;let intro=1.-smoothstep(.3,2.6,D.style.y);uv.x+=intro*sin(uv.y*770.+D.style.y*67.)*.0007;
  let ca=(uv-.5)*dot(uv-.5,uv-.5)*.0018;
  let color=vec3f(load(uv+ca).r,load(uv).g,load(uv-ca).b)*D.style.x;
  let vignette=1.-dot(uv-.5,uv-.5)*.24;
  var outColor=linearToSRGB(aces(color*vignette));
  // Low-amplitude monochrome emulsion grain, smoothly evolved at 12 Hz.
  // Dark regions get less grain, so it cannot masquerade as path fireflies.
  let t=D.style.z*12.;let k=floor(t);let blend=smoothstep(0.,1.,fract(t));
  let grain=mix(grainHash(o.position.xy,k),grainHash(o.position.xy,k+1.),blend);
  let luminance=dot(outColor,vec3f(.2126,.7152,.0722));
  outColor+=grain*D.style.w*(.25+.75*smoothstep(.02,.4,luminance));
  return vec4f(outColor,1.);
}
