"""Same ROIs/thresholds as v1.56. Luma metrics are display-space, not energy."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
r=Path('../workroom-v1.57-evidence');old=Path('../workroom-v1.56-evidence');nl=Path('../workroom-v1.54-evidence/after')
files={'main':Path('../workroom-v1.55-evidence/main.png'),'no-live':Path('../workroom-v1.55-evidence/candidate.png'),'before':old/'reference/transmission.png','after':r/'reference/transmission.png'}
res={'units':'display sRGB luma, not radiometric energy','reference':{},'door':{},'benchmark':{}}
for name,f in files.items():
 a=np.asarray(Image.open(f).convert('RGB'))@np.array([.2126,.7152,.0722])/255;res['reference'][name]={}
 for k,(x,y,X,Y)in {'patch':(1400,820,1780,860),'dark-water':(180,900,900,1120),'ceiling':(1200,30,1550,100),'column':(1230,520,1320,740)}.items():
  v=a[y:Y,x:X];res['reference'][name][k]={'mean':float(v.mean()),'p99':float(np.percentile(v,99)),'cv':float(v.std()/v.mean())}
canvas=Image.new('RGB',(1920,1264),(20,20,20));d=ImageDraw.Draw(canvas)
for i,(name,f)in enumerate(files.items()):
 x=i%2*960;y=i//2*632;canvas.paste(Image.open(f).resize((960,600)),(x,y+32));d.text((x+12,y+10),name,fill='white')
canvas.save(r/'reference-comparison.png')
for name,folder in [('no-live',nl),('before',old/'after'),('after',r/'after')]:
 a=np.load(folder/'source-luma.npy',mmap_mode='r')[480:660];res['door'][name]={}
 for k,(x,y,X,Y)in {'whole':(200,175,760,315),'dark':(650,190,900,320),'ceiling-interior':(200,35,760,100)}.items():
  v=a[:,y:Y,x:X].astype(float)/255;res['door'][name][k]={'mean':float(v.mean()),'p99':float(np.percentile(v,99)),'delta100msP99':float(np.percentile(abs(v[3:]-v[:-3]),99)),'temporalStdRMS':float(np.sqrt(np.var(v,axis=0).mean()))}
for label in ['floor','ceiling','second-015','second-020']:
 canvas=Image.new('RGB',(2880,656),(20,20,20));d=ImageDraw.Draw(canvas)
 for i,(name,folder)in enumerate([('no-live',nl),('before',old/'after'),('after',r/'after')]):
  canvas.paste(Image.open(folder/(label+'.png')),(i*960,32));d.text((i*960+12,10),name,fill='white')
 canvas.save(r/(label+'-comparison.png'))
if (r/'benchmark/masks/door-interior.f32').exists():
 m=json.load(open(r/'benchmark/current/manifest.json'));refmask=np.load('../workroom-v1.51-evidence/benchmark/static-light/source-luma.npy',mmap_mode='r')
 cases={'before':old/'benchmark/current','after':r/'benchmark/current','no-live':Path('../workroom-v1.54-evidence/benchmark/current')}
 arrays={k:np.load(v/'source-luma.npy',mmap_mode='r')for k,v in cases.items()}
 for seg in m['segments']:
  if not seg.get('hold')or seg['name']=='water-body':continue
  lo=round((seg['start']+1)*30);hi=round(seg['end']*30);md=np.fromfile(r/'benchmark/masks'/(seg['name']+'.f32'),np.float32).reshape(416,640,4);sid=np.rint(md[:,:,0]).astype(int)-1;mask=(sid>=0)&(md[:,:,3]<.5)
  if 'door-interior'in seg['name']:mask&=(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
  sm=refmask[lo:hi].mean(0)/255;mask&=(sm>2/255)&(sm<.30);res['benchmark'][seg['name']]={}
  for name,a in arrays.items():
   v=a[lo:hi][:,mask].astype(float)/255;med=float(np.median(v));p99=float(np.percentile(v,99));res['benchmark'][seg['name']][name]={'mean':float(v.mean()),'median':med,'p99':p99,'contrast':p99/med,'delta100msP99':float(np.percentile(abs(v[3:]-v[:-3]),99))}
(r/'comparison.json').write_text(json.dumps(res,indent=2));print(json.dumps(res,indent=2))
