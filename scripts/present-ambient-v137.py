from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
r=Path('../workroom-v1.37-evidence');fig,ax=plt.subplots(1,3,figsize=(14,4))
for j,name in enumerate(['before','after']):
 h=np.fromfile(r/f'ambient-{name}-360.f32',np.float32).reshape(864,448);crop=h[320:480,144:304]
 c=ax[j].imshow(crop*1000,origin='lower',extent=[0,5,0,5],vmin=-8,vmax=8,cmap='RdBu_r');ax[j].set(title=f'Background {name}, t=6 s',xlabel='m',ylabel='m');fig.colorbar(c,ax=ax[j],label='Height mm')
 a=h[160:704,64:384];w=np.outer(np.hanning(a.shape[0]),np.hanning(a.shape[1]));p=abs(np.fft.rfft2((a-a.mean())*w))**2;kz,kx=np.meshgrid(np.fft.fftfreq(a.shape[0],1/32),np.fft.rfftfreq(a.shape[1],1/32),indexing='ij');f=np.hypot(kx,kz);bins=np.arange(0,5.1,.1);ps=np.histogram(f,bins,weights=p)[0];ax[2].plot((bins[1:]+bins[:-1])/2,ps/p.sum(),label=name)
ax[2].set(xlabel='Spatial frequency cycles/m',ylabel='Power fraction per 0.1 cycles/m',title='Background height spectrum');ax[2].legend();ax[2].grid(alpha=.3);fig.tight_layout();fig.savefig(r/'ambient-comparison.png',dpi=150)
