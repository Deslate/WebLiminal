from pathlib import Path
import numpy as np,json
from PIL import Image,ImageDraw
from scipy.ndimage import gaussian_filter,maximum_filter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('../workroom-v1.43-evidence');weights=np.array([.2126,.7152,.0722]);roi=(slice(24,140),slice(335,420))
def field(p):return np.fromfile(p,np.float32).reshape(147,648,4)[:,:,:3]@weights
ref=field(root/'hot-reference64/000.f32')[roi];data={}
for n,p in [('before','wall-before'),('dense','wall-dense'),('after','hot-after')]:
 files=sorted((root/p).glob('*.f32'));a=np.stack([field(f)[roi] for f in files]);d=np.diff(a,axis=0);spec=abs(np.fft.rfft((a-a.mean(0))*np.hanning(len(a))[:,None,None],axis=0))**2;power=spec.sum((1,2));freq=np.fft.rfftfreq(len(a),1/30)
 data[n]={'frames':len(a),'mean':float(a.mean()),'spatialCV_first':float(a[0].std()/a[0].mean()),'peak_first':float(a[0].max()),'rmse_to_64_direction_reference_percent':float(np.sqrt(np.mean((a[0]-ref)**2))/ref.mean()*100),'temporalRMS_percent_mean':float(np.sqrt(np.mean(d*d))/a.mean()*100),'power_above_8Hz_percent':float(power[freq>8].sum()/power.sum()*100)}
 if n=='before':base=a
 if n=='after':after=a
# FWHM of resolved bright maxima in the fixed receiving-plane region.
a=base[0]; peaks=np.argwhere((a==maximum_filter(a,size=9))&(a>.35));widths=[]
for y,x in peaks:
 if y<5 or x<5 or y>=a.shape[0]-5 or x>=a.shape[1]-5:continue
 row=a[y];col=a[:,x];w=[]
 for p,c,step in [(row,x,27/648),(col,y,6.1/147)]:
  lo=c;hi=c
  while lo>0 and p[lo]>.5*p[c]:lo-=1
  while hi<len(p)-1 and p[hi]>.5*p[c]:hi+=1
  w.append((hi-lo)*step)
 widths.append(w)
data['bright_peak_fwhm_m']={'count':len(widths),'min':np.min(widths,axis=0).tolist(),'median':np.median(widths,axis=0).tolist(),'max':np.max(widths,axis=0).tolist()}
data['roi']={'wall_x':7,'z':[-17+335/24,-17+420/24],'y':[24*6.1/147,140*6.1/147],'cell_m':[27/648,6.1/147],'tile_m':.25}
(root/'measurements.json').write_text(json.dumps(data,indent=2))
fig,axs=plt.subplots(2,2,figsize=(11,10));extent=[data['roi']['z'][0],data['roi']['z'][1],data['roi']['y'][0],data['roi']['y'][1]]
for j,(title,a) in enumerate([('Before',base[0]),('After: finite solar disk',after[0])]):
 axs[0,j].imshow(a,origin='lower',extent=extent,vmin=0,vmax=1.5,cmap='gray');axs[0,j].set_title(title+' / linear, 0–1.5');axs[1,j].imshow(np.log1p(a/.025),origin='lower',extent=extent,vmin=0,vmax=np.log1p(1.5/.025),cmap='gray');axs[1,j].set_title(title+' / log(1+E/0.025)');
 for i in range(2):axs[i,j].set_xlabel('wall z / m');axs[i,j].set_ylabel('wall height / m')
fig.tight_layout();fig.savefig(root/'wall-irradiance-comparison.png',dpi=160);plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(12,4));idx=np.unravel_index(np.var(base,axis=0).argmax(),base.shape[1:]);
for title,a in [('Before',base),('After',after)]:
 axs[0].plot(6+np.arange(len(a))/30,a[:,idx[0],idx[1]],label=title)
 s=np.sum(abs(np.fft.rfft((a-a.mean(0))*np.hanning(len(a))[:,None,None],axis=0))**2,(1,2));f=np.fft.rfftfreq(len(a),1/30);axs[1].plot(f[1:],s[1:]/s[1:].sum(),label=title)
axs[0].set(xlabel='Simulation time / s',ylabel='Linear irradiance',title='Most time-varying receiver cell (fixed position)');axs[1].set(xlabel='Hz',ylabel='Fraction of temporal power',title='ROI temporal spectrum (Hann window)');axs[0].legend();axs[1].legend();fig.tight_layout();fig.savefig(root/'temporal-comparison.png',dpi=160)
# Original captures, only labels and layout are added.
for files,out in [(['hot-before/000.png','hot-after/000.png'],'close-before-after.png'),(['before/6.000.png','after/6.000.png'],'overview-before-after.png')]:
 if not all((root/f).exists() for f in files):continue
 outimg=Image.new('RGB',(1280,872));dr=ImageDraw.Draw(outimg)
 for j,f in enumerate(files):outimg.paste(Image.open(root/f).resize((640,416)),(j*640,24));dr.text((j*640+8,7),['BEFORE','AFTER'][j]);outimg.paste(Image.open(root/f).crop((400,340,950,700)).resize((640,419)),(j*640,452))
 outimg.save(root/out)
print(json.dumps(data,indent=2))
