from pathlib import Path
import json,numpy as np
from PIL import Image,ImageDraw
r=Path('../workroom-v1.61-evidence');cases=['baseline','sun64','sky64','solar-only','sky-only','short-half','short-double','sky16','sky256','sky-jitter4','sun-spatial16','sky-jitter64','sky-jitter256','final'];m=json.load(open(r/'baseline/manifest.json'));d=m['readings'][0]['fields']['47'];ny,nx=d['ny'],d['nx'];dx=14/nx;dz=27/ny
x=-7+(np.arange(nx)+.5)*dx;z=-17+(np.arange(ny)+.5)*dz;regions={'sunlit-ceiling':(5.5,-2.4,6.9,-.8),'dark-ceiling':(-3,5,1,8),'behind-arch':(5.5,-6,6.9,-4.2),'door-ceiling':(-1,-2.75,1,-1.8)}
def read(c,t=6,kind='current'):return np.fromfile(r/c/f'47-{t}-{kind}.f32',np.float32).reshape(ny,nx,4)[:,:,:3]@np.array([.2126,.7152,.0722])
def stats(a):
 gy,gx=np.gradient(a,dz,dx);g=np.sqrt(np.mean(gx*gx+gy*gy));w=np.outer(np.hanning(a.shape[0]),np.hanning(a.shape[1]));p=abs(np.fft.rfft2((a-a.mean())*w))**2;p[0,0]=0;fz=np.fft.fftfreq(a.shape[0],dz);fx=np.fft.rfftfreq(a.shape[1],dx);f=np.hypot(fz[:,None],fx[None,:]);return {'mean':float(a.mean()),'cv':float(a.std()/max(a.mean(),1e-12)),'gradientRMS':float(g),'gradientLengthMM':float(1000*a.std()/max(g,1e-12)),'frequencyCentroidCyclesPerM':float((p*f).sum()/max(p.sum(),1e-12)),'powerAbove4CyclesPerM':float(p[f>4].sum()/max(p.sum(),1e-12))}
a=read('baseline');result={'units':'raw transported receiver irradiance, fixed physical ROIs, gradient length is NOT filament width','regions':{}}
for label,(xmin,zmin,xmax,zmax)in regions.items():
 ix=np.flatnonzero((x>=xmin)&(x<xmax));iz=np.flatnonzero((z>=zmin)&(z<zmax));sl=np.ix_(iz,ix);result['regions'][label]={'bounds':[xmin,zmin,xmax,zmax],'shape':[len(iz),len(ix)],'cases':{}}
 scale=max(np.percentile(a[sl],99),1e-9);sheet=Image.new('RGB',(350*len(cases),460),(20,20,20));draw=ImageDraw.Draw(sheet)
 for i,c in enumerate(cases):
  if not (r/c/'manifest.json').exists():continue
  b=read(c);v=b[sl];s=stats(v);s['vsBaselineRelativeMAE']=float(abs(v-a[sl]).mean()/max(a[sl].mean(),1e-12));s['temporal100msRMS']=float(np.sqrt(np.mean((read(c,6.1)[sl]-v)**2)));result['regions'][label]['cases'][c]=s
  for j,display in enumerate([np.clip(v/scale,0,1),np.sqrt(np.clip(v/scale,0,1))]):
   im=Image.fromarray(np.uint8(display*255)).resize((340,200));sheet.paste(im,(350*i,30+j*225))
  draw.text((350*i+5,5),c,fill='white')
 sheet.save(r/(label+'-irradiance.png'))
coeff=np.fromfile(r/'baseline/waves.f32',np.float32).reshape(864,448,4,4)
def wave(px,pz):
 qx=np.clip((px+7)*32-.5,0,447);qz=np.clip((pz+17)*32-.5,0,863);ix=qx.astype(int);iz=qz.astype(int);tx=qx-ix;tz=qz-iz;co=coeff[iz,ix];vx=np.stack([tx*0+1,tx,tx**2,tx**3],-1);vz=np.stack([tz*0+1,tz,tz**2,tz**3],-1);return np.einsum('...i,...ij,...j->...',vz,co,vx)
for c in cases:
 if not (r/c/'manifest.json').exists():continue
 co=np.fromfile(r/c/'waves.f32',np.float32).reshape(864,448,4,4);sl=co[480:800,160:320];# unobstructed front pool, same source region
 height=sl[:,:,0,0];sx=32*sl[:,:,0,1];sz=32*sl[:,:,1,0]
 result.setdefault('waveDiagnostics',{})[c]={'heightRMSmm':float(height.std()*1000),'normalRMSdegrees':float(np.sqrt(np.mean(np.arctan(np.hypot(sx,sz))**2))*180/np.pi)}
result['integratedCeiling']={c:float(read(c).sum()*dx*dz) for c in cases if (r/c/'manifest.json').exists()}
if (r/'sky-only/manifest.json').exists():result['sourceSumRelativeL1']=float(abs(read('solar-only')+read('sky-only')-a).sum()/abs(a).sum())
(r/'metrics.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
