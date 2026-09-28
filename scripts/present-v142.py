from pathlib import Path
from PIL import Image,ImageDraw
import av,json,numpy as np
r=Path('../workroom-v1.42-evidence')
video=r/'keyboard-slow/first-person-keyboard.webm'
c=av.open(str(video));frames=[];targets=iter([3,5,7,9,11,14,17]);target=next(targets,None)
for f in c.decode(video=0):
 t=float(f.pts*f.time_base)
 if target is not None and t>=target:
  frames.append((t,f.to_image()));target=next(targets,None)
 if target is None:break
sheet=Image.new('RGB',(960, len(frames)//2*344+(344 if len(frames)%2 else 0)), '#151515');d=ImageDraw.Draw(sheet)
for i,(t,im) in enumerate(frames):
 im.thumbnail((480,312));x=(i%2)*480;y=(i//2)*344;sheet.paste(im,(x,y+28));d.text((x+10,y+8),f'candidate-slow / recorded t={t:.2f}s',fill='white')
sheet.save(r/'keyboard-slow/contact.png')
(r/'keyboard-slow/decoded.json').write_text(json.dumps({'timestamps':[x[0] for x in frames],'video':str(video)},indent=2))
if (r/'water/reference-pose-candidate-slow.png').exists():
 files=[Path('../workroom-v1-evidence/previous-proof/06-full-resolution.png'),r/'water/reference-pose-baseline.png',r/'water/reference-pose-candidate-slow.png'];labels=['EARLY REFERENCE / frozen 1024 samples','CURRENT / matched camera / t=12s','BACKGROUND EXPERIMENT / slow / t=12s / NOT MERGED']
 sheet=Image.new('RGB',(960,3*632),'#151515');d=ImageDraw.Draw(sheet)
 for i,(file,label) in enumerate(zip(files,labels)):
  im=Image.open(file).convert('RGB');im.thumbnail((960,600));sheet.paste(im,(0,i*632+32));d.text((12,i*632+10),label,fill='white')
 sheet.save(r/'reference-comparison.png')
metrics=json.loads((r/'water/ambient-metrics.json').read_text());means={k:{q:float(np.mean([v[str(i)][q] for i in [360,720,1800]])) for q in v['360']} for k,v in metrics.items()};(r/'water/means.json').write_text(json.dumps(means,indent=2));print(json.dumps(means,indent=2))
