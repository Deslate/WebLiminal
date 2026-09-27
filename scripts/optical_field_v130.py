import numpy as np,json
def field(folder):
 meta=json.loads((folder/'state-6.json').read_text());base=np.fromfile(folder/'wave-6.f32',np.float32).reshape(864,448,4)[:,:,0];modes=np.array(meta['shortWaves']).reshape(-1,4)
 def eval(x,z):
  px=np.clip((x+7)*32-.5,0,447);pz=np.clip((z+17)*32-.5,0,863);ix=np.floor(px).astype(int);iz=np.floor(pz).astype(int);tx=px-ix;tz=pz-iz
  W=lambda t:np.array([-.5*t+t*t-.5*t**3,1-2.5*t*t+1.5*t**3,.5*t+2*t*t-1.5*t**3,-.5*t*t+.5*t**3]);D=lambda t:np.array([-.5+2*t-1.5*t*t,-5*t+4.5*t*t,.5+4*t-4.5*t*t,-t+1.5*t*t]);wx,wz,dx,dz=W(tx),W(tz),D(tx),D(tz);h=np.zeros_like(x);hx=h.copy();hz=h.copy()
  for j in range(4):
   for i in range(4):
    v=base[np.clip(iz+j-1,0,863),np.clip(ix+i-1,0,447)];h+=v*wx[i]*wz[j];hx+=v*dx[i]*wz[j]*32;hz+=v*wx[i]*dz[j]*32
  bh=h.copy();bx=hx.copy();bz=hz.copy()
  for kx,kz,phase,a in modes:
   q=kx*x+kz*z+phase;h+=a*np.cos(q);hx-=a*kx*np.sin(q);hz-=a*kz*np.sin(q)
  return h,hx,hz,bh,bx,bz
 return eval
