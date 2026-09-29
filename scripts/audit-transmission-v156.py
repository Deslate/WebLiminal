import json
from pathlib import Path
import numpy as np
r=Path('../workroom-v1.56-evidence/energy');flat=json.load(open(r/'flat-production.json'));wave=json.load(open(r/'wavy-production.json'));paths=np.array(json.load(open(r/'wavy-production-paths.json'))['paths']).reshape(-1,8,4)
valid=paths[:,7,3]==1;v=paths[valid];assert len(v)>0;assert np.all(v[:,4,3]==0),'A reflected first-water packet was recorded'
f=v[:,3,3];incoming=v[:,6,:3];outgoing=v[:,7,:3];expected=incoming*(1-f[:,None]);err=float(np.max(abs(outgoing-expected)/np.maximum(abs(expected),1e-15)));assert err<1e-6
for group,g in flat['regions'].items():
 assert g['fields']['energyDelta']['min']==g['fields']['energyDelta']['max']==0
 assert g['fields']['liveField']['flux']==g['fields']['flatField']['flux']
summary={'transmittedRecords':len(v),'reflectedRecords':int(np.sum(v[:,4,3]!=0)),'oneMinusFMaxRelativeError':err,'fresnelMinMedianMax':np.percentile(f,[0,50,100]).tolist(),'flatDeltaExactlyZero':True,'units':'Receiver area integral of linear luminance irradiance. Multiple diffuse receiver events are counted, not source watts.','regions':{}}
for name,g in wave['regions'].items():summary['regions'][name]={k:g['fields'][k]for k in ['fine0','liveField','energyDelta','combined','closureError','clampAdded']}
(r/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
