# Geometric diagnostic, not a renderer: reflected solar-centre rays from the
# measured GPU height field, before occlusion. Local map determinant measures
# physical focusing. Restrict to the front open pool/wall for interpretation.
from pathlib import Path
import numpy as np,json
from scipy.ndimage import gaussian_filter
r=Path('../workroom-v1.45-evidence');result={}
Z,X=np.mgrid[:864,:448];X=-7+(X+.5)/32;Z=-17+(Z+.5)/32
sun=np.array([-.66,.69,.295]);sun/=np.linalg.norm(sun);inc=-sun
for name in ['baseline','after']:
 h=np.fromfile(r/f'mechanism/{name}-60.f32',np.float32).reshape(864,448)
 hz,hx=np.gradient(h,1/32);n=np.stack([-hx,np.ones_like(h),-hz],-1);n/=np.linalg.norm(n,axis=-1)[...,None]
 ray=inc-2*np.sum(n*inc,-1)[...,None]*n;t=(7-X)/ray[...,0]
 wallY=.42+h+t*ray[...,1];wallZ=Z+t*ray[...,2]
 yz,yx=np.gradient(wallY,1/32);zz,zx=np.gradient(wallZ,1/32);det=yx*zz-yz*zx
 # Solar-centre straight incoming path to ceiling aperture.
 up=(6.101-.42-h)/sun[1];ax=X+up*sun[0];az=Z+up*sun[2]
 m=(ax>-4.5)&(ax<.3)&(az>-1.6)&(az<4.2)&(Z>-2.8)&(wallZ>-2.8)&(wallY>.42)&(wallY<5.8)&(X<6.8)
 result[name]={'samples':int(m.sum()),'nearFoldFraction_absDetBelow_0_2':float(np.mean(abs(det[m])<.2)), 'mapDeterminantP5P50P95':np.percentile(det[m],[5,50,95]).tolist(),'targetY_P5P95':np.percentile(wallY[m],[5,95]).tolist(),'targetZ_P5P95':np.percentile(wallZ[m],[5,95]).tolist()}
(r/'reflection-map.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
