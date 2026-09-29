import json,numpy as np
from pathlib import Path
r=Path('../workroom-v1.61-evidence');old=Path('../workroom-v1.53-evidence/benchmark');new=r/'benchmark';before=Path('../workroom-v1.60-evidence/benchmark/current')
m=json.load(open(new/'current/manifest.json'));static=np.load(old/'static-light/source-luma.npy',mmap_mode='r');cases={'before':before,'after':new/'current'}
arrays={k:np.load(p/'source-luma.npy',mmap_mode='r')for k,p in cases.items()};out={'units':'display 8bit luma, 100ms raw pixel differences','mask':'fixed bfb1dbc static-light mean 2/255..0.30, solid primary not direct sun; doorway intrados only','holds':{}}
for s in m['segments']:
 if not s.get('hold') or s['name']=='water-body':continue
 lo=round((s['start']+1)*30);hi=round(s['end']*30);meta=np.fromfile(old/'masks'/(s['name']+'.f32'),np.float32).reshape(416,640,4);sid=np.rint(meta[:,:,0]).astype(int)-1;mask=(sid>=0)&(meta[:,:,3]<.5)
 if 'door-interior' in s['name']:mask&=(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
 sm=static[lo:hi].mean(0)/255;mask&=(sm>2/255)&(sm<.3);out['holds'][s['name']]={}
 for name,data in arrays.items():
  v=data[lo:hi][:,mask].astype(float);out['holds'][s['name']][name]={'pixels':int(mask.sum()),'mean':float(v.mean()/255),'delta100msP99':float(np.percentile(abs(v[3:]-v[:-3]),99)),'deltaRMS':float(np.sqrt(((v[3:]-v[:-3])**2).mean()))}
if(new/'repeat/manifest.json').exists():
 a=arrays['after'];b=np.load(new/'repeat/source-luma.npy',mmap_mode='r');out['repeatDifferentValues']=sum(int(np.count_nonzero(a[i:i+60]!=b[i:i+60]))for i in range(0,len(a),60));out['repeatValues']=int(a.size)
(r/'benchmark-comparison.json').write_text(json.dumps(out,indent=2));print(out)
