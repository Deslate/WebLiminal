from pathlib import Path
import os
from PIL import Image
import numpy as np,json
r=Path(os.environ.get('EVIDENCE_DIR','../workroom-v1.60-evidence'));old=Path('../workroom-v1.58-evidence/matrix')
base=np.array(Image.open(r/'matrix/default.png').convert('RGB'),dtype=np.int16)
oldbase=np.array(Image.open(old/'default.png').convert('RGB'),dtype=np.int16)
rows=[]
for p in sorted((r/'matrix').glob('*.json')):
 row=json.loads(p.read_text());a=np.array(Image.open(p.with_suffix('.png')).convert('RGB'),dtype=np.int16);d=abs(a-base);name=row['name'];oldname={'default':'water-full','water-transmission':'default'}.get(name,name);op=old/(oldname+'.png')
 row={'name':name,'lab':row['lab'],'internal':row['snapshot']['internal'],'rgbMAELevels':float(d.mean()),'rgbP99Levels':float(np.percentile(d,99)),'changedPixelFraction':float(np.any(d>0,axis=2).mean()),'errors':row['snapshot']['errors'],'performance':'待测'}
 if op.exists():row['oldCandidateMAEVsTransmission']=float(abs(np.array(Image.open(op).convert('RGB'),dtype=np.int16)-oldbase).mean())
 rows.append(row)
(r/'matrix-analysis.json').write_text(json.dumps(rows,indent=2))
print('\n'.join(f"{x['name']}: MAE={x['rgbMAELevels']:.6f}, p99={x['rgbP99Levels']}, old={x.get('oldCandidateMAEVsTransmission',0):.6f}" for x in rows))
if (r/'reference.png').exists():
 a=np.array(Image.open('../workroom-v1.59-evidence/reference/full.png'));b=np.array(Image.open(r/'reference.png'));assert a.shape==b.shape;d=abs(a.astype(np.int16)-b.astype(np.int16));out={'shape':list(a.shape),'differentChannels':int(np.count_nonzero(d)),'maxChannelDifference':int(d.max()),'mae':float(d.mean())};(r/'default-equivalence.json').write_text(json.dumps(out,indent=2));print(out)
