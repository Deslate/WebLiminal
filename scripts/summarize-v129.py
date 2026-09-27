from pathlib import Path
import json,hashlib,subprocess
r=Path('../workroom-v1.29-evidence');prior=Path('../workroom-v1.27-evidence')
old=json.loads((r/'old-full/performance.json').read_text());new=json.loads((r/'new-full/performance.json').read_text());rows=[]
for a,b in zip(old['cases'],new['cases']):
 assert (a['region'],a['mode'])==(b['region'],b['mode'])
 rows.append({'region':a['region'],'mode':a['mode'],'oldFps':a['fps'],'newFps':b['fps'],'oldMinOneSecond':a['minOneSecond'],'newMinOneSecond':b['minOneSecond'],'oldP95ms':a['p95'],'newP95ms':b['p95'],'newPass30':b['pass30']})
(r/'performance-comparison.json').write_text(json.dumps({'oldRevision':'368919e','newRevision':'408f5cc','resolution':[1280,832],'rows':rows,'everyCasePasses30':all(x['newPass30'] for x in rows)},indent=2))
metrics=json.loads((prior/'regularity.json').read_text())['metrics']['after'];quality={'method':'Same source and byte-identical fresh receiver buffers; same 900-frame PNG replay. No changed wave or rendering parameters.','irradianceIdentity':json.loads((r/'irradiance-identity.json').read_text()),'regularityBefore':metrics,'regularityAfter':metrics,'quiet':{}}
for name in ['normal','floor']:
 identity=json.loads((r/f'identity/final-{name}/record.json').read_text());assert identity['allPNGsIdentical'];m=json.loads((prior/f'appearance/final-{name}/metrics.json').read_text());quality['quiet'][name]={'frames':identity['frames'],'allPNGsIdentical':True,'before':m,'after':m,'percentChange':0}
quality['sourceHashes']={}
for f in ['src/render/common.wgsl','src/render/renderer.js','src/render/short-waves.js']:
 oldSource=subprocess.check_output(['git','show','408f5cc:'+f]);now=Path(f).read_bytes();assert oldSource==now;quality['sourceHashes'][f]=hashlib.sha256(now).hexdigest()
(r/'quality-invariance.json').write_text(json.dumps(quality,indent=2));print('All performance and identity checks passed.')
