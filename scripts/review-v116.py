from pathlib import Path
from PIL import Image,ImageDraw
import subprocess,numpy as np,json,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.16-evidence/final')
ff='/Users/steven/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac'
report=[]
for name,duration in [('fast',8),('slow',10)]:
 folder=root/f'high-angle-{name}-decoded';folder.mkdir(exist_ok=True)
 for kind,args in [('overview',['-r','1']),('dense',['-ss','5','-t',str(duration)])]:
  command=[ff,'-hide_banner','-loglevel','error','-i',str(root/f'high-angle-{name}.webm'),*args,'-y',str(folder/f'{kind}-%03d.png')]
  subprocess.run(command,check=True)
  fs=sorted(folder.glob(f'{kind}-*.png'))
  previous=None;diffs=[];fires=[]
  for start in range(0,len(fs),12):
   sheet=Image.new('RGB',(1536,1412),'#141414');draw=ImageDraw.Draw(sheet)
   for j,f in enumerate(fs[start:start+12]):
    a=Image.open(f).convert('RGB');im=a.resize((512,333));x=j%3*512;y=j//3*353;sheet.paste(im,(x,y+20));draw.text((x+6,y+3),f'{name} {kind} {f.stem}',fill='white')
    if kind=='dense':
     lum=np.asarray(a,dtype=np.float32)@np.array([.2126,.7152,.0722],np.float32)
     if previous is not None:diffs.append(float(abs(lum-previous).mean()))
     previous=lum;c=lum[1:-1,1:-1];neighbors=[lum[dy:dy+lum.shape[0]-2,dx:dx+lum.shape[1]-2] for dy in range(3) for dx in range(3) if (dx,dy)!=(1,1)];fires.append(int(((c>=75)&(sum(neighbors)/8<50)&(c-np.maximum.reduce(neighbors)>=25)).sum()))
   sheet.save(root/f'{name}-{kind}-sheet-{start//12:02}.jpg',quality=95)
  if kind=='dense':report.append({'name':name,'frames':len(fs),'decodedHz':25,'videoRange':[5,5+duration],'luminanceMAE255Median':float(np.median(diffs)),'luminanceMAE255Max':max(diffs),'maximumIsolatedBrightPixels':max(fires)})
(root/'video-analysis.json').write_text(json.dumps({'method':'Native 25Hz decode; full motion windows plus 1Hz overview. Pixel heuristic is not a proof of absence of coherent shimmer. Sheets must be visually inspected.','cases':report},indent=2))
