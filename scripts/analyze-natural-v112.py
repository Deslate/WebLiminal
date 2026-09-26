"""Fixed-ROI translational correlation; an auxiliary repetition metric only."""
from pathlib import Path
import json,sys
import numpy as np
root=Path(sys.argv[1]);result={}
for name,path in [('v1.11',root/'before/capture.json'),('v1.12',root/'final/natural/capture.json')]:
 data=json.loads(path.read_text())['report']['original']['floor']['roi']['rgb']
 y=np.asarray(data).reshape(96,96,3)@np.array([.2126,.7152,.0722]);peaks=[]
 for dy in range(-30,31):
  for dx in range(-30,31):
   if dx*dx+dy*dy<36:continue
   a=y[max(0,dy):min(96,96+dy),max(0,dx):min(96,96+dx)].flatten()
   b=y[max(0,-dy):min(96,96-dy),max(0,-dx):min(96,96-dx)].flatten()
   peaks.append((float(np.corrcoef(a,b)[0,1]),dx,dy))
 peak=max(peaks);result[name]={'peakCorrelation':peak[0],'offsetCells':peak[1:],'offsetMetres':[v/48 for v in peak[1:]]}
result['method']='Same 2x2m world irradiance ROI, same phase14.7, no camera/material/tone mapping. Pearson correlation over overlapping pixels; integer offsets ±30 cells, radius >=6cells. Not a universal realism or non-repetition guarantee.'
(root/'final/natural-correlation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
