from pathlib import Path
import numpy as np,json
root=Path('../workroom-v1.32-evidence');x,z=np.meshgrid(-7+(np.arange(448)+.5)/32,-17+(np.arange(864)+.5)/32);stats={}
for name in ['before','broader']:
 stats[name]={}
 for speed,t in [(.8,11),(1.6,7)]:
  h=np.fromfile(root/name/f'isolated-{speed}-{t}.f32',np.float32).reshape(864,448);hz,hx=np.gradient(h,1/32);angle=np.degrees(np.arctan(np.hypot(hx,hz)));dx=x-3.6;dz=z-1
  bow=(dx>.2)&(dx<1.2)&(abs(dz)<.3);rear=(dx<-.25)&(dx>-1.5)&(abs(dz)<.25);roi=(dx>.4)&(dx<1.5)&(abs(dz)<.75)
  views={}
  for label,pitch,focal in [('old',.028,28),('new',-.7,14)]:
   # Camera looks along +x, with actual height and the production film gate.
   dy=.42+h-1.62;forward=dx*np.cos(pitch)+dy*np.sin(pitch);vertical=-dx*np.sin(pitch)+dy*np.cos(pitch);tanY=min(24,36/(1280/832))*.5/focal
   visible=(forward>0)&(abs(vertical)<forward*tanY)&(abs(dz)<forward*tanY*1280/832)
   visible &= np.hypot(dx,dz)*(.57/(1.2-h))>.19 # actual actor top cap occlusion
   region=(dx>0)&(dx<4)&(abs(dz)<2)&visible
   views[label]={'normalRMSDegrees':float(np.sqrt(np.mean(angle[region]**2))),'normalMaxDegrees':float(angle[region].max()),'areaAbove2DegreesM2':float(np.sum(region&(angle>2))/1024)}
  stats[name][str(speed)]={'peakMM':float(h.max()*1000),'bowMM':float(h[bow].max()*1000),'rearMM':float(h[rear].min()*1000),'forwardNormalRMSDegrees':float(np.sqrt(np.mean(angle[roi]**2))),'forwardNormalMaxDegrees':float(angle[roi].max()),'views':views}
(root/'visibility-metrics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats,indent=2))
