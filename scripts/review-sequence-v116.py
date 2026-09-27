from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.16-evidence/final');results=[]
for name in ['fast','slow','bright','dark']:
 folder=root/(name+'-lossless-frames') if name in ['fast','slow'] else root/'first-person-motion'
 fs=sorted(folder.glob('frame-*.png' if name in ['fast','slow'] else name+'-*.png'))
 if not fs:continue
 selections=[('overview',fs[::30]),('continuous',fs[90:226] if name=='fast' else fs[90:331])] if name in ['fast','slow'] else [('continuous',fs)]
 for kind,selected in selections:
  for start in range(0,len(selected),20):
   sheet=Image.new('RGB',(1600,1410),'#151515');draw=ImageDraw.Draw(sheet)
   for j,f in enumerate(selected[start:start+20]):
    im=Image.open(f).convert('RGB').resize((400,260));x=j%4*400;y=j//4*282;sheet.paste(im,(x,y+20));draw.text((x+5,y+3),f'{name} {f.stem}',fill='white')
   sheet.save(root/f'review-{name}-{kind}-{start//20:02}.jpg',quality=97)
 previous=None;diff=[];fires=[]
 for f in fs:
  lum=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32)@np.array([.2126,.7152,.0722],np.float32)
  if previous is not None:diff.append(float(abs(lum-previous).mean()))
  previous=lum;c=lum[1:-1,1:-1];ns=[lum[y:y+lum.shape[0]-2,x:x+lum.shape[1]-2] for y in range(3) for x in range(3) if(x,y)!=(1,1)];fires.append(int(((c>=75)&(sum(ns)/8<50)&(c-np.maximum.reduce(ns)>=25)).sum()))
 results.append({'name':name,'frames':len(fs),'hz':30 if name in ['fast','slow'] else 60,'luminanceMAE255Median':float(np.median(diff)),'luminanceMAE255Max':max(diff),'maximumIsolatedBrightPixels':max(fires),'visuallySelectedFrames':sum(len(a) for _,a in selections)})
(root/'lossless-analysis.json').write_text(json.dumps({'method':'Uncompressed native PNG analysis. Full motion intervals plus1Hz full-sequence overview selected for visual inspection. No pixel metric proves absence of coherent flicker.','cases':results},indent=2))
