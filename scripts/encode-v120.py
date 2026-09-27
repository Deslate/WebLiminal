"""Evidence only. Requires full FFmpeg (FFMPEG env or PATH); no app dependency."""
from pathlib import Path
import os,shutil,subprocess,sys
source,target=sys.argv[1:]
ff=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
if not ff:raise SystemExit('Set FFMPEG to a full FFmpeg build with PNG decode and libvpx-vp9.')
subprocess.run([ff,'-hide_banner','-loglevel','error','-framerate','30','-i',str(Path(source)/'frame-%04d.png'),'-c:v','libvpx-vp9','-lossless','1','-pix_fmt','gbrp','-deadline','realtime','-cpu-used','8','-row-mt','1','-threads','8','-g','60','-auto-alt-ref','0','-lag-in-frames','0','-y',target],check=True)
