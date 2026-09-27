from PIL import Image,ImageDraw
from pathlib import Path
import sys,numpy as np,json
root=Path(sys.argv[1]);reports=[]
for folder in sorted(root.glob('*-decoded')):
 groups={'overview':sorted(folder.glob('overview*'))}
 for f in folder.glob('dense*'):
  key='-'.join(f.stem.split('-')[:2]);groups.setdefault(key,[]).append(f)
 for name,fs in groups.items():
  fs=sorted(fs);changes=[];previous=None
  for f in fs:
   a=np.array(Image.open(f)).astype(float)
   if previous is not None:changes.append(float(abs(a-previous).mean()))
   previous=a
  reports.append(dict(group=str(folder/name),count=len(fs),duplicates=sum(x==0 for x in changes),MAEmedian=float(np.median(changes))))
  if name.startswith('dense'):
   crop=Image.new('RGB',(1520,1100));draw=ImageDraw.Draw(crop)
   for j,f in enumerate(fs):
    im=Image.open(f).crop((450,420,1058,820)).resize((304,200));x=j%5*304;y=j//5*220;crop.paste(im,(x,y+20));draw.text((x+4,y+3),f.stem,fill='white')
   crop.save(root/f'{folder.name}-{name}-crop.jpg',quality=95)
  for start in range(0,len(fs),12):
   page=Image.new('RGB',(1440,4*332),(12,12,12));draw=ImageDraw.Draw(page)
   for j,f in enumerate(fs[start:start+12]):
    im=Image.open(f);im.thumbnail((480,310));x=(j%3)*480;y=(j//3)*332;page.paste(im,(x,y+20));draw.text((x+5,y+3),f.stem,fill='white')
   page.save(root/f'{folder.name}-{name}-sheet-{start//12:02}.jpg',quality=90)
json.dump(reports,open(root/'decoded-differences.json','w'),indent=2)
