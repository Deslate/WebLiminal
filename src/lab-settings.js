export const LAB_KEY='poolrooms-light-lab-main-v3';
export const LAB_FIELDS=[
 {key:'waterMode',group:'Water light',label:'Live water light',options:[['full','Full: reflection + transmission'],['transmission','Transmission only'],['off','Off: static cache + base ray tracing']],default:'full'},
 {key:'reflectionDepth',group:'Ray sampling',label:'Extra reflection continuation',options:[[0,'Level 0 (default)'],[1,'Level 1 · four-direction integral']],default:0},
 {key:'diffuseDirections',group:'Ray sampling',label:'Diffuse directions',options:[[32,'32'],[64,'64'],[128,'128'],[256,'256']],default:128},
 {key:'photonCount',group:'Ray sampling',label:'Cached photons / batch',options:[[49152,'49,152'],[98304,'98,304'],[196608,'196,608']],default:196608},
 {key:'skySamples',group:'Ray sampling',label:'Sky area samples',options:[[64,'64 points'],[256,'256 points'],[1024,'1024 points (default)']],default:1024},
 {key:'resolution',group:'Reception and reconstruction',label:'Internal resolution',options:[['auto','Adaptive (default)'],[1,'Fixed 100%'],[.75,'Fixed 75%'],[.5,'Fixed 50%']],default:'auto'},
 {key:'gridScale',group:'Reception and reconstruction',label:'Irradiance grid density',options:[[.5,'0.5× · pool floor 4.17cm'],[1,'1× · pool floor 2.08cm'],[1.5,'1.5× · pool floor 1.39cm']],default:1},
 {key:'filterScale',group:'Reception and reconstruction',label:'Photon reconstruction radius',options:[[.5,'0.5×'],[1,'1× (default)'],[1.5,'1.5×']],default:1},
];
export const LAB_DEFAULTS=Object.freeze(Object.fromEntries(LAB_FIELDS.map(f=>[f.key,f.default])));
export function normalizeLab(value={}){return Object.fromEntries(LAB_FIELDS.map(f=>[f.key,f.options.find(([v])=>String(v)===String(value?.[f.key]))?.[0]??f.default]));}
export function readLab(storage){try{
 const saved=storage.getItem(LAB_KEY);if(saved!==null&&saved!==undefined)return normalizeLab(JSON.parse(saved));
 const legacy=JSON.parse(storage.getItem('poolrooms-light-lab-main-v2')||'{}');
 // Upgrade the previous sky default without resetting unrelated saved controls.
 if(legacy?.skySamples===256)legacy.skySamples=1024;
 return normalizeLab(legacy);
}catch{return {...LAB_DEFAULTS};}}
export function saveLab(storage,value){try{storage.setItem(LAB_KEY,JSON.stringify(normalizeLab(value)));return true;}catch{return false;}}
