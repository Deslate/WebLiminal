"""Compare physical receiver integrals, not display luma or watts."""
import json,sys
from pathlib import Path
import numpy as np
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.53-evidence')
read=lambda stage,mode:json.loads((root/stage/(mode+'.json')).read_text())
before=read('energy','wavy-production');after=read('energy-after','wavy-production');ref=read('energy-after','wavy-reference');flat=read('energy-after','flat-production')
out={'units':'covered receiver area times linear luminance irradiance; not watts; repeated bounces counted as receiver events','reference':'fine0 ONLY from independent full indirect photon estimator; reference combined deliberately contains redundant diagnostic fields and must not be used','regions':{}}
for g in after['regions']:
 def flux(d,k):return d['regions'][g]['fields'][k]['flux']
 out['regions'][g]={'before':{k:flux(before,k) for k in ['fine0','liveField','energyDelta','clampAdded','combined']},'after':{k:flux(after,k) for k in ['fine0','liveField','energyDelta','clampAdded','combined']},'reference':flux(ref,'fine0'),'relativeReferenceError':flux(after,'combined')/flux(ref,'fine0')-1}
 assert flat['regions'][g]['fields']['energyDelta']['min']==0
 assert flat['regions'][g]['fields']['energyDelta']['max']==0
 assert flux(flat,'liveField')==flux(flat,'flatField')
p=np.array(json.loads((root/'energy-after/wavy-production-paths.json').read_text())['paths']).reshape(-1,8,4)
pairs=p.reshape(-1,2,8,4);pairs=pairs[np.all(pairs[:,:,7,3]==1,axis=1)]
assert len(pairs)>0
incoming=pairs[:,0,6,:3];outgoing=pairs[:,:,7,:3].sum(1)
assert np.allclose(incoming,outgoing,rtol=1e-6,atol=1e-10)
out['waterBranchAudit']={'completePairs':len(pairs),'incomingRGB':incoming.sum(0).tolist(),'reflectedPlusTransmittedRGB':outgoing.sum(0).tolist(),'maxRelativeClosureError':float(np.max(abs(incoming-outgoing)/incoming)),'fresnelMinMedianMax':np.percentile(pairs[:,0,3,3],[0,50,100]).tolist()}
out['flatDeltaExactlyZero']=True
(root/'energy-summary.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
