from pathlib import Path
from PIL import Image,ImageDraw
import av,json
root=Path('../workroom-v1.42-followup-evidence')
for folder in root.glob('stationary-*'):
 v=folder/'stationary-70s.webm'
 if not v.exists():continue
 targets=iter([6,15,30,45,60,69]);target=next(targets,None);frames=[]
 with av.open(str(v)) as c:
  for f in c.decode(video=0):
   t=float(f.pts*f.time_base)
   if target is not None and t>=target:
    frames.append((t,f.to_image()));target=next(targets,None)
   if target is None:break
 sheet=Image.new('RGB',(1280,3*424),'#161616');d=ImageDraw.Draw(sheet)
 for i,(t,im) in enumerate(frames):
  im.thumbnail((640,400));x=(i%2)*640;y=(i//2)*424;sheet.paste(im,(x,y+24));d.text((x+12,y+6),f'{folder.name} / video t={t:.2f}s',fill='white')
 sheet.save(folder/'contact.png');(folder/'decoded.json').write_text(json.dumps({'timestamps':[t for t,_ in frames]},indent=2))
sheet=Image.new('RGB',(1280,848),'#161616');d=ImageDraw.Draw(sheet)
for y,t in enumerate([6,60]):
 for x,name in enumerate(['before','balanced-pressure']):
  p=root/f'stationary-{name}'/f'second-{t}.png'
  if p.exists():
   im=Image.open(p);im.thumbnail((640,400));sheet.paste(im,(x*640,y*424+24));d.text((x*640+12,y*424+6),f'{name} / capture after {t}s / stationary camera',fill='white')
sheet.save(root/'stationary-comparison.png')
