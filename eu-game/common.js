// 背景星空、星環、連線：主持端與手機端共用
(function () {
  // 星空背景
  window.EU_sky = function (el, density) {
    el.innerHTML = '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><canvas></canvas>';
    var cv = el.querySelector('canvas'), cx = cv.getContext('2d'), stars = [], dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      var n = Math.round(innerWidth * innerHeight / (density || 9000));
      stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + .2, p: Math.random() * 6.28, s: Math.random() * .6 + .2 });
    }
    size(); addEventListener('resize', size);
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function draw(t) {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], a = .35 + .65 * Math.abs(Math.sin(s.p + t / 1000 * s.s));
        var y = ((s.y + (reduce ? 0 : t / 900000 * s.s)) % 1) * cv.height;
        cx.globalAlpha = a; cx.fillStyle = '#fff';
        cx.beginPath(); cx.arc(s.x * cv.width, y, s.r * dpr, 0, 6.283); cx.fill();
      }
      requestAnimationFrame(draw);
    })(0);
  };

  // 12 顆星的環（歐盟旗）
  var STAR = 'M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.3633,0.118 L0.5878,0.809 L0,0.382 L-0.5878,0.809 L-0.3633,0.118 L-0.951,-0.309 L-0.2245,-0.309Z';
  window.EU_ring = function (el, label) {
    var s = '<svg viewBox="-60 -60 120 120">';
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      s += '<g transform="translate(' + (Math.cos(a) * 46).toFixed(2) + ',' + (Math.sin(a) * 46).toFixed(2) + ') scale(7.5)"><path class="st" d="' + STAR + '"/></g>';
    }
    s += '</svg>' + (label !== undefined ? '<div class="num">' + label + '</div>' : '');
    el.classList.add('ring'); el.innerHTML = s;
    var st = el.querySelectorAll('.st');
    return {
      set: function (lit) { for (var i = 0; i < 12; i++) st[i].classList.toggle('off', i >= lit); },
      num: el.querySelector('.num')
    };
  };

  // 連線：Supabase Realtime broadcast
  window.EU_connect = function (room, onMsg, onStatus) {
    var sb = window.supabase.createClient(EU_NET.url, EU_NET.key, { realtime: { params: { eventsPerSecond: 40 } } });
    var ch = sb.channel(EU_NET.channel(room), { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'm' }, function (p) { onMsg(p.payload); });
    var ready = false, queue = [];
    ch.subscribe(function (status) {
      ready = status === 'SUBSCRIBED';
      if (ready) { while (queue.length) ch.send({ type: 'broadcast', event: 'm', payload: queue.shift() }); }
      onStatus && onStatus(status);
    });
    return {
      send: function (payload) {
        if (ready) ch.send({ type: 'broadcast', event: 'm', payload: payload });
        else queue.push(payload);
      },
      isReady: function () { return ready; }
    };
  };

  // 彩帶
  window.EU_confetti = function (canvas, ms) {
    var cx = canvas.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    var cols = ['#ffcc33', '#2a4bff', '#ff4d6d', '#16c79a', '#ffffff', '#3d7bff'], ps = [];
    for (var i = 0; i < 260; i++) ps.push({
      x: Math.random() * canvas.width, y: -Math.random() * canvas.height * .8, vx: (Math.random() - .5) * 3 * dpr, vy: (Math.random() * 3 + 2) * dpr,
      w: (Math.random() * 8 + 5) * dpr, h: (Math.random() * 5 + 3) * dpr, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, c: cols[i % cols.length], star: i % 7 === 0
    });
    var end = performance.now() + (ms || 6000);
    (function f(t) {
      cx.clearRect(0, 0, canvas.width, canvas.height);
      ps.forEach(function (p) {
        p.x += p.vx + Math.sin(t / 400 + p.r) * .6; p.y += p.vy; p.r += p.vr;
        if (p.y > canvas.height && t < end) { p.y = -20; p.x = Math.random() * canvas.width; }
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
        if (p.star) { cx.font = (p.w * 1.8) + 'px serif'; cx.fillText('★', 0, 0); } else cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        cx.restore();
      });
      if (t < end + 4000) requestAnimationFrame(f); else cx.clearRect(0, 0, canvas.width, canvas.height);
    })(performance.now());
  };
})();
