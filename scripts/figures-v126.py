from pathlib import Path
import json,numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw
r=Path('../workroom-v1.26-evidence');src=r/'irradiance';names=['baseline','trial050','final'];titles=['0.15mm / previous speed','0.50mm / speed x0.1 / trial only','0.38mm / speed x0.1 / selected']
arrays=[np.fromfile(src/f'{name}-main.f32',np.float32).reshape(512,512) for name in names];limit=np.ceil(max(a.max() for a in arrays)/10)*10
fig,axes=plt.subplots(1,3,figsize=(15,5),constrained_layout=True)
for ax,a,title in zip(axes,arrays,titles):
 im=ax.imshow(a,origin='lower',extent=[2.5,4.5,-2,0],vmin=0,vmax=limit,cmap='gray',interpolation='nearest');ax.set_title(title,fontsize=10);ax.set_xlabel('Pool floor x (metres)');ax.set_ylabel('Pool floor z (metres)')
fig.colorbar(im,ax=axes,label='Direct solar irradiance, renderer units / common linear scale');fig.suptitle('DIAGNOSTIC: actual floor irradiance buffers / same t=6s and world region / no camera reflection',fontsize=11);fig.savefig(r/'floor-irradiance-comparison.png',dpi=150);plt.close(fig)
canvas=Image.new('RGB',(1920,460));d=ImageDraw.Draw(canvas)
for i,(name,title) in enumerate(zip(names,titles)):
 im=Image.open(src/f'{name}-room-appearance.png').convert('RGB');im.thumbnail((640,416));canvas.paste(im,(i*640,44));d.text((i*640+8,8),title,fill='white');d.text((i*640+8,24),'ABOVE WATER: appearance only / same exposure, t=6s',fill='white')
canvas.save(r/'above-water-appearance-comparison.png')
# Fixed-frame sheets inspect appearance, not irradiance metrics.
for name in ['final-normal','final-floor']:
 files=sorted((r/'appearance'/name/'frames').glob('*.png'));sheet=Image.new('RGB',(1280,230*((len(files)//30+3)//4)))
 for n,i in enumerate(range(0,len(files),30)):
  im=Image.open(files[i]);im.thumbnail((320,208));sheet.paste(im,(n%4*320,n//4*230+22));ImageDraw.Draw(sheet).text((n%4*320+5,n//4*230+4),f'APPEARANCE ONLY {name} {i/30:.1f}s',fill='white')
 sheet.save(r/f'{name}-overview.png')
