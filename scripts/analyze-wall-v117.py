import json, numpy as np
from pathlib import Path
from PIL import Image,ImageDraw
root=Path('../workroom-v1.17-evidence');results={}
for label in ['before','area4','dark-before','dark-after']:
 p=root/label;fs=sorted(f for f in p.glob('receivers-*.json') if f.stem!='receivers-0');data=[json.loads(f.read_text()) for f in fs]
 if not data:continue
 results[label]={}
 for sid in ['10','18','32','40']:
  d=data[0][sid];a=np.array([f[sid]['irradiance'] for f in data],np.float32).reshape(len(data),d['ny'],d['nx'],4)
  y=a[:,:,:,:3]@np.array([.2126,.7152,.0722]);mx=y.max(0);rng=np.ptp(y,axis=0)
  yy=(np.arange(d['ny'])+.5)*6.1/d['ny'];xx=(np.arange(d['nx'])+.5)*(27 if sid in ['10','18'] else 14)/d['nx']+(-17 if sid in ['10','18'] else -7);mask=np.broadcast_to(((yy>.5)&(yy<5.75))[:,None],mx.shape).copy()
  if sid in ['10','18']:mask &= ~(((xx>-3.65)&(xx<-2.85))|((xx>-11.6)&(xx<-10.8)))[None,:]
  results[label][sid]={'visibleZeroFraction':float(np.mean(mx[mask]==0)),'visibleVaryingFraction1e6':float(np.mean(rng[mask]>1e-6)),'samples':len(fs),'zeroFraction':float(np.mean(mx==0)),'varyingFraction1e6':float(np.mean(rng>1e-6)),'meanRange':float(rng.mean()),'maxRange':float(rng.max())}
  if sid=='18':
   rgb=np.stack([np.clip(np.log1p(mx)*130,0,255),np.clip(np.log1p(rng)*250,0,255),np.zeros_like(mx)],-1).astype('uint8');Image.fromarray(rgb[::-1]).resize((1296,294)).save(p/'receiver-envelope.png')
 print(label,results[label])
(root/'coverage-analysis.json').write_text(json.dumps(results,indent=2))
