from pathlib import Path
from PIL import Image,ImageDraw,ImageEnhance
import numpy as np,json
p=Path('../workroom-v1.20-evidence/comparison');report={}
for name in ['deep','normal','shallow','near','far','bright','darkWall','wall','ceiling','flat']:
 c=Image.new('RGB',(1536,1060),'#171717');d=ImageDraw.Draw(c)
 for i,mode in enumerate(['before','after']):
  im=Image.open(p/mode/(name+'.png')).convert('RGB').crop((0,170,1280,820)).resize((768,490));c.paste(im,(i*768,40));c.paste(ImageEnhance.Brightness(im).enhance(6),(i*768,560));d.text((i*768+8,12),f'{mode} | {name} | t=1s, same pose/wave replay | normal exposure',fill='white');d.text((i*768+8,535),'Identical display RGB x6 (dark detail inspection only)',fill='white')
 c.save(p/(name+'-comparison.png'))
for name in ['flat','deep']:
 vals={mode:np.array(json.load(open(p/mode/(name+'.json')))['floor']['rgb']).reshape(96,96,3)@np.array([.2126,.7152,.0722]) for mode in ['before','after','reference']};r={};win=np.outer(np.hanning(96),np.hanning(96))
 for mode,v in vals.items():
  f=abs(np.fft.fftshift(np.fft.fft2((v-v.mean())*win)))**2;r[mode]={'mean':float(v.mean()),'power14cm':float(f[57,37]),'power12cm':float(f[62,55]),'rmseReference':float(np.sqrt(np.mean((v-vals['reference'])**2)))}
 report[name]=r;c=Image.new('RGB',(1536,550),'#171717');d=ImageDraw.Draw(c);scale=float(np.quantile(vals['before'],.98))
 for i,(mode,v)in enumerate(vals.items()):
  im=Image.fromarray(np.uint8(np.clip(v/scale,0,1)*255)).resize((512,512));c.paste(im,(512*i,38));d.text((512*i+8,10),f'{mode} | actual sky/water irradiance | common gain',fill='white')
 c.save(p/(name+'-fields.png'))
(p/'analysis.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
# Required enlarged photographic comparison: shared crop, scale, exposure.
c=Image.new('RGB',(1920,1580),'#171717');d=ImageDraw.Draw(c)
for i,mode in enumerate(['before','after']):
 im=Image.open(p/mode/'deep.png').convert('RGB').crop((300,210,940,710)).resize((960,750));c.paste(im,(960*i,40));c.paste(ImageEnhance.Brightness(im).enhance(6),(960*i,830));d.text((i*960+10,10),f'{mode} | same camera, t=1s | crop 640x500 enlarged 1.5x | normal exposure',fill='white');d.text((i*960+10,803),'SAME CROP | display RGB x6 for dark-detail inspection; no image smoothing',fill='white')
c.save(p/'floor-enlarged-before-after.png')
# Two world-coordinate 2m patches: east wall and western ceiling.
r={};c=Image.new('RGB',(1440,1040),'#171717');d=ImageDraw.Draw(c)
for j,(sid,ys,xs) in enumerate([('18',slice(12,60),slice(240,288)),('47',slice(240,288),slice(5,53))]):
 vals={}
 for mode in ['before','after','reference']:
  a=json.load(open(p/mode/'flat.json'))[sid];vals[mode]=(np.array(a['irradiance']).reshape(a['ny'],a['nx'],4)[:,:,:3]@np.array([.2126,.7152,.0722]))[ys,xs]
 scale=max(np.quantile(vals['before'],.98),1e-8);r[sid]={}
 for i,(mode,v)in enumerate(vals.items()):
  r[sid][mode]={'mean':float(v.mean()),'rmseReference':float(np.mean((v-vals['reference'])**2)**.5)};im=Image.fromarray(np.uint8(np.clip(v/scale,0,1)*255)).resize((480,480));c.paste(im,(i*480,j*520+40));d.text((i*480+5,j*520+10),f'{mode} | receiver {sid} | same linear gain',fill='white')
c.save(p/'wall-ceiling-fields.png');(p/'wall-ceiling-analysis.json').write_text(json.dumps(r,indent=2))
