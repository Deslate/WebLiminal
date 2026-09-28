from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw,ImageFont
r=Path('../workroom-v1.41-evidence');font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',18)
summary=[];data=json.loads((r/'material-moments.json').read_text())
for d in [2,3,4,5,7,10]:
 row={'distance':d};arrays={}
 for name in ['before','after']:
  a=np.array(next(q['values'] for q in data if q['d']==d and q['variant']==name)).reshape(-1,8);arrays[name]=a;mask=a[:,3]>.01
  row[name]={'normalRMSDeg':float(np.sqrt(np.mean(a[mask,0]**2))),'roughnessMean':float(np.mean(a[mask,1])),'unresolvedSlopeVariance':float(np.mean(a[mask,2]))}
 mask=arrays['before'][:,3]>.01
 err=arrays['after'][mask,1]**4-arrays['before'][mask,1]**4-arrays['after'][mask,2]
 row['maxVarianceAccountingError']=float(abs(err).max());assert abs(err).max()<1e-6
 if d>=5:assert row['before']['normalRMSDeg']==0 and row['after']['normalRMSDeg']>.25
 out=Image.new('RGB',(1920,664),'#14252c');draw=ImageDraw.Draw(out)
 for j,name in enumerate(['before','after']):out.paste(Image.open(r/name/f'{d}m.png').resize((960,624)),(j*960,40));draw.text((j*960+12,12),f'{name} / wall distance {d}m',font=font,fill='white')
 out.save(r/f'compare-{d}m.png')
 if (r/'reference64'/f'{d}m.png').exists():
  a=np.array(Image.open(r/'after'/f'{d}m.png')).astype(float)[:,:,:3];ref=np.array(Image.open(r/'reference64'/f'{d}m.png')).astype(float)[:,:,:3]
  delta=abs(a-ref);row['reference64OutputDifference']={'MAE8bit':float(delta.mean()),'p99':float(np.percentile(delta,99))}
 summary.append(row)
(r/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
