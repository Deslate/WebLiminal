from pathlib import Path
import numpy as np,json
from PIL import Image,ImageDraw
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('../workroom-v1.45-evidence');roi=(slice(24,140),slice(335,420));w=np.array([.2126,.7152,.0722]);data={};arrays={}
for name in ['before','after']:
 files=sorted((root/f'wall-{name}-60').glob('*.f32'))
 if not files:continue
 a=np.stack([(np.fromfile(f,np.float32).reshape(147,648,4)[:,:,:3]@w)[roi] for f in files]);arrays[name]=a;d=np.diff(a,axis=0);s=np.sum(abs(np.fft.rfft((a-a.mean(0))*np.hanning(len(a))[:,None,None],axis=0))**2,(1,2));fr=np.fft.rfftfreq(len(a),1/30)
 data[name]={'samples':len(a),'mean':float(a.mean()),'spatialCV':float(np.mean(np.std(a,axis=(1,2))/np.mean(a,axis=(1,2)))),'temporalDeltaRMS_percentMean':float(np.sqrt(np.mean(d*d))/a.mean()*100),'temporalCentroidHz':float((s*fr).sum()/s.sum()),'powerAbove4Hz_percent':float(s[fr>4].sum()/s.sum()*100),'powerAbove8Hz_percent':float(s[fr>8].sum()/s.sum()*100),'peak':float(a.max()),'maxOneFrameDelta':float(np.max(abs(d))),'delta100msP999':float(np.percentile(abs(a[3:]-a[:-3]),99.9)),'delta100msMax':float(np.max(abs(a[3:]-a[:-3]))),'delta100msAbove_0_5_count':int(np.sum(abs(a[3:]-a[:-3])>.5))}
(root/'wall-metrics.json').write_text(json.dumps(data,indent=2));print(json.dumps(data,indent=2))
if len(arrays)==2:
 fig,axs=plt.subplots(2,2,figsize=(11,9));extent=[-17+335/24,-17+420/24,24*6.1/147,140*6.1/147]
 for j,(name,a) in enumerate(arrays.items()):
  axs[0,j].imshow(a[0],origin='lower',extent=extent,vmin=0,vmax=1.5,cmap='gray');axs[0,j].set_title(name+' / linear 0–1.5');axs[1,j].imshow(np.log1p(a[0]/.025),origin='lower',extent=extent,vmin=0,vmax=np.log1p(1.5/.025),cmap='gray');axs[1,j].set_title(name+' / log(1+E/0.025)')
  for i in range(2):axs[i,j].set(xlabel='Wall z / m',ylabel='Height / m')
 fig.tight_layout();fig.savefig(root/'wall-linear-log.png',dpi=150);plt.close(fig)
 fig,axs=plt.subplots(1,2,figsize=(12,4));idx=np.unravel_index(np.var(arrays['before'],axis=0).argmax(),arrays['before'].shape[1:])
 for name,a in arrays.items():
  axs[0].plot(60+np.arange(len(a))/30,a[:,idx[0],idx[1]],label=name);s=np.sum(abs(np.fft.rfft((a-a.mean(0))*np.hanning(len(a))[:,None,None],axis=0))**2,(1,2));fr=np.fft.rfftfreq(len(a),1/30);axs[1].plot(fr[1:],s[1:]/s[1:].sum(),label=name)
 axs[0].set(xlabel='Time / s',ylabel='Linear irradiance',title='Same fixed wall receiver');axs[1].set(xlabel='Hz',ylabel='Fraction of temporal power');axs[0].legend();axs[1].legend();fig.tight_layout();fig.savefig(root/'wall-temporal.png',dpi=150);plt.close(fig)
 for frame in ['000','120','240']:
  paths=[root/f'wall-{n}-60/{frame}.png' for n in ['before','after']]
  if all(p.exists() for p in paths):
   im=Image.new('RGB',(1600,550));dr=ImageDraw.Draw(im)
   for j,p in enumerate(paths):im.paste(Image.open(p).resize((800,520)),(800*j,30));dr.text((800*j+10,10),['BEFORE','AFTER'][j])
   im.save(root/f'wall-view-{frame}.png')
# Water persistence: same spectrum window and physical units in both versions.
p=root/'mechanism/metrics.json'
if p.exists():
 q=json.loads(p.read_text());fig,axs=plt.subplots(1,3,figsize=(13,4))
 for name in ['baseline','after','unforced']:
  if name not in q:continue
  ts=sorted(int(t) for t in q[name] if int(t)>0)
  for ax,key in zip(axs,['shortPower','longPower','normalDeg']):ax.plot(ts,[q[name][str(t)][key] for t in ts],'-o',label=name)
 for ax,title in zip(axs,['Short-wave power (2–6 cycles/m)','Long-wave power (<1 cycle/m)','Normal RMS / degrees']):ax.set(xlabel='Scene time / s',title=title);ax.legend()
 fig.tight_layout();fig.savefig(root/'water-persistence.png',dpi=150);plt.close(fig)
