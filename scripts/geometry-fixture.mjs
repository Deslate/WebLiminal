import {readFileSync} from 'node:fs';
const level=JSON.parse(readFileSync(new URL('../levels/poolrooms.json',import.meta.url)));
const source=readFileSync(new URL('../src/render/geometry.js',import.meta.url),'utf8').replace('import level from "../../levels/poolrooms.json";',`const level=${JSON.stringify(level)};`).replace('"./light-atlas.js"',JSON.stringify(new URL('../src/render/light-atlas.js',import.meta.url).href));
export const {makeGeometry}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
