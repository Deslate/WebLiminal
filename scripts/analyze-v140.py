from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw,ImageFont
r=Path('../workroom-v1.40-evidence');font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',18)
rows=[]
for d in [2,3,4,5,7,10]:
 out=Image.new('RGB',(1920,664),'#14252c');draw=ImageDraw.Draw(out)
 for j,name in enumerate(['before','after']):out.paste(Image.open(r/name/f'{d}m.png').resize((960,624)),(j*960,40));draw.text((j*960+12,12),f'{name} / perpendicular wall distance {d}m',font=font,fill='white')
 out.save(r/f'compare-{d}m.png')
 a=np.array(Image.open(r/'after'/f'{d}m.png')).astype(float)[:,:,:3];b=np.array(Image.open(r/'no-filter'/f'{d}m.png')).astype(float)[:,:,:3]
 rows.append({'distance':d,'filterOutputMeanAbs8bit':float(abs(a-b).mean()),'filterOutputP99Abs8bit':float(np.percentile(abs(a-b),99))})
data=json.loads((r/'reflection-samples.json').read_text());summary=[]
for d in [2,3,4,5,7,10]:
 row={'wallDistance':d}
 for v in ['before','after']:
  s=next(s for s in data if s['variant']==v and s['wallDistance']==d);row[v+'Luminance']=float(np.dot(s['reflection'][:3],[.2126,.7152,.0722]));row['rayDistance']=s['centralRayDistance']
 summary.append(row)
(r/'summary.json').write_text(json.dumps({'centralRawReflection':summary,'filterAblation':rows},indent=2));print(json.dumps(summary,indent=2))
assert summary[0]['beforeLuminance']==summary[0]['afterLuminance']
assert all(s['beforeLuminance']==0 and s['afterLuminance']>0 for s in summary[3:])
