from pathlib import Path
import numpy as np,json,sys
p=Path(sys.argv[1]);r=json.loads(p.read_text());out={}
for name in ['before','after']:
 data=r[name];a=np.asarray(data['frames'],dtype=float).reshape(-1,64,64);t=a-a.mean(axis=0);power=(abs(np.fft.rfft(t*np.hanning(len(t))[:,None,None],axis=0))**2).sum(axis=(1,2));freq=np.fft.rfftfreq(len(t),1/data['hz']);power[0]=0
 spatial=abs(np.fft.fftshift(np.fft.fft2((a-a.mean(axis=(1,2),keepdims=True))*np.outer(np.hanning(64),np.hanning(64)),axes=(1,2)),axes=(1,2)))**2
 k=np.fft.fftshift(np.fft.fftfreq(64,data['dx']));kx,kz=np.meshgrid(k,k);rad=np.hypot(kx,kz)
 out[name]={'medianHeightRMSmm':float(np.median([x['rms']*1000 for x in data['summary']])),'peakAbsHeightMm':max(x['max']*1000 for x in data['summary']),'temporalCentroidHz':float((power*freq).sum()/power.sum()),'temporalPowerAbove2Hz':float(power[freq>2].sum()/power.sum()),'spatialPowerAbove8CyclesPerMetre':float(spatial[:,rad>8].sum()/spatial.sum()),'temporalFrequencyHz':freq.tolist(),'temporalPower':power.tolist()}
out['maxStateDifference30vs60']=r['maxDifference'];out['limits']='Raw simulated heights, same initial seed and pressure algorithm, 20s independent reset/replays. Geometry-free pool fixture; finite ROI/sample length is not proof of arbitrary-view absence of periodicity or anisotropy.'
(p.parent/'spectra-summary.json').write_text(json.dumps(out,indent=2));print(json.dumps({k:{x:y for x,y in v.items() if not isinstance(y,list)} if isinstance(v,dict) else v for k,v in out.items()},indent=2))
