import {LAB_FIELDS,LAB_DEFAULTS} from './lab-settings.js';
export function createLabMenu({apply,getState}){
 const panel=document.createElement('section');panel.id='light-lab';panel.hidden=true;panel.setAttribute('aria-label','光传输实验台');
 panel.innerHTML='<header><div><small>LIGHT TRANSPORT LAB</small><h2>光传输实验台</h2></div><button type="button" data-close aria-label="关闭实验台">关闭 · G</button></header><p>一次只改一项，比较同一位置。切档重置实验时间与光照缓存，保留机位。</p><div data-fields></div><div class="lab-bottom"><button type="button" data-reset>恢复本轮默认组合</button><span data-resolution></span></div><p class="lab-note">各行耗时是当前整组配置的实测，不是单项独立耗时。高成本档用于对照，不保证实时。全关水光仍保留静态缓存；不是完整无偏光追。</p><p data-status role="status"></p>';
 const fields=panel.querySelector('[data-fields]');let group='';const controls=new Map();
 for(const f of LAB_FIELDS){if(f.group!==group){const h=document.createElement('h3');h.textContent=f.group;fields.append(h);group=f.group;}
  const row=document.createElement('label');row.className='lab-row';const title=document.createElement('span');title.textContent=f.label;const select=document.createElement('select');select.name=f.key;
  for(const [v,label]of f.options){const o=document.createElement('option');o.value=String(v);o.textContent=label;select.append(o);}
  const meter=document.createElement('output');meter.textContent='等待实测';row.append(title,select,meter);fields.append(row);controls.set(f.key,select);
  select.addEventListener('change',()=>change({...getState(),[f.key]:select.value}));
 }
 const status=panel.querySelector('[data-status]');let busy=false;
 function sync(){for(const[k,s]of controls)s.value=String(getState()[k]);}
 async function change(value){if(busy)return;busy=true;panel.setAttribute('aria-busy','true');for(const s of controls.values())s.disabled=true;panel.querySelector('[data-reset]').disabled=true;status.textContent='正在切换并建立缓存…';
  try{const saved=await apply(value);status.textContent=saved?'已生效，刷新后保留。':'已生效；浏览器未允许保存。';}catch(e){status.textContent='切换失败：'+e.message;}
  finally{busy=false;panel.removeAttribute('aria-busy');for(const s of controls.values())s.disabled=false;panel.querySelector('[data-reset]').disabled=false;sync();}
 }
 function close(){panel.hidden=true;document.activeElement?.blur();}
 panel.querySelector('[data-close]').onclick=close;panel.querySelector('[data-reset]').onclick=()=>change({...LAB_DEFAULTS});document.body.append(panel);sync();
 let last=0;
 return {get isOpen(){return !panel.hidden;},toggle(){panel.hidden=!panel.hidden;if(!panel.hidden){sync();panel.querySelector('select').focus();}},close,sync,
  update({paused,frames,internal}){if(panel.hidden)return;const now=performance.now();if(now-last<500&&!paused)return;last=now;const dt=frames.slice(-60).map(f=>f.ms);const ms=dt.reduce((a,b)=>a+b,0)/dt.length;const text=paused?'已暂停 · 无新帧':dt.length<12?'等待稳定帧…':`${(1000/ms).toFixed(1)} fps / ${ms.toFixed(1)} ms`;for(const meter of panel.querySelectorAll('output'))meter.textContent=text;panel.querySelector('[data-resolution]').textContent=`内部 ${internal.join(' × ')}`;}
 };
}
