from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import math,json
p=Path('../workroom-v1.17-evidence/final');src=Image.open(p/'before-same-time.png').convert('RGB');im=Image.new('RGB',(1280,932),'#121212');im.paste(src,(0,100));d=ImageDraw.Draw(im);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
d.text((16,12),'BEFORE: predicted reflected-aperture edge, not an atlas block border',fill='white',font=font)
d.text((16,43),'Red: flat-water sun footprint limit. Waves displace it. Cyan: actual geometry corner.',fill='white',font=font)
d.text((16,72),'Wall x=7m; z=-1.6 -(0.295/0.69)*(y+6.102-2*0.42). Original image unchanged.',fill='white',font=font)
points=[]
for k in range(151):
 y=.5+k*5.3/150;z=-1.6-(.295/.69)*(y+6.102-2*.42);dy=y-1.62;depth=math.cos(.2)*6+math.sin(.2)*dy;up=-math.sin(.2)*6+math.cos(.2)*dy;x=640*(1+(z+6)/depth/((1280/832)*(36/(1280/832)/2/28)));py=416*(1-up/depth/(36/(1280/832)/2/28));points.append((x,py+100))
for k in range(0,len(points)-3,6):d.line(points[k:k+4],fill='#ff6969',width=3)
d.line([(998,100),(1081,930)],fill='#55ddec',width=2)
im.save(p/'before-boundary-annotated.png');(p/'boundary.json').write_text(json.dumps({'wall':'x=7m','predictedEdge':'z=-1.6-(.295/.69)*(y+6.102-2*.42)','camera':{'x':1,'y':1.62,'z':-6,'yaw':-math.pi/2,'pitch':.2},'meaning':'Flat-water central-sun footprint limit from opening zmin. Actual waves and solar disc soften/move this boundary. It is not an atlas-cell seam. Cyan marks visible geometry corner approximately in image space.'},indent=2))
