"""Matched six-second screenshots; display RGB differences, not emitted energy."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json
r=Path('../workroom-v1.58-evidence');base=np.asarray(Image.open(r/'matrix/default.png').convert('RGB')).astype(float);luma=np.array([.2126,.7152,.0722]);results=[]
for row in json.load(open(r/'matrix.json')):
 a=np.asarray(Image.open(r/'matrix'/(row['name']+'.png')).convert('RGB')).astype(float);d=abs(a-base);v={**row,'rgbMAELevels':float(d.mean()),'rgbP99Levels':float(np.percentile(d,99)),'changedPixelFraction':float(np.any(d>0,axis=2).mean()),'rois':{}}
 for name,(x,y,X,Y)in {'floor-patch':(700,410,890,430),'ceiling':(600,15,775,50),'dark-water':(90,450,450,560)}.items():
  t=a[y:Y,x:X]@luma/255;v['rois'][name]={'mean':float(t.mean()),'p99':float(np.percentile(t,99))}
 results.append(v)
(r/'matrix-analysis.json').write_text(json.dumps(results,indent=2))
names=['water-full','default','water-off','reflection-1','directions-32','resolution-half'];im=Image.new('RGB',(1920,864),(20,20,20));d=ImageDraw.Draw(im)
for i,name in enumerate(names):
 x=i%3*640;y=i//3*432;im.paste(Image.open(r/'matrix'/(name+'.png')).resize((640,400)),(x,y+32));d.text((x+12,y+10),name+' | same camera, 6s',fill='white')
im.save(r/'switch-comparison.png')
a=np.asarray(Image.open('../workroom-v1.57-evidence/reference/transmission.png')).astype(int);b=np.asarray(Image.open(r/'reference/transmission.png')).astype(int);delta=abs(a-b);eq={'differentChannels':int(np.count_nonzero(delta)),'maxChannelDifference':int(delta.max()),'meanAbsoluteChannelDifference':float(delta.mean())}
if (r/'reference/off.png').exists():
 old=np.asarray(Image.open('../workroom-v1.55-evidence/candidate.png')).astype(int);new=np.asarray(Image.open(r/'reference/off.png')).astype(int);t=abs(new-old);eq['offVs507febb']={'differentChannels':int(np.count_nonzero(t)),'maxChannelDifference':int(t.max()),'meanAbsoluteChannelDifference':float(t.mean()),'floorMean':float((new[820:860,1400:1780,:3]@luma/255).mean())}
(r/'default-equivalence.json').write_text(json.dumps(eq,indent=2))
lines=['| 档位 | RGB平均绝对差（0–255） | 池底亮区均值 | fps | ms/帧 | 内部尺寸 |','|---|---:|---:|---:|---:|---|']
for a in results:lines.append(f"| {a['name']} | {a['rgbMAELevels']:.5f} | {a['rois']['floor-patch']['mean']:.6f} | {a['fps']:.2f} | {a['meanMs']:.2f} | {'×'.join(map(str,a['internal']))} |")
(r/'matrix-table.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines));print(eq)
