export const LAB_KEY='poolrooms-light-lab-v1';
export const LAB_FIELDS=[
 {key:'waterMode',group:'水光通道',label:'实时水光',options:[['full','全开：反射 + 透射'],['transmission','只留透射'],['off','全关：静态缓存 + 基础光追']],default:'transmission'},
 {key:'reflectionDepth',group:'光追采样',label:'额外反射续追',options:[[0,'0 级（现状）'],[1,'1 级 · 四方向积分']],default:0},
 {key:'diffuseDirections',group:'光追采样',label:'漫反射方向',options:[[32,'32'],[64,'64'],[128,'128'],[256,'256']],default:128},
 {key:'photonCount',group:'光追采样',label:'缓存光子 / 批',options:[[49152,'49,152'],[98304,'98,304'],[196608,'196,608']],default:196608},
 {key:'skySamples',group:'光追采样',label:'天光面积采样',options:[[64,'64 点'],[256,'256 点']],default:256},
 {key:'resolution',group:'接收与重建',label:'内部分辨率',options:[['auto','自适应（默认）'],[1,'固定 100%'],[.75,'固定 75%'],[.5,'固定 50%']],default:'auto'},
 {key:'gridScale',group:'接收与重建',label:'照度格线密度',options:[[.5,'0.5× · 池底 4.17cm'],[1,'1× · 池底 2.08cm'],[1.5,'1.5× · 池底 1.39cm']],default:1},
 {key:'filterScale',group:'接收与重建',label:'光子重建范围',options:[[.5,'0.5×'],[1,'1×（默认）'],[1.5,'1.5×']],default:1},
];
export const LAB_DEFAULTS=Object.freeze(Object.fromEntries(LAB_FIELDS.map(f=>[f.key,f.default])));
export function normalizeLab(value={}){return Object.fromEntries(LAB_FIELDS.map(f=>[f.key,f.options.find(([v])=>String(v)===String(value?.[f.key]))?.[0]??f.default]));}
export function readLab(storage){try{return normalizeLab(JSON.parse(storage.getItem(LAB_KEY)||'{}'));}catch{return {...LAB_DEFAULTS};}}
export function saveLab(storage,value){try{storage.setItem(LAB_KEY,JSON.stringify(normalizeLab(value)));return true;}catch{return false;}}
