from PIL import Image,ImageDraw
from pathlib import Path
import numpy as np,json
root=Path('../workroom-v1.21-evidence/motion');out=root/'review';out.mkdir(exist_ok=True)
files=sorted((root/'frames').glob('*.png'))
for name,indices in {'overview':range(0,len(files),30),'sun-static':range(40,70),'sun-moving':range(200,230),'sun-stop':range(450,480),'dark-moving':range(700,730)}.items():
 sheet=Image.new('RGB',(320*5,230*((len(indices)+4)//5)))
 for n,i in enumerate(indices):
  a=Image.open(files[i]).convert('RGB')
  if i>=540:a=Image.fromarray(np.uint8(np.minimum(np.array(a,dtype=float)*6,255)))
  a.thumbnail((320,208));x=n%5*320;y=n//5*230;sheet.paste(a,(x,y+22));ImageDraw.Draw(sheet).text((x+5,y+5),f'frame {i} / {i/30:.3f}s'+(' RGB x6' if i>=540 else ''),fill='white')
 sheet.save(out/f'{name}.png')
metrics=[];prev=None
for i,f in enumerate(files):
 a=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32);lum=a@np.array([.2126,.7152,.0722],dtype=np.float32)
 n=(lum[1:-1,:-2]+lum[1:-1,2:]+lum[:-2,1:-1]+lum[2:,1:-1])*.25
 isolated=int(np.sum((lum[1:-1,1:-1]-n>25)&(lum[1:-1,1:-1]>70)))
 if prev is not None and i!=540:metrics.append({'frame':i,'mae':float(np.abs(a-prev).mean()),'meanDelta':float(abs(a.mean()-prev.mean())),'isolatedBright':isolated})
 prev=a
r={k:{'medianMAE':float(np.median([m['mae'] for m in metrics if lo<=m['frame']<hi])),'maxMAE':max(m['mae'] for m in metrics if lo<=m['frame']<hi),'maxMeanDelta':max(m['meanDelta'] for m in metrics if lo<=m['frame']<hi),'maxIsolatedBright':max(m['isolatedBright'] for m in metrics if lo<=m['frame']<hi)} for k,lo,hi in [('sun',10,540),('dark',550,900)]}
(root/'analysis.json').write_text(json.dumps({'summary':r,'frames':metrics},indent=2));print(r)
