// 出框：照片放進相框、九宮格、拍立得裡，再把摳出來的人疊在最上面，頭和手就會「衝出」框外
// 醒圖海外版沒有單獨的出框按鈕，是用「摳圖貼圖 + 圖層 + 形狀」或範本做的，這裡做成一鍵範本

export const POPS = [
  { id: 'frame', name: '相框出框' },
  { id: 'grid', name: '九宮格' },
  { id: 'polaroid', name: '拍立得' },
  { id: 'circle', name: '圓框' },
  { id: 'arch', name: '拱門' },
  { id: 'behind', name: '人在字前' },
];
export const POP_BGS = [['blur', '模糊'], ['#ffffff', '白'], ['#111111', '黑'], ['#ffe3ec', '粉'], ['#d0ebff', '藍'], ['#fff3bf', '黃']];
// popY：框的上緣在人像高度的哪裡（0 = 頭頂，100 = 腳底）；popM：框離照片邊緣多遠
export const POP_P0 = { pop: '', popY: 30, popM: 8, popBg: 'blur', popText: 'HELLO', popTC: '#ffffff', popSt: { t: 'solid', c: '#ffffff', w: 30, o: 100 } };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

// 框的位置：上緣跟著人的位置走，人的頭肩會露在框外
export function popRect(W, H, P, box) {
  const m = P.popM / 100 * Math.min(W, H);
  const top = clamp(box ? box.y + box.h * P.popY / 100 : H * 0.3, H * 0.06, H * 0.85);
  return { x: m, y: top, w: W - m * 2, h: Math.max(H * 0.1, H - m - top) };
}

function blurred(photo, W, H) {
  // 縮很小再放大兩次，等於很強的模糊，又快
  const s1 = canvas(Math.max(4, W / 12), Math.max(4, H / 12)), s2 = canvas(Math.max(2, W / 40), Math.max(2, H / 40));
  s1.getContext('2d').drawImage(photo, 0, 0, s1.width, s1.height);
  s2.getContext('2d').drawImage(s1, 0, 0, s2.width, s2.height);
  const c = canvas(W, H), ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s2, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, 0, W, H);
  return c;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function shadow(ctx, k) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = k * 0.04; ctx.shadowOffsetY = k * 0.012; }

// 畫整張出框圖。photo：調整後的照片；person：同尺寸、只留人的圖（可以是 null）；stroke：人的描邊 { canvas, pad }
export function drawPop(ctx, W, H, P, photo, person, stroke, box) {
  const k = Math.min(W, H), R = popRect(W, H, P, box), id = P.pop;
  ctx.save();
  if (id === 'behind') ctx.drawImage(photo, 0, 0, W, H);
  else if (P.popBg === 'blur') ctx.drawImage(blurred(photo, W, H), 0, 0);
  else { ctx.fillStyle = P.popBg; ctx.fillRect(0, 0, W, H); }
  const clipPhoto = path => { ctx.save(); path(); ctx.clip(); ctx.drawImage(photo, 0, 0, W, H); ctx.restore(); };
  const bw = k * 0.016; // 白邊粗細
  if (id === 'frame') {
    ctx.save(); shadow(ctx, k); ctx.fillStyle = '#fff'; rr(ctx, R.x - bw, R.y - bw, R.w + bw * 2, R.h + bw * 2, k * 0.035); ctx.fill(); ctx.restore();
    clipPhoto(() => rr(ctx, R.x, R.y, R.w, R.h, k * 0.025));
  } else if (id === 'grid') {
    const g = k * 0.03, tw = (R.w - g * 2) / 3, th = (R.h - g * 2) / 3;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x = R.x + i * (tw + g), y = R.y + j * (th + g);
      ctx.save(); shadow(ctx, k * 0.6); ctx.fillStyle = '#fff'; rr(ctx, x - bw * 0.45, y - bw * 0.45, tw + bw * 0.9, th + bw * 0.9, k * 0.016); ctx.fill(); ctx.restore();
      clipPhoto(() => rr(ctx, x, y, tw, th, k * 0.012));
    }
  } else if (id === 'polaroid') {
    // 白色卡片稍微歪一點，下緣比較寬
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, a = -0.05, m = k * 0.035;
    const win = { x: R.x + m, y: R.y + m, w: R.w - m * 2, h: R.h - m * 4.2 };
    // 路徑在旋轉的座標裡建立，之後填色、裁切都照建立時的形狀
    const card = path => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.translate(-cx, -cy); path(); ctx.restore(); };
    ctx.save(); shadow(ctx, k); ctx.fillStyle = '#fff'; card(() => rr(ctx, R.x, R.y, R.w, R.h, k * 0.008)); ctx.fill(); ctx.restore();
    ctx.save(); card(() => ctx.rect(win.x, win.y, win.w, win.h)); ctx.clip(); ctx.drawImage(photo, 0, 0, W, H); ctx.restore();
  } else if (id === 'circle') {
    const r = Math.min(R.w, R.h) / 2, cx = box ? clamp(box.x + box.w / 2, r + R.x, W - R.x - r) : W / 2, cy = R.y + r;
    ctx.save(); shadow(ctx, k); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r + bw, 0, 7); ctx.fill(); ctx.restore();
    clipPhoto(() => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); });
  } else if (id === 'arch') {
    const path = (o) => { const r = R.w / 2 + o; ctx.beginPath(); ctx.moveTo(R.x - o, R.y + R.h + o); ctx.lineTo(R.x - o, R.y + r - o); ctx.arc(R.x + R.w / 2, R.y + r - o, r, Math.PI, 0); ctx.lineTo(R.x + R.w + o, R.y + R.h + o); ctx.closePath(); };
    ctx.save(); shadow(ctx, k); ctx.fillStyle = '#fff'; path(bw); ctx.fill(); ctx.restore();
    clipPhoto(() => path(0));
  } else if (id === 'behind') {
    // 大字放在人的後面：人會擋住一部分字，像雜誌封面
    const t = (P.popText || ' ').slice(0, 12);
    let fs = k * 0.4;
    ctx.font = `900 ${fs}px "Helvetica Neue","Arial Black","PingFang TC",sans-serif`;
    fs *= Math.min(1, W * 0.92 / Math.max(1, ctx.measureText(t).width));
    ctx.font = `900 ${fs}px "Helvetica Neue","Arial Black","PingFang TC",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.popTC;
    const y = box ? box.y + Math.min(box.h * 0.22, fs * 0.6) + box.h * (P.popY - 30) / 100 : H * 0.3;
    ctx.fillText(t, W / 2, clamp(y, fs * 0.5, H - fs * 0.5));
  }
  if (person) {
    if (stroke) ctx.drawImage(stroke.canvas, -stroke.pad, -stroke.pad, W + stroke.pad * 2, H + stroke.pad * 2);
    ctx.drawImage(person, 0, 0, W, H);
  }
  ctx.restore();
}
