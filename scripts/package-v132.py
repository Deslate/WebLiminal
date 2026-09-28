from pathlib import Path
import subprocess,json
from PIL import Image,ImageDraw,ImageFont
from matplotlib.font_manager import findfont
import imageio_ffmpeg
root=Path('../workroom-v1.32-evidence');ff=imageio_ffmpeg.get_ffmpeg_exe();font=ImageFont.truetype(findfont('DejaVu Sans'),22)
subprocess.run([ff,'-y','-framerate','30','-i',str(root/'before/%04d.png'),'-framerate','30','-i',str(root/'after/%04d.png'),'-filter_complex','[0:v][1:v]hstack=inputs=2','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(root/'first-person-before-after.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=(root/'encode.log').open('w'))
checks={}
for f in [root/'first-person-before-after.mp4',root/'keyboard/first-person-keyboard.webm']:
 out=subprocess.check_output([ff,'-v','error','-i',str(f),'-f','framemd5','-'],text=True);checks[f.name]=sum(bool(s) and not s.startswith('#') for s in out.splitlines())
assert checks['first-person-before-after.mp4']==361
assert checks['first-person-keyboard.webm']>300
(root/'video-check.json').write_text(json.dumps(checks,indent=2))
canvas=Image.new('RGB',(2560,884),'white');d=ImageDraw.Draw(canvas)
for col,name in enumerate(['before','after']):canvas.paste(Image.open(root/name/'0180.png'),(col*1280,52));d.text((col*1280+20,13),name.upper()+' / first person / t=6s',font=font,fill='black')
canvas.save(root/'first-person-before-after.png')
sheet=Image.new('RGB',(1280,5*448),'white');d=ImageDraw.Draw(sheet)
for row,i in enumerate([30,90,180,240,330]):
 d.text((12,row*448+5),f't={i/30:.1f}s | BEFORE (left) / AFTER (right)',font=font,fill='black')
 for col,name in enumerate(['before','after']):sheet.paste(Image.open(root/name/f'{i:04d}.png').resize((640,416)),(col*640,row*448+32))
sheet.save(root/'contact.png')
print(checks)
print('Selected physical field equals production:',(root/'broader/wave-moving.f32').read_bytes()==(root/'after/wave-moving.f32').read_bytes())
