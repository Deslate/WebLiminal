from pathlib import Path
import numpy as np,json
from scipy.ndimage import map_coordinates
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path('../workroom-v1.30-evidence')
from optical_field_v130 import field
stats={}
for name in ['before','before-sync','medium','visible','coupled','single-field','final','dominant','coupled-band-off']:
 folder=root/name
 if not (folder/'state-6.json').exists():continue
 d=np.array([.66,-.69,-.295]);d/=np.linalg.norm(d);eta=1/1.333;flat=eta*d.copy();flat[1]=-np.sqrt(1-flat[0]**2-flat[2]**2);shift=-.42/flat[1]*flat[[0,2]]
 x,z=np.meshgrid(np.linspace(3.5-shift[0]-.8,3.5-shift[0]+.8,400),np.linspace(-1-shift[1]-.8,-1-shift[1]+.8,400));h,hx,hz,bh,bx,bz=field(folder)(x,z)
 n=np.stack([-hx,np.ones_like(h),-hz],-1);n/=np.linalg.norm(n,axis=-1)[...,None];dn=n@d;r=eta*d-(eta*dn+np.sqrt(1-eta*eta*(1-dn*dn)))[...,None]*n;landx=x-(.42+h)/r[:,:,1]*r[:,:,0];landz=z-(.42+h)/r[:,:,1]*r[:,:,2]
 step=1.6/399;xx=np.gradient(landx,step,axis=1);xz=np.gradient(landx,step,axis=0);zx=np.gradient(landz,step,axis=1);zz=np.gradient(landz,step,axis=0);J=xx*zz-xz*zx
 irradiance=np.fromfile(folder/'solar-2-6.f32',np.float32).reshape(512,512);sampled=map_coordinates(irradiance,[(landz+2)/2*511,(landx-2.5)/2*511],order=1,mode='nearest');good=(J>.15)&(landx>2.52)&(landx<4.48)&(landz>-1.98)&(landz<-.02);good[:3]=False;good[-3:]=False;good[:,:3]=False;good[:,-3:]=False
 flux=(1+(d[0]*hx+d[2]*hz)/(-d[1]));pred=flux/np.maximum(J,.15)
 def corr(a,b):return float(np.corrcoef(a[good],b[good])[0,1])
 baseCurvature=np.gradient(bx,step,axis=1)+np.gradient(bz,step,axis=0);bandCurvature=np.gradient(hx-bx,step,axis=1)+np.gradient(hz-bz,step,axis=0)
 stats[name]={'baseCurvatureRMS':float(np.sqrt(np.mean(baseCurvature**2))),'bandCurvatureRMS':float(np.sqrt(np.mean(bandCurvature**2))),'heightRMSmm':float(np.std(h)*1000),'baseHeightRMSmm':float(np.std(bh)*1000),'bandHeightRMSmm':float(np.std(h-bh)*1000),'baseSlopeRMS':float(np.sqrt(np.mean(bx*bx+bz*bz))),'bandSlopeRMS':float(np.sqrt(np.mean((hx-bx)**2+(hz-bz)**2))),'waterHeightToTransportedFloorCorrelation':corr(h,sampled),'jacobianPredictionToGPUCorrelation':corr(pred,sampled),'solarCV':float(irradiance.std()/irradiance.mean()),'validFraction':float(good.mean())}
 fig,axs=plt.subplots(1,3,figsize=(15,5));hm=axs[0].imshow(h*1000,vmin=-15,vmax=15,origin='lower',cmap='RdBu_r',extent=[x.min(),x.max(),z.min(),z.max()]);axs[0].set_title('Actual water height / mm');fig.colorbar(hm,ax=axs[0],shrink=.65,label='mm');axs[1].imshow(pred,origin='lower',cmap='gray',vmin=.4,vmax=2,extent=[x.min(),x.max(),z.min(),z.max()]);axs[1].set_title('Snell ray-area compression (CPU)');axs[2].imshow(sampled/np.mean(sampled),origin='lower',cmap='gray',vmin=.4,vmax=2,extent=[x.min(),x.max(),z.min(),z.max()]);axs[2].set_title('GPU floor light at ray landing points')
 if name=='final' and (root/'ray-correspondence.json').exists():
  for point in json.loads((root/'ray-correspondence.json').read_text()):
   for ax in axs:ax.plot(point['water'][0],point['water'][2],'o',mfc='none',mec='#ffdd44',ms=12,mew=2);ax.annotate(point['label'],(point['water'][0],point['water'][2]),xytext=(10,7),textcoords='offset points',color='#a56b00',weight='bold')
 for ax in axs:ax.set_xlabel('Water surface x / m');ax.set_ylabel('Water surface z / m')
 fig.suptitle(name+' / t=6s / right image re-indexed by real refracted rays, NOT rendered overlay');fig.tight_layout();fig.savefig(folder/'causal-mapping.png',dpi=140);plt.close(fig)
(root/'transport-metrics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats,indent=2))
