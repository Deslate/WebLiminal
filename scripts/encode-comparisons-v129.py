from pathlib import Path
import subprocess,imageio_ffmpeg,json
r=Path('../workroom-v1.29-fix-evidence');ff=imageio_ffmpeg.get_ffmpeg_exe()
for name in ['before','after']:
 p=r/'video-fast';subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-framerate','30','-i',str(p/name/'%04d.png'),'-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p',str(p/f'{name}.mp4')],check=True)
for folder in ['video','video-fast']:
 p=r/folder;subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-i',str(p/'before.mp4'),'-i',str(p/'after.mp4'),'-filter_complex','hstack=inputs=2,scale=1920:624','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',str(p/'comparison.mp4')],check=True)
 md5=subprocess.check_output([ff,'-hide_banner','-loglevel','error','-i',str(p/'comparison.mp4'),'-f','framemd5','-'],text=True);(p/'comparison.framemd5').write_text(md5);frames=[v for v in md5.splitlines() if not v.startswith('#')];assert len(frames)==361
print('Both 30Hz comparison videos decode to 361 frames; source PNGs retained. Review copies are lossy H.264, never used for quantitative metrics.')
