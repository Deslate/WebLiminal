from pathlib import Path
from PIL import Image,ImageDraw
import sys,json,numpy as np
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.15-evidence/final')
files=sorted((root/'stop-frames').glob('*.png'))
for name,fs in [('overview',[f for f in files if int(f.stem.split('-')[1])%30==0]),('continuous',[f for f in files if 180<=int(f.stem.split('-')[1])<=240])]:
 for start in range(0,len(fs),12):
  canvas=Image.new('RGB',(1536,1100),(12,12,12));d=ImageDraw.Draw(canvas)
  for j,f in enumerate(fs[start:start+12]):
   im=Image.open(f).convert('RGB');im.thumbnail((512,333));x=j%3*512;y=j//3*275
   # Preserve the water/body region, not the upper ceiling.
   im=Image.open(f).convert('RGB').crop((0,200,1280,832)).resize((512,253));canvas.paste(im,(x,y+20));d.text((x+5,y+3),f'stop {int(f.stem.split("-")[1])/30-6:+.3f}s',fill='white')
  canvas.save(root/f'stop-{name}-sheet-{start//12:02}.jpg',quality=95)
# Native-resolution consecutive PNG diagnostic, not a proof of no flicker.
fs=[f for f in files if 180<=int(f.stem.split('-')[1])<=240];prev=None;diff=[];fire=[]
for f in fs:
 a=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32);lum=a@np.array([.2126,.7152,.0722],np.float32)
 if prev is not None:diff.append(float(np.abs(lum-prev).mean()))
 prev=lum;c=lum[1:-1,1:-1];ns=[lum[y:y+lum.shape[0]-2,x:x+lum.shape[1]-2] for y in range(3) for x in range(3) if(x,y)!=(1,1)];fire.append(int(((c>=75)&(sum(ns)/8<50)&(c-np.maximum.reduce(ns)>=25)).sum()))
(root/'stop-analysis.json').write_text(json.dumps({'frames':len(fs),'hz':30,'adjacentLuminanceMAE255':{'median':float(np.median(diff)),'max':max(diff)},'maximumIsolatedBrightPixels':max(fire),'limitations':'Includes actual moving water and grain. Visual inspection is still required.'},indent=2))
