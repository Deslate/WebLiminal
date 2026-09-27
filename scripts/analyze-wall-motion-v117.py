from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
p=Path('../workroom-v1.17-evidence/motion');report=[]
for mode in [0,1]:
 fs=sorted(p.glob(f'mode{mode}-*.png'));diff=[];isolated=[];prev=None
 for i,f in enumerate(fs):
  a=np.asarray(Image.open(f),np.float32)[:,:,:3]@np.array([.2126,.7152,.0722],np.float32)
  if prev is not None:diff.append(float(np.mean(abs(a-prev))))
  prev=a;c=a[1:-1,1:-1];ns=[a[y:y+a.shape[0]-2,x:x+a.shape[1]-2]for y in range(3)for x in range(3)if(x,y)!=(1,1)];isolated.append(int(((c>75)&(c-np.maximum.reduce(ns)>25)).sum()))
 for start in range(0,len(fs),20):
  im=Image.new('RGB',(1600,1410),'#121212');d=ImageDraw.Draw(im)
  for j,f in enumerate(fs[start:start+20]):
   x=j%4*400;y=j//4*282;im.paste(Image.open(f).convert('RGB').resize((400,260)),(x,y+20));d.text((x+3,y+2),f.stem,fill='white')
  im.save(p/f'review-mode{mode}-{start//20}.jpg',quality=95)
 report.append({'mode':mode,'frames':len(fs),'hz':60,'medianMAE':float(np.median(diff)),'maxMAE':max(diff),'maxIsolatedBrightPixels':max(isolated)})
(p/'analysis.json').write_text(json.dumps(report,indent=2))
