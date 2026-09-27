from PIL import Image,ImageDraw
from pathlib import Path
import numpy as np,json
root=Path('../workroom-v1.21-evidence');out=root/'comparison';out.mkdir(exist_ok=True)
for name in ['sun','sunNear','dark']:
 a=Image.open(root/'before'/f'{name}.png').convert('RGB');b=Image.open(root/'sharp'/f'{name}.png').convert('RGB')
 if name=='dark':
  a=Image.fromarray(np.uint8(np.minimum(np.array(a,dtype=float)*10,255)));b=Image.fromarray(np.uint8(np.minimum(np.array(b,dtype=float)*10,255)))
 sheet=Image.new('RGB',(2560,876));sheet.paste(a,(0,44));sheet.paste(b,(1280,44));d=ImageDraw.Draw(sheet);d.text((20,14),f'v1.20 / original {"display RGB x10 (diagnostic only)" if name=="dark" else "exposure 0.85"}',fill='white');d.text((1300,14),f'v1.21 / same camera, t=3s {"display RGB x10 (diagnostic only)" if name=="dark" else "exposure 0.85"}',fill='white');sheet.save(out/f'{name}-before-after.png')
 if name=='dark':b.save(out/'dark-boosted.png')
# No amplification on the submitted sunlit close-up.
Image.open(root/'sharp/sun.png').save(out/'floor-caustics.png')
