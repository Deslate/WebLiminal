from pathlib import Path
from PIL import Image
import numpy as np,json,sys
out={}
for folder in sys.argv[1:]:
 p=Path(folder);files=sorted((p/'frames').glob('frame-*.png'));last=None;mae=[];iso=[];means=[]
 for f in files:
  a=np.asarray(Image.open(f).convert('RGB'),np.float32);l=a@np.array([.2126,.7152,.0722],np.float32);c=l[1:-1,1:-1];near=np.maximum.reduce([l[:-2,1:-1],l[2:,1:-1],l[1:-1,:-2],l[1:-1,2:]]);iso.append(int((c-near>25).sum()));means.append(float(l.mean()))
  if last is not None:mae.append(float(abs(a-last).mean()))
  last=a
 r={'frames':len(files),'medianMAE':float(np.median(mae)),'p95MAE':float(np.percentile(mae,95)),'maxMAE':max(mae),'maxIsolated':max(iso),'isolatedFrames':[i for i,n in enumerate(iso) if n],'meanLuminance':float(np.mean(means))};(p/'metrics.json').write_text(json.dumps(r,indent=2));out[p.name]=r
print(json.dumps(out,indent=2))
