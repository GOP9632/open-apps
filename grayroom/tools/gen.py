# Step 2 of 2 (see collect.js): turn the collected text into outlines.
# Run from the grayroom folder: python3 tools/gen.py
# Rewrites the TX block in scene.js (lettering on the card) and the postmark paths in index.html.
import json, re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import outline as O
data = json.load(open('tools/txt_items.json'))
tx = {}; post = []
for t in data:
    if any(ord(c) > 0x2e80 for c in t['text']): continue   # the Chinese line stays HTML text (system font)
    t['spaced'] = 'letter-spacing' in t['outer'] or 'textLength' in t['outer']
    p = O.outline(t)
    m = ''.join(f'<path d="{d}"' + (f' fill="{k}"' if k else '') + '/>' for k, d in p.items())
    if t['key']: tx[t['key']] = m
    elif t.get('post'): post.append(m)
block = '  /*TX-BEGIN*/\n  const TX = {\n' + ''.join(f"    {k}: '{v}',\n" for k, v in tx.items()) + '  };\n  /*TX-END*/'
s = open('scene.js').read()
assert '/*TX-BEGIN*/' in s
open('scene.js', 'w').write(re.sub(r'  /\*TX-BEGIN\*/.*?/\*TX-END\*/', lambda m: block, s, flags=re.S))
h = open('index.html').read()
cur = re.search(r'<svg class="postmark".*?</svg>', h, flags=re.S).group(0)
assert len(post) == 3
open('index.html', 'w').write(h.replace(cur, cur[:cur.index('<path')] + ''.join(post) + '</svg>'))
print({k: len(v) for k, v in tx.items()}, 'postmark', [len(b) for b in post])
