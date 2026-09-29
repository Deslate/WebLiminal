import json,numpy as np
from pathlib import Path
from scipy.signal import welch
from PIL import Image,ImageDraw
r=Path('../workroom-v1.47-evidence/floor-clock');rows={n:json.loads((r/f'{n}.json').read_text()) for n in ['before','after']};report={}
for n,a in rows.items():
 v=np.array([q['values'] for q in a]);f,p=welch(v,fs=10,nperseg=100,axis=0);p=p.sum(1);report[n]={'temporalCentroidHz':float((p*f).sum()/p.sum()),'delta100msRMS':float(np.sqrt((np.diff(v,axis=0)**2).mean())),'meanIrradiance':float(v.mean()),'relativeDelta100msRMS':float(np.sqrt((np.diff(v,axis=0)**2).mean())/v.mean()),'timeAgreement':all(q['cameraTime']==q['lightTime'] for q in a)}
white=max(max(q['roi']['rgb']) for a in rows.values() for q in a[:4]);report['displayWhite']=white
for mode in ['linear','sqrt']:
 out=Image.new('RGB',(1152,660));d=ImageDraw.Draw(out)
 for row,(n,a) in enumerate(rows.items()):
  for col,q in enumerate(a[:4]):
   rgb=np.array(q['roi']['rgb']).reshape(96,96,3);l=rgb@np.array([.2126,.7152,.0722])/white
   if mode=='sqrt':l=np.sqrt(np.maximum(l,0))
   im=Image.fromarray(np.uint8(np.clip(l,0,1)*255)).convert('RGB').resize((288,288),Image.Resampling.NEAREST);x=col*288;y=row*330;out.paste(im,(x,y+32));d.text((x+4,y+7),f'{n} t={q["t"]:.1f} {mode}')
 out.save(r/f'floor-{mode}.png')
(r/'analysis.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
