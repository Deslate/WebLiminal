from pathlib import Path
import subprocess,json
import imageio_ffmpeg
from PIL import Image,ImageDraw,ImageFont
from matplotlib.font_manager import findfont
root=Path('../workroom-v1.31-evidence');ff=imageio_ffmpeg.get_ffmpeg_exe();font=ImageFont.truetype(findfont('DejaVu Sans'),20)
for view in ['above','under']:
 path=root/f'{view}-before-after.mp4';subprocess.run([ff,'-y','-framerate','30','-i',str(root/f'before/sequence-{view}/%04d.png'),'-framerate','30','-i',str(root/f'after/sequence-{view}/%04d.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(path)],check=True,stdout=subprocess.DEVNULL,stderr=(root/f'{view}-encode.log').open('w'))
 decoded=subprocess.check_output([ff,'-v','error','-i',str(path),'-f','framemd5','-'],text=True);assert sum(bool(l) and not l.startswith('#') for l in decoded.splitlines())==181
 sheet=Image.new('RGB',(1024,4*548),'white');draw=ImageDraw.Draw(sheet)
 for row,i in enumerate([0,60,120,180]):
  draw.text((10,row*548+7),f't={6+i/30:.1f}s  |  BEFORE (left) / AFTER (right)',font=font,fill='black')
  for col,name in enumerate(['before','after']):sheet.paste(Image.open(root/f'{name}/sequence-{view}/{i:04d}.png').resize((512,512)),(col*512,row*548+36))
 sheet.save(root/f'{view}-contact.png')
(root/'video-check.json').write_text(json.dumps({'framesPerVideo':181,'fps':30,'physicalTimes':[6,12],'left':'before','right':'after','method':'Same fixed cameras; physical replay, not realtime performance. H264 CRF18; source PNG retained.'},indent=2))
