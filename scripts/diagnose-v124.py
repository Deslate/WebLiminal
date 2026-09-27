"""CPU differential/inverse audit of the exported shared water field.
No image synthesis or changes to application code. Local unoccluded patch only.
"""
import numpy as np,json
from pathlib import Path
R=Path('../workroom-v1.24-evidence');R.mkdir(exist_ok=True)
d=json.load(open(R/'study/water.json'));H=np.asarray(d['values']).reshape(864,448,4)[:,:,0]
eta=1/1.333;l=np.array([.66,.69,-.295]);l/=np.linalg.norm(l);incoming=-l

def weights(t):
 return np.array([-.5*t+t*t-.5*t**3,1-2.5*t*t+1.5*t**3,.5*t+2*t*t-1.5*t**3,-.5*t*t+.5*t**3]).T

def deriv(t):
 return np.array([-.5+2*t-1.5*t*t,-5*t+4.5*t*t,.5+4*t-4.5*t*t,-t+1.5*t*t]).T*32

def field(p,amp=0):
 q=(p+np.array([7,17]))*32-.5;b=np.floor(q).astype(int);t=q-b;wx=weights(t[:,0]);wz=weights(t[:,1]);dx=deriv(t[:,0]);dz=deriv(t[:,1]);h=np.zeros(len(p));gx=h.copy();gz=h.copy()
 for j in range(4):
  for i in range(4):
   v=H[np.clip(b[:,1]+j-1,0,863),np.clip(b[:,0]+i-1,0,447)];h+=v*wx[:,i]*wz[:,j];gx+=v*dx[:,i]*wz[:,j];gz+=v*wx[:,i]*dz[:,j]
 if amp:
  for angle,lam,j in zip([.37,2.11,4.28],[.08,.105,.13],range(3)):
   k=2*np.pi/lam;direction=np.array([np.cos(angle),np.sin(angle)]);omega=np.sqrt((9.81*k+.000073*k**3)*np.tanh(k*.42));phase=k*(p@direction)-omega*7.7*.28+j*1.71;a=amp/np.sqrt(3);h+=a*np.cos(phase);g=-a*k*np.sin(phase);gx+=g*direction[0];gz+=g*direction[1]
 return h,np.stack([gx,gz],axis=-1)

def refract(g,inc=incoming):
 n=np.column_stack([-g[:,0],np.ones(len(g)),-g[:,1]]);n/=np.linalg.norm(n,axis=1)[:,None];dot=n@inc;v=eta*inc-(eta*dot+np.sqrt(1-eta*eta*(1-dot*dot)))[:,None]*n;return v

def mapping(p,amp=0):
 h,g=field(p,amp);v=refract(g);return p-v[:,[0,2]]*((.42+h)/v[:,1])[:,None]

def jac(p,amp=0):
 e=.00005;a=(mapping(p+[e,0],amp)-mapping(p-[e,0],amp))/(2*e);b=(mapping(p+[0,e],amp)-mapping(p-[0,e],amp))/(2*e);return np.stack([a,b],axis=-1)

def inverse(target,amp,seeds):
 init=target-np.array([.42,0])[0]*(-refract(np.zeros((1,2)))[0,[0,2]]/refract(np.zeros((1,2)))[0,1]);p=np.repeat(init,len(seeds),axis=0)+np.tile(seeds,(len(target),1));q=np.repeat(target,len(seeds),axis=0);steps=np.zeros(len(p),int);done=np.zeros(len(p),bool)
 for it in range(24):
  f=mapping(p,amp)-q;err=np.linalg.norm(f,axis=1);fresh=(err<1e-8)&~done;steps[fresh]=it;done|=fresh;J=jac(p,amp);det=np.linalg.det(J);J[np.abs(det)<1e-7]+=np.eye(2)*1e-5;delta=np.linalg.solve(J,f[:,:,None])[:,:,0];delta*=np.minimum(1,.05/np.maximum(np.linalg.norm(delta,axis=1),1e-9))[:,None];p[~done]-=delta[~done]
 residual=np.linalg.norm(mapping(p,amp)-q,axis=1);ok=residual<1e-8;steps[~done]=24;roots=p.reshape(len(target),len(seeds),2);valid=ok.reshape(len(target),len(seeds));counts=[]
 for row,good in zip(roots,valid):
  unique=[]
  for x in row[good]:
   if all(np.linalg.norm(x-y)>.0001 for y in unique):unique.append(x)
  counts.append(len(unique))
 return dict(seedConvergence=float(ok.mean()),targetsWithRoot=float((np.array(counts)>0).mean()),targetsMultipleRoots=float((np.array(counts)>1).mean()),maxRoots=max(counts),meanIterations=float(steps.mean()),p95Iterations=float(np.percentile(steps,95)))

x,z=np.meshgrid(np.linspace(2.2,4.2,512),np.linspace(-1.86,.14,512));p=np.column_stack([x.ravel(),z.ravel()]);out={}
rng=np.random.default_rng(124);targets=rng.uniform([2.7,-1.7],[4.3,-.3],(1024,2));seeds=np.array([[x,z] for x in [-.04,0,.04] for z in [-.04,0,.04]])
for name,amp in [('baseline',0),('short015',.00015),('short05',.0005),('short1',.001)]:
 h,g=field(p,amp);J=jac(p,amp);det=np.linalg.det(J);e=.00005;hx=(field(p+[e,0],amp)[1]-field(p-[e,0],amp)[1])/(2*e);hz=(field(p+[0,e],amp)[1]-field(p-[0,e],amp)[1])/(2*e);curv=np.sqrt(hx[:,0]**2+2*hx[:,1]**2+hz[:,1]**2)
 out[name]=dict(heightStdMm=float(h.std()*1000),slopeRMS=float(np.sqrt((g*g).sum(1).mean())),curvatureRMS=float(np.sqrt((curv*curv).mean())),detP01=float(np.percentile(det,1)),foldFraction=float((det<0).mean()),nearFocusFraction=float((abs(det)<.2).mean()),inverseOne=inverse(targets,amp,np.array([[0,0]])),inverseNine=inverse(targets,amp,seeds))
 
 if amp==.001:
  folded=p[det<0][::max(1,int((det<0).sum()/128))];q=mapping(folded,amp);out[name]['inverseFoldTargets25Seeds']=inverse(q,amp,np.array([[x,z] for x in np.arange(-.02,.021,.01) for z in np.arange(-.02,.021,.01)]))
 print(name,out[name],flush=True)
# Fourier diagnostic on 4x4m patch; Hann window and mean removal.
a=H[480:608,256:384];ft=abs(np.fft.fft2((a-a.mean())*np.outer(np.hanning(128),np.hanning(128))))**2;k=np.fft.fftfreq(128,1/32);kx,kz=np.meshgrid(k,k);kr=np.hypot(kx,kz);cur=ft*kr**4
out['spectrum']={str(cut):float(cur[kr>1/cut].sum()/cur.sum()) for cut in [.5,.25,.125]}
# Flat-surface direction-to-floor derivative; projected finite solar disk ellipse.
g=np.zeros((1,2));eps=1e-5;B=np.column_stack([(-.42*refract(np.array([[eps,0]]))[0,[0,2]]/refract(np.array([[eps,0]]))[0,1]+.42*refract(g)[0,[0,2]]/refract(g)[0,1])/eps,(-.42*refract(np.array([[0,eps]]))[0,[0,2]]/refract(np.array([[0,eps]]))[0,1]+.42*refract(g)[0,[0,2]]/refract(g)[0,1])/eps]);out['slopeToLandingMetres']=B.tolist();out['focusingCurvatureInverseMetres']=(1/np.linalg.svd(B)[1]).tolist()
u=np.cross(l,[0,1,0]);u/=np.linalg.norm(u);v=np.cross(l,u);flat=-.42*refract(g)[0,[0,2]]/refract(g)[0,1];cols=[]
for axis in [u,v]:
 inc=-(l+axis*eps);inc/=np.linalg.norm(inc);r=refract(g,inc)[0];cols.append((-.42*r[[0,2]]/r[1]-flat)/eps)
D=np.column_stack(cols);out['solarDiskFullAxesMm']=(np.linalg.svd(D)[1]*.0093*1000).tolist()
(R/'differential.json').write_text(json.dumps(out,indent=2))
