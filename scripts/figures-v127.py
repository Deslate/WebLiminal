from pathlib import Path
from PIL import Image,ImageDraw
r=Path('../workroom-v1.27-evidence');pairs=[('before',Path('../workroom-v1.26-evidence/irradiance/final-room-appearance.png')),('after',r/'irradiance/final-room-appearance.png')]
canvas=Image.new('RGB',(1280,462));d=ImageDraw.Draw(canvas)
for i,(name,p) in enumerate(pairs):
 im=Image.open(p).convert('RGB');im.thumbnail((640,416));canvas.paste(im,(640*i,46));d.text((640*i+8,8),name+' / t=6s / same exposure',fill='white');d.text((640*i+8,26),'ABOVE WATER: appearance only, not irradiance diagnosis',fill='white')
canvas.save(r/'above-water-comparison.png')
for name in ['final-normal','final-floor']:
 files=sorted((r/'appearance'/name/'frames').glob('*.png'));sheet=Image.new('RGB',(1280,230*((len(files)//30+3)//4)))
 for n,i in enumerate(range(0,len(files),30)):
  im=Image.open(files[i]);im.thumbnail((320,208));sheet.paste(im,(n%4*320,n//4*230+22));ImageDraw.Draw(sheet).text((n%4*320+5,n//4*230+4),f'APPEARANCE {name} {i/30:.1f}s',fill='white')
 sheet.save(r/f'{name}-overview.png')
