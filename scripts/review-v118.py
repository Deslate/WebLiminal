from pathlib import Path
from PIL import Image,ImageEnhance,ImageDraw
import json,numpy as np
root=Path('../workroom-v1.18-evidence');out=root/'review';out.mkdir(exist_ok=True)
for name in ['dark','darkNear','shadow','shadowNear','brightNear']:
 for gain in [1,5] if name!='brightNear' else [1]:
  canvas=Image.new('RGB',(1600,555),'#171717');d=ImageDraw.Draw(canvas)
  for j,phase in enumerate(['before','after']):
   im=Image.open(root/phase/(name+'.png')).convert('RGB');im=ImageEnhance.Brightness(im).enhance(gain)
   canvas.paste(im.resize((800,520)),(j*800,35));d.text((j*800+10,10),f'{phase} | {name} | identical display RGB gain x{gain}',fill='white')
  canvas.save(out/f'{name}-before-after-x{gain}.png')
# A true crop enlargement, no selective contrast or retouch. Two adjacent tiles.
for phase in ['before','after']:
 im=Image.open(root/phase/'shadowNear.png').convert('RGB').crop((210,75,1065,475)).resize((1710,800))
 for gain in [1,5]:
  c=Image.new('RGB',(1710,840),'#171717');c.paste(ImageEnhance.Brightness(im).enhance(gain),(0,40));ImageDraw.Draw(c).text((12,12),f'{phase}: adjacent tiles, 2x crop; display RGB gain x{gain} (raw originals retained)',fill='white');c.save(out/f'adjacent-{phase}-x{gain}.png')
for region in ['dark','bright']:
 files=sorted((root/'motion'/region).glob('frame-*.png'))
 if not files:continue
 for start in range(0,len(files),24):
  c=Image.new('RGB',(1600,6*280),'#171717');d=ImageDraw.Draw(c)
  for k,f in enumerate(files[start:start+24]):
   im=Image.open(f).convert('RGB');im=ImageEnhance.Brightness(im).enhance(5 if region=='dark' else 1)
   x=k%4*400;y=k//4*280;c.paste(im.resize((400,260)),(x,y+20));d.text((x+4,y+3),f'{region} {f.stem} gain {5 if region=="dark" else 1}',fill='white')
  c.save(out/f'{region}-motion-{start:04d}.jpg',quality=95)
