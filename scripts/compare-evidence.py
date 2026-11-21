"""Compare exact source luma across two completed visual benchmark runs."""
import json
import sys
from pathlib import Path
import numpy as np

before, after = map(Path, sys.argv[1:3])
results = {}
for current in sorted(after.glob('*/manifest.json')):
    name = current.parent.name
    previous = before / name / 'manifest.json'
    if not previous.exists():
        raise RuntimeError(f'Missing baseline case: {name}')
    a, b = json.loads(previous.read_text()), json.loads(current.read_text())
    for field in ['fps', 'width', 'height', 'duration', 'segments', 'labConfig', 'pathHash']:
        if a[field] != b[field]:
            raise RuntimeError(f'{name}: mismatched {field}')
    x = np.load(previous.parent / 'source-luma.npy', mmap_mode='r')
    y = np.load(current.parent / 'source-luma.npy', mmap_mode='r')
    if x.shape != y.shape or x.dtype != y.dtype:
        raise RuntimeError(f'{name}: mismatched array format')
    maximum = changed = 0
    for i in range(len(x)):
        delta = np.abs(x[i].astype(np.int16) - y[i].astype(np.int16))
        maximum = max(maximum, int(delta.max()))
        changed += int(np.count_nonzero(delta))
    results[name] = dict(shape=list(x.shape), values=int(x.size), changedValues=changed,
                         maxLumaDifference=maximum, exact=changed == 0,
                         beforeSource=a['sourceHash'], afterSource=b['sourceHash'])
if not results:
    raise RuntimeError('No completed cases')
report = dict(before=str(before.resolve()), after=str(after.resolve()), cases=results,
              exact=all(v['exact'] for v in results.values()))
(after / 'exact-comparison.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
sys.exit(0 if report['exact'] else 1)
