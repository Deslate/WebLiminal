"""Matched before/after display metrics; never confuse these with flux."""
import json,sys,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
r=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.53-evidence/benchmark')
a=np.load(r/'legacy-energy/source-luma.npy',mmap_mode='r');b=np.load(r/'current/source-luma.npy',mmap_mode='r');st=np.load(os.environ.get('STATIC_REFERENCE',r/'static-light/source-luma.npy'),mmap_mode='r')
m=json.loads((r/'current/manifest.json').read_text());out={}
for s in m['segments']:
 if not s.get('hold'):continue
 lo=int((s['start']+1)*30);hi=int(s['end']*30)
 md=np.fromfile(r/'masks'/(s['name']+'.f32'),np.float32).reshape(416,640,4);sid=np.rint(md[:,:,0]).astype(int)-1
 mask=(sid>=0)&(md[:,:,3]<.5)
 if 'door-interior' in s['name']:mask&=(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
 sm=st[lo:hi].mean(0)/255;mask&=(sm>2/255)&(sm<.30)
 def stats(v):
  x=v[lo:hi][:,mask].astype(float)/255
  if not x.size:return {}
  med=float(np.median(x));p99=float(np.percentile(x,99));return {'median':med,'p99':p99,'p99MinusMedian':p99-med,'p99OverMedian':p99/med if med else None,'mean':float(x.mean())}
 out[s['name']]={'pixels':int(mask.sum()),'before':stats(a),'after':stats(b)}
if os.environ.get('STATIC_REFERENCE'):
 (r.parent/'display-original-mask.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2));sys.exit()
for t in [0,8,22,28,44,69]:
 c=Image.new('RGB',(1280,450));d=ImageDraw.Draw(c)
 for j,(folder,label) in enumerate([('legacy-energy','Before'),('current','After')]):
  c.paste(Image.open(r/folder/f'second-{t:03d}.png'),(640*j,34));d.text((640*j+12,10),f'{label} | same camera, exposure, simulation | t={t}s')
 c.save(r.parent/f'comparison-{t:02d}s.png')
(r.parent/'display-comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
# Decode both delivered videos; juxtapose the untouched same-time RGB frames.
import av
clips=[]
for folder in ['legacy-energy','current']:
 c=av.open(str(r/folder/'roam.mp4'));clips.append([f.to_ndarray(format='rgb24') for i,f in enumerate(c.decode(video=0)) if 66*30<=i<72*30]);c.close()
c=av.open(str(r.parent/'ceiling-before-after.mp4'),'w');v=c.add_stream('libx264',rate=30);v.width=1280;v.height=416;v.pix_fmt='yuv420p';v.options={'crf':'12'}
for aa,bb in zip(*clips):
 f=av.VideoFrame.from_ndarray(np.concatenate([aa,bb],axis=1),format='rgb24')
 for p in v.encode(f):c.mux(p)
for p in v.encode():c.mux(p)
c.close()
