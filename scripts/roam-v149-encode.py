# Stream length-prefixed source PNGs into a viewable video; retain exact luma.
import sys,struct,io,json
from pathlib import Path
import av,numpy as np
from PIL import Image
root=Path(sys.argv[1]);n=int(sys.argv[2]);w=int(sys.argv[3]);h=int(sys.argv[4]);fps=int(sys.argv[5])
luma=np.lib.format.open_memmap(root/'source-luma.npy',mode='w+',dtype='uint8',shape=(n,h,w))
c=av.open(str(root/'roam.mp4'),'w');s=c.add_stream('libx264',rate=fps);s.width=w;s.height=h;s.pix_fmt='yuv420p';s.options={'crf':'12','preset':'fast'}
for i in range(n):
 header=sys.stdin.buffer.read(4)
 if len(header)!=4:raise RuntimeError(f'truncated frame {i}/{n}')
 size=struct.unpack('<I',header)[0];buf=bytearray()
 while len(buf)<size:
  part=sys.stdin.buffer.read(size-len(buf))
  if not part:raise RuntimeError('truncated PNG')
  buf.extend(part)
 a=np.asarray(Image.open(io.BytesIO(buf)).convert('RGB'));luma[i]=np.rint(a@np.array([.2126,.7152,.0722])).astype('uint8')
 f=av.VideoFrame.from_ndarray(a,format='rgb24');f.pts=i
 for p in s.encode(f):c.mux(p)
 if i%fps==0:Image.fromarray(a).save(root/f'second-{i//fps:03d}.png')
for p in s.encode():c.mux(p)
c.close();luma.flush()
