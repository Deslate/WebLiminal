from pathlib import Path
from PIL import Image,ImageDraw
import av,json,numpy as np
r=Path('../workroom-v1.44-evidence');stats={}
for name in ['before','after']:
 folder=r/f'stationary-{name}';p=folder/'stationary-70s.webm'
 if not p.exists():continue
 c=av.open(str(p));targets=[7,30,60,70];fine=[60+i*.2 for i in range(10)];full={};near={};last=0;count=0
 for f in c.decode(video=0):
  t=float(f.time);last=t;count+=1
  for target in targets:
   if target not in full and t>=target:full[target]=f.to_image()
  for target in fine:
   if target not in near and t>=target:near[target]=f.to_image()
 c.close();im=Image.new('RGB',(1280,840));dr=ImageDraw.Draw(im)
 for j,(t,f) in enumerate(full.items()):x=j%2*640;y=j//2*420;im.paste(f.resize((640,400)),(x,y+20));dr.text((x+5,y+5),f'{name} video t={t}s')
 im.save(folder/'decoded-contact.png');im=Image.new('RGB',(1500,820));dr=ImageDraw.Draw(im)
 for j,(t,f) in enumerate(near.items()):x=j%5*300;y=j//5*410;im.paste(f.crop((980,0,1280,390)),(x,y+20));dr.text((x+5,y+5),f'{name} video {t:.1f}s')
 im.save(folder/'wall-continuous-frames.png');states=json.loads((folder/'states.json').read_text());stats[name]={'decodedFrames':count,'duration':last,'elapsedStart':states[0]['elapsed'],'elapsedEnd':states[-1]['elapsed'],'resolutionFirst':states[0]['resolution'],'resolutionLast':states[-1]['resolution'],'errors':list({e for s in states for e in s['errors']})}
(r/'video-inspection.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats,indent=2))
