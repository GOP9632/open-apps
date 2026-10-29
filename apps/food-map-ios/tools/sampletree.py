#!/usr/bin/env python3
# 讀 macOS `sample` 指令的輸出，只看主執行緒「在忙」的部分（扣掉等事件的 mach_msg），印出最重的呼叫鏈和 App 自己的函式
# 用法（模擬器裡的 App 就是 Mac 上的一般行程）：
#   sample $(pgrep -x FoodMap) 4 1 -mayDie -file /tmp/s1.txt   # 開始後 4 秒內做動作
#   python3 sampletree.py /tmp/s1.txt
#   python3 sampletree.py /tmp/s1.txt --all   # 每個執行緒在提交 CA（Core Animation）上花了幾個樣本、執行緒名字
import re, sys, collections

IDLE = ('mach_msg', '__CFRunLoopServiceMachPort', 'semaphore_wait', '__psynch_cvwait', 'kevent')
BORING = ('CFRunLoop', 'GSEventRunModal', 'UIApplicationMain', '-[UIApplication _run]', 'App.main()')
line_re = re.compile(r'^([\s+!:|]*?)(\d+)\s+(.*)$')


class Node:
    def __init__(self, name, lib, count):
        self.name, self.lib, self.count, self.kids = name, lib, count, []


def parse(path):
    lines = open(path, encoding='utf-8', errors='replace').read().splitlines()
    try:
        i = next(k for k, l in enumerate(lines) if l.startswith('Call graph:'))
    except StopIteration:
        sys.exit('找不到 Call graph:，這不是 sample 的輸出')
    threads, stack = [], []
    for l in lines[i + 1:]:
        if not l.strip():
            break
        m = line_re.match(l)
        if not m:
            continue
        col = len(m.group(1))
        rest = m.group(3)
        mm = re.match(r'(.*?)\s+\(in ([^)]*)\)', rest)
        name, lib = (mm.group(1), mm.group(2)) if mm else (rest.split('  [')[0], '')
        n = Node(name.strip(), lib, int(m.group(2)))
        while stack and stack[-1][0] >= col:
            stack.pop()
        if stack:
            stack[-1][1].kids.append(n)
        else:
            threads.append(n)
        stack.append((col, n))
    return threads


def zero(n):
    n.busy = 0
    for k in n.kids:
        zero(k)


def idle(n):
    if any(k in n.name for k in IDLE):
        zero(n)
        return n.count
    s = sum(idle(k) for k in n.kids)
    n.busy = n.count - s
    return s


args = [a for a in sys.argv[1:] if a != '--all']
if not args:
    sys.exit('用法：python3 sampletree.py sample輸出.txt [--all]')
threads = parse(args[0])

# --all：每個執行緒在 CA 提交底下的樣本數（同一條鏈上重複出現只算最上面那層）
CA = ('CA::Transaction::commit', 'CA::Context::commit_transaction', 'CA::Layer')
if '--all' in sys.argv[1:]:
    def under(n, key):
        if key in n.name:
            return n.count
        return sum(under(k, key) for k in n.kids)
    print(f'每個執行緒在 CA 底下的樣本數（每個樣本約 1 ms）：')
    print(f'{"commit":>7} {"ctx":>7} {"Layer":>7} {"全部":>7}  執行緒')
    rows = []
    for t in threads:
        c = [under(t, k) for k in CA]
        if any(c):
            rows.append((c, t))
    for c, t in sorted(rows, key=lambda r: -max(r[0])):
        print(f'{c[0]:7d} {c[1]:7d} {c[2]:7d} {t.count:7d}  {t.name[:120]}')
    if not rows:
        print('  （沒有執行緒在 CA 底下）')
    sys.exit(0)

main = next((t for t in threads if 'main-thread' in t.name), threads[0] if threads else None)
if not main:
    sys.exit('沒有執行緒資料')
idle(main)
print(f'主執行緒樣本 {main.count}，在忙 {main.busy}（每個樣本約 1 ms）')

# 在忙的呼叫樹：只留佔在忙時間 8% 以上的分支；系統框架裡一路單傳、數字不變的層收起來
thr = max(3, main.busy * 0.08)
print(f'\n在忙的呼叫樹（只列 ≥ {thr:.0f} 個樣本的分支）：')
out = []
def tree(n, depth, run=0):
    kids = [k for k in n.kids if k.busy >= thr]
    boring = any(b in n.name for b in BORING) or n is main or n.name in ('start', 'main')
    passthru = (len(kids) == 1 and kids[0].busy == n.busy and kids[0].lib == n.lib and 'FoodMap' not in n.lib)
    if boring:
        for k in kids:
            tree(k, depth)
        return
    if passthru and run > 0:
        tree(kids[0], depth, run + 1)
        return
    if run > 1:
        out.append('  ' * depth + f'       … 略過 {run - 1} 層')
    out.append('  ' * depth + f'{n.busy:6d} {n.name[:130]}  [{n.lib}]')
    for k in kids:
        tree(k, depth + 1, 1 if (len(kids) == 1 and k.busy == n.busy and k.lib == n.lib and 'FoodMap' not in k.lib) else 0)
tree(main, 0)
print('\n'.join(out[:120]))
if len(out) > 120:
    print(f'… 還有 {len(out) - 120} 行')

# App 自己的函式（祖先裡已經有同名的不重複算）、最常停在哪
app, leaf = collections.Counter(), collections.Counter()
def walk(n, seen):
    if 'FoodMap' in n.lib and n.name not in seen and n.name not in ('main', 'start'):
        app[n.name] += n.busy
        seen = seen | {n.name}
    own = n.busy - sum(k.busy for k in n.kids)
    if own > 0:
        leaf[f'{n.name[:110]}  [{n.lib}]'] += own
    for k in n.kids:
        walk(k, seen)
walk(main, frozenset())
print('\nApp 自己的函式（含底下呼叫）：')
for name, v in app.most_common(15):
    if v > 0:
        print(f'  {v:6d} {name[:150]}')
print('\n最常停在：')
for name, v in leaf.most_common(10):
    print(f'  {v:6d} {name}')
