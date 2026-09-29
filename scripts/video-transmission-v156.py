import av
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('../workroom-v1.56-evidence');paths=[Path('../workroom-v1.54-evidence/before/roam.mp4'),Path('../workroom-v1.54-evidence/after/roam.mp4'),r/'after/roam.mp4'];cs=[av.open(str(p))for p in paths];out=av.open(str(r/'door-walk-three-way.mp4'),'w');s=out.add_stream('libx264',rate=30);s.width=2880;s.height=656;s.pix_fmt='yuv420p';s.options={'crf':'13','preset':'fast'}
for i,frames in enumerate(zip(*(c.decode(video=0)for c in cs))):
 im=Image.new('RGB',(2880,656),(20,20,20));d=ImageDraw.Draw(im)
 for j,f in enumerate(frames):
  im.paste(f.to_image(),(960*j,32));d.text((960*j+12,10),['MAIN: reflection + transmission','NO LIVE WATER','TRANSMISSION + diffuse delta'][j]+f' | {i/30:.2f}s',fill='white')
 for packet in s.encode(av.VideoFrame.from_image(im)):out.mux(packet)
for packet in s.encode():out.mux(packet)
out.close()
for c in cs:c.close()
