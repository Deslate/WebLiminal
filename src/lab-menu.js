import {LAB_FIELDS,LAB_DEFAULTS} from './lab-settings.js';
export function createLabMenu({apply,getState}){
 const panel=document.createElement('section');panel.id='light-lab';panel.hidden=true;panel.setAttribute('aria-label','Light transport lab');
 panel.innerHTML='<header><div><small>LIGHT TRANSPORT LAB</small><h2>Light transport lab</h2></div><button type="button" data-close aria-label="Close lab">Close · G</button></header><p>Change one setting at a time and compare from the same spot. Switching resets lab time and light caches; the camera position is kept.</p><div data-fields></div><div class="lab-bottom"><button type="button" data-reset>Restore defaults</button><span data-resolution></span></div><p class="lab-note">Each row shows the measured cost of the whole current configuration, not of that option alone. High-cost options are for comparison and are not guaranteed to run in real time. With water light off the static cache is still used; this is not a full unbiased path trace.</p><p data-status role="status"></p>';
 const fields=panel.querySelector('[data-fields]');let group='';const controls=new Map();
 for(const f of LAB_FIELDS){if(f.group!==group){const h=document.createElement('h3');h.textContent=f.group;fields.append(h);group=f.group;}
  const row=document.createElement('label');row.className='lab-row';const title=document.createElement('span');title.textContent=f.label;const select=document.createElement('select');select.name=f.key;
  for(const [v,label]of f.options){const o=document.createElement('option');o.value=String(v);o.textContent=label;select.append(o);}
  const meter=document.createElement('output');meter.textContent='Waiting for measurement';row.append(title,select,meter);fields.append(row);controls.set(f.key,select);
  select.addEventListener('change',()=>change({...getState(),[f.key]:select.value}));
 }
 const status=panel.querySelector('[data-status]');let busy=false;
 function sync(){for(const[k,s]of controls)s.value=String(getState()[k]);}
 async function change(value){if(busy)return;busy=true;panel.setAttribute('aria-busy','true');for(const s of controls.values())s.disabled=true;panel.querySelector('[data-reset]').disabled=true;status.textContent='Switching and rebuilding caches…';
  try{const saved=await apply(value);status.textContent=saved?'Applied; kept after reload.':'Applied; the browser did not allow saving.';}catch(e){status.textContent='Switch failed: '+e.message;}
  finally{busy=false;panel.removeAttribute('aria-busy');for(const s of controls.values())s.disabled=false;panel.querySelector('[data-reset]').disabled=false;sync();}
 }
 function close(){panel.hidden=true;document.activeElement?.blur();}
 panel.querySelector('[data-close]').onclick=close;panel.querySelector('[data-reset]').onclick=()=>change({...LAB_DEFAULTS});document.body.append(panel);sync();
 let last=0;
 return {get isOpen(){return !panel.hidden;},toggle(){panel.hidden=!panel.hidden;if(!panel.hidden){sync();panel.querySelector('select').focus();}},close,sync,
  update({paused,frames,internal}){if(panel.hidden)return;const now=performance.now();if(now-last<500&&!paused)return;last=now;const dt=frames.slice(-60).map(f=>f.ms);const ms=dt.reduce((a,b)=>a+b,0)/dt.length;const text=paused?'Paused · no new frames':dt.length<12?'Waiting for stable frames…':`${(1000/ms).toFixed(1)} fps / ${ms.toFixed(1)} ms`;for(const meter of panel.querySelectorAll('output'))meter.textContent=text;panel.querySelector('[data-resolution]').textContent=`Internal ${internal.join(' × ')}`;}
 };
}
