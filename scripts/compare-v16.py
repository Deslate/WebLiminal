"""Check an arithmetic optimization against its saved continuous-frame reference.
A one-code-value tolerance is only for floating-point/8-bit rounding; shape or
shading changes must fail. The exact PNG hash test remains available separately.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import json,sys
reference,current=map(Path,sys.argv[1:3]);report={}
for name in ['wall','dark','low','glaze']:
    maxima=[];means=[];changed=[]
    for i in range(61):
        filename=f'{name}-{i:03d}.png'
        a=np.asarray(Image.open(reference/filename),dtype=np.int16)
        b=np.asarray(Image.open(current/filename),dtype=np.int16)
        delta=np.abs(a-b)
        maxima.append(int(delta.max()));means.append(float(delta.mean()))
        changed.append(int(np.count_nonzero(delta)))
    report[name]={'frames':61,'maximumChannelDifference':max(maxima),'maximumMeanAbsoluteChannelDifference':max(means),'maximumChangedChannels':max(changed)}
(current/'equivalence-difference.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
assert all(r['maximumChannelDifference']<=1 and r['maximumMeanAbsoluteChannelDifference']<.00001 for r in report.values())
