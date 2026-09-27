"""Package existing paired captures; no rendering or scene changes."""
from pathlib import Path
import subprocess, imageio_ffmpeg
from PIL import Image, ImageDraw
root=Path('../workroom-v1.30-evidence')
exe=imageio_ffmpeg.get_ffmpeg_exe()
for name in ['before-sync','final']:
 p=root/name
 subprocess.run([exe,'-y','-framerate','30','-i',str(p/'surface/%04d.png'),'-framerate','30','-i',str(p/'floor/%04d.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2,scale=1600:800','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(p/'surface-floor-sync.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=(p/'encode.log').open('w'))
 out=subprocess.check_output([exe,'-v','error','-i',str(p/'surface-floor-sync.mp4'),'-f','framemd5','-'],text=True)
 count=sum(1 for line in out.splitlines() if line and not line.startswith('#'))
 assert count==361,count
 (p/'decode-check.txt').write_text(f'Decoded frames: {count}\n30 fps; source t=6..18s; left=above water, right=underwater\n')
 sheet=Image.new('RGB',(768,5*410),'white');draw=ImageDraw.Draw(sheet)
 for row,i in enumerate([0,90,180,270,360]):
  draw.text((8,row*410+3),f't={6+i/30:.1f}s | above water (left) / underwater (right)',fill='black')
  for col,view in enumerate(['surface','floor']):
   im=Image.open(p/view/f'{i:04d}.png').resize((384,384))
   sheet.paste(im,(col*384,row*410+26))
 sheet.save(p/'sequence-contact.png')
