"""Evidence figures only; never imported by the renderer."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
r=Path('../workroom-v1.23-evidence'); src=r/'footprint-convergence'; out=r/'final-footprint'
a=Image.open(src/'previous.png').convert('RGB');b=Image.open(src/'current.png').convert('RGB');b.save(out/'floor-front.png')
pair=Image.new('RGB',(2560,864));pair.paste(a,(0,32));pair.paste(b,(1280,32));d=ImageDraw.Draw(pair);d.text((10,10),'v1.22 / ca09c32 / t=6s',fill='white');d.text((1290,10),'v1.23 / same camera, water, exposure / t=6s',fill='white');pair.save(out/'floor-before-after.png')
# Lift shadows for diagnostic viewing only; identical operation on both panels.
lift=lambda im:Image.fromarray(np.uint8(np.clip((np.asarray(im)/255.)**.55*255,0,255)))
pair.paste(lift(a),(0,32));pair.paste(lift(b),(1280,32));ImageDraw.Draw(pair).text((300,10),'DIAGNOSTIC SHADOW LIFT: display RGB ^ 0.55, not app exposure',fill='white');pair.save(out/'floor-before-after-shadow-lift.png')
canvas=Image.new('RGB',(1536,550));draw=ImageDraw.Draw(canvas)
for i,name in enumerate(['previous','current','reference']):
 e=np.fromfile(src/f'{name}-main.f32',np.float32).reshape(512,512);im=Image.fromarray(np.uint8(np.clip(e/28,0,1)*255));canvas.paste(im,(i*512,38));draw.text((i*512+8,8),name+' / linear E, common range 0..28',fill='white')
canvas.save(out/'raw-irradiance-comparison.png')
