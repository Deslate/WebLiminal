from pathlib import Path
import subprocess,json
root=Path('../workroom-v1.21-evidence/motion');ff='/tmp/workroom-v120-video-tools/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
def hashes(args):
 text=subprocess.check_output([ff,'-v','error',*args,'-pix_fmt','rgb24','-f','framemd5','-'],text=True)
 return [l.split(',')[-1].strip() for l in text.splitlines() if not l.startswith('#')]
a=hashes(['-framerate','30','-i',str(root/'frames/frame-%04d.png')]);b=hashes(['-i',str(root/'pool-floor-30s-lossless.webm')]);r={'sourceFrames':len(a),'decodedFrames':len(b),'everyRGBFrameIdentical':a==b,'durationSeconds':len(b)/30};(root/'lossless-verification.json').write_text(json.dumps(r,indent=2));print(r);assert len(a)==900 and a==b
subprocess.run([ff,'-v','error','-i',str(root/'pool-floor-30s-lossless.webm'),'-vf','select=eq(n\\,210)','-frames:v','1','-y',str(root/'decoded-frame-0210.png')],check=True)
