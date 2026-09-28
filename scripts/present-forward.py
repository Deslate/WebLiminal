from pathlib import Path
import json,subprocess,numpy as np
from PIL import Image,ImageDraw,ImageFont
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import imageio_ffmpeg
r=Path('../workroom-forward-evidence')
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(r/'keyboard-final/first-person-keyboard.webm'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(r/'first-person.mp4')],check=True)
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',20);im=Image.new('RGB',(1920,664),'#142329');d=ImageDraw.Draw(im)
for n,(name,label) in enumerate([('steep','Previous candidate / t=6 s'),('after','Forward body pressure / t=6 s')]):
 im.paste(Image.open(r/f'compare/{name}-180.png').resize((960,624)),(n*960,40));d.text((n*960+12,10),label,fill='white',font=font)
im.save(r/'before-after.png')
x,z=np.meshgrid(-7+(np.arange(448)+.5)/32,-17+(np.arange(864)+.5)/32);mask=(x>.4+1.2)&(x<.4+3)&(abs(z-1)<1.5)
fig,axes=plt.subplots(1,3,figsize=(13,4));m=json.loads((r/'metrics.json').read_text())
for i,name in enumerate(['steep','after']):
 h=np.fromfile(r/f'{name}-0.8-6.f32',np.float32).reshape(864,448);angles=np.arctan(np.hypot(*np.gradient(h,1/32)))*180/np.pi
 ix=np.where(mask.any(axis=0))[0];iz=np.where(mask.any(axis=1))[0];a=angles[np.ix_(iz,ix)];c=axes[i].imshow(a,origin='lower',extent=[1.2,3,-1.5,1.5],vmin=0,vmax=12,cmap='magma',aspect='auto');axes[i].set(xlabel='Distance ahead (m)',ylabel='Lateral distance (m)',title=f'{name}: {m[name]["0.8"]["rows"]["6"]["frontNormalRMS"]:.3f} deg RMS')
fig.colorbar(c,ax=list(axes[:2]),label='Normal angle (degrees)',shrink=.8)
for name,label in [('base','v1.33'),('steep','Previous candidate'),('after','Forward pressure')]:
 rows=m[name]['0.8']['rows'];ts=[2,4,6,8,10,16];axes[2].plot(ts,[rows[str(t)]['frontNormalRMS'] for t in ts],'o-',label=label)
axes[2].axvline(8,color='grey',ls=':',label='Stop');axes[2].set(xlabel='Simulation time (s)',ylabel='Forward normal RMS (degrees)',title='Same forward region');axes[2].legend(fontsize=8);axes[2].grid(alpha=.2);fig.subplots_adjust(wspace=.8);fig.savefig(r/'front-metrics.png',dpi=160);plt.close(fig)
