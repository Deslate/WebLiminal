from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
r=Path('../workroom-v1.25-evidence');sets={
 'v123-normal':r/'appearance/v123-normal/frames',
 'v125-normal':r/'appearance/v125-normal/frames',
 'v123-floor':Path('../workroom-v1.23-evidence/final-footprint/frames'),
 'v125-floor':r/'appearance/v125-floor/frames'}
out={}
for name,path in sets.items():
 files=sorted(path.glob('frame-*.png'));expected=600 if 'floor' in name else 300
 if len(files)!=expected:raise RuntimeError(f'{name}: {len(files)}/{expected} frames')
 last=None;metrics=[];ts=[]
 for i,f in enumerate(files):
  a=np.asarray(Image.open(f).convert('RGB'),np.float32);l=a@np.array([.2126,.7152,.0722],np.float32);c=l[1:-1,1:-1];near=np.maximum.reduce([l[:-2,1:-1],l[2:,1:-1],l[1:-1,:-2],l[1:-1,2:]]);ts.append(l[::8,::8].ravel())
  if last is not None:metrics.append({'frame':i,'mae':float(abs(a-last).mean()),'isolated':int((c-near>25).sum())})
  last=a
 a=np.array(ts);a-=a.mean(0);ft=abs(np.fft.rfft(a*np.hanning(len(a))[:,None],axis=0))**2;freq=np.fft.rfftfreq(len(a),1/30)
 out[name]={'frames':len(files),'medianMAE':float(np.median([m['mae'] for m in metrics])),'maxMAE':max(m['mae'] for m in metrics),'maxIsolated':max(m['isolated'] for m in metrics),'isolatedFrames':[m for m in metrics if m['isolated']],'above5HzFraction':float(ft[freq>5].sum()/ft.sum()),'perFrame':metrics}
 sheet=Image.new('RGB',(1280,230*((len(files)//30+3)//4)))
 for n,i in enumerate(range(0,len(files),30)):
  im=Image.open(files[i]);im.thumbnail((320,208));sheet.paste(im,(n%4*320,n//4*230+22));ImageDraw.Draw(sheet).text((n%4*320+4,n//4*230+4),f'{name}, {i/30:.1f}s, appearance ONLY',fill='white')
 sheet.save(r/f'{name}-overview.png')
(r/'appearance-metrics.json').write_text(json.dumps(out,indent=2))
print(json.dumps({n:{k:v for k,v in a.items() if k!='perFrame'} for n,a in out.items()},indent=2))
