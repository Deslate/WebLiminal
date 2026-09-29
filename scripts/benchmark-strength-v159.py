"""Compare exact archived bfb1dbc and current full-route raw luma using one fixed mask."""
import json,subprocess,numpy as np
from pathlib import Path
r=Path('../workroom-v1.59-evidence');old=Path('../workroom-v1.53-evidence/benchmark');new=r/'benchmark'
archived=json.load(open(old/'current/source-snapshot.json'))['sources']
assert all(subprocess.check_output(['git','show','bfb1dbc:'+f],text=True)==s for f,s in archived.items())
m=json.load(open(new/'current/manifest.json'));static=np.load(old/'static-light/source-luma.npy',mmap_mode='r');cases={'before-bfb1dbc':old/'current',**{p.parent.name:p.parent for p in new.glob('*/manifest.json')}}
cases.update({p.parent.name:p.parent for p in (r/'live-convergence').glob('*/manifest.json')})
arrays={k:np.load(p/'source-luma.npy',mmap_mode='r')for k,p in cases.items()};out={'units':'p99 delta /255; mean/p99 normalized display luma, not energy','mask':'bfb1dbc static-light mean 2/255..0.30, solid primary not direct sun; doorway intrados only','holds':{},'maskMatches':{}}
for s in m['segments']:
 if not s.get('hold') or s['name']=='water-body':continue
 lo=round((s['start']+1)*30);hi=round(s['end']*30);path=old/'masks'/(s['name']+'.f32');meta=np.fromfile(path,np.float32).reshape(416,640,4);sid=np.rint(meta[:,:,0]).astype(int)-1;mask=(sid>=0)&(meta[:,:,3]<.5)
 if 'door-interior' in s['name']:mask&=(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
 sm=static[lo:hi].mean(0)/255;mask&=(sm>2/255)&(sm<.3);out['holds'][s['name']]={}
 if (new/'masks'/path.name).exists():out['maskMatches'][s['name']]=bool(np.array_equal(meta,np.fromfile(new/'masks'/path.name,np.float32).reshape(416,640,4)))
 for name,data in arrays.items():
  v=data[lo:hi][:,mask].astype(float);out['holds'][s['name']][name]={'pixels':int(mask.sum()),'mean':float(v.mean()/255),'p99':float(np.percentile(v,99)/255),'delta100msP99':float(np.percentile(abs(v[3:]-v[:-3]),99)),'deltaRMS':float(np.sqrt(((v[3:]-v[:-3])**2).mean()))}
(r/'benchmark-strength.json').write_text(json.dumps(out,indent=2))
for k,v in out['holds'].items():print(k,{n:(a['delta100msP99'],round(a['deltaRMS'],4))for n,a in v.items()})
