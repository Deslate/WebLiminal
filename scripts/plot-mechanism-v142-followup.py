from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
r=Path('../workroom-v1.42-followup-evidence/mechanism');data=json.loads((r/'metrics.json').read_text());ts=[6,30,60,120]
fig,ax=plt.subplots(1,3,figsize=(15,4.2))
for name in ['baseline','unforced','undamped','half-step','bandwidth','energy-budget','stationary-budget','balanced-pressure']:
 if name not in data:continue
 q=data[name];a=np.array([q[str(t)]['shortPower'] for t in ts]);ax[0].plot(ts,a/a[0],'-o',label=name);ax[1].plot(ts,[q[str(t)]['frequency'] for t in ts],'-o');ax[2].plot(ts,[q[str(t)]['normalDeg'] for t in ts],'-o')
for a,title in zip(ax,['Height power in 2-6 cycles/m (relative to t=6s)','Height spectrum centroid (cycles/m)','Surface normal RMS (degrees)']):a.set_title(title,fontsize=10);a.set_xlabel('elapsed seconds');a.grid(alpha=.25)
ax[0].legend(fontsize=8);fig.suptitle('GPU wave-state measurements, same seed / ROI / clock; no image filtering');fig.tight_layout();fig.savefig(r/'ablation.png',dpi=150)
