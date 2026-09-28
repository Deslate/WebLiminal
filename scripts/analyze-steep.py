from pathlib import Path
import os,json,numpy as np
import matplotlib.pyplot as plt
r=Path('../workroom-ripples-steep-evidence');dx=1/32
x,z=np.meshgrid(-7+(np.arange(448)+.5)*dx,-17+(np.arange(864)+.5)*dx)
f=np.hypot(*np.meshgrid(np.fft.fftfreq(448,dx),np.fft.fftfreq(864,dx)))
results={};fig,axes=plt.subplots(1,2,figsize=(12,4))
for name in os.environ.get('VARIANTS','before,12,16,20').split(','):
 results[name]={}
 for speed in [.8,1.6]:
  rows=json.loads((r/f'{name}-spectrum.json').read_text())['runs'];run=next(v for v in rows if v['speed']==speed);results[name][str(speed)]={'peakOverRunMM':run['peakMM'],'samples':{}}
  for t in [2,4,6,8,10,16]:
   h=np.fromfile(r/f'{name}-{speed}-{t}.f32',np.float32).reshape(864,448);hx,hz=np.gradient(h,dx);slope=np.hypot(hx,hz);actor=next(v['x'] for v in run['rows'] if v['t']==t);roi=(x-actor)**2+(z-1)**2<9
   # Whole physical field, no image FFT; subtract mean, suppress domain edge leakage.
   q=(h-h.mean())*np.outer(np.hanning(864),np.hanning(448));power=np.abs(np.fft.fft2(q))**2;power[0,0]=0;tot=power.sum();centroid=(power*f).sum()/tot
   out={'heightRMSMM':float(np.sqrt(np.mean(h[roi]**2))*1000),'normalRMSDegrees':float(np.sqrt(np.mean(np.arctan(slope[roi])**2))*180/np.pi),'normalP95Degrees':float(np.percentile(np.arctan(slope[roi])*180/np.pi,95)),'frequencyCentroidCyclesPerM':float(centroid),'powerAbove1CyclePerM':float(power[f>1].sum()/tot),'powerAbove3CyclesPerM':float(power[f>3].sum()/tot),'rmsWavelengthM':float(1/np.sqrt((power*f*f).sum()/tot))};results[name][str(speed)]['samples'][t]=out
   if speed==.8 and t==6:
    bins=np.linspace(0,5,101);hist=np.histogram(f,bins,weights=power)[0];axes[0].plot((bins[:-1]+bins[1:])/2,hist/tot,label=name)
    iz=np.argmin(abs(z[:,0]-1));axes[1].plot(x[0],h[iz]*1000,label=name)
axes[0].set(xlabel='Spatial frequency (cycles/m)',ylabel='Fraction of height power per bin');axes[1].set(xlim=(-4,4),xlabel='x (m), z = 1 m',ylabel='Height (mm)');[a.legend() for a in axes];fig.tight_layout();fig.savefig(r/'spectrum-height.png',dpi=170);(r/'metrics.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
