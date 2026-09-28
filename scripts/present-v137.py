from pathlib import Path
import json,subprocess,numpy as np
from PIL import Image,ImageDraw,ImageFont
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import imageio_ffmpeg
r=Path('../workroom-v1.37-evidence');ff=imageio_ffmpeg.get_ffmpeg_exe()
for name in ['before','after']:
 subprocess.run([ff,'-v','error','-i',str(r/f'keyboard-{name}/first-person-keyboard.webm'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(r/f'first-person-{name}.mp4')],check=True)
 # Actual consecutive recorded frames, 8Hz contact sheets during walking.
 out=r/f'decoded-{name}';out.mkdir(exist_ok=True)
 subprocess.run([ff,'-v','error','-i',str(r/f'first-person-{name}.mp4'),'-vf','fps=8','-y',str(out/'%04d.png')],check=True)
 for start in [32,48,64]:
  sheet=Image.new('RGB',(1280,3*232),'#15242a');d=ImageDraw.Draw(sheet)
  for j in range(12):
   p=out/f'{start+j:04d}.png'
   if p.exists():sheet.paste(Image.open(p).resize((320,208)),((j%4)*320,(j//4)*232+24));d.text(((j%4)*320+5,(j//4)*232+5),f'{(start+j-1)/8:.3f}s {name}',fill='white')
  sheet.save(r/f'contact-{name}-{start}.jpg')
m=json.loads((r/'metrics.json').read_text());x,z=np.meshgrid(-7+(np.arange(448)+.5)/32,-17+(np.arange(864)+.5)/32);mask=(x>1.6)&(x<3.4)&(abs(z-1)<1.5)
fig,axes=plt.subplots(2,2,figsize=(10,8))
for i,name in enumerate(['before','after']):
 h=np.fromfile(r/f'{name}-0.8-6.f32',np.float32).reshape(864,448);angle=np.arctan(np.hypot(*np.gradient(h,1/32)))*180/np.pi
 ix=np.where(mask.any(axis=0))[0];iz=np.where(mask.any(axis=1))[0]
 for j,(a,lim,lab) in enumerate([(h*1000,100,'Height mm'),(angle,20,'Normal degrees')]):
  c=axes[j,i].imshow(a[np.ix_(iz,ix)],origin='lower',extent=[1.2,3,-1.5,1.5],vmin=-lim if j==0 else 0,vmax=lim,cmap='RdBu_r' if j==0 else 'magma',aspect='auto');axes[j,i].set(title=f'{name}: {lab}',xlabel='Distance ahead m',ylabel='Lateral m');fig.colorbar(c,ax=axes[j,i])
fig.tight_layout();fig.savefig(r/'forward-fields.png',dpi=160)
