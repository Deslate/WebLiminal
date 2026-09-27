from pathlib import Path
import subprocess,json,os
root=Path(os.environ.get('EVIDENCE_DIR','../workroom-v1.22-evidence/final'));ff=os.environ.get('FFMPEG','/tmp/workroom-v120-video-tools/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1')
def hashes(args):
 t=subprocess.check_output([ff,'-v','error',*args,'-pix_fmt','rgb24','-f','framemd5','-'],text=True)
 return [l.split(',')[-1].strip() for l in t.splitlines() if not l.startswith('#')]
a=hashes(['-framerate','30','-i',str(root/'frames/frame-%04d.png')]);b=hashes(['-i',str(root/'floor-fixed-lossless.webm')]);r={'sourceFrames':len(a),'decodedFrames':len(b),'everyRGBFrameIdentical':a==b,'durationSeconds':len(b)/30};(root/'lossless-verification.json').write_text(json.dumps(r,indent=2));print(r);assert len(a)==600 and a==b
for video in ['floor-fixed-lossless','floor-fixed-realtime']:
 subprocess.run([ff,'-v','error','-i',str(root/f'{video}.webm'),'-vf','fps=1,scale=320:-1,tile=5x5','-frames:v','1','-y',str(root/f'{video}-decoded-sheet.png')],check=True)
 subprocess.run([ff,'-v','error','-ss','6','-i',str(root/f'{video}.webm'),'-frames:v','1','-y',str(root/f'{video}-decoded-6s.png')],check=True)
