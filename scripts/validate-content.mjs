import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {buildPoolroomsScene} from '../levels/poolrooms-scene.js';
import {validateScene} from '../src/render/scene.js';
import {createPoolroomsWorld,bookmarks} from '../levels/poolrooms-regions.js';
import {canStand} from '../src/collision.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const level=JSON.parse(readFileSync(join(root,'levels/poolrooms.json')));
assert.equal(level.id,'poolrooms-v1');
const scene=validateScene(buildPoolroomsScene(level,level.optics));
const world=createPoolroomsWorld(level,{});
for(const bookmark of bookmarks){
 const region=world.generate(bookmark.address),local=validateScene(region.scene(region.optics));
 assert(canStand(region.spawn.x,region.spawn.z,local.bounds,local.solids),`${bookmark.name}: blocked spawn`);
 assert(local.shapes.length<=80,`${bookmark.name}: resident shape budget exceeded`);
}
assert(level.spawn.x>scene.bounds.minX&&level.spawn.x<scene.bounds.maxX);
assert(level.spawn.z>scene.bounds.minZ&&level.spawn.z<scene.bounds.maxZ);
assert(level.spawn.y<scene.bounds.ceiling);
assert(level.optics.waterLevel>level.optics.waveAmplitude*1.07);
assert(level.optics.waterLevel+level.optics.waveAmplitude*1.07<level.spawn.y);
assert(level.optics.apertureWidth>0&&level.optics.apertureWidth<9);
assert(existsSync(join(root,`materials/${level.material}.wgsl`)));
const forbidden=/\.(png|jpe?g|webp|avif|gif|bmp|hdr|exr|ktx2?|dds|tiff?|ico)$/i;
const found=[];
function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','.runtime','.flops','dist'].includes(item.name))continue;const p=join(dir,item.name);if(item.isDirectory())scan(p);else if(forbidden.test(item.name))found.push(p);}}
scan(root);assert.deepEqual(found,[],'v1 forbids bitmap resource files in the source tree. Write evidence outside the repository.');
for(const name of ['common.wgsl','photons.wgsl','camera.wgsl','water-caustics.wgsl','diffuse-transfer.wgsl','compose-light.wgsl','reflection-filter.wgsl'])assert(!/textureSample|textureLoad/.test(readFileSync(join(root,'src/render',name),'utf8')),'Transport must not sample image assets.');
// The engine consumes a level module it is given; it never imports one.
for(const name of readdirSync(join(root,'src/render')))assert(!/from\s*["'][^"']*(levels|materials)\//.test(readFileSync(join(root,'src/render',name),'utf8')),`src/render/${name} imports level or material content directly.`);
console.log('v1 content valid: scene description, spawn, water envelope, aperture, material slot; renderer imports no level; zero bitmap resources.');
