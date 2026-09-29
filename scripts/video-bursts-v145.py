from pathlib import Path
import av,numpy as np,json,os
from PIL import Image,ImageDraw
r=Path('../workroom-v1.45-evidence');stats={};prefix='wall-canvas' if os.environ.get('WALL') else 'canvas';height=600 if os.environ.get('WALL') else 160
for name in ['before','after']:
 p=r/f'{prefix}-{name}/stationary.webm';c=av.open(str(p));history=[];peak=0;event=None;count=0;maxima=[];frames=0;last=0
 for frame in c.decode(video=0):
  t=float(frame.time);last=t;frames+=1
  rgb=frame.to_ndarray(format='rgb24');y=rgb[:height].astype(np.float32)@np.array([.2126,.7152,.0722],np.float32)/255
  history.append((t,y,rgb))
  while len(history)>2 and history[1][0]<=t-.1:history.pop(0)
  if t<6 or t-history[0][0]<.08:continue
  d=abs(y-history[0][1]);m=float(d.max());maxima.append(m);count+=int(np.sum(d>.1))
  if m>peak:
   peak=m;iy,ix=np.unravel_index(np.argmax(d),d.shape);event={'t0':history[0][0],'t1':t,'pixel':[int(ix),int(iy)],'delta':m};a=Image.fromarray(history[0][2]);b=Image.fromarray(rgb);im=Image.new('RGB',(960,330));dr=ImageDraw.Draw(im)
   for j,(pic,tm) in enumerate([(a,history[0][0]),(b,t)]):im.paste(pic.resize((480,300)),(480*j,30));dr.text((480*j+8,8),f'{name} {tm:.3f}s / max wall change at {ix},{iy}')
   im.save(r/f'{prefix}-{name}/worst-100ms.png')
 c.close();stats[name]={'decodedFrames':frames,'duration':last,'wallROI_pixels':[0,0,960,height],'max100msDisplayLumaDelta':peak,'frameMaxP99':float(np.percentile(maxima,99)),'eventsAbove_0_1_pixelSamples':count,'worst':event}
(r/f'{prefix}-bursts.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats,indent=2))
