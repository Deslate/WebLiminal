from pathlib import Path
import numpy as np,json
from PIL import Image,ImageDraw
r=Path('../workroom-v1.24-evidence');out={};sheet=Image.new('RGB',(1280,4*302));draw=ImageDraw.Draw(sheet)
for row,name in enumerate(['baseline','short015','short05','short1']):
 files=sorted((r/'temporal'/f'{name}-frames').glob('*.png'));series=[];diff=[];isol=[];last=None
 for i,f in enumerate(files):
  a=np.asarray(Image.open(f).convert('RGB'),dtype=np.float32);l=a@np.array([.2126,.7152,.0722],np.float32);c=l[1:-1,1:-1];near=np.maximum.reduce([l[:-2,1:-1],l[2:,1:-1],l[1:-1,:-2],l[1:-1,2:]]);isol.append(int((c-near>25).sum()));series.append(l[::8,::8].ravel())
  if last is not None:diff.append(float(abs(a-last).mean()))
  last=a
  if i in [0,30,60]:
   im=Image.open(f);im.thumbnail((426,277));sheet.paste(im,(i//30*426,row*302+25))
 a=np.array(series);a-=a.mean(0);ft=abs(np.fft.rfft(a*np.hanning(len(a))[:,None],axis=0))**2;freq=np.fft.rfftfreq(len(a),1/30);out[name]={'frames':len(files),'medianFrameMAE':float(np.median(diff)),'maxFrameMAE':max(diff),'maxIsolatedPixels':max(isol),'framesWithIsolatedPixels':sum(x>0 for x in isol),'temporalPowerAbove5Hz':float(ft[freq>5].sum()/ft.sum())};draw.text((8,row*302+6),name+' / t=6,7,8s / same camera & exposure',fill='white')
sheet.save(r/'short-wave-time-comparison.png');(r/'temporal-metrics.json').write_text(json.dumps(out,indent=2));print(out)
# Equal-scale photon irradiance, independent of tile shading.
canvas=Image.new('RGB',(1536,550));d=ImageDraw.Draw(canvas)
for i,name in enumerate(['baseline','short05','short1']):
 a=np.fromfile(r/'study'/f'{name}-main.f32',np.float32).reshape(512,512);canvas.paste(Image.fromarray(np.uint8(np.clip(a/60,0,1)*255)),(i*512,38));d.text((i*512+8,8),name+' / same linear scale 0..60 (clipped)',fill='white')
canvas.save(r/'raw-light-comparison.png')
