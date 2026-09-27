from pathlib import Path
from PIL import Image,ImageDraw
import json,numpy as np,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.16-evidence/final');data=json.loads((root/'wake-simulation.json').read_text());canvas=Image.new('RGB',(1440,1050),'#171c20');draw=ImageDraw.Draw(canvas)
for j,(run,t) in enumerate(zip(data['runs'],[11,7])):
 row=next(r for r in run['rows'] if r['t']==t);a=np.array(row['roi']).reshape(192,288);v=np.clip(a/.06,-1,1);rgb=np.stack([128+127*v,128-70*abs(v),128-127*v],-1).astype('uint8');im=Image.fromarray(rgb).resize((720,480));canvas.paste(im,(j*720,70));draw.text((j*720+20,20),f"{run['speed']} m/s | same body position ({row['x']:.1f},1.0)m",fill='white');draw.text((j*720+20,43),f"Raw height: red +60mm / gray 0 / blue -60mm | direction ->",fill='white')
 draw.text((j*720+20,570),f"Bow {row['bow']*1000:.1f}mm | aft trough {row['rear']*1000:.1f}mm",fill='white');draw.text((j*720+20,595),f"Wake ROI 1-4m aft: RMS {row['farRMS']*1000:.2f}mm",fill='white')
 # Same physical region later, not an independently constructed wake pattern.
 end=next(r for r in run['rows'] if r['t']==23);a=np.array(end['roi']).reshape(192,288);v=np.clip(a/.06,-1,1);rgb=np.stack([128+127*v,128-70*abs(v),128-127*v],-1).astype('uint8');canvas.paste(Image.fromarray(rgb).resize((576,384)),(j*720+72,650));draw.text((j*720+20,625),f"t=23s, source stopped {23-t}s earlier; standing body remains",fill='white')
canvas.save(root/'wake-field-slow-vs-fast.png')
# Summaries exclude large ROI arrays.
(root/'simulation-metrics.json').write_text(json.dumps({**data,'runs':[{'speed':r['speed'],'rows':[{k:v for k,v in row.items() if k!='roi'} for row in r['rows']]} for r in data['runs']]},indent=2))
