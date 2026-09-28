from pathlib import Path
import json,numpy as np,os
r=Path(os.environ.get('EVIDENCE_DIR','../workroom-v1.42-evidence/water'));out={}
def crop(h):return h[160:704,64:384]
def stats(h):
 a=crop(h);gz,gx=np.gradient(a,1/32);angle=np.arctan(np.hypot(gx,gz))*180/np.pi;w=np.outer(np.hanning(a.shape[0]),np.hanning(a.shape[1]));p=abs(np.fft.rfft2((a-a.mean())*w))**2;kz,kx=np.meshgrid(np.fft.fftfreq(a.shape[0],1/32),np.fft.rfftfreq(a.shape[1],1/32),indexing='ij');f=np.hypot(kx,kz)
 return {'frequencyCyclesM':float((p*f).sum()/p.sum()),'heightRMSmm':float(np.sqrt(np.mean(a*a))*1000),'normalRMSdeg':float(np.sqrt(np.mean(angle*angle)))}
for name in os.environ.get('VARIANTS','baseline,candidate').split(','):
 hs={i:np.fromfile(r/f'ambient-{name}-{i}.f32',np.float32).reshape(864,448) for i in [0,360,361,720,721,1800,1801]};rows={i:stats(hs[i]) for i in [0,360,720,1800]}
 for i in [360,720,1800]:
  a,b=crop(hs[i]),crop(hs[i+1]);ga=np.stack(np.gradient(a,1/32));gb=np.stack(np.gradient(b,1/32));rows[i]['frameHeightChangeRMSmm']=float(np.sqrt(np.mean((a-b)**2))*1000);rows[i]['frameSlopeChangeRMS']=float(np.sqrt(np.mean(np.sum((ga-gb)**2,axis=0))))
 out[name]=rows
(r/'ambient-metrics.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
