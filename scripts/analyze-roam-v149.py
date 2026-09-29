"""Video triage, not a universal physical-truth classifier. No rendered pixels modified."""
from pathlib import Path
import sys,json
import av,cv2,numpy as np
from PIL import Image,ImageDraw
root=Path(sys.argv[1] if len(sys.argv)>1 else '../workroom-v1.49-evidence/benchmark')
TH={'darkMin':2/255,'darkMax':.40,'lagSeconds':.1,'blockPixels':8,'absoluteDelta':2/255,'relativeDelta':.05,'minConnectedBlocks':4,'minDarkAreaFraction':.005,'minConsecutiveFrames':2,'isolatedPixelDelta':.08}
summary={'thresholds':TH,'meaning':'Engineering triage thresholds, not validated psychophysical limits. A dark surface can receive reflected/indirect light. Only matched controls can attribute changes. Moving residuals are review candidates, never standalone failures.','cases':{}}
base=None
for folder in [root/'current']+sorted(p for p in root.iterdir() if p.is_dir() and p.name!='current'):
 if not (folder/'manifest.json').exists():continue
 m=json.loads((folder/'manifest.json').read_text());fps=m['fps'];h=m['height'];w=m['width'];lag=round(fps*.1)
 # The entire delivered video is decoded, including motion. Exact source is a codec control.
 cap=av.open(str(folder/'roam.mp4'));video=np.stack([np.rint(f.to_ndarray(format='rgb24')@np.array([.2126,.7152,.0722])).astype('uint8') for f in cap.decode(video=0)]);cap.close()
 source=np.load(folder/'source-luma.npy',mmap_mode='r');assert video.shape==source.shape,(video.shape,source.shape)
 if folder.name=='current':base=source;baseManifest=m
 elif m.get('renderEquivalenceHash',m['sourceHash'])!=baseManifest.get('renderEquivalenceHash',baseManifest['sourceHash']):raise RuntimeError('Cannot compare different render-equivalence hashes')
 report={'decodedFrames':len(video),'durationSeconds':len(video)/fps,'codecMAE':float(np.mean(abs(video.astype(np.float32)-source)))/255,'holds':{},'moving':[]}
 for seg in m['segments']:
  # Exclude cuts, and first second of settling; cover stop separately in trace.
  lo=round((seg['start']+1)*fps);hi=round(seg['end']*fps)
  if not seg.get('hold'):
   for i in range(lo,hi-lag,6):
    a=video[i];b=video[i+lag];flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,3,15,3,5,1.2,0);back=cv2.calcOpticalFlowFarneback(b,a,None,.5,3,15,3,5,1.2,0)
    yy,xx=np.mgrid[:h,:w].astype('float32');mx=xx+flow[:,:,0];my=yy+flow[:,:,1];warped=cv2.remap(b,mx,my,cv2.INTER_LINEAR);backw=cv2.remap(back,mx,my,cv2.INTER_LINEAR)
    valid=(np.linalg.norm(flow+backw,axis=2)<.5)&(mx>2)&(mx<w-3)&(my>2)&(my<h-3)&(a>9)&(a<102)
    if valid.sum():report['moving'].append({'t':i/fps,'segment':seg['name'],'validFraction':float(valid.mean()),'flowCompensatedP99':float(np.percentile(abs(warped.astype(float)-a)[valid],99)/255)})
   continue
  a=source[lo:hi].astype('float32')/255;b=base[lo:hi].astype('float32')/255;v=video[lo:hi].astype('float32')/255
  bh=h//8;bw=w//8
  block=lambda x:x.reshape(len(x),bh,8,bw,8).mean((2,4))
  means=block(b).mean(0);mask=(means>TH['darkMin'])&(means<TH['darkMax'])
  metadata=np.fromfile(root/'masks'/(seg['name']+'.f32'),np.float32).reshape(h,w,4)
  sid=np.rint(metadata[:,:,0]).astype(int)-1;solid=sid>=0;direct=metadata[:,:,3]>.5
  inside=solid&(sid//9>=9)&(sid//9<=12)&(sid%9>=6)
  # Doorway alert statistics must be on the inner arch, not a ceiling visible beside it.
  eligible=inside&~direct if 'door-interior' in seg['name'] else solid&~direct
  if seg['name']=='water-body':eligible=metadata[:,:,0]==-9
  coverage=eligible.reshape(bh,8,bw,8).mean((1,3));mask&=coverage>=.9
  d=block(a[lag:]-a[:-lag]);dv=block(v[lag:]-v[:-lag]);threshold=np.maximum(TH['absoluteDelta'],TH['relativeDelta']*means)
  active=(abs(d)>threshold)&mask;areas=[];clusters=[];boxes=[]
  for q in active:
   n,labels,stats,_=cv2.connectedComponentsWithStats(q.astype('uint8'),8)
   if n>1:
    j=1+stats[1:,4].argmax();clusters.append(int(stats[j,4]));boxes.append(stats[j,:4].tolist())
   else:clusters.append(0);boxes.append([0,0,0,0])
   areas.append(float(q.sum()/max(1,mask.sum())))
  flagged=(np.array(clusters)>=TH['minConnectedBlocks'])&(np.array(areas)>=TH['minDarkAreaFraction']);alert=bool(np.any(flagged[1:]&flagged[:-1]));worst=int(np.argmax(clusters));idx=lo+worst
  series=block(a);series-=series.mean(0);power=(abs(np.fft.rfft(series*np.hanning(len(series))[:,None,None],axis=0))**2)[:,mask].sum(1);freq=np.fft.rfftfreq(len(series),1/fps);den=max(float(power[1:].sum()),1e-20)
  pix=abs(a[lag:]-a[:-lag]);pixelMask=np.repeat(np.repeat(mask,8,0),8,1)
  entry={'alert':alert,'region':'inner arch excluding direct solar visibility' if 'door-interior' in seg['name'] else 'non-directly-sunlit primary surface','eligiblePixelFraction':float(eligible.mean()),'darkBlocks':int(mask.sum()),'delta100msBlockP99':float(np.percentile(abs(d[:,mask]),99)) if mask.any() else 0,'delta100msBlockMax':float(abs(d[:,mask]).max()) if mask.any() else 0,'maxConnectedBlocks':max(clusters),'maxDarkAreaFraction':max(areas),'flaggedFrameCount':int(flagged.sum()),'worstTime':idx/fps,'worstBoxPixels':[int(x*8) for x in boxes[worst]],'temporalCentroidHz':float((power[1:]*freq[1:]).sum()/den),'powerAbove3Hz':float(power[freq>3].sum()/den),'isolatedPixelEvents':int((pix[:,pixelMask]>TH['isolatedPixelDelta']).sum()),'decodedVsSourceBlockDeltaMAE':float(abs(dv-d).mean()),'sameTimeVsCurrentMAE':float(abs(a-b).mean())}
  # Strength diagnosis is separate from temporal flicker alerts. Fixed mask
  # uses the matched static-light reference, not the potentially bright caustic.
  referencePath=root/'static-light'/'source-luma.npy'
  reference=np.load(referencePath,mmap_mode='r')[lo:hi].astype('float32')/255 if referencePath.exists() else b
  referenceMean=reference.mean(0);strengthMask=eligible&(referenceMean>2/255)&(referenceMean<.30)
  vals=a[:,strengthMask];lightAdded=np.maximum(a-reference,0)[:,strengthMask]
  entry['strength']={'mask':'primary eligible surface, matched static-light mean luma 2/255..0.30; display units, not irradiance','pixels':int(strengthMask.sum()),'mean':float(vals.mean()) if vals.size else 0,'p99':float(np.percentile(vals,99)) if vals.size else 0,'temporalRangeP95':float(np.percentile(np.percentile(vals,95,axis=0)-np.percentile(vals,5,axis=0),95)) if vals.size else 0,'positiveExcessVsStaticP99':float(np.percentile(lightAdded,99)) if vals.size else 0,'positiveExcessOver10PctFraction':float((lightAdded>.10).mean()) if vals.size else 0}
  report['holds'][seg['name']]=entry
  contact=Image.new('RGB',(w*3,h+32));dr=ImageDraw.Draw(contact)
  for j,k in enumerate([max(lo,idx-3),idx,idx+lag]):
   im=Image.fromarray(video[k]).convert('RGB');contact.paste(im,(j*w,32));dr.text((j*w+5,8),f'{folder.name} {seg["name"]} t={k/fps:.3f}')
  x,y,bx,by=entry['worstBoxPixels'];dr.rectangle((w+x,32+y,w+x+bx,32+y+by),outline='red',width=2);contact.save(folder/(seg['name']+'-worst.png'))
  # An unmodified decoded temporal strip and a short, same-rate clip for inspection.
  clip=av.open(str(folder/(seg['name']+'-worst.mp4')),'w');stream=clip.add_stream('libx264',rate=fps);stream.width=w;stream.height=h;stream.pix_fmt='yuv420p';stream.options={'crf':'12'}
  for k in range(max(lo,idx-fps),min(hi,idx+fps*2)):
   f=av.VideoFrame.from_ndarray(np.repeat(video[k,:,:,None],3,2),format='rgb24')
   for p in stream.encode(f):clip.mux(p)
  for p in stream.encode():clip.mux(p)
  clip.close()
 report['status']='REVIEW' if any(x['alert'] for x in report['holds'].values()) else 'NO_THRESHOLD_ALERT_NOT_VISUAL_PASS'
 if folder.name=='repeat':report['repeatMaxLumaError']=int(np.max(abs(source.astype(np.int16)-base.astype(np.int16))))
 (folder/'analysis.json').write_text(json.dumps(report,indent=2));summary['cases'][folder.name]=report
 print(folder.name,report['status'],[(k,round(v['delta100msBlockP99'],5),v['maxConnectedBlocks']) for k,v in report['holds'].items()],flush=True)
(root/'report.json').write_text(json.dumps(summary,indent=2))
lines=['# Automated roaming triage','',summary['meaning'],'','Thresholds: `'+json.dumps(TH)+'`','', '| Case / hold | 100ms block p99 | Max cluster (8px blocks) | Flagged frames | Status |','|---|---:|---:|---:|---|']
for name,r in summary['cases'].items():
 for hold,e in r['holds'].items():lines.append(f'| {name} / {hold} | {e["delta100msBlockP99"]:.5f} | {e["maxConnectedBlocks"]} | {e["flaggedFrameCount"]} | {"REVIEW" if e["alert"] else "no alert"} |')
lines+=['','## Dark-region strength (separate from flicker)','', 'Fixed dark masks use the matched static-light reference. Positive excess includes baseline changes in rollback cases; it is not a pure water-path attribution for those cases. All values are display luma, not radiometric irradiance.','', '| Case / hold | Mean luma | Luma p99 | Temporal range p95 | Positive excess p99 vs static |','|---|---:|---:|---:|---:|']
for name,r in summary['cases'].items():
 for hold,e in r['holds'].items():
  q=e['strength'];lines.append(f'| {name} / {hold} | {q["mean"]:.5f} | {q["p99"]:.5f} | {q["temporalRangeP95"]:.5f} | {q["positiveExcessVsStaticP99"]:.5f} |')
(root/'REPORT.md').write_text('\n'.join(lines)+'\n')
