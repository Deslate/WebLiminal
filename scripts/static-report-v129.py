from pathlib import Path
import numpy as np,json
from scipy.ndimage import gaussian_filter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image
r=Path('../workroom-v1.29-fix-evidence');out=r/'report';out.mkdir(exist_ok=True)
# Identical world area and display transform across all columns.
fig,axs=plt.subplots(2,4,figsize=(16,8));stats={}
for i,t in enumerate([0,6,30,60]):
 a=np.fromfile(r/f'before/solar-0.5-{t}.f32',np.float32).reshape(512,512)
 for j,b in enumerate([a,np.log1p(a)]):axs[j,i].imshow(b,cmap='gray',origin='lower',extent=[3.25,3.75,-1.25,-.75],vmin=0,vmax=30 if j==0 else np.log(31));axs[j,i].set_title(f'{t}s / '+('linear' if j==0 else 'log(1+E)'));axs[j,i].set_xlabel('world x / m')
fig.suptitle('Existing solar irradiance: 0.5 m crop, fixed world coordinates; NOT stationary');fig.tight_layout();fig.savefig(out/'solar-60s-zoom-linear-log.png',dpi=140);plt.close(fig)
fig,axs=plt.subplots(2,4,figsize=(16,8));base=None
for i,name in enumerate(['low-exposure','no-short','no-sky','no-base']):
 a=np.fromfile(r/name/'solar-2-6.f32',np.float32).reshape(512,512);n=json.loads((r/name/'state-6.json').read_text())['receivers']['3'];b=np.fromfile(r/name/'combined-6.f32',np.float32).reshape(n['ny'],n['nx'],4)[:,:,:3]@np.array([.2126,.7152,.0722]);x=-7+(np.arange(n['nx'])+.5)*14/n['nx'];z=-17+(np.arange(n['ny'])+.5)*27/n['ny'];b=b[np.ix_((z>=-2)&(z<=0),(x>=2.5)&(x<=4.5))]
 for j,(v,vmax) in enumerate([(a,31),(b,4)]):axs[j,i].imshow(np.log1p(v),cmap='gray',origin='lower',vmin=0,vmax=np.log(vmax));axs[j,i].set_title(name+(' / solar' if j==0 else ' / non-solar'));axs[j,i].axis('off')
 stats[name]={'solarMean':float(a.mean()),'solarCV':float(a.std()/a.mean()),'nonSolarMean':float(b.mean()),'nonSolarCV':float(b.std()/b.mean())}
fig.suptitle('Component A/B at 6s; log(1+E), shared scale within each row');fig.tight_layout();fig.savefig(out/'components-log.png',dpi=140);plt.close(fig)
fig,axs=plt.subplots(1,3,figsize=(15,5));ref=np.fromfile(r/'before/solar-2-0.f32',np.float32).reshape(512,512);a=np.fromfile(r/'before/solar-2-60.f32',np.float32).reshape(512,512);hp={}
for ax,mm in zip(axs,[3,10,30]):
 u=ref-gaussian_filter(ref,mm/1000*511/2);v=a-gaussian_filter(a,mm/1000*511/2);hp[mm]={'correlation0to60':float(np.corrcoef(u.ravel(),v.ravel())[0,1]),'rmsOverMean0':float(u.std()/ref.mean())};ax.imshow(v,cmap='RdBu_r',vmin=-2,vmax=2);ax.set_title(f'60s residual, Gaussian sigma {mm}mm');ax.axis('off')
fig.tight_layout();fig.savefig(out/'highpass.png',dpi=140);plt.close(fig)
# Actual camera A/B, no normalized contrast or per-image exposure adjustment.
canvas=Image.new('RGB',(1024*3,1080),'white');from PIL import ImageDraw
d=ImageDraw.Draw(canvas)
for i,name in enumerate(['low-exposure','no-short','no-solar']):canvas.paste(Image.open(r/name/'under-6.png'),(i*1024,56));d.text((i*1024+20,20),name+' / underwater / exposure 0.08',fill='black')
canvas.save(out/'underwater-ab.png');(out/'metrics.json').write_text(json.dumps({'componentAB':stats,'highpassMotion':hp},indent=2))
