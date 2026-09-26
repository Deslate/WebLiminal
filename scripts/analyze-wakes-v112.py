"""Continuous-frame diagnostics, not a proof of absence of every visual artifact."""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);result={}
for name in ['floor','wall']:
 files=sorted(root.glob(name+'-???.png')); frames=[np.asarray(Image.open(p).convert('RGB'),dtype=np.float32) for p in files]
 lum=[a@np.array([.2126,.7152,.0722],dtype=np.float32) for a in frames]
 ds=[float(np.abs(b-a).mean()) for a,b in zip(lum,lum[1:])]
 second=[float(np.abs(c-2*b+a).mean()) for a,b,c in zip(lum,lum[1:],lum[2:])]
 fire=[]
 for y in lum:
  c=y[1:-1,1:-1];n=[y[j:y.shape[0]-2+j,i:y.shape[1]-2+i] for j in range(3) for i in range(3) if (i,j)!=(1,1)]
  fire.append(int(((c>=75)&(sum(n)/8<50)&(c-np.maximum.reduce(n)>=25)).sum()))
 result[name]={'frames':len(files),'timeStep':1/60,'adjacentMAE255':{'min':min(ds),'median':float(np.median(ds)),'max':max(ds)},'secondDifferenceMAE255':{'median':float(np.median(second)),'max':max(second)},'maximumIsolatedBrightPixels':max(fire),'perFrameMAE':ds,'perFrameSecondDifference':second}
 for start in range(0,len(files),12):
  canvas=Image.new('RGB',(1512,810),(18,22,23));d=ImageDraw.Draw(canvas)
  for k,p in enumerate(files[start:start+12]):
   im=Image.open(p).convert('RGB');im.thumbnail((378,246));x=k%4*378;z=k//4*270;canvas.paste(im,(x,z));d.text((x+5,z+248),f'{name} +{(start+k)/60:.4f}s',fill='white')
  canvas.save(root/f'{name}-sheet-{start//12:02d}.jpg')
result['limits']='Absolute pixel difference includes real caustic movement, geometry and quantization. No temporal image filter. No universal flicker guarantee; inspect continuous sheets/video as well.'
(root/'analysis.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:{a:b for a,b in v.items() if not a.startswith('perFrame')} if isinstance(v,dict) else v for k,v in result.items()},indent=2))
