from pathlib import Path
from PIL import Image
import subprocess,io,sys
source,target=sys.argv[1:];ff='/Users/steven/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac'
# The installed Playwright FFmpeg has only MJPEG/VP8 decoders. Feed maximum
# quality 4:4:4 MJPEG via image2pipe; original lossless PNGs remain the authority.
cmd=[ff,'-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','mjpeg','-framerate','30','-i','pipe:0','-c:v','libvpx','-deadline','good','-cpu-used','4','-b:v','16M','-crf','4','-qmin','4','-qmax','12','-g','30','-auto-alt-ref','0','-lag-in-frames','0','-y',target]
p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
try:
 for file in sorted(Path(source).glob('frame-*.png')):
  buf=io.BytesIO();Image.open(file).convert('RGB').save(buf,format='JPEG',quality=100,subsampling=0);p.stdin.write(buf.getvalue())
finally:p.stdin.close()
assert p.wait()==0
