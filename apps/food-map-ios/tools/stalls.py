#!/usr/bin/env python3
# 從 Instruments Time Profiler 匯出的 XML 找出主執行緒卡住的那幾段，印出每段最重的呼叫鏈
# 用法：
#   xcrun xctrace record --template 'Time Profiler' --attach $(pgrep -x FoodMap) --time-limit 12s --output t.trace
#   xcrun xctrace export --input t.trace --xpath '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]' > t.xml
#   python3 stalls.py t.xml [最短毫秒，預設 40]
import sys, collections, xml.etree.ElementTree as ET

path = sys.argv[1]
min_ms = float(sys.argv[2]) if len(sys.argv) > 2 else 40
root = ET.parse(path).getroot()
ids = {e.get('id'): e for e in root.iter() if e.get('id')}

def R(e):
    while e is not None and e.get('ref'):
        e = ids.get(e.get('ref'))
    return e

def frames(bt):
    out = []
    for f in R(bt).iter():
        f = R(f)
        if f is None or f.tag != 'frame':
            continue
        b = R(f.find('binary'))
        out.append((f.get('name') or f.get('addr') or '?', b.get('name') if b is not None else ''))
    return out  # 最裡面（正在跑的）在最前面

samples = []
for row in root.iter('row'):
    t = R(row.find('sample-time'))
    th = R(row.find('thread'))
    bt = row.find('backtrace')
    if bt is None:
        bt = row.find('tagged-backtrace')
    if t is None or th is None or bt is None:
        continue
    if 'Main Thread' not in (th.get('fmt') or ''):
        continue
    w = R(row.find('weight'))
    ms = int(w.text) / 1e6 if w is not None and w.text else 1.0
    samples.append((int(t.text) / 1e6, ms, frames(bt)))

samples.sort(key=lambda s: s[0])
print(f'主執行緒樣本 {len(samples)} 個')
wins, cur = [], []
for s in samples:
    if cur and s[0] - (cur[-1][0] + cur[-1][1]) > 2.5:
        wins.append(cur); cur = []
    cur.append(s)
if cur:
    wins.append(cur)

BORING = ('CFRunLoop', 'GSEvent', 'UIApplicationMain', '_dispatch_main_queue')
for w in wins:
    dur = w[-1][0] + w[-1][1] - w[0][0]
    if dur < min_ms:
        continue
    busy = sum(s[1] for s in w)
    print(f'\n=== 卡 {dur:.0f} ms（從錄影開始第 {w[0][0]/1000:.2f} 秒，CPU {busy:.0f} ms）')
    tree = {}
    leaf = collections.Counter()
    app = collections.Counter()
    for _, ms, fr in w:
        node = tree
        for name, binary in reversed(fr):
            n = node.setdefault(name, [0.0, {}, binary])
            n[0] += ms
            node = n[1]
        if fr:
            leaf[fr[0][0]] += ms
        for name in {n for n, b in fr if 'FoodMap' in b}:
            app[name] += ms
    # 最重的那條呼叫鏈：每層挑最多樣本的
    chain, node = [], tree
    while node:
        name, n = max(node.items(), key=lambda kv: kv[1][0])
        chain.append((name, n[0], n[2]))
        node = n[1]
    cut = 0
    for i, (name, _, _) in enumerate(chain):
        if name in ('start', 'main') or any(k in name for k in BORING):
            cut = i + 1
    print('最重的呼叫鏈：')
    for name, ms, binary in chain[cut:cut + 45]:
        print(f'  {ms:6.0f}ms {name[:150]}  [{binary}]')
    print('App 自己的函式（含底下呼叫）：')
    for name, ms in app.most_common(12):
        print(f'  {ms:6.0f}ms {name[:150]}')
    print('最常停在：')
    for name, ms in leaf.most_common(8):
        print(f'  {ms:6.0f}ms {name[:150]}')
