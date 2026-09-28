import numpy as np,json
from pathlib import Path
r=Path('../workroom-v1.42-followup-evidence/mechanism');out={}
for file in r.glob('*.f32'):
 name,t=file.stem.rsplit('-',1);h=np.fromfile(file,np.float32).reshape(864,448);a=h[160:704,64:384];a=a-a.mean();gz,gx=np.gradient(a,1/32);w=np.outer(np.hanning(a.shape[0]),np.hanning(a.shape[1]));p=abs(np.fft.rfft2(a*w))**2;kz,kx=np.meshgrid(np.fft.fftfreq(a.shape[0],1/32),np.fft.rfftfreq(a.shape[1],1/32),indexing='ij');k=np.hypot(kx,kz)
 out.setdefault(name,{})[t]={'frequency':float((p*k).sum()/p.sum()),'heightMM':float(np.sqrt(np.mean(a*a))*1000),'normalDeg':float(np.sqrt(np.mean(np.arctan(np.hypot(gx,gz))**2))*180/np.pi),'shortPower':float(p[(k>=2)&(k<6)].sum()),'longPower':float(p[k<1].sum())}
(r/'metrics.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
