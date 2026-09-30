# Raw body-wave height fields (no rendering): top-down maps and wedge statistics.
# The wedge half-angle is an apparent crest-envelope estimate at this depth and
# speed, not a Kelvin-angle claim.
from pathlib import Path
import json,os,numpy as np,matplotlib
matplotlib.use('Agg');import matplotlib.pyplot as plt
r=Path(os.environ.get('EVIDENCE_ROOT','../workroom-cone-evidence'))/'simulation'
x,z=np.meshgrid(-7+(np.arange(448)+.5)/32,-17+(np.arange(864)+.5)/32)
def load(name,speed,t):return np.fromfile(r/f'{name}-{speed}-{t}.f32',np.float32).reshape(864,448)
def stats(h,bx):
 slope=np.arctan(np.hypot(*np.gradient(h,1/32)))*180/np.pi
 ahead=(x>bx+1.2)&(x<bx+3)&(abs(z-1)<1.5)
 behind=(x<bx-.4)&(x>bx-3.4)&(abs(z-1)<3)
 bearing=np.degrees(np.arctan2(abs(z-1),bx-x))
 wedge=behind&(bearing<30)
 # Crest envelope: lateral offset of the steepest cell on each side, per slice behind the body.
 arms={}
 for side,sign in (('left',1),('right',-1)):
  d,w=[],[]
  for back in np.arange(.8,3.01,.25):
   col=int(round((bx-back+7)*32-.5));lat=sign*(z[:,col]-1)
   m=(lat>.05)&(lat<3)
   if not m.any():continue
   k=np.argmax(np.where(m,slope[:,col],-1));d.append(back);w.append(lat[k])
  d,w=np.array(d),np.array(w);arms[side]=float(np.degrees(np.arctan((d@w)/(d@d)))) if len(d) else None
 e=slope**2
 return{'frontNormalRMS':float(np.sqrt(np.mean(slope[ahead]**2))),'frontHeightRMSmm':float(np.sqrt(np.mean(h[ahead]**2))*1000),
  'behindNormalRMS':float(np.sqrt(np.mean(slope[behind]**2))),'wedgeEnergyFraction30deg':float(e[wedge].sum()/max(1e-30,e[behind].sum())),
  'apparentArmHalfAngleDeg':arms,'heightMinMaxmm':[float(h[behind|ahead].min()*1000),float(h[behind|ahead].max()*1000)]}
out={}
names=[p.stem for p in sorted(r.glob('*.json')) if p.stem!='metrics']
for name in names:
 meta=json.loads((r/f'{name}.json').read_text());out[name]={}
 for run in meta['runs']:
  out[name][str(run['speed'])]={'peakAbsHeightmm':run['peakMM'],'rows':{str(v['t']):stats(load(name,run['speed'],v['t']),v['x']) for v in run['rows']}}
 out[name]['stress']=meta['stress'];out[name]['refinement']=meta['refinement']
(r/'metrics.json').write_text(json.dumps(out,indent=2))
for speed in ('0.8','1.6'):
 times=[4,6,8,10];fig,ax=plt.subplots(len(names),len(times),figsize=(4*len(times),3.8*len(names)),constrained_layout=True)
 meta={n:json.loads((r/f'{n}.json').read_text()) for n in names}
 for i,name in enumerate(names):
  rows={v['t']:v['x'] for run in meta[name]['runs'] if str(run['speed'])==speed for v in run['rows']}
  for j,t in enumerate(times):
   h=load(name,speed,t)*1000;bx=rows[t];c=ax[i,j].imshow(h,origin='lower',extent=[-7,7,-17,10],cmap='RdBu_r',vmin=-30,vmax=30)
   ax[i,j].set_xlim(bx-5,bx+3);ax[i,j].set_ylim(-2.5,4.5);ax[i,j].plot(bx,1,'ko',ms=4)
   ax[i,j].set_title(f"{dict(head='HEAD fragmented kicks',after='restored bow R=.65').get(name,name)}  t={t}s")
 fig.colorbar(c,ax=ax,label='height mm (walk +x, body = dot)');fig.savefig(r.parent/f'fields-{speed}.png',dpi=110);plt.close(fig)
for name,v in out.items():
 print(name,{t:{k:(round(q,3) if isinstance(q,float) else q) for k,q in s.items()} for t,s in v['0.8']['rows'].items() if t in ('4','6','8')})
