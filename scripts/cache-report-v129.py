from pathlib import Path
import json,numpy as np
from scipy.ndimage import gaussian_filter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw
r=Path('../workroom-v1.29-fix-evidence');nx,ny=672,1296;x=-7+(np.arange(nx)+.5)/48;z=-17+(np.arange(ny)+.5)/48
read=lambda p:np.fromfile(p,np.float32).reshape(ny,nx,4)[:,:,:3]@np.array([.2126,.7152,.0722])
cut=lambda a:a[np.ix_(abs(z+6)<1,abs(x)<1)]
a=read(r/'dark/dark-before/combined-6.f32');b=read(r/'dark/wide-cache/combined-6.f32');n=read(r/'dark/no-base/combined-6.f32');old0=read(r/'before/combined-0.f32');old60=read(r/'before/combined-60.f32')
vs=[cut(old0),cut(old60),cut(b),cut(n)];fig,axs=plt.subplots(2,4,figsize=(16,8))
for i,(v,label) in enumerate(zip(vs,['old 0s','old 60s','new kernel 6s','cache disabled 6s'])):
 for j in range(2):axs[j,i].imshow(v if j==0 else np.log1p(v/.02),origin='lower',extent=[-1,1,-7,-5],cmap='gray',vmin=0,vmax=.5 if j==0 else np.log1p(.5/.02));axs[j,i].set_title(label+(' / linear' if j==0 else ' / log(1+E/0.02)'));axs[j,i].set_xlabel('world x / m')
fig.suptitle('Dark-floor non-solar irradiance, common display scale; 2 m crop');fig.tight_layout();fig.savefig(r/'report/cache-linear-log.png',dpi=140);plt.close(fig)
fig,axs=plt.subplots(1,3,figsize=(14,5))
for ax,v,label in zip(axs,[cut(a),cut(b),cut(n)],['old 6s','new 6s','cache disabled 6s']):
 h=v-gaussian_filter(v,.08*48);ax.imshow(h,origin='lower',extent=[-1,1,-7,-5],cmap='RdBu_r',vmin=-.06,vmax=.06);ax.set_title(label+' / residual, sigma=80mm')
fig.tight_layout();fig.savefig(r/'report/cache-residual.png',dpi=140);plt.close(fig)
summary={'method':'2 m dark ROI x[-1,1] z[-7,-5], cell 1/48 m. HP uses Gaussian sigma80mm, NOT a hard wavelength cutoff. FFT band is 150-500mm with Hann window.','before':{},'after':{},'noCache':{}}
for key,v in zip(['before','after','noCache'],[a,b,n]):
 q=cut(v);h=q-gaussian_filter(q,.08*48);w=np.outer(np.hanning(96),np.hanning(96));p=abs(np.fft.fft2((q-q.mean())*w))**2;freq=np.fft.fftfreq(96,1/48);fx,fz=np.meshgrid(freq,freq);f=np.hypot(fx,fz);summary[key]={'mean':float(q.mean()),'cv':float(q.std()/q.mean()),'highpassRMS':float(h.std()),'highpassRMSOverOriginalMean':float(h.std()/cut(a).mean()),'band150to500Power':float(p[(f>=2)&(f<=1/.15)].sum()),'wholeFloorSum':float(v.sum())}
for key,v in [('before',cut(a)),('after',cut(b))]:
 h=v-gaussian_filter(v,.25*48);g=np.gradient(h,1/48);summary[key]['gradientLengthMm']=float(1000*h.std()/np.sqrt(np.mean(g[0]**2+g[1]**2)))
 p=abs(np.fft.fft2(h*np.outer(np.hanning(96),np.hanning(96))))**2;ac=np.fft.fftshift(np.fft.ifft2(p).real);ac/=ac[48,48];yy,xx=np.indices(ac.shape);rr=np.hypot(yy-48,xx-48);v=np.array([ac[(rr>=i)&(rr<i+1)].mean() for i in range(30)]);i=np.where(v<np.exp(-1))[0][0];summary[key]['radialCorrelation1eMm']=float((i-1+(v[i-1]-np.exp(-1))/(v[i-1]-v[i]))/48*1000)
summary['old0to60Correlation']=float(np.corrcoef(cut(old0).ravel(),cut(old60).ravel())[0,1]);summary['cacheMeanShare']=float(cut(a-n).mean()/cut(a).mean());summary['meanChange']=float(cut(b).mean()/cut(a).mean()-1);summary['wholeFloorChange']=float(b.sum()/a.sum()-1)
summary['solarMaxAbsDifference']=float(abs(np.fromfile(r/'dark/dark-before/solar-2-6.f32',np.float32)-np.fromfile(r/'dark/wide-cache/solar-2-6.f32',np.float32)).max())
(r/'report/cache-metrics.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
canvas=Image.new('RGB',(3072,1080),'white');d=ImageDraw.Draw(canvas)
for i,name in enumerate(['dark-before','wide-cache','no-base']):canvas.paste(Image.open(r/'dark'/name/'under-6.png'),(i*1024,56));d.text((i*1024+20,20),name+' / t6s / same underwater camera / exposure .85',fill='black')
canvas.save(r/'report/cache-underwater-ab.png')
final=read(r/'dark/final/combined-60.f32');fig,axs=plt.subplots(2,3,figsize=(12,8))
for i,(v,label) in enumerate([(cut(old0),'old 0s'),(cut(old60),'old 60s'),(cut(final),'final 60s')]):
 for j in range(2):axs[j,i].imshow(v if j==0 else np.log1p(v/.02),origin='lower',extent=[-1,1,-7,-5],cmap='gray',vmin=0,vmax=.5 if j==0 else np.log1p(.5/.02));axs[j,i].set_title(label+(' / linear' if j==0 else ' / log'));axs[j,i].set_xlabel('world x / m')
fig.tight_layout();fig.savefig(r/'report/cache-60s-final.png',dpi=140);plt.close(fig)
