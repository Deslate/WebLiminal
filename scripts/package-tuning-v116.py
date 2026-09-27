from pathlib import Path
import json,subprocess
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import imageio_ffmpeg
from matplotlib.font_manager import findfont
root=Path('../workroom-v1.16-tuning-evidence');ff=imageio_ffmpeg.get_ffmpeg_exe();font=ImageFont.truetype(findfont('DejaVu Sans'),26)
for kind,count in [('idle',181),('walk',421)]:
 args=[ff,'-y','-framerate','30','-i',str(root/f'before-{kind}/%04d.png'),'-framerate','30','-i',str(root/f'after-{kind}/%04d.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(root/f'{kind}-before-after.mp4')]
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=(root/f'{kind}-encode.log').open('w'))
 decoded=subprocess.check_output([ff,'-v','error','-i',str(root/f'{kind}-before-after.mp4'),'-f','framemd5','-'],text=True);assert sum(bool(l) and not l.startswith('#') for l in decoded.splitlines())==count
 sheet=Image.new('RGB',(2560,882),'white');draw=ImageDraw.Draw(sheet)
 for col,name in enumerate(['before','after']):
  i=90 if kind=='idle' else 210;sheet.paste(Image.open(root/f'{name}-{kind}/{i:04d}.png'),(col*1280,50));draw.text((col*1280+20,10),f'{name.upper()} | {kind} | t={5 if kind=="idle" else 7}s',fill='black',font=font)
 sheet.save(root/f'{kind}-before-after.png')
s=json.loads((root/'simulation.json').read_text())
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig,axes=plt.subplots(1,2,figsize=(12,4))
for ax,name in zip(axes,['before','after']):
 r=next(r for r in s['rows'] if r['name']==name and r['speed']==.8);m=next(m for m in r['marks'] if m['t']==11)
 v=np.array(m['roi']).reshape(192,288)*1000;im=ax.imshow(v,origin='lower',extent=[-4,5,-2,4],cmap='RdBu_r',vmin=-20,vmax=90);ax.set_title(name+' / 0.8 m/s / t=11s');ax.set_xlabel('x / m');ax.set_ylabel('z / m')
fig.colorbar(im,ax=axes,label='Actual simulated height / mm');fig.savefig(root/'slow-wake-height.png',dpi=160);plt.close(fig)
(root/'video-validation.json').write_text(json.dumps({'method':'Decoded every H264 frame; CRF18 compressed evidence, original PNG retained; left BEFORE, right AFTER; 30Hz physical replay, not realtime fps','frames':{'idle':181,'walk':421}},indent=2))
