from pathlib import Path
from PIL import Image,ImageDraw,ImageEnhance
import numpy as np,json,subprocess
p=Path('../workroom-v1.20-evidence/hq-motion');fs=sorted((p/'frames').glob('frame-*.png'));assert len(fs)==720
for label,indices in [('overview',list(range(0,720,30))),('start',list(range(110,140))),('walk',list(range(350,380))),('stop',list(range(590,620)))]:
 for start in range(0,len(indices),24):
  c=Image.new('RGB',(1536,1368),'#161616');d=ImageDraw.Draw(c)
  for j,i in enumerate(indices[start:start+24]):
   im=ImageEnhance.Brightness(Image.open(fs[i]).convert('RGB')).enhance(6).resize((384,208));x=j%4*384;y=j//4*228;c.paste(im,(x,y+20));d.text((x+4,y+3),f'lossless {i}/720 t={i/30:.3f}s | RGB x6',fill='white')
  c.save(p/f'review-{label}-{start}.jpg',quality=96)
means=[];adj=[];isolated=[];prev=None
for f in fs:
 a=np.array(Image.open(f).convert('RGB'),dtype=np.float32);lum=a@np.array([.2126,.7152,.0722],np.float32);means.append(float(lum.mean()))
 if prev is not None:adj.append(float(np.abs(lum-prev).mean()))
 center=lum[1:-1,1:-1];neighbors=[lum[y:y+lum.shape[0]-2,x:x+lum.shape[1]-2] for y in range(3) for x in range(3) if (x,y)!=(1,1)];isolated.append(int(np.sum((center>=75)&(sum(neighbors)/8<50)&(center-np.maximum.reduce(neighbors)>=25))));prev=lum
r={'frames':len(fs),'seconds':24,'fpsOfSequence':30,'maximumIsolatedBrightPixels':max(isolated),'maxAdjacentMeanLumaChange255':float(np.max(abs(np.diff(means)))),'medianAdjacentMAE255':float(np.median(adj)),'maxAdjacentMAE255':max(adj),'limits':'Pixel heuristics include physical movement/grain and do not prove no flicker. All lossless frames retained; images inspected separately.'};(p/'analysis.json').write_text(json.dumps(r,indent=2));print(r)
