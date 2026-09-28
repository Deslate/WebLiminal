"""Summarize actual hardware counters and untouched consecutive-frame captures."""
import json, pathlib, numpy as np
from PIL import Image, ImageDraw, ImageFont
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=pathlib.Path(__file__).resolve().parents[2]/'workroom-v1.35-evidence'
r=json.loads((p/'measurements.json').read_text())
keys=['closedBefore','active','paused','resumed','closedAfter']
stats={k:{'median':float(np.median([x['Device Utilization %'] for x in r[k]])), 'mean':float(np.mean([x['Device Utilization %'] for x in r[k]])), 'range':[min(x['Device Utilization %'] for x in r[k]),max(x['Device Utilization %'] for x in r[k])]} for k in keys}
a=np.array(Image.open(p/'paused.png')).astype(float)
continuity=[];previous=a
for i,x in enumerate(r['resumeFrames']):
 b=np.array(Image.open(p/f'resume-{i}.png')).astype(float)
 continuity.append({'frame':i,'simulationTime':x['t'],'deltaFromPause':x['t']-r['pauseStart']['elapsed'],'pixelMAE8bit':float(abs(b-previous).mean()),'maxPixelDelta':float(abs(b-previous).max())});previous=b
summary={'gpu':stats,'beforeFPS':r['beforeFPS'],'resumedFPS':r['resumedFPS'],'pausedGPUsubmissions':r['pauseEnd']['submits']-r['pauseStart']['submits'],'pausedDurationSeconds':(r['paused'][-1]['wall']-r['paused'][0]['wall'])/1000,'simulationTimeDuringPause':[r['pauseStart']['elapsed'],r['pauseEnd']['elapsed']],'continuity':continuity}
(p/'summary.json').write_text(json.dumps(summary,indent=2))
fig,ax=plt.subplots(figsize=(10,3.8));offset=0
for key,label,color in zip(keys,['Closed before','Running','Paused','Resumed','Closed after'],['#95a5a6','#198a95','#588b4f','#198a95','#95a5a6']):
 v=[x['Device Utilization %'] for x in r[key]];xs=np.arange(len(v))+offset
 ax.plot(xs,v,'o-',color=color,label=f'{label} (median {stats[key]["median"]:g}%)');ax.axvspan(offset-.4,offset+len(v)-.6,color=color,alpha=.08);offset+=len(v)+1
ax.set(ylim=(-3,103),ylabel='Whole-machine GPU utilization (%)',xlabel='Sequential hardware samples (1 second apart; stage gaps omitted)',title='ESC pause: AGX driver utilization, same machine and session')
ax.legend(ncol=3,fontsize=8);ax.grid(alpha=.15);fig.tight_layout();fig.savefig(p/'gpu-utilization.png',dpi=180);plt.close(fig)
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',17)
board=Image.new('RGB',(1800,940),'#17232b');draw=ImageDraw.Draw(board)
for n,idx in enumerate([-1,0,1,2,3,4]):
 x=n%3*600;y=n//3*470
 im=Image.open(p/('paused.png' if idx<0 else f'resume-{idx}.png')).convert('RGB');im=im.crop((620,190,1220,620))
 board.paste(im,(x,y+40));label='Paused (retained frame)' if idx<0 else f'Resume {idx}: +{continuity[idx]["deltaFromPause"]*1000:.1f} ms'
 draw.text((x+12,y+12),label,font=font,fill='white')
board.save(p/'resume-contact-sheet.png')
print(json.dumps(summary,indent=2))
