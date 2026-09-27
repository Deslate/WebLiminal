from pathlib import Path
import json, numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image,ImageDraw,ImageFont
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import findfont
root=Path('../workroom-v1.31-evidence')
def load(name,key='liveField',t=6):return np.fromfile(root/name/f'{key}-{t}.f32',np.float32).reshape(288,432,4)[:,:,:3]@np.array([.2126,.7152,.0722])
def roi(a):return a[72:168,48:144]
f=np.fft.fftshift(np.fft.fftfreq(96,1/48));fy,fx=np.meshgrid(f,f,indexing='ij');band=((abs(fx)>16)&(abs(fx)<20)&(abs(fy)<1.5))|((abs(fy)>16)&(abs(fy)<20)&(abs(fx)<1.5));win=np.outer(np.hanning(96),np.hanning(96))
def metrics(a):
 a=roi(a);mean=float(a.mean());res=(a-gaussian_filter(a,4))/max(mean,1e-20);power=abs(np.fft.fftshift(np.fft.fft2(res*win)))**2
 return {'mean':mean,'residualRMS':float(res.std()),'gridBandPower':float(power[band].sum())}
report={name:metrics(load(name)) for name in ['before','no-cache','no-sky','no-sun','no-bounce','wide-cache','sky-half','after']}
report['reduction']=1-report['after']['gridBandPower']/report['before']['gridBandPower'];report['meanChange']=report['after']['mean']/report['before']['mean']-1
report['cacheUnchanged']=(root/'before/fine0-6.f32').read_bytes()==(root/'after/fine0-6.f32').read_bytes()
report['temporal']={}
for name in ['before','after']:
 a,b=roi(load(name,t=6)),roi(load(name,t=66));report['temporal'][name]={'liveRelativeRMSChange60s':float(np.sqrt(np.mean((b-a)**2))/a.mean()),'cacheBitIdentical60s':(root/name/'fine0-6.f32').read_bytes()==(root/name/'fine0-66.f32').read_bytes()}
(root/'summary.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
assert report['reduction']>.95
assert abs(report['meanChange'])<.02
assert report['cacheUnchanged']
font=ImageFont.truetype(findfont('DejaVu Sans'),26)
for view in ['under','above']:
 canvas=Image.new('RGB',(2048,1080),'white');draw=ImageDraw.Draw(canvas)
 for i,name in enumerate(['before','after']):canvas.paste(Image.open(root/name/f'dark-{view}-6.png'),(i*1024,56));draw.text((i*1024+18,15),f'{name.upper()} / {view} water / same t=6s',font=font,fill='black')
 canvas.save(root/f'{view}-before-after.png')
fig,axes=plt.subplots(2,2,figsize=(10,9))
for j,name in enumerate(['before','after']):
 a=roi(load(name))
 for i in [0,1]:
  v=a if i==0 else np.log1p(a/.15);lo,hi=(.07,.25) if i==0 else (np.log1p(.07/.15),np.log1p(.25/.15))
  axes[i,j].imshow(v,origin='lower',extent=[-3,-1,-1.5,.5],vmin=lo,vmax=hi,cmap='gray');axes[i,j].set_title(name+' / '+('linear' if i==0 else 'log1p'));axes[i,j].set_xlabel('x / m');axes[i,j].set_ylabel('z / m')
fig.suptitle('Actual floor water irradiance / identical scale in both columns');fig.tight_layout();fig.savefig(root/'irradiance-linear-log.png',dpi=150);plt.close(fig)
fig,axes=plt.subplots(1,3,figsize=(13,4))
for ax,name in zip(axes,['before','sky-half','after']):
 a=roi(load(name));res=(a-gaussian_filter(a,4))/a.mean();power=abs(np.fft.fftshift(np.fft.fft2(res*win)))**2;ax.imshow(np.log10(1+power),origin='lower',extent=[-24,24,-24,24],vmin=0,vmax=4,cmap='magma');ax.set_title(name);ax.set_xlabel('cycles / m');ax.set_ylabel('cycles / m')
fig.suptitle('Grid frequency follows SKY source spacing, not receiver or tile spacing');fig.tight_layout();fig.savefig(root/'source-spacing-proof.png',dpi=150);plt.close(fig)
