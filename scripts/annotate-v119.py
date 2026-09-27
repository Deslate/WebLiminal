from pathlib import Path
from PIL import Image,ImageDraw,ImageEnhance
import numpy as np,json
root=Path('../workroom-v1.19-evidence');p=root/'lattice-proof'
# Actual rendered pre-change floor; explicitly marked display gain.
im=Image.open(root/'scout'/'d0.85-x-4-z-6.png').convert('RGB').crop((0,170,1280,820)).resize((1536,780))
c=Image.new('RGB',(1536,840),'#161616');c.paste(ImageEnhance.Brightness(im).enhance(6),(0,60));d=ImageDraw.Draw(c);d.text((15,10),'BEFORE: f54503e | x=-4,z=-6 | depth=0.85m | crop 1.2x | display RGB gain x6',fill='white');d.text((15,30),'Original scout/d0.85-x-4-z-6.png; waveAmplitude=0.052m. Tile pitch is 250mm; dot rows cross tile seams.',fill='white');c.save(p/'before-floor-enlarged.png')
# Measurements are in world space BEFORE albedo, refraction and tone mapping.
im=Image.open(p/'flat-field.png');c=Image.new('RGB',(1024,900),'#171717');c.paste(im,(0,64));d=ImageDraw.Draw(c)
for x in range(0,769,96):d.line((x,64,x,832),fill=(90,150,90));d.line((0,64+x,768,64+x),fill=(90,150,90))
d.text((12,12),'BEFORE: transported SKY irradiance, not material / not final colour',fill='white');d.text((12,32),'2m x 2m world crop [-5,-3] x [-7,-5]; green squares = actual 250mm tile pitch',fill='white')
d.line((800,100,896,100),fill='white',width=3);d.text((800,110),'250mm tile',fill='white')
d.line((800,165,816,165),fill=(240,200,80),width=3);d.text((800,177),'41.67mm wall cell',fill='white')
d.line((800,235,808,235),fill=(80,180,240),width=3);d.text((800,248),'20.83mm floor cell',fill='white')
d.text((790,320),'FFT dot-row periods:',fill='white');d.text((790,345),'140.7mm / 127.8mm',fill='white');d.text((790,385),'256 x 512 emitters',fill='white');d.text((790,405),'-> 512 x 1024:',fill='white');d.text((790,425),'140.7mm -> 70.4mm',fill='white');d.text((790,465),'Receiver/tile grid',fill='white');d.text((790,485),'UNCHANGED in A/B.',fill='white');d.text((12,858),'Near-flat control = waveAmplitude 0.001m (not a disabled/frozen production wave).',fill='white');c.save(p/'before-grid-measured.png')
# Common scale for an optical density A/B (not separately normalized).
vals=[]
for n in ['flat','dense','reference']:
 a=json.load(open(p/(n+'.json')));vals.append(np.array(a['rgb']).reshape(96,96,3)@np.array([.2126,.7152,.0722]))
scale=np.quantile(vals[0],.98);c=Image.new('RGB',(1536,552),'#171717');d=ImageDraw.Draw(c)
for i,(n,v)in enumerate(zip(['default 256x512','dense 512x1024','64 aperture samples (diagnostic)'],vals)):
 im=Image.fromarray(np.uint8(np.clip(v/scale,0,1)*255)).resize((512,512));c.paste(im,(i*512,40));d.text((i*512+6,12),n+' | identical linear gain',fill='white')
c.save(p/'density-ab.png')
