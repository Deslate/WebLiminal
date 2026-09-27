from pathlib import Path
import numpy as np,json
from scipy.ndimage import map_coordinates,maximum_filter
from PIL import Image,ImageDraw,ImageFont
from matplotlib.font_manager import findfont
from optical_field_v130 import field
root=Path('../workroom-v1.30-evidence');folder=root/'final';size=1024
x,z=np.meshgrid(np.linspace(2.55,4.05,400),np.linspace(-1.65,-.12,400));h,hx,hz,*_=field(folder)(x,z);d=np.array([.66,-.69,-.295]);d/=np.linalg.norm(d);n=np.stack([-hx,np.ones_like(h),-hz],-1);n/=np.linalg.norm(n,axis=-1)[...,None];dn=n@d;eta=1/1.333;r=eta*d-(eta*dn+np.sqrt(1-eta*eta*(1-dn*dn)))[...,None]*n;lx=x-(.42+h)/r[:,:,1]*r[:,:,0];lz=z-(.42+h)/r[:,:,1]*r[:,:,2];e=np.fromfile(folder/'solar-2-6.f32',np.float32).reshape(512,512);e=map_coordinates(e,[(lz+2)/2*511,(lx-2.5)/2*511],order=1,mode='nearest')
above={'x':4.36,'y':1.62,'z':-1.34,'yaw':1.958,'pitch':-.778};under={'x':3.5,'y':.35,'z':-1,'yaw':0,'pitch':-np.pi/2}
def project(point,camera,focal):
 y,p=camera['yaw'],camera['pitch'];delta=np.array(point)-np.array([camera[k] for k in ['x','y','z']]);right=np.array([np.cos(y),0,-np.sin(y)]);up=np.array([np.sin(y)*np.sin(p),np.cos(p),np.cos(y)*np.sin(p)]);forward=np.array([-np.sin(y)*np.cos(p),np.sin(p),-np.cos(y)*np.cos(p)]);depth=delta@forward
 return np.array([512+512*(delta@right)/(depth*12/focal),512-512*(delta@up)/(depth*12/focal)])
peaks=np.argwhere((e==maximum_filter(e,31))&(lx>2.6)&(lx<4.4)&(lz>-1.9)&(lz<-.1));peaks=sorted(peaks,key=lambda q:-e[tuple(q)]);points=[]
for iy,ix in peaks:
 water=[float(x[iy,ix]),float(.42+h[iy,ix]),float(z[iy,ix])];floor=[float(lx[iy,ix]),0,float(lz[iy,ix])];a=project(water,above,20);b=project(floor,under,4.2)
 if np.any(a<70) or np.any(a>954) or np.any(b<70) or np.any(b>954):continue
 if any(np.linalg.norm(np.array(water)[[0,2]]-np.array(v['water'])[[0,2]])<.45 for v in points):continue
 points.append({'label':chr(65+len(points)),'water':water,'floor':floor,'abovePixel':a.tolist(),'belowPixel':b.tolist(),'irradiance':float(e[iy,ix])})
 if len(points)==3:break
assert len(points)==3
font=ImageFont.truetype(findfont('DejaVu Sans'),28);small=ImageFont.truetype(findfont('DejaVu Sans'),22)
canvas=Image.new('RGB',(2048,1140),'#f7f7f5');draw=ImageDraw.Draw(canvas)
for i,(image,title,coords) in enumerate([('reflection-6.png','Water surface view / t = 6.000 s','abovePixel'),('under-6.png','Underwater floor view / t = 6.000 s','belowPixel')]):
 canvas.paste(Image.open(folder/image).convert('RGB'),(i*1024,60));draw.text((i*1024+24,16),title,font=font,fill='#15222c')
 for p in points:
  px,py=p[coords];px+=i*1024;py+=60;draw.ellipse((px-13,py-13,px+13,py+13),outline='#ffdf3e',width=3);draw.text((px+18,py-35),p['label'],font=font,fill='#ffdf3e',stroke_width=2,stroke_fill='#102430')
draw.text((24,1100),'Letters follow central-sun Snell rays. Markers annotate the evidence; they are never rendered scene light.',font=small,fill='#15222c');canvas.save(root/'same-time-surface-floor.png');(root/'ray-correspondence.json').write_text(json.dumps(points,indent=2))
