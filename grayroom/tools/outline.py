# turns the collected SVG text (txt_items.json) into path data, one path per fill
import json, math, sys, io
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
import uharfbuzz as hb

FONTS = {('Inter', False): 'fonts/inter.woff2', ('Fraunces', False): 'fonts/fraunces.woff2', ('Fraunces', True): 'fonts/fraunces-italic.woff2'}
_cache = {}
def instance(fam, ital, wght, opsz):
    key = (fam, ital, wght, opsz)
    if key in _cache: return _cache[key]
    f = TTFont(FONTS[(fam, ital)])
    loc = {'wght': wght}
    if fam == 'Fraunces': loc['opsz'] = max(9, min(144, opsz))
    inst = instantiateVariableFont(f, loc, inplace=False)
    inst.flavor = None
    buf = io.BytesIO(); inst.save(buf); data = buf.getvalue()
    face = hb.Face(data); font = hb.Font(face)
    _cache[key] = (inst, inst.getGlyphSet(), font, inst['head'].unitsPerEm)
    return _cache[key]

def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def glyph_path(gs, name, sc, x, y, rot):
    pen = DecomposingRecordingPen(gs); gs[name].draw(pen)
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def T(pt):
        px, py = pt[0] * sc, -pt[1] * sc
        return fmt(x + px * c - py * s) + ',' + fmt(y + px * s + py * c)
    out = []
    for op, args in pen.value:
        if op == 'moveTo': out.append('M' + T(args[0]))
        elif op == 'lineTo': out.append('L' + T(args[0]))
        elif op == 'qCurveTo':
            pts = list(args)
            if pts[-1] is None:   # closed all-off-curve contour
                pts = pts[:-1]; start = ((pts[-1][0] + pts[0][0]) / 2, (pts[-1][1] + pts[0][1]) / 2); out.append('M' + T(start)); pts.append(start)
            for i in range(len(pts) - 1):
                ctrl = pts[i]; nxt = pts[i + 1]
                end = nxt if i == len(pts) - 2 else ((ctrl[0] + nxt[0]) / 2, (ctrl[1] + nxt[1]) / 2)
                out.append('Q' + T(ctrl) + ' ' + T(end))
        elif op == 'curveTo': out.append('C' + ' '.join(T(a) for a in args))
        elif op in ('closePath', 'endPath'): out.append('Z')
    return ''.join(out)

def outline(t, opsz_of=lambda size: size):
    items = t['items']; text = t['text']
    paths = {}   # fill -> d
    # runs of the same font
    i = 0
    while i < len(items):
        j = i; it = items[i]
        fam = it['fam'].split(',')[0].strip().strip('"\'')
        key = (fam, it['ital'], it['wght'], it['size'])
        while j < len(items) and (items[j]['fam'].split(',')[0].strip().strip('"\''), items[j]['ital'], items[j]['wght'], items[j]['size']) == key: j += 1
        inst, gs, font, upem = instance(fam, it['ital'], it['wght'], opsz_of(it['size']))
        buf = hb.Buffer(); buf.add_str(text, i, j - i); buf.guess_segment_properties()
        spaced = abs((items[i]['ex'] - items[i]['x'])) and t.get('spaced')
        hb.shape(font, buf, {'liga': not t.get('spaced', False), 'clig': not t.get('spaced', False)})
        order = font.face and inst.getGlyphOrder()
        for info in buf.glyph_infos:
            ch = items[info.cluster]; name = order[info.codepoint]
            if ch['ch'] == ' ': continue
            d = glyph_path(gs, name, ch['size'] / upem, ch['x'], ch['y'], ch['r'])
            paths.setdefault(ch['fill'], []).append(d)
        i = j
    return {k: ''.join(v) for k, v in paths.items()}
