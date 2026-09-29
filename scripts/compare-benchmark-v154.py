import json
from pathlib import Path
import numpy as np
r=Path('../workroom-v1.54-evidence');old=Path('../workroom-v1.53-evidence/benchmark');new=r/'benchmark';m=json.load(open(old/'current/manifest.json'));n=json.load(open(new/'current/manifest.json'));assert m['segments']==n['segments'];a=np.load(old/'current/source-luma.npy',mmap_mode='r');b=np.load(new/'current/source-luma.npy',mmap_mode='r');ref=np.load('../workroom-v1.51-evidence/benchmark/static-light/source-luma.npy',mmap_mode='r');out={'beforeSource':m['sourceHash'],'afterSource':n['sourceHash'],'method':'76s matched route; fixed original static-light dark mask; display luma, not energy','holds':{}}
for seg in m['segments']:
 if not seg.get('hold') or seg['name']=='water-body':continue
 lo=round((seg['start']+1)*30);hi=round(seg['end']*30);md=np.fromfile(new/'masks'/(seg['name']+'.f32'),np.float32).reshape(416,640,4);sid=np.rint(md[:,:,0]).astype(int)-1;mask=(sid>=0)&(md[:,:,3]<.5)
 if 'door-interior' in seg['name']:mask&=(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
 sm=ref[lo:hi].mean(0)/255;mask&=(sm>2/255)&(sm<.30);d={}
 for label,src in [('before',a),('after',b)]:
  v=src[lo:hi][:,mask].astype(float)/255;med=float(np.median(v));p99=float(np.percentile(v,99));d[label]={'mean':float(v.mean()),'median':med,'p99':p99,'contrast':p99/med,'p99MinusMedian':p99-med,'delta100msP99':float(np.percentile(abs(v[3:]-v[:-3]),99))}
 out['holds'][seg['name']]=d
(r/'benchmark-comparison.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
