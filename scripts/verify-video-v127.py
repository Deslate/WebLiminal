from pathlib import Path
import subprocess,json,os
r=Path('../workroom-v1.27-evidence/appearance');ff=os.environ.get('FFMPEG','/tmp/workroom-v120-video-tools/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1')
def hashes(args):
 t=subprocess.check_output([ff,'-v','error',*args,'-pix_fmt','rgb24','-f','framemd5','-'],text=True)
 return [l.split(',')[-1].strip() for l in t.splitlines() if not l.startswith('#')]
out={}
for name,count in [('final-normal',300),('final-floor',600)]:
 p=r/name;a=hashes(['-framerate','30','-i',str(p/'frames/frame-%04d.png')]);b=hashes(['-i',str(p/'appearance-fixed-lossless.webm')]);out[name]={'sourceFrames':len(a),'decodedFrames':len(b),'everyRGBFrameIdentical':a==b,'seconds':count/30};assert len(a)==count and a==b
 subprocess.run([ff,'-v','error','-ss','6','-i',str(p/'appearance-fixed-lossless.webm'),'-frames:v','1','-y',str(p/'decoded-6s.png')],check=True)
(r/'lossless-verification.json').write_text(json.dumps(out,indent=2));print(out)
