from pathlib import Path
import numpy as np,json
from PIL import Image,ImageDraw
p=Path('../workroom-v1.19-evidence/lattice-proof');report={};imgs=[]
for n in ['normal','flat','skyOnly','sunOnly','dense','sparse','oldFour','reference','shallow','deep','narrow']:
 a=json.load(open(p/(n+'.json')));v=np.array(a['rgb']).reshape(96,96,3)@np.array([.2126,.7152,.0722]);win=np.outer(np.hanning(96),np.hanning(96));f=np.abs(np.fft.fftshift(np.fft.fft2((v-v.mean())*win)))**2;yy,xx=np.mgrid[-48:48,-48:48];f[(xx*xx+yy*yy)<25]=0;peaks=[]
 for y in range(1,95):
  for x in range(1,95):
   if y>=48 and f[y,x]>0 and f[y,x]==f[y-1:y+2,x-1:x+2].max():peaks.append((float(f[y,x]),x-48,y-48))
 peaks=sorted(peaks,reverse=True)[:8];report[n]={'mean':v.mean(),'cv':v.std()/max(v.mean(),1e-20),'peaks':[{'power':a,'kx':x,'kz':y,'periodM':2/(x*x+y*y)**.5} for a,x,y in peaks]}
 im=Image.fromarray(np.uint8(np.clip(v/max(np.quantile(v,.98),1e-20),0,1)*255)).convert('RGB').resize((768,768));im.save(p/(n+'-field.png'));d=ImageDraw.Draw(im)
 for x in range(0,769,96):d.line((x,0,x,768),fill=(80,130,75));d.line((0,x,768,x),fill=(80,130,75))
 im.save(p/(n+'-tile-overlay.png'));imgs.append((n,im))
canvas=Image.new('RGB',(1536,((len(imgs)+3)//4)*414),'#151515');d=ImageDraw.Draw(canvas)
for i,(n,im)in enumerate(imgs):x=i%4*384;y=i//4*414;canvas.paste(im.resize((384,384)),(x,y+30));d.text((x+5,y+6),n+' | individual scale, 25cm tile grid',fill='white')
canvas.save(p/'fields-overview.jpg',quality=95);(p/'analysis.json').write_text(json.dumps(report,indent=2));print(json.dumps({n:{'mean':r['mean'],'peaks':r['peaks'][:2]} for n,r in report.items()},indent=2))
