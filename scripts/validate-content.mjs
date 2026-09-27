import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname;
const level=JSON.parse(readFileSync(join(root,'levels/poolrooms.json')));
assert.equal(level.id,'poolrooms-v1');
assert(level.spawn.x>level.bounds.minX&&level.spawn.x<level.bounds.maxX);
assert(level.spawn.z>level.bounds.minZ&&level.spawn.z<level.bounds.maxZ);
assert(level.optics.waterLevel>level.optics.waveAmplitude*1.07);
assert(level.optics.waterLevel+level.optics.waveAmplitude*1.07<level.spawn.y);
assert(level.optics.apertureWidth>0&&level.optics.apertureWidth<9);
assert(existsSync(join(root,`materials/${level.material}.wgsl`)));
const forbidden=/\.(png|jpe?g|webp|avif|gif|bmp|hdr|exr|ktx2?|dds|tiff?|ico)$/i;
const found=[];
function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','.runtime','.flops','dist'].includes(item.name))continue;const p=join(dir,item.name);if(item.isDirectory())scan(p);else if(forbidden.test(item.name))found.push(p);}}
scan(root);assert.deepEqual(found,[],'v1 forbids bitmap resource files in the source tree. Write evidence outside the repository.');
for(const name of ['common.wgsl','photons.wgsl','camera.wgsl','water-caustics.wgsl','solar-atlas.wgsl','diffuse-transfer.wgsl','compose-light.wgsl','reflection-filter.wgsl']) {
 const shader=readFileSync(join(root,'src/render',name),'utf8');
 // The solar atlas is generated and cleared by photon transport each frame.
 // Permit only this named render target, never imported bitmap sampling.
 const withoutRuntimeAtlas=shader.replace(/textureLoad\(solarAtlas,/g,'runtimePhotonRead(');
 assert(!/textureSample|textureLoad/.test(withoutRuntimeAtlas),'Transport must not sample image assets.');
}
const renderer=readFileSync(join(root,'src/render/renderer.js'),'utf8');
assert(!/copyExternalImageToTexture|createImageBitmap|new Image\(/.test(renderer),'No external image uploads.');
console.log('v1 content valid: spawn, water envelope, aperture, material slot; zero bitmap resources.');
