from pathlib import Path
from PIL import Image,ImageDraw
import subprocess
root=Path('../workroom-v1.17-evidence');ff='/Users/steven/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac'
for name in ['dark-before','dark-after']:
 p=root/name
 for start in range(0,66,16):
  im=Image.new('RGB',(1280,912),'#101010');d=ImageDraw.Draw(im)
  for j,n in enumerate(range(start,min(start+16,66))):
   f=p/f'wall-{n:03}.png';a=Image.open(f).resize((320,208));x=j%4*320;y=j//4*228;im.paste(a,(x,y+20));d.text((x+3,y+3),f'{name} {n}s',fill='white')
  im.save(p/f'review-{start//16}.jpg',quality=95)
 p.joinpath('decoded').mkdir(exist_ok=True)
 subprocess.run([ff,'-hide_banner','-loglevel','error','-i',str(p/'dark-wall-65s.webm'),'-ss','30','-t','2','-y',str(p/'decoded/frame-%03d.png')],check=True)
 fs=sorted((p/'decoded').glob('*.png'))
 for start in range(0,len(fs),16):
  im=Image.new('RGB',(1280,912),'#101010');d=ImageDraw.Draw(im)
  for j,f in enumerate(fs[start:start+16]):
   a=Image.open(f).resize((320,208));x=j%4*320;y=j//4*228;im.paste(a,(x,y+20));d.text((x+3,y+3),f'{name} {f.stem}',fill='white')
  im.save(p/f'decoded-review-{start//16}.jpg',quality=95)
