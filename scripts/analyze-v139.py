from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw,ImageFont
r=Path('../workroom-v1.39-evidence');out={}
for name in ['before','after']:
 a=json.loads((r/f'{name}-continuity.json').read_text());v=np.array(a['values']).reshape(len(a['cases']),3,2,2,4);out[name]={}
 for i,c in enumerate(a['cases']):
  diff=np.linalg.norm(v[i,:,0,:,:3]-v[i,:,1,:,:3],axis=-1);den=np.maximum(1e-8,(np.linalg.norm(v[i,:,0,:,:3],axis=-1)+np.linalg.norm(v[i,:,1,:,:3],axis=-1))*.5);out[name][c['name']]={'epsilonsM':a['epsilons'],'relativeRGBJumpPercent':(diff/den*100).tolist()}
(r/'continuity-summary.json').write_text(json.dumps(out,indent=2))
for name in out['before']:print(name, 'before',out['before'][name]['relativeRGBJumpPercent'][-1],'after',out['after'][name]['relativeRGBJumpPercent'][-1])
assert max(x['relativeRGBJumpPercent'][-1][0] for x in out['after'].values())<.01
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',18)
views=json.loads((r/'before/views.json').read_text())
for name in views:
 im=Image.new('RGB',(1920,664),'#14252c');d=ImageDraw.Draw(im)
 for j,variant in enumerate(['before','after']):im.paste(Image.open(r/variant/f'{name}.png').resize((960,624)),(j*960,40));d.text((j*960+12,12),f'{variant} / {name}',font=font,fill='white')
 im.save(r/f'compare-{name}.png')
for part,start in enumerate(range(0,len(views),5)):
 sheet=Image.new('RGB',(1280,5*441),'#14252c');d=ImageDraw.Draw(sheet)
 for i,name in enumerate(list(views)[start:start+5]):
  for j,variant in enumerate(['before','after']):sheet.paste(Image.open(r/variant/f'{name}.png').resize((640,416)),(j*640,i*441+25));d.text((j*640+4,i*441+5),f'{variant} {name}',fill='white')
 sheet.save(r/f'survey-{part}.jpg')
