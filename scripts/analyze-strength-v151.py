"""Matched transport rollback strength metrics. Diagnostic only, no image alteration."""
from pathlib import Path
import sys,json,numpy as np
from PIL import Image,ImageDraw
r=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.51-evidence/ab');h,w=416,640
meta=np.fromfile(sys.argv[2] if len(sys.argv)>2 else '../workroom-v1.51-evidence/benchmark/masks/dark-wall-ceiling.f32',np.float32).reshape(h,w,4)
sid=np.rint(meta[:,:,0]).astype(int)-1
base=np.load(r/'current/source-luma.npy').astype('float32')/255
reference=np.load(r/'no-reflected-water/source-luma.npy').astype('float32')/255 if (r/'no-reflected-water/snapshot.json').exists() else base
mean=reference.mean(0); eligible=(sid>=0)&(meta[:,:,3]<.5)
# Fixed masks from current source, shared by all variants. Exclude aperture/sky/water.
masks={'dark':eligible&(mean<.30)&(mean>2/255),'veryDark':eligible&(mean<.15)&(mean>2/255),'brighterSolid':(sid>=0)&(mean>=.30)}
report={'maskDefinition':'Same geometric masks for all variants. Dark: no-reflected-water reference mean display luma 2/255..0.30, no direct sun; veryDark <0.15; brighterSolid >=0.30. Luma is display-referred, not radiometric energy. Temporal p95-p05 measures full oscillation amplitude, not 100ms flicker. Spatial p95-p05 mixes illumination gradient/material; paired no-reflected-water control isolates that path.','regions':{k:int(v.sum()) for k,v in masks.items()},'cases':{}}
no=np.load(r/'no-reflected-water/source-luma.npy').astype('float32')/255 if (r/'no-reflected-water/snapshot.json').exists() else None
for d in r.iterdir():
 if not (d/'snapshot.json').exists():continue
 a=np.load(d/'source-luma.npy').astype('float32')/255;stats={}
 for name,mask in masks.items():
  v=a[:,mask];amp=np.percentile(v,95,axis=0)-np.percentile(v,5,axis=0)
  q={'mean':float(v.mean()),'p99':float(np.percentile(v,99)),'spatialRange95_05':float(np.mean(np.percentile(v,95,axis=1)-np.percentile(v,5,axis=1))),'temporalAmplitudeP95':float(np.percentile(amp,95)),'temporalAmplitudeMean':float(amp.mean()),'sameTimeMAE':float(abs(a-base)[:,mask].mean())}
  if no is not None:
   pairedPath=r/'all-four-no-reflected-water'/'source-luma.npy'
   paired=np.load(pairedPath).astype('float32')/255 if d.name=='all-four' and (r/'all-four-no-reflected-water'/'snapshot.json').exists() else no
   effect=np.maximum(a-paired,0)[:,mask];q.update(reflectionAddedMean=float(effect.mean()),reflectionAddedP99=float(np.percentile(effect,99)),reflectionAddedOver10PctFraction=float((effect>.1).mean()))
  q['reflectionAttributionValid']=d.name in ['current','no-reflected-water'] or (d.name=='all-four' and (r/'all-four-no-reflected-water'/'snapshot.json').exists())
  stats[name]=q
 report['cases'][d.name]=stats
(r/'strength.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
folders=[d for d in r.iterdir() if (d/'snapshot.json').exists()]
canvas=Image.new('RGB',(1280,448*((len(folders)+1)//2)));dr=ImageDraw.Draw(canvas)
for i,d in enumerate(folders):
 x=i%2*640;y=i//2*448;canvas.paste(Image.open(d/'second-001.png'),(x,y+32));dr.text((x+8,y+8),d.name,fill='white')
canvas.save(r/'matched-strength.jpg')
