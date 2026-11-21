"""Matched-control attribution. Flags sampling sensitivity, never infers truth from darkness alone."""
from pathlib import Path
import sys,json,numpy as np
r=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.49-evidence/benchmark');m=json.loads((r/'current/manifest.json').read_text());base=np.load(r/'current/source-luma.npy',mmap_mode='r');result={'thresholds':{'dominantChainRatio':.25,'samplingSensitiveDeltaRatio':.5,'minimumDeltaRMS':.5/255,'repeatMaxAllowedLumaLevels':0},'holds':{}}
for seg in m['segments']:
 if not seg.get('hold'):continue
 h,w=m['height'],m['width'];lo=int((seg['start']+1)*30);hi=int(seg['end']*30)
 block=lambda a:a.reshape(len(a),h//8,8,w//8,8).mean((2,4))
 a=block(base[lo:hi].astype(float)/255);meta=np.fromfile(r/'masks'/(seg['name']+'.f32'),np.float32).reshape(h,w,4);sid=np.rint(meta[:,:,0]).astype(int)-1
 eligible=(sid>=0)&(meta[:,:,3]<.5)
 if 'door-interior' in seg['name']:eligible&=(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
 if seg['name']=='water-body':eligible=meta[:,:,0]==-9
 mask=(eligible.reshape(h//8,8,w//8,8).mean((1,3))>=.9)&(a.mean(0)>2/255)&(a.mean(0)<.4)
 d=(a[3:]-a[:-3])[:,mask];rms=float(np.sqrt(np.mean(d*d))) if mask.any() else 0;entry={'darkBlocks':int(mask.sum()),'baselineDeltaRMS':rms,'controls':{}}
 for n in ['repeat','no-glaze','rotated','no-diffuse','static-light','rotated-transfer','dense-transfer','low-transfer']:
  p=r/n/'manifest.json'
  if not p.exists():continue
  mm=json.loads(p.read_text())
  if mm.get('renderEquivalenceHash',mm['sourceHash'])!=m.get('renderEquivalenceHash',m['sourceHash']):raise ValueError('Mismatched source '+n)
  b=block(np.load(r/n/'source-luma.npy',mmap_mode='r')[lo:hi].astype(float)/255);db=(b[3:]-b[:-3])[:,mask];err=db-d;br=float(np.sqrt(np.mean(db*db))) if mask.any() else 0;er=float(np.sqrt(np.mean(err*err))) if mask.any() else 0
  entry['controls'][n]={'deltaRMS':br,'deltaRMS_ratio':br/max(rms,1e-12),'temporalDifferenceRMS':er,'temporalDifferenceRatio':er/max(rms,1e-12),'temporalCorrelation':float(np.corrcoef(d.ravel(),db.ravel())[0,1]) if mask.any() and np.std(db)>0 and np.std(d)>0 else None,'sameTimeMAE':float(np.mean(abs((b-a)[:,mask]))) if mask.any() else 0}
 labels=[];cs=entry['controls']
 if 'repeat' in cs and cs['repeat']['sameTimeMAE']>0:labels.append('NOT_EXACTLY_REPRODUCIBLE')
 for key,tag in [('no-glaze','GLAZE_CHAIN_DOMINATES'),('no-diffuse','DYNAMIC_DIFFUSE_CHAIN_DOMINATES'),('static-light','LIVE_ILLUMINATION_CHAIN_DOMINATES')]:
  if key in cs and cs[key]['deltaRMS_ratio']<.25 and rms>.5/255:labels.append(tag)
 for key,tag in [('rotated','GLAZE_QUADRATURE_SENSITIVE'),('rotated-transfer','DIFFUSE_QUADRATURE_SENSITIVE')]:
  if key in cs and cs[key]['temporalDifferenceRatio']>.5 and cs[key]['temporalDifferenceRMS']>.5/255:labels.append(tag)
 if not labels:labels=['NO_ATTRIBUTION_FROM_AVAILABLE_CONTROLS']
 entry['classification']=labels;entry['physicalTruth']='Direct shadow does not exclude reflected or indirect light. A chain ablation identifies origin, not correctness. Rotating quadrature should preserve a converged integral; sample sensitivity is an error indicator. A 64-direction reference is finite, not ground truth.';result['holds'][seg['name']]=entry
(r/'attribution.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:{'classification':v['classification'],'rms':v['baselineDeltaRMS'],'ratios':{n:round(c['deltaRMS_ratio'],3) for n,c in v['controls'].items()}} for k,v in result['holds'].items()},indent=2))
