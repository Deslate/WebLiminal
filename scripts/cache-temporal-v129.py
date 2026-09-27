from pathlib import Path
import numpy as np,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
r=Path('../workroom-v1.29-fix-evidence');nx,ny=672,1296;x=-7+(np.arange(nx)+.5)/48;z=-17+(np.arange(ny)+.5)/48
cut=lambda a:a[np.ix_(abs(z+6)<1,abs(x)<1)]
read=lambda p:np.fromfile(p,np.float32).reshape(ny,nx,4)[:,:,:3]@np.array([.2126,.7152,.0722])
fig,axs=plt.subplots(2,4,figsize=(16,8));result={}
for i,(name,t) in enumerate([('before',6),('before',66),('final',6),('final',66)]):
 v=cut(read(r/f'cache60/{name}/cache-{t}.f32'))
 for j in range(2):axs[j,i].imshow(v if j==0 else np.log1p(v/.02),origin='lower',extent=[-1,1,-7,-5],cmap='gray',vmin=0,vmax=.5 if j==0 else np.log1p(.5/.02));axs[j,i].set_title(f'{name} / {t}s / '+('linear' if j==0 else 'log(1+E/0.02)'));axs[j,i].set_xlabel('world x / m')
fig.suptitle('Direct cached irradiance readback: warmed up 6s, then held camera for 60s');fig.tight_layout();fig.savefig(r/'report/cache-warmed-60s-linear-log.png',dpi=140);plt.close(fig)
for name in ['before','final']:
 a=np.fromfile(r/f'cache60/{name}/cache-6.f32',np.float32);b=np.fromfile(r/f'cache60/{name}/cache-66.f32',np.float32)
 u=cut(read(r/f'cache60/{name}/combined-6.f32'));v=cut(read(r/f'cache60/{name}/combined-66.f32'))
 solar0=np.fromfile(r/f'cache60/{name}/solar-2-6.f32',np.float32);solar1=np.fromfile(r/f'cache60/{name}/solar-2-66.f32',np.float32)
 result[name]={'cachedWholeFloorMaxAbsDifference':float(np.max(abs(a-b))),'cachedWholeFloorBitIdentical':bool(np.array_equal(a,b)),'combinedDarkRoiCorrelation':float(np.corrcoef(u.ravel(),v.ravel())[0,1]),'solarBrightRoiCorrelation':float(np.corrcoef(solar0,solar1)[0,1])}
result['solarBeforeAfterMaxAbsDifference']={t:float(abs(np.fromfile(r/f'cache60/before/solar-2-{t}.f32',np.float32)-np.fromfile(r/f'cache60/final/solar-2-{t}.f32',np.float32)).max())for t in [6,66]}
(r/'report/cache-warmed-60s.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
