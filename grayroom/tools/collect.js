// Step 1 of 2: read every SVG <text> on the card, character by character, as the browser lays it out.
// The page keeps its lettering as SVG text when opened with ?txt=1 (normally it draws the outlines made here).
//
//   cd grayroom && python3 -m http.server 8000 &
//   node tools/collect.js            (needs Playwright; writes tools/txt_items.json)
//   python3 tools/gen.py             (needs fonttools, uharfbuzz, brotli; rewrites the TX block in scene.js and the postmark in index.html)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  await p.goto((process.argv[2] || 'http://localhost:8000/') + '?fx=1&intro=0&txt=1'); await p.waitForTimeout(2500);
  await p.evaluate(() => document.fonts.ready);
  // the postmark on the back is kept as text in tools/postmark-text.html
  await p.evaluate(html => { document.querySelector('svg.postmark').outerHTML = html; }, fs.readFileSync(path.join(__dirname, 'postmark-text.html'), 'utf8').trim());
  await p.waitForTimeout(300);
  const out = await p.evaluate(() => {
    const res = [];
    for (const t of document.querySelectorAll('#rig svg text')) {
      if (t.closest('.copy.g')) continue;   // dual layers: the colour copy is the source (the script makes the gray one)
      const chars = [];
      const walk = (n, el) => { for (const c of n.childNodes) { if (c.nodeType === 3) { for (const ch of c.data) chars.push({ ch, el }); } else if (c.nodeType === 1) walk(c, c); } };
      walk(t, t);
      const n = t.getNumberOfChars(), items = [], txt = chars.map(c => c.ch).join('');
      for (let k = 0; k < n; k++) { const c = chars[k]; const cs = getComputedStyle(c.el.nodeName === 'textPath' ? t : c.el); const pt = t.getStartPositionOfChar(k), e = t.getEndPositionOfChar(k);
        items.push({ ch: c.ch, x: pt.x, y: pt.y, ex: e.x, ey: e.y, r: t.getRotationOfChar(k), fam: cs.fontFamily, size: parseFloat(cs.fontSize), wght: +cs.fontWeight, ital: cs.fontStyle === 'italic', fill: c.el.getAttribute('fill') || t.getAttribute('fill') || null }); }
      res.push({ key: t.dataset.t || '', post: !!t.closest('svg.postmark'), text: txt, n, len: txt.length, outer: t.outerHTML.replace(/\s+/g, ' ').slice(0, 200), items });
    }
    return res;
  });
  fs.writeFileSync(path.join(__dirname, 'txt_items.json'), JSON.stringify(out, null, 1));
  for (const t of out) console.log((t.key || (t.post ? 'postmark' : '?')).padEnd(10), JSON.stringify(t.text), 'chars', t.n, '/', t.len);
  await b.close();
})();
