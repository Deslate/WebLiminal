from pathlib import Path
import json,numpy as np,subprocess,imageio_ffmpeg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image,ImageDraw
r=Path('../workroom-v1.29-fix-evidence');q=json.loads((r/'wake/metrics.json').read_text());rows=[]
fig,axs=plt.subplots(2,2,figsize=(13,9))
for run in q['runs']:
 t=9 if run['speed']==.8 else 5;a=next(a for a in run['rows'] if a['t']==t);i=0 if run['strength']==.3 else 1;j=0 if run['speed']==.8 else 1
 h=np.array(a['roi']).reshape(192,288)*1000;im=axs[j,i].imshow(h,origin='lower',extent=[-4,5,-2,4],cmap='RdBu_r',vmin=-40,vmax=40);axs[j,i].set_title(f"strength {run['strength']}, speed {run['speed']}m/s, t={t}s");axs[j,i].set_xlabel('x / m');axs[j,i].set_ylabel('z / m');rows.append({'strength':run['strength'],'speed':run['speed'],**{k:v for k,v in a.items() if k!='roi'}})
fig.colorbar(im,ax=axs.ravel().tolist(),label='Physical height / mm');fig.savefig(r/'report/wake-height.png',dpi=140);plt.close(fig);(r/'report/wake-summary.json').write_text(json.dumps(rows,indent=2))
# No synthetic overlay in the scene: this is a labelled contact sheet of actual renderer output.
canvas=Image.new('RGB',(2560,888),'white');d=ImageDraw.Draw(canvas)
for i,n in enumerate(['before','after']):canvas.paste(Image.open(r/f'video/{n}/0210.png'),(i*1280,56));d.text((i*1280+20,20),n+' / t7s / body strength '+str([.3,.45][i]),fill='black')
canvas.save(r/'report/wake-above-before-after.png')
ff=imageio_ffmpeg.get_ffmpeg_exe()
for n in ['before','after']:
 subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-framerate','30','-i',str(r/f'video/{n}/%04d.png'),'-c:v','libx264','-crf','0','-preset','fast','-pix_fmt','yuv444p',str(r/f'video/{n}.mp4')],check=True)
# Quietness computed on raw images, not compressed video. Walking deliberately increases local motion.
metrics={}
for n in ['before','after']:
 a=None;series=[]
 for i in range(361):
  b=np.asarray(Image.open(r/f'video/{n}/{i:04d}.png')).astype(float)[...,:3]/255
  if a is not None:series.append(float(np.abs(b-a).mean()))
  a=b
 metrics[n]={'prewalkMedian':float(np.median(series[1:59])),'walkingMedian':float(np.median(series[60:270])),'stoppedMedian':float(np.median(series[270:])),'frameMAE':series}
(r/'report/wake-image-motion.json').write_text(json.dumps(metrics,indent=2))
