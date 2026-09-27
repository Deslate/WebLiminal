from pathlib import Path
import numpy as np,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
r=Path('../workroom-v1.29-fix-evidence/before');times=[t for t in [0,6,30,60] if (r/f'state-{t}.json').exists()];fig,axs=plt.subplots(2,len(times),figsize=(5*len(times),9),squeeze=False);arrays={}
for i,t in enumerate(times):
 info=json.loads((r/f'state-{t}.json').read_text());n=info['receivers']['3'];a=np.fromfile(r/f'combined-{t}.f32',np.float32).reshape(n['ny'],n['nx'],4)[:,:,:3]@np.array([.2126,.7152,.0722]);x=-7+(np.arange(n['nx'])+.5)*14/n['nx'];z=-17+(np.arange(n['ny'])+.5)*27/n['ny'];a=a[np.ix_((z>=-2)&(z<=0),(x>=2.5)&(x<=4.5))];b=np.fromfile(r/f'solar-2-{t}.f32',np.float32).reshape(512,512);arrays[t]=(a,b)
 axs[0,i].imshow(np.log1p(a),origin='lower',extent=[2.5,4.5,-2,0],cmap='gray',vmin=0,vmax=np.log(4));axs[0,i].set_title(f'non-solar combined / {t}s / log');axs[1,i].imshow(np.log1p(b),origin='lower',extent=[2.5,4.5,-2,0],cmap='gray',vmin=0,vmax=np.log(51));axs[1,i].set_title(f'solar / {t}s / log')
fig.tight_layout();fig.savefig(r/'layers.png',dpi=120);out={}
for t,(a,b) in arrays.items():
 out[t]={}
 for name,v,ref in [('combined',a,arrays[0][0]),('solar',b,arrays[0][1])]:out[t][name]={'mean':float(v.mean()),'cv':float(v.std()/v.mean()),'correlation0':float(np.corrcoef(v.ravel(),ref.ravel())[0,1]),'relativeL1Change':float(np.mean(abs(v-ref))/ref.mean())}
print(json.dumps(out,indent=2));(r/'metrics.json').write_text(json.dumps(out,indent=2))
