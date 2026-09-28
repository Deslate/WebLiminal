from pathlib import Path
import subprocess,json
from PIL import Image,ImageDraw,ImageFont
from matplotlib.font_manager import findfont
import imageio_ffmpeg,numpy as np
r=Path('../workroom-v1.34-evidence');ff=imageio_ffmpeg.get_ffmpeg_exe();font=ImageFont.truetype(findfont('DejaVu Sans'),20)
subprocess.run([ff,'-y','-framerate','30','-i',str(r/'same-view-before/%04d.png'),'-framerate','30','-i',str(r/'after/%04d.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(r/'same-view-before-after.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=(r/'encode.log').open('w'))
checks={}
for f in [r/'same-view-before-after.mp4',r/'keyboard-selected/first-person-keyboard.webm']:
 out=subprocess.check_output([ff,'-v','error','-i',str(f),'-f','framemd5','-'],text=True);checks[f.name]=sum(bool(s) and not s.startswith('#') for s in out.splitlines())
(r/'video-check.json').write_text(json.dumps(checks,indent=2))
sheet=Image.new('RGB',(1280,5*448),'white');draw=ImageDraw.Draw(sheet)
for row,i in enumerate([30,120,180,240,300]):
 draw.text((12,row*448+5),f't={i/30:.1f}s | V1.33 (left) / V1.34 (right); same camera, ambient',font=font,fill='black')
 for col,name in enumerate(['same-view-before','after']):sheet.paste(Image.open(r/name/f'{i:04d}.png').resize((640,416)),(col*640,row*448+32))
sheet.save(r/'contact.png')
metrics=[]
for i in range(0,361,15):
 a=np.asarray(Image.open(r/'same-view-before'/f'{i:04d}.png'),dtype=float)/255;b=np.asarray(Image.open(r/'after'/f'{i:04d}.png'),dtype=float)/255
 diff=np.abs(a-b)[300:,:,:3].max(axis=2)
 metrics.append({'time':i/30,'lowerImageFractionRGBDifferenceOver8of255':float(np.mean(diff>8/255)),'meanMaxChannelDifference':float(diff.mean())})
(r/'same-view-image-differences.json').write_text(json.dumps(metrics,indent=2));print(checks);print(metrics)
