from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.22-evidence/final')
files=sorted((root/'frames').glob('frame-*.png'))
for name,indices in {'overview':range(0,len(files),30),'continuous':range(150,180),'late':range(420,450)}.items():
 sheet=Image.new('RGB',(1280,230*((len(indices)+3)//4)))
 for n,i in enumerate(indices):
  a=Image.open(files[i]);a.thumbnail((320,208));x=n%4*320;y=n//4*230;sheet.paste(a,(x,y+22));ImageDraw.Draw(sheet).text((x+5,y+5),f'{i/30:.3f}s',fill='white')
 sheet.save(root/f'{name}.png')
metrics=[];last=None
for i,f in enumerate(files):
 a=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32);l=a@np.array([.2126,.7152,.0722],dtype=np.float32);c=l[1:-1,1:-1];neighbours=np.maximum.reduce([l[1:-1,:-2],l[1:-1,2:],l[:-2,1:-1],l[2:,1:-1]])
 if last is not None:metrics.append({'frame':i,'mae':float(np.abs(a-last).mean()),'meanDelta':float(abs(a.mean()-last.mean())),'isolated':int(((c-neighbours)>25).sum())})
 last=a
(root/'image-metrics.json').write_text(json.dumps({'frames':len(files),'medianMAE':float(np.median([m['mae'] for m in metrics])),'maxMAE':max(m['mae'] for m in metrics),'maxIsolated':max(m['isolated'] for m in metrics),'perFrame':metrics},indent=2))
