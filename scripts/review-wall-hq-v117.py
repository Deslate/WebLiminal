from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
p=Path('../workroom-v1.17-evidence/final');fs=sorted((p/'wall-frames').glob('frame-*.png'))
for name,chosen in [('overview',fs[::30]),('continuous',fs[900:961])]:
 for start in range(0,len(chosen),16):
  im=Image.new('RGB',(1280,912),'#121212');d=ImageDraw.Draw(im)
  for j,f in enumerate(chosen[start:start+16]):
   x=j%4*320;y=j//4*228;im.paste(Image.open(f).convert('RGB').resize((320,208)),(x,y+20));d.text((x+3,y+3),f.stem,fill='white')
  im.save(p/f'hq-{name}-{start//16}.jpg',quality=97)
previous=None;mae=[];rms=[];fires=[]
for f in fs:
 a=np.asarray(Image.open(f).convert('RGB'),np.float32);lum=a@np.array([.2126,.7152,.0722],np.float32)
 if previous is not None:mae.append(float(np.mean(abs(lum-previous))))
 previous=lum;c=lum[1:-1,1:-1];ns=[lum[y:y+lum.shape[0]-2,x:x+lum.shape[1]-2]for y in range(3)for x in range(3)if(x,y)!=(1,1)];fires.append(int(((c>75)&(c-np.maximum.reduce(ns)>25)).sum()))
(p/'hq-analysis.json').write_text(json.dumps({'frames':len(fs),'hz':30,'seconds':(len(fs)-1)/30,'medianMAE255':float(np.median(mae)),'maxMAE255':max(mae),'maxIsolatedBrightPixels':max(fires),'note':'Native PNG; difference includes moving light and film grain. Not a proof of no coherent flicker.'},indent=2))
