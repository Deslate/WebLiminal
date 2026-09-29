from pathlib import Path
import numpy as np,av
from PIL import Image,ImageDraw
r=Path('../workroom-v1.45-evidence');w=np.array([.2126,.7152,.0722]);fs=[sorted((r/f'wall-{n}-60').glob('*.f32')) for n in ['before','after']]
assert all(len(f)==241 for f in fs)
out=av.open(str(r/'wall-irradiance-replay.mp4'),'w');stream=out.add_stream('libx264',rate=30);stream.width=800;stream.height=640;stream.pix_fmt='yuv420p';stream.options={'crf':'18'}
for i in range(241):
 canvas=Image.new('RGB',(800,640));dr=ImageDraw.Draw(canvas)
 for j in range(2):
  a=(np.fromfile(fs[j][i],np.float32).reshape(147,648,4)[:,:,:3]@w)[24:140,335:420];a=np.flipud(a)
  for y,b in enumerate([np.clip(a/1.5,0,1),np.clip(np.log1p(a/.025)/np.log1p(1.5/.025),0,1)]):canvas.paste(Image.fromarray(np.uint8(b*255)).convert('RGB').resize((220,300)),(j*400+90,25+y*310))
  dr.text((j*400+10,7),f'{["BEFORE","AFTER"][j]}   scene t={60+i/30:.2f}s');dr.text((j*400+10,100),'LINEAR');dr.text((j*400+10,410),'LOG')
 dr.text((10,627),'Actual wall irradiance buffer / fixed display scale / 30Hz replay, not an FPS test')
 frame=av.VideoFrame.from_image(canvas)
 for packet in stream.encode(frame):out.mux(packet)
for packet in stream.encode():out.mux(packet)
out.close()
