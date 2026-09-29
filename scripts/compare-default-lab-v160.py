from pathlib import Path
import os
import numpy as np,json
r=Path(os.environ.get('EVIDENCE_DIR','../workroom-v1.60-evidence'));old=Path('../workroom-v1.59-evidence/benchmark/current');new=r/'benchmark/current'
a=np.load(old/'source-luma.npy',mmap_mode='r');b=np.load(new/'source-luma.npy',mmap_mode='r');assert a.shape==b.shape
m=json.loads((old/'manifest.json').read_text());n=json.loads((new/'manifest.json').read_text());assert m['pathHash']==n['pathHash'];assert m['frames']==n['frames'];assert m['segments']==n['segments']
changed=0;maximum=0;total=0
for start in range(0,len(a),60):
 d=abs(a[start:start+60].astype(np.int16)-b[start:start+60].astype(np.int16));changed+=int(np.count_nonzero(d));maximum=max(maximum,int(d.max()));total+=int(d.sum())
result={'oldCommit':'b758476','oldSourceHash':m['sourceHash'],'newSourceHash':n['sourceHash'],'samePathAndFrameTimes':True,'shape':list(a.shape),'lumaValues':int(a.size),'differentValues':changed,'maxDifference':maximum,'meanAbsoluteDifference':total/a.size,'durationSeconds':76,'fps':30,'method':'Raw uint8 source-luma; replay rate is not realtime performance'}
repeat=r/'benchmark/repeat/source-luma.npy'
if (r/'benchmark/repeat/manifest.json').exists():
 c=np.load(repeat,mmap_mode='r');result['repeatDifferentValues']=sum(int(np.count_nonzero(b[i:i+60]!=c[i:i+60])) for i in range(0,len(b),60))
(r/'route-equivalence.json').write_text(json.dumps(result,indent=2));print(result)
