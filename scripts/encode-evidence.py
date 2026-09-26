"""Encode original PNG evidence through the installed Playwright MJPEG decoder.
The PNG sequence remains the lossless source of truth; JPEG is only the video input.
"""
from pathlib import Path
from PIL import Image
import io, subprocess, sys
folder=Path(sys.argv[1])
ffmpeg=Path.home()/'Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac'
with (folder/'encoding.log').open('w') as log:
    process=subprocess.Popen([str(ffmpeg),'-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','pipe:0','-c:v','libvpx','-b:v','10M','-crf','8','-deadline','good','-cpu-used','4','-pix_fmt','yuv420p',str(folder/'motion-and-settle-12s.webm')],stdin=subprocess.PIPE,stderr=log)
    for path in sorted((folder/'sequence').glob('frame-*.png')):
        image=Image.open(path).convert('RGB');data=io.BytesIO();image.save(data,format='JPEG',quality=100,subsampling=0);process.stdin.write(data.getvalue())
    process.stdin.close()
    if process.wait():raise RuntimeError('See encoding.log')
