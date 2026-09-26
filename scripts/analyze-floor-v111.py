"""Image diagnostics; not a universal proof of flicker absence."""
from pathlib import Path
import json,sys
import numpy as np
from PIL import Image
p=Path(sys.argv[1]);prev=None;deltas=[];fire=[];means=[]
for f in sorted((p/'floor-frames').glob('*.png')):
 y=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32)@np.array([.2126,.7152,.0722],dtype=np.float32)
 means.append(float(y.mean()))
 if prev is not None:deltas.append(float(np.abs(y-prev).mean()))
 c=y[1:-1,1:-1];n=[y[j:y.shape[0]-2+j,i:y.shape[1]-2+i] for j in range(3) for i in range(3) if (i,j)!=(1,1)]
 fire.append(int(((c>=75)&(sum(n)/8<50)&(c-np.maximum.reduce(n)>=25)).sum()));prev=y
r={'frames':len(means),'stepSeconds':.04,'maxIsolatedBrightPixels':max(fire),'adjacentLuminanceMAE255':{'median':float(np.median(deltas)),'max':max(deltas),'min':min(deltas)},'meanLuminanceRange':[min(means),max(means)],'limits':'Includes real caustic, camera and .004 film-grain changes. Stepped frames are not a live FPS benchmark; inspect images too.'}
(p/'floor-image-analysis.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
