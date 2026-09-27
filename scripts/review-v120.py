from pathlib import Path
from PIL import Image,ImageDraw,ImageEnhance
import subprocess,numpy as np,json
p=Path('../workroom-v1.20-evidence/motion');ff='/Users/steven/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac';q=p/'decoded';q.mkdir(exist_ok=True)
subprocess.run([ff,'-hide_banner','-loglevel','error','-i',str(p/'dark-floor-walk.webm'),'-y',str(q/'frame-%04d.png')],check=True)
files=sorted(q.glob('*.png'));print('decoded',len(files),'frames')
# All playback frames remain available. Review an overview plus contiguous windows.
for label,fs in [('overview',files[::25]),('start-walk',files[125:175]),('turn',files[275:325]),('stop',files[525:575])]:
 for start in range(0,len(fs),25):
  c=Image.new('RGB',(1600,1140),'#161616');d=ImageDraw.Draw(c)
  for i,f in enumerate(fs[start:start+25]):
   im=ImageEnhance.Brightness(Image.open(f).convert('RGB')).enhance(6).resize((320,208));x=i%5*320;y=i//5*228;c.paste(im,(x,y+20));d.text((x+3,y+3),f'{f.stem} display RGB x6',fill='white')
  c.save(p/f'review-{label}-{start}.jpg',quality=95)
# Full-frame luminance derivative detects large one-frame exposure flashes, not all noise.
means=[]
for f in files:means.append(float(np.array(Image.open(f).convert('RGB'),dtype=float).mean()))
(p/'decoded-analysis.json').write_text(json.dumps({'frames':len(files),'meanRGB255':means,'maxAdjacentMeanChange':float(np.max(abs(np.diff(means))))},indent=2))
