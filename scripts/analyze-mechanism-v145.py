import numpy as np,json,sys
from pathlib import Path
r=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.45-evidence/mechanism');out={}
for file in r.glob('*.f32'):
 name,t=file.stem.rsplit('-',1);h=np.fromfile(file,np.float32).reshape(864,448);a=h[480:800,64:384];a=a-a.mean();gz,gx=np.gradient(a,1/32);w=np.outer(np.hanning(a.shape[0]),np.hanning(a.shape[1]));p=abs(np.fft.rfft2(a*w))**2;kz,kx=np.meshgrid(np.fft.fftfreq(a.shape[0],1/32),np.fft.rfftfreq(a.shape[1],1/32),indexing='ij');k=np.hypot(kx,kz)
 out.setdefault(name,{})[t]={'frequency':float((p*k).sum()/p.sum()),'heightMM':float(np.sqrt(np.mean(a*a))*1000),'normalDeg':float(np.sqrt(np.mean(np.arctan(np.hypot(gx,gz))**2))*180/np.pi),'shortPower':float(p[(k>=2)&(k<6)].sum()),'longPower':float(p[k<1].sum()),'finePower':float(p[(k>=3)&(k<8)].sum()),'p99SlopeDeg':float(np.percentile(np.arctan(np.hypot(gx,gz))*180/np.pi,99)),'slopeSpatialCV_1m':float(np.std(np.sqrt((gx*gx+gz*gz).reshape(10,32,10,32).mean((1,3))))/np.mean(np.sqrt((gx*gx+gz*gz).reshape(10,32,10,32).mean((1,3))))), 'maxHeightMM':float(np.max(abs(a))*1000)}
(r/'metrics.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
