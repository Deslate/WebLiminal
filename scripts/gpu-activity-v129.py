"""Read per-process AGX accumulatedGPUTime counters without privileged tools."""
import subprocess,re,time,json,sys
from pathlib import Path
def snapshot():
 s=subprocess.check_output(['ioreg','-r','-c','AGXDeviceUserClient','-l'],text=True);out={}
 for block in s.split('+-o AGXDeviceUserClient'):
  m=re.search(r'"IOUserClientCreator" = "pid (\d+), ([^"]+)"',block)
  if not m:continue
  pid,name=m.groups();t=sum(map(int,re.findall(r'"accumulatedGPUTime"=(\d+)',block)))
  out.setdefault(pid,{'name':name,'ticks':0})['ticks']+=t
 return out
first=snapshot();start=time.monotonic();time.sleep(float(sys.argv[1]) if len(sys.argv)>1 else 3);last=snapshot();elapsed=time.monotonic()-start
rows=[{'pid':int(pid),'name':v['name'],'deltaGPUTime':v['ticks']-first[pid]['ticks']} for pid,v in last.items() if pid in first and v['ticks']>first[pid]['ticks']];rows.sort(key=lambda v:v['deltaGPUTime'],reverse=True);result={'seconds':elapsed,'active':rows};print(json.dumps(result,indent=2))
if len(sys.argv)>2:Path(sys.argv[2]).write_text(json.dumps(result,indent=2))
