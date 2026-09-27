from pathlib import Path
import numpy as np,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.ndimage import gaussian_filter
root=Path('../workroom-v1.31-evidence');stats={}
for d in root.iterdir():
 if not (d/'combined-6.f32').exists():continue
 fig,axes=plt.subplots(2,3,figsize=(12,8));stats[d.name]={}
 for col,key in enumerate(['fine0','liveField','combined']):
  a=np.fromfile(d/f'{key}-6.f32',np.float32).reshape(288,432,4);a=a[:,:,:3]@np.array([.2126,.7152,.0722]);a=a[72:168,48:144] # x -3..-1,z-1.5..0.5
  # Detrended fine structure below about 0.2m; mean-normalized amplitude.
  residual=(a-gaussian_filter(a,4))/max(a.mean(),1e-20);power=np.abs(np.fft.fftshift(np.fft.fft2(residual*np.outer(np.hanning(96),np.hanning(96)))) )**2;freq=np.fft.fftshift(np.fft.fftfreq(96,1/48));y,x=np.meshgrid(freq,freq,indexing='ij');mask=(np.hypot(x,y)>3);p=power*mask;iy,ix=np.unravel_index(np.argmax(p),p.shape)
  stats[d.name][key]={'mean':float(max(a.mean(),1e-20)),'fineResidualRMS':float(np.std(residual)),'dominantFrequencyXY': [float(freq[ix]),float(freq[iy])],'dominantScaleMM':float(1000/np.hypot(freq[ix],freq[iy]))}
  for row in [0,1]:
   shown=a/max(a.mean(),1e-20) if row==0 else np.log1p(a/max(a.mean(),1e-20));axes[row,col].imshow(shown,origin='lower',cmap='gray',extent=[-3,-1,-1.5,.5]);axes[row,col].set_title(key+(' / linear' if row==0 else ' / log1p'));axes[row,col].set_xlabel('x / m')
 fig.suptitle(d.name+' / actual GPU floor irradiance, dark region');fig.tight_layout();fig.savefig(d/'fields.png',dpi=140);plt.close(fig)
(root/'grid-metrics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats,indent=2))
