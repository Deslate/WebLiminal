import numpy as np,json,os
from pathlib import Path
from scipy.ndimage import label
from PIL import Image,ImageDraw
r=Path(os.environ.get('EVIDENCE_DIR','../workroom-v1.26-evidence/irradiance'));out={}
for name in ['baseline','trial050','final']:
 if not (r/f'{name}.json').exists():continue
 info=json.loads((r/f'{name}.json').read_text());v={'totalEnergy':info['solar']['integratedLuminance']}
 for patch,width in [('main',2),('focus',.25)]:
  a=np.fromfile(r/f'{name}-{patch}.f32',np.float32).reshape(512,512);g=np.gradient(a,width/511);grad=np.sqrt(np.mean(g[0]**2+g[1]**2));th=np.median(a)+(a.max()-np.median(a))*.5;labels,count=label(a>=th);region=labels==labels[np.unravel_index(a.argmax(),a.shape)];refpath=r/f'reference-{patch}.f32'
  z={'mean':float(a.mean()),'cv':float(a.std()/a.mean()),'p99overP50':float(np.percentile(a,99)/np.median(a)),'max':float(a.max()),'gradientLengthMm':float(a.std()/grad*1000),'halfPeakEquivalentDiameterMm':float(2*np.sqrt(region.sum()/np.pi)*width/511*1000),'top1PercentEnergyFraction':float(a[a>=np.percentile(a,99)].sum()/a.sum())}
  if refpath.exists():ref=np.fromfile(refpath,np.float32).reshape(512,512);z['relativeL1ToReference']=float(np.mean(abs(a-ref))/ref.mean())
  v[patch]=z
 out[name]=v
(r/'metrics.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
