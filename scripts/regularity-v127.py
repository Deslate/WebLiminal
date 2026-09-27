"""Actual solar receiver, same 2m ROI; Hann PSD, directional/radial concentration and nonzero-lag ACF."""
from pathlib import Path
import numpy as np,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.ndimage import maximum_filter
root=Path('../workroom-v1.27-evidence'); out=root/'irradiance';out.mkdir(parents=True,exist_ok=True)
arrays={n:np.fromfile(p,np.float32).reshape(512,512) for n,p in [('before',out/'before-main.f32' if (out/'before-main.f32').exists() else Path('../workroom-v1.26-evidence/irradiance/final-main.f32')),('after',out/'final-main.f32')]}
metrics={}; fig,axs=plt.subplots(2,3,figsize=(15,8))
for row,(name,a) in enumerate(arrays.items()):
 g=np.gradient(a,2/511); centered=a-a.mean();w=np.outer(np.hanning(512),np.hanning(512)); f=np.fft.fftshift(np.fft.fftfreq(512,2/511));x,y=np.meshgrid(f,f);r=np.hypot(x,y);theta=np.mod(np.arctan2(y,x),np.pi);ps=abs(np.fft.fftshift(np.fft.fft2(centered*w)))**2
 mask=(r>=3)&(r<=40); bins=np.linspace(0,np.pi,19);d=np.histogram(theta[mask],bins,weights=ps[mask])[0];d/=d.sum();rad=np.histogram(r[mask],np.arange(3,42),weights=ps[mask])[0];rad/=rad.sum()
 # ACF of demeaned field with zero padding, overlap-count normalized; discard central lobe.
 ft=np.fft.fft2(centered,s=(1024,1024));ac=np.fft.fftshift(np.fft.ifft2(abs(ft)**2).real);lag=np.arange(-512,512);lx,ly=np.meshgrid(lag,lag);overlap=np.maximum(512-abs(lx),1)*np.maximum(512-abs(ly),1);ac=ac/overlap;ac/=ac[512,512];dist=np.hypot(lx,ly)*2/511;eligible=(dist>=.06)&(dist<=.5);peaks=eligible&(ac==maximum_filter(ac,size=7));peak=float(ac[peaks].max())
 metrics[name]={'gradientLengthMm':float(a.std()/np.sqrt(np.mean(g[0]**2+g[1]**2))*1000),'cv':float(a.std()/a.mean()),'mean':float(a.mean()),'max10degreeDirectionFraction':float(d.max()),'directionFractions':d.tolist(),'max1CyclePerMetreBandFraction':float(rad.max()),'radialEffectiveBins':float(1/(rad**2).sum()),'autocorrelationPeak60to500mm':peak,'autocorrelationPeak150to500mm':float(ac[peaks & (dist>=.15)].max()),'radialFractions':rad.tolist()}
 axs[row,0].bar(np.arange(18)*10+5,d,width=9);axs[row,0].set_title(name+' / angular power, 3–40 cycles/m');axs[row,1].plot(np.arange(3,41),rad);axs[row,1].set_title('radial power / 1 cycle/m bins');axs[row,2].imshow(ac[384:641,384:641],origin='lower',extent=[-.5,.5,-.5,.5],cmap='coolwarm',vmin=-1,vmax=1);axs[row,2].set_title('overlap-normalized autocorrelation')

for ax in axs[:,0]:ax.set_ylim(0,.4)
for ax in axs[:,1]:ax.set_ylim(0,.22)
fig.tight_layout();fig.savefig(root/'regularity.png',dpi=140);plt.close(fig)
for transform in ['linear','log']:
 fig,axs=plt.subplots(1,2,figsize=(12,6));vmax=max(a.max() for a in arrays.values());vmax=np.ceil(vmax/10)*10
 for ax,(name,a) in zip(axs,arrays.items()):
  display=a if transform=='linear' else np.log1p(a);im=ax.imshow(display,origin='lower',extent=[2.5,4.5,-2,0],cmap='gray',vmin=0,vmax=vmax if transform=='linear' else np.log1p(vmax));ax.set_title(name);ax.set_xlabel('floor x / m');ax.set_ylabel('floor z / m')
 fig.suptitle('DIRECT SOLAR IRRADIANCE / t=6s / same ROI / '+transform+' common scale');fig.colorbar(im,ax=axs,label='E' if transform=='linear' else 'ln(1+E)');fig.savefig(root/f'irradiance-{transform}.png',dpi=160);plt.close(fig)
(root/'regularity.json').write_text(json.dumps({'method':'Demeaned 512², 2m ROI; Hann power restricted 3–40 cycles/m; ACF zero-padded with overlap normalization; local peaks 60–500mm. Same definitions before/after. Thresholds are artifact screens, not proof of naturalness.','metrics':metrics},indent=2));print(json.dumps(metrics,indent=2))
