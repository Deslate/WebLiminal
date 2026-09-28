from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw,ImageFont
r=Path('../workroom-v1.38-evidence');out={}
for name in ['before','after']:
 a=np.array(json.loads((r/f'{name}-seam.json').read_text())['seam']).reshape(2,2,6,5,2,2,4);out[name]=[]
 for l in range(5):
  z=a[:,:,:,l,:,:,:3];d=np.linalg.norm(z[:,:,:,0]-z[:,:,:,1],axis=-1);scale=np.maximum(1e-7,(np.linalg.norm(z[:,:,:,0],axis=-1)+np.linalg.norm(z[:,:,:,1],axis=-1))*.5);v=d/scale
  out[name].append({'epsilonM':10**(-2-l),'indirectMeanPercent':float(v[:,:,:,0].mean()*100),'indirectMaxPercent':float(v[:,:,:,0].max()*100),'skyMeanPercent':float(v[:,:,:,1].mean()*100),'skyMaxPercent':float(v[:,:,:,1].max()*100)})
assert out['before'][-1]['indirectMeanPercent']>1, 'baseline must reproduce discontinuity'
assert out['after'][-1]['indirectMaxPercent']<.001, 'indirect chart limits must agree'
assert out['after'][-1]['skyMaxPercent']<.003, 'sky chart limits must agree'
assert out['after'][-1]['indirectMeanPercent']<out['after'][0]['indirectMeanPercent']/1000
(r/'continuity.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',20)
for name in ['front','left','right','back','other','default']:
 canvas=Image.new('RGB',(1920,664),'#132329');d=ImageDraw.Draw(canvas)
 for j,v in enumerate(['before','after']):
  canvas.paste(Image.open(r/v/f'{name}.png').resize((960,624)),(j*960,40));d.text((j*960+12,9),f'{v} / {name} / identical camera and frozen t=12',font=font,fill='white')
 canvas.save(r/f'compare-{name}.png')
# Same crop and exposure on both sides. Enlargement is nearest-neighbour,
# retaining the original pixels; no blur, local contrast adjustment or retouch.
canvas=Image.new('RGB',(1152,816),'#132329');d=ImageDraw.Draw(canvas)
for j,v in enumerate(['before','after']):
 im=Image.open(r/v/'front.png').crop((568,128,712,512)).resize((576,768),Image.Resampling.NEAREST);canvas.paste(im,(j*576,48));d.text((j*576+12,12),v+' / centre seam at x=640',fill='white',font=font)
canvas.save(r/'centre-enlarged.png')
