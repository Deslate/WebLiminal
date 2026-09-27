from pathlib import Path
from PIL import Image
import numpy as np,subprocess,json
root=Path('../workroom-v1.16-evidence/final');ff='/Users/steven/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac';folder=root/'hq-decoded';folder.mkdir(exist_ok=True);rows=[]
for name in ['fast','slow']:
 for frame in [0,90,180,195,300,450,600]:
  file=folder/f'{name}-{frame:04}.png';p=subprocess.run([ff,'-hide_banner','-loglevel','error','-i',str(root/f'high-angle-{name}-hq.webm'),'-ss',str(frame/30),'-frames:v','1','-y',str(file)],capture_output=True);assert p.returncode==0,p.stderr
  a=np.asarray(Image.open(root/f'{name}-lossless-frames/frame-{frame:04}.png').convert('RGB'),dtype=np.float32);b=np.asarray(Image.open(file).convert('RGB'),dtype=np.float32);rows.append({'name':name,'frame':frame,'RGBmae255':float(abs(a-b).mean()),'RGBp99Error':float(np.quantile(abs(a-b),.99))})
(root/'codec-check.json').write_text(json.dumps(rows,indent=2))
# Locate any isolated bright-pixel heuristic result in the original slow frames.
spots=[]
for file in sorted((root/'slow-lossless-frames').glob('*.png')):
 a=Image.open(file).convert('RGB');lum=np.asarray(a,dtype=np.float32)@np.array([.2126,.7152,.0722],np.float32);c=lum[1:-1,1:-1];ns=[lum[y:y+lum.shape[0]-2,x:x+lum.shape[1]-2] for y in range(3) for x in range(3) if(x,y)!=(1,1)];ys,xs=np.where((c>=75)&(sum(ns)/8<50)&(c-np.maximum.reduce(ns)>=25))
 for y,x in zip(ys,xs):
  x=int(x+1);y=int(y+1);spots.append({'frame':file.name,'xy':[x,y],'luminance':float(lum[y,x])});a.crop((max(0,x-64),max(0,y-64),min(1280,x+64),min(832,y+64))).resize((512,512)).save(root/f'isolated-{file.stem}.png')
(root/'isolated-pixel-locations.json').write_text(json.dumps(spots,indent=2))
