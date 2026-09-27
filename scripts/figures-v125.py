from pathlib import Path
import numpy as np,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw
r=Path('../workroom-v1.25-evidence');src=r/'irradiance'
fig,ax=plt.subplots(1,3,figsize=(15,5),constrained_layout=True)
for a,name,title in zip(ax,['v122','v123','v125'],['v1.22: 384² source','v1.23: 640² source','v1.25: finite-depth short waves, A=0.15mm']):
 e=np.fromfile(src/f'{name}-main.f32',np.float32).reshape(512,512);im=a.imshow(e,origin='lower',extent=[2.5,4.5,-2,0],vmin=0,vmax=35,cmap='gray',interpolation='nearest');a.set_title(title,fontsize=10);a.set_xlabel('Pool floor x (metres)');a.set_ylabel('Pool floor z (metres)')
fig.colorbar(im,ax=ax,label='Direct solar irradiance (renderer units), identical scale');fig.suptitle('DIAGNOSTIC: floor irradiance buffer only / t=6s / no camera, material, reflection or tone mapping',fontsize=11);fig.savefig(r/'floor-irradiance-comparison.png',dpi=150);plt.close(fig)
canvas=Image.new('RGB',(2560,872));draw=ImageDraw.Draw(canvas)
for i,name in enumerate(['v123','v125']):
 canvas.paste(Image.open(src/f'{name}-appearance.png').convert('RGB'),(1280*i,40));draw.text((1280*i+12,12),name+' / ABOVE WATER: appearance only, not irradiance diagnosis / same exposure, t=6s',fill='white')
canvas.save(r/'above-water-appearance-comparison.png')

canvas=Image.new('RGB',(2560,872));draw=ImageDraw.Draw(canvas)
for i,name in enumerate(['v123','v125']):
 canvas.paste(Image.open(src/f'{name}-room-appearance.png').convert('RGB'),(1280*i,40));draw.text((1280*i+12,12),name+' / NORMAL ABOVE-WATER VIEW: appearance only / same exposure, t=6s',fill='white')
canvas.save(r/'room-appearance-comparison.png')
