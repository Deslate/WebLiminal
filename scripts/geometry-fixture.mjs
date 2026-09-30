import {readFileSync} from 'node:fs';
import {buildPoolroomsScene} from '../levels/poolrooms-scene.js';
import {packScene} from '../src/render/scene.js';
const level=JSON.parse(readFileSync(new URL('../levels/poolrooms.json',import.meta.url)));
export const poolroomsScene=(apertureWidth,apertureDepth)=>buildPoolroomsScene(level,{apertureWidth,apertureDepth});
export const makeGeometry=(apertureWidth,apertureDepth,gridScale)=>packScene(poolroomsScene(apertureWidth,apertureDepth),gridScale);
