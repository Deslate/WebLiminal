from pathlib import Path
import numpy as np,json
p=Path('../workroom-v1.27-evidence/wave-spectrum.json');d=json.loads(p.read_text());out={}
x,z=np.meshgrid(np.linspace(2.5,4.5,512),np.linspace(-2,0,512));freq=np.fft.fftshift(np.fft.fftfreq(512,2/511));fx,fz=np.meshgrid(freq,freq);r=np.hypot(fx,fz);angle=np.mod(np.arctan2(fz,fx),np.pi);mask=(r>3)&(r<40)
for name,v in d.items():
 modes=np.array(v['uniforms']).reshape(-1,4);height=sum(m[3]*np.cos(m[0]*x+m[1]*z+m[2]) for m in modes);power=abs(np.fft.fftshift(np.fft.fft2((height-height.mean())*np.outer(np.hanning(512),np.hanning(512)))))**2
 angular=np.histogram(angle[mask],np.linspace(0,np.pi,19),weights=power[mask])[0];angular/=angular.sum();k=np.linalg.norm(modes[:,:2],axis=1);omega=np.sqrt((9.81*k+.000073*k**3)*np.tanh(.42*k))*.28*v['timeScale']
 out[name]={'heightRmsMm':float(np.sqrt(np.mean(height**2))*1000),'max10degreeDirectionFraction':float(angular.max()),'angularFractions':angular.tolist(),'curvatureRmsPerMetre':float(np.sqrt(np.sum((modes[:,3]*k*k)**2)/2)),'modalFrequenciesHz':(omega/(2*np.pi)).tolist(),'rmsHeightVelocityMmPerSecond':float(np.sqrt(np.sum((modes[:,3]*omega)**2)/2)*1000)}
Path('../workroom-v1.27-evidence/raw-wave-metrics.json').write_text(json.dumps(out,indent=2))
