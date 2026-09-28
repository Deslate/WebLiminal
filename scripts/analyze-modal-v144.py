import json,numpy as np
from pathlib import Path
from scipy.optimize import least_squares
r=Path('../workroom-v1.44-evidence');q=json.loads((r/'modal.json').read_text());rows={k:np.array(v) for k,v in q['rows'].items()};a=rows['60'];modes=[]
for j,n in enumerate([14,56,224],2):
 lam=28/n;k=2*np.pi/lam;s=4*32**2*np.sin(k/64)**2;omega=np.sqrt((9.81+.000073*s)*np.sqrt(s)*np.tanh(.42*np.sqrt(s)));gamma=(.055+.00008*s)/2
 t=a[:,0];y=a[:,j];fit=least_squares(lambda p:(np.exp(-p[1]*t)*(p[2]*np.cos(p[0]*t)+p[3]*np.sin(p[0]*t))-y)*1000,[omega,gamma,.001,0],max_nfev=10000)
 modes.append({'wavelength':lam,'measuredOmega':fit.x[0],'measuredDecay':fit.x[1],'frequencyVsDiscreteFiniteDepthPercent':100*(fit.x[0]/omega-1),'fitRMSE_mm':float(np.sqrt(np.mean(fit.fun**2)))})
result={'modes':modes,'meanHeightMaxDrift_mm':float(np.max(abs(a[:,1]-.001))*1000),'30vs60_maxHeight_mm':float(np.max(abs(rows['30'][:,1:]-a[::2,1:]))*1000),'errors':q['errors']};(r/'modal-metrics.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
