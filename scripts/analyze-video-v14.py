"""Inspect decoded real-time recording; pixel tests are only firefly heuristics.
Requires Pillow and numpy in the QA Python environment (not app dependencies).
"""
from pathlib import Path
import json, sys
from PIL import Image, ImageDraw
import numpy as np
root=Path(sys.argv[1]);files=sorted((root/'video-frames').glob('frame-*.png'));out=root/'video-review';out.mkdir(exist_ok=True)
report={'uiMask':'Top 64px / bottom 68px; caption x80..480 y670..840; first 3s excluded from scene heuristic (intro UI). Unmasked counts retained.', 'frames':len(files),'fps':25,'fireflyDefinition':'Luma >=75, all eight neighbours at least 25 lower, their mean <50; excludes 1px image border','samples':[]};previous=None
for index,p in enumerate(files):
 a=np.asarray(Image.open(p).convert('RGB'),dtype=np.float32);y=a[:,:,0]*.2126+a[:,:,1]*.7152+a[:,:,2]*.0722
 c=y[1:-1,1:-1];neighbours=[y[j:y.shape[0]-2+j,i:y.shape[1]-2+i] for j in range(3) for i in range(3) if (j,i)!=(1,1)]
 top=np.maximum.reduce(neighbours);mean=sum(neighbours)/8;mask=(c>=75)&(mean<50)&(c-top>=25);count=int(np.count_nonzero(mask))
 scene=mask.copy();scene[:64,:]=False;scene[914:,:]=False;scene[670:840,80:480]=False
 sceneCount=int(np.count_nonzero(scene)) if index>=75 else None
 report['samples'].append({'frame':index+1,'seconds':index/25,'isolatedBrightPixels':count,'sceneIsolatedBrightPixels':sceneCount,'meanLuminance':float(y.mean()),'consecutiveMAE':None if previous is None else float(np.abs(y-previous).mean())});previous=y

def sheet(indices,name):
 canvas=Image.new('RGB',(1512,3*270),(18,22,23));draw=ImageDraw.Draw(canvas)
 for k,i in enumerate(indices):
  im=Image.open(files[i]).convert('RGB');im.thumbnail((378,246));x=k%4*378;z=k//4*270;canvas.paste(im,(x,z));draw.text((x+7,z+247),f'Frame {i+1:04d} / {i/25:.2f}s',fill='white')
 canvas.save(out/name)
for k,start in enumerate(range(0,len(files),12)):sheet(list(range(start,min(start+12,len(files)))),f'consecutive-{k:02d}.jpg')
indices=list(range(0,len(files),12))
for k,start in enumerate(range(0,len(indices),12)):sheet(indices[start:start+12],f'overview-{k:02d}.jpg')
report['maximumSceneIsolatedBrightPixels']=max(x['sceneIsolatedBrightPixels'] or 0 for x in report['samples']);report['maximumIsolatedBrightPixels']=max(x['isolatedBrightPixels'] for x in report['samples']);(root/'video-analysis.json').write_text(json.dumps(report,indent=2));print({k:v for k,v in report.items() if k!='samples'})
