from pathlib import Path
from PIL import Image,ImageDraw
import json,subprocess,os,io
root=Path(os.environ.get('EVIDENCE_DIR','/Users/steven/Projects/workroom-v1.8-evidence/final'));review=root/'review';review.mkdir(exist_ok=True)
ffmpeg='/Users/steven/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac'
report={}
for kind in ['front','inside']:
 files=sorted((root/f'{kind}-frames').glob('frame-*.png'))
 proc=subprocess.Popen([ffmpeg,'-y','-f','image2pipe','-framerate','25','-vcodec','mjpeg','-i','pipe:0','-c:v','libvpx','-crf','8','-b:v','8M',str(root/f'{kind}-seam.webm'),'-loglevel','error'],stdin=subprocess.PIPE)
 for p in files:
  packet=io.BytesIO();Image.open(p).convert('RGB').save(packet,format='JPEG',quality=98,subsampling=0);proc.stdin.write(packet.getvalue())
 proc.stdin.close();assert proc.wait()==0
 def sheet(ids,name):
  canvas=Image.new('RGB',(1512,810),(18,22,23));d=ImageDraw.Draw(canvas)
  for k,i in enumerate(ids):
   im=Image.open(files[i]).convert('RGB');im.thumbnail((378,246));x=k%4*378;y=k//4*270;canvas.paste(im,(x,y));d.text((x+5,y+248),f'{kind} {i/25:.2f}s / {i:04}',fill='white')
  canvas.save(review/name)
 for start in range(0,len(files),12):sheet(list(range(start,min(start+12,len(files)))),f'{kind}-consecutive-{start//12:02}.jpg')
 ids=list(range(0,len(files),10))
 for start in range(0,len(ids),12):sheet(ids[start:start+12],f'{kind}-overview-{start//12:02}.jpg')
 report[kind]={'frames':len(files),'duration':(len(files)-1)/25,'encodingFps':25,'internal':[1280,832],'method':'fixed-time sequence, not real-time performance'}
(root/'sequence-review.json').write_text(json.dumps(report,indent=2))
# Same unedited renders side by side; only resize for this labelled contact sheet.
canvas=Image.new('RGB',(1512,530),(18,22,23));d=ImageDraw.Draw(canvas)
for i,(folder,label) in enumerate([('before','v1.7'),('final','v1.8')]):
 im=Image.open(root.parent/folder/'springFront.png').convert('RGB');im.thumbnail((756,491));canvas.paste(im,(756*i,0));d.text((756*i+15,502),label+' / same pose / 0.30m',fill='white')
canvas.save(root/'spring-comparison.jpg')
