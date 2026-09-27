from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
p=Path('../workroom-v1.17-evidence/aperture-proof');report={}
for width in [4.8,3.6]:
 data={m:json.loads((p/f'mode{m}-width{width}.json').read_text()) for m in [0,1,2]};report[str(width)]={}
 for sid in ['10','18','32','40']:
  d=data[0][sid];v={m:np.array(data[m][sid]['irradiance']).reshape(d['ny'],d['nx'],4)[:,:,:3]@np.array([.2126,.7152,.0722]) for m in data};r=v[2];mask=r>1e-5
  report[str(width)][sid]={str(m):{'RMSvs64':float(np.sqrt(np.mean((v[m]-r)**2))),'missedLitFraction':float(np.mean(v[m][mask]<1e-7)),'integral':float(v[m].sum()),'peak':float(v[m].max())} for m in data}
  if sid=='18':
   im=Image.new('RGB',(1296,1050),'#141414');dr=ImageDraw.Draw(im);maximum=max(float(x.max()) for x in v.values())
   for j in [0,1,2]:
    q=np.clip(v[j]/maximum,0,1);rgb=np.stack([q,q**.6,q**.3],-1)*255;im.paste(Image.fromarray(rgb.astype('uint8')[::-1]).resize((1296,294)),(0,j*350+30));dr.text((10,j*350+5),['OLD 4 fixed aperture points','NEW spatially distributed aperture samples (same budget)','REFERENCE 64 fixed aperture points (16x diagnostic budget)'][j],fill='white')
   im.save(p/f'sky-only-width{width}.png')
(p/'comparison.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
