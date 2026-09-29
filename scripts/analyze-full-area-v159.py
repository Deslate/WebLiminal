"""Matched 22s first-person path. Statistics use raw luma, not encoded video."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
r=Path('../workroom-v1.59-evidence');out={'units':'display uint8 luma levels; mean normalized 0..1; not emitted energy','cases':{}}
for p in sorted(r.glob('*/manifest.json')):
 d=p.parent
 if not (d/'source-luma.npy').exists():continue
 a=np.load(d/'source-luma.npy',mmap_mode='r')[480:660];vout={}
 for k,(x,y,X,Y)in {'whole':(200,175,760,315),'dark':(650,190,900,320),'ceiling-interior':(200,35,760,100)}.items():
  v=a[:,y:Y,x:X].astype(float);delta=abs(v[3:]-v[:-3]);vout[k]={'mean':float(v.mean()/255),'p99':float(np.percentile(v,99)/255),'delta100msP99':float(np.percentile(delta,99)),'delta100msP999':float(np.percentile(delta,99.9)),'fractionAbove1':float((delta>1).mean()),'fractionAbove2':float((delta>2).mean()),'temporalStdRMS':float(np.sqrt(np.var(v,axis=0).mean()))}
 out['cases'][d.name]=vout
(r/'comparison.json').write_text(json.dumps(out,indent=2))
for name,v in out['cases'].items():print(name,[(k,a['delta100msP99'],round(a['temporalStdRMS'],5),round(a['fractionAbove1']*100,3))for k,a in v.items()])
names=[n for n in ['baseline','area','final'] if (r/n/'second-020.png').exists()]
if names:
 im=Image.new('RGB',(960*len(names),656),(18,18,18));dr=ImageDraw.Draw(im)
 for i,n in enumerate(names):im.paste(Image.open(r/n/'second-020.png'),(960*i,32));dr.text((960*i+10,10),n,fill='white')
 im.save(r/'door-comparison.png')
