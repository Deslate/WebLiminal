import json
from pathlib import Path
import numpy as np,av
from PIL import Image,ImageDraw
r=Path('/Users/steven/Projects/workroom-v1.54-evidence');results={}
for name in ['floor','wall','ceiling','second-006','second-010','second-015','second-020']:
 images=[Image.open(r/v/(name+'.png')).convert('RGB') for v in ['before','after']];w,h=images[0].size;c=Image.new('RGB',(w*2,h+32));d=ImageDraw.Draw(c)
 for i,im in enumerate(images):c.paste(im,(w*i,32));d.text((w*i+10,10),['BEFORE bfb1dbc','AFTER no live water transport'][i]+' | '+name+' | same camera / exposure')
 c.save(r/(name+'-comparison.png'))
 if name in ['floor','wall','ceiling']:
  bounds={'floor':(200,90,760,290),'wall':(180,100,780,500),'ceiling':(50,10,900,80)}[name]
  vals=[]
  for im in images:
   a=np.asarray(im.crop(bounds))@np.array([.2126,.7152,.0722])/255;vals.append({'mean':float(a.mean()),'p99':float(np.percentile(a,99))})
  results[name]={'screenROI':bounds,'before':vals[0],'after':vals[1],'meanChangePercent':100*(vals[1]['mean']/vals[0]['mean']-1),'units':'display luma; floor includes water reflection/refraction, not pure irradiance'}
for name in ['before','after']:
 a=np.load(r/name/'source-luma.npy',mmap_mode='r')[16*30:22*30,175:315,200:760].astype(float)/255;delta=abs(a[3:]-a[:-3]);results.setdefault('arch-hold',{})[name]={'mean':float(a.mean()),'p99':float(np.percentile(a,99)),'delta100msP99':float(np.percentile(delta,99)),'temporalStdRMS':float(np.sqrt(np.mean(np.var(a,axis=0))))}
results['arch-hold']['screenROI']=[200,175,760,315];results['arch-hold']['intervalSeconds']=[16,22]
# Stream unmodified RGB frame pairs, labelled; video encoding is not FPS evidence.
cs=[av.open(str(r/v/'roam.mp4')) for v in ['before','after']];out=av.open(str(r/'walk-up-before-after.mp4'),'w');s=out.add_stream('libx264',rate=30);s.width=1920;s.height=656;s.pix_fmt='yuv420p';s.options={'crf':'13','preset':'fast'}
for i,pair in enumerate(zip(*(c.decode(video=0) for c in cs))):
 im=Image.new('RGB',(1920,656));d=ImageDraw.Draw(im)
 for j,f in enumerate(pair):im.paste(f.to_image(),(j*960,32));d.text((j*960+12,10),['BEFORE','AFTER — static cache + camera rays'][j]+f' | t={i/30:.2f}s')
 frame=av.VideoFrame.from_image(im)
 for p in s.encode(frame):out.mux(p)
for p in s.encode():out.mux(p)
out.close()
for c in cs:c.close()
d={'screenROI':[650,190,900,320],'intervalSeconds':[16,22]}
for name in ['before','after']:
 a=np.load(r/name/'source-luma.npy',mmap_mode='r')[480:660,190:320,650:900].astype(float)/255
 d[name]={'mean':float(a.mean()),'p99':float(np.percentile(a,99)),'delta100msP99':float(np.percentile(abs(a[3:]-a[:-3]),99))}
results['arch-dark-hold']=d
(r/'comparison.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
