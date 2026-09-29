from pathlib import Path
import json,numpy as np
from scipy.signal import welch
r=Path('../workroom-v1.47-evidence');out={}
for name in ['before','after']:
 a=np.array(json.loads((r/f'wave-time-{name}.json').read_text()));v=a[:,1:].reshape(len(a),16,3)
 freq,p=welch(v[:,:,1:],fs=30,nperseg=512,axis=0);p=p.sum((1,2))
 out[name]={'normalTemporalCentroidHz':float((freq*p).sum()/p.sum()),'heightRMSmm':float(np.sqrt((v[:,:,0]**2).mean())*1000),'slopeRMSdegrees':float(np.sqrt((v[:,:,1:]**2).sum(2).mean())*180/np.pi),'powerAbove1Hz':float(p[freq>1].sum()/p.sum())}
(r/'temporal-analysis.json').write_text(json.dumps(out,indent=2));print(out)
