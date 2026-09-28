from pathlib import Path
import json,numpy as np
r=Path('../workroom-v1.37-evidence');x,z=np.meshgrid(-7+(np.arange(448)+.5)/32,-17+(np.arange(864)+.5)/32);out={}
for path in r.glob('*-spectrum.json'):
 name=path.name.replace('-spectrum.json','');out[name]={}
 for run in json.loads(path.read_text())['runs']:
  rows={}
  for v in run['rows']:
   t=v['t'];h=np.fromfile(r/f'{name}-{run["speed"]}-{t}.f32',np.float32).reshape(864,448);angle=np.arctan(np.hypot(*np.gradient(h,1/32)))*180/np.pi
   ahead=(x>v['x']+1.2)&(x<v['x']+3)&(abs(z-1)<1.5);near=(x-v['x'])**2+(z-1)**2<9
   crop=h[np.ix_(np.any(ahead,axis=1),np.any(ahead,axis=0))];win=np.outer(np.hanning(crop.shape[0]),np.hanning(crop.shape[1]));power=abs(np.fft.rfft2((crop-crop.mean())*win))**2
   kz,kx=np.meshgrid(np.fft.fftfreq(crop.shape[0],1/32),np.fft.rfftfreq(crop.shape[1],1/32),indexing='ij');freq=np.hypot(kx,kz);centroid=float((power*freq).sum()/max(1e-30,power.sum()))
   rows[t]={'frontFrequencyCentroidCyclesM':centroid,'frontNormalRMS':float(np.sqrt(np.mean(angle[ahead]**2))),'frontHeightRMSmm':float(np.sqrt(np.mean(h[ahead]**2))*1000),'frontHeightMinMaxmm':[float(h[ahead].min()*1000),float(h[ahead].max()*1000)],'localNormalRMS':float(np.sqrt(np.mean(angle[near]**2)))}
  out[name][str(run['speed'])]={'peakAbsHeightmm':run['peakMM'],'rows':rows}
(r/'metrics.json').write_text(json.dumps(out,indent=2))
for k,v in out.items():print(k,v['0.8']['rows']['6'] if '6' in v['0.8']['rows'] else v['0.8']['rows'][6])
