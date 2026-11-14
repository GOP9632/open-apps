/* GrayRoom layered postcard: shared artwork.
   Scene layers use a 1000 x 1373 coordinate system (the window of the card).
   Elements with class "co" only show in the colour copy, "go" only in the gray copy. */
(function () {
  const SW = 1000, SH = 1373;
  const ARCH = 'M236,1010 C230,880 252,770 246,650 C240,520 262,404 326,304 C378,224 444,166 512,148 C566,160 644,228 702,322 C754,404 764,520 757,646 C751,772 772,880 766,1010 Z';

  const svg = (inner, w = SW, h = SH) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;

  /* ---------- 01 mural (seen through the arch) ---------- */
  const mural = svg(`
    <defs>
      <linearGradient id="mu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.08" stop-color="#1c2a52"/>
        <stop offset="0.36" stop-color="#6b3a78"/>
        <stop offset="0.56" stop-color="#d4556a"/>
        <stop offset="0.74" stop-color="#f08a4b"/>
        <stop offset="0.92" stop-color="#f8c865"/>
      </linearGradient>
      <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff3cf"/>
        <stop offset="0.62" stop-color="#ffe29a"/>
        <stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1000" height="1373" fill="url(#mu)"/>
    <circle cx="500" cy="735" r="330" fill="url(#sun)" opacity=".95"/>
    <g fill="none" stroke-linecap="round">
      <path d="M150,520 C330,440 640,470 880,560" stroke="#fff" stroke-opacity=".07" stroke-width="54"/>
      <path d="M140,640 C360,560 660,600 900,690" stroke="#fff" stroke-opacity=".08" stroke-width="40"/>
      <path d="M160,330 C360,270 640,280 860,350" stroke="#9db4ff" stroke-opacity=".10" stroke-width="46"/>
      <path d="M170,860 C380,800 640,820 860,900" stroke="#fff" stroke-opacity=".12" stroke-width="34"/>
      <path d="M200,960 C400,920 620,930 820,985" stroke="#fff6dd" stroke-opacity=".16" stroke-width="26"/>
    </g>
    <g fill="#fff">
      <circle cx="372" cy="228" r="2.6" opacity=".7"/><circle cx="640" cy="212" r="2" opacity=".6"/>
      <circle cx="560" cy="182" r="1.8" opacity=".55"/><circle cx="446" cy="186" r="1.6" opacity=".5"/>
      <circle cx="318" cy="330" r="2" opacity=".45"/><circle cx="700" cy="318" r="2.4" opacity=".5"/>
    </g>
  `);

  /* ---------- 02 plaster wall with the arch cut out ---------- */
  const rays = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, r1 = 26, r2 = i % 2 ? 78 : 112;
    rays.push(`M${(118 + Math.cos(a) * r1).toFixed(1)},${(292 + Math.sin(a) * r1).toFixed(1)} L${(118 + Math.cos(a) * r2).toFixed(1)},${(292 + Math.sin(a) * r2).toFixed(1)}`);
  }
  const wall = svg(`
    <defs>
      <linearGradient id="wl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d9d7d2"/><stop offset=".72" stop-color="#c6c4bf"/><stop offset="1" stop-color="#b3b1ac"/>
      </linearGradient>
      <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a09e9a"/><stop offset="1" stop-color="#6a6866"/>
      </linearGradient>
      <radialGradient id="pool" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#fff4dc" stop-opacity=".5"/><stop offset="1" stop-color="#fff4dc" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="lamp" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#fff1cf" stop-opacity=".95"/><stop offset=".35" stop-color="#ffe2a8" stop-opacity=".45"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="refl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffc56e" stop-opacity=".55"/><stop offset="1" stop-color="#ffc56e" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path fill-rule="evenodd" fill="url(#wl)" d="M-60,-60 H1060 V1010 H-60 Z ${ARCH}"/>
    <!-- trowelled plaster: soft light and dark patches -->
    <g fill="#fff" opacity=".12">
      <ellipse cx="150" cy="470" rx="150" ry="90" transform="rotate(-18 150 470)"/>
      <ellipse cx="880" cy="230" rx="140" ry="80" transform="rotate(22 880 230)"/>
      <ellipse cx="890" cy="900" rx="150" ry="70" transform="rotate(-12 890 900)"/>
      <ellipse cx="420" cy="70" rx="200" ry="40"/>
    </g>
    <g fill="#000" opacity=".05">
      <ellipse cx="90" cy="840" rx="130" ry="90" transform="rotate(20 90 840)"/>
      <ellipse cx="930" cy="560" rx="100" ry="140" transform="rotate(-10 930 560)"/>
      <ellipse cx="700" cy="90" rx="190" ry="40" transform="rotate(6 700 90)"/>
      <ellipse cx="80" cy="130" rx="120" ry="60" transform="rotate(-14 80 130)"/>
    </g>
    <g fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3" stroke-linecap="round">
      <path d="M40,560 q60,-30 130,-8"/><path d="M820,400 q70,-22 140,6"/><path d="M60,930 q80,-26 150,2"/>
      <path d="M800,960 q70,-20 150,4"/><path d="M620,60 q90,-18 180,8"/><path d="M830,700 q50,-16 110,2"/>
    </g>
    <ellipse cx="118" cy="660" rx="150" ry="250" fill="url(#pool)"/>
    <ellipse cx="882" cy="640" rx="150" ry="260" fill="url(#pool)"/>
    <!-- sunburst wall lamp -->
    <circle cx="118" cy="292" r="150" fill="url(#lamp)"/>
    <path d="${rays.join(' ')}" stroke="#fff6de" stroke-opacity=".8" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <circle cx="118" cy="292" r="21" fill="#f3f1ec" stroke="#fff" stroke-width="3"/>
    <circle cx="118" cy="292" r="9" fill="#fff3d0"/>
    <!-- arch: thick hand-plastered rim, with warm light on its inner edge -->
    <path d="${ARCH}" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="40" transform="translate(5,6)"/>
    <path d="${ARCH}" fill="none" stroke="#8f8d88" stroke-width="30" stroke-linejoin="round"/>
    <path d="${ARCH}" fill="none" stroke="#a5a39e" stroke-width="14" stroke-linejoin="round" transform="translate(-3,-3)"/>
    <g fill="none" stroke-linejoin="round">
      <path d="${ARCH}" stroke="#ffd79a" stroke-width="16" stroke-opacity=".28" transform="translate(0,0)"/>
      <path d="${ARCH}" stroke="#fff1d2" stroke-width="4" stroke-opacity=".9" transform="translate(4,4) scale(.992)" />
    </g>
    <!-- lit tube sign above the arch -->
    <g transform="rotate(-5 512 92)">
      <rect x="376" y="68" width="272" height="48" rx="24" fill="#ffe9c0" opacity=".28"/>
      <rect x="388" y="76" width="248" height="32" rx="16" fill="#fbf7ee" stroke="#fff" stroke-width="2"/>
      <text x="512" y="99.5" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="19" font-weight="700" letter-spacing="5" fill="#4a4a4a">GRAY ROOM</text>
      <rect x="640" y="80" width="26" height="24" rx="5" fill="#1d1d1d"/>
    </g>
    <rect x="-60" y="1010" width="1120" height="423" fill="url(#fl)"/>
    <path d="M236,1010 H766 L860,1373 H140 Z" fill="url(#refl)" opacity=".7"/>
    <rect x="-60" y="1010" width="1120" height="10" fill="#000" opacity=".2"/>
    <rect x="-60" y="1002" width="282" height="8" fill="#000" opacity=".08"/>
    <rect x="780" y="1002" width="282" height="8" fill="#000" opacity=".08"/>
  `);

  /* ---------- 03 gallery: small works hanging beside the arch ---------- */
  const gallery = svg(`
    <defs>
      <clipPath id="gA"><rect x="88" y="528" width="96" height="136"/></clipPath>
      <clipPath id="gC"><rect x="818" y="486" width="96" height="112"/></clipPath>
      <clipPath id="gB"><circle cx="134" cy="800" r="58"/></clipPath>
    </defs>
    <!-- A: texture painting, waves -->
    <rect x="80" y="528" width="120" height="160" fill="#000" opacity=".22" transform="translate(7,9)"/>
    <rect x="76" y="516" width="120" height="160" fill="#f6f3ee" stroke="#1d1d1d" stroke-width="6"/>
    <g clip-path="url(#gA)">
      <rect x="88" y="528" width="96" height="136" fill="#f5e9d3"/>
      <circle cx="158" cy="560" r="17" fill="#f08a4b"/>
      <path d="M80,600 Q112,578 136,598 T192,596 V670 H80 Z" fill="#8fd0c4"/>
      <path d="M80,622 Q110,604 138,622 T192,618 V670 H80 Z" fill="#2c8c8c"/>
      <path d="M80,645 Q114,630 140,646 T192,642 V670 H80 Z" fill="#1f4e79"/>
      <g stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7" fill="none">
        <path d="M94,612 q10,-7 20,0"/><path d="M140,632 q10,-7 20,0"/><path d="M104,655 q10,-6 20,0"/>
      </g>
    </g>
    <!-- B: round canvas, flowers -->
    <circle cx="140" cy="808" r="62" fill="#000" opacity=".22"/>
    <circle cx="134" cy="800" r="62" fill="#fbf7f0" stroke="#e6e0d6" stroke-width="5"/>
    <g clip-path="url(#gB)">
      <rect x="70" y="738" width="130" height="126" fill="#f7d9d2"/>
      <g fill="#e2567a"><circle cx="112" cy="786" r="13"/><circle cx="131" cy="776" r="13"/><circle cx="131" cy="798" r="13"/><circle cx="150" cy="787" r="13"/></g>
      <circle cx="131" cy="787" r="8" fill="#f8c865"/>
      <g fill="#f08a4b"><circle cx="160" cy="826" r="9"/><circle cx="173" cy="818" r="9"/><circle cx="173" cy="834" r="9"/></g>
      <circle cx="170" cy="826" r="5" fill="#fff3cf"/>
      <path d="M131,800 C128,826 120,846 108,862 M170,838 C168,850 162,858 156,866" stroke="#3f8f6b" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M121,832 q-18,-4 -24,8 q16,6 24,-8z" fill="#3f8f6b"/>
    </g>
    <!-- C: pet portrait -->
    <rect x="806" y="474" width="120" height="136" fill="#000" opacity=".22" transform="translate(7,9)"/>
    <rect x="806" y="474" width="120" height="136" fill="#f6f3ee" stroke="#1d1d1d" stroke-width="6"/>
    <g clip-path="url(#gC)">
      <rect x="818" y="486" width="96" height="112" fill="#efb84a"/>
      <path d="M836,598 C836,560 846,546 846,532 L842,508 L858,522 Q866,518 874,522 L890,508 L886,532 C886,546 896,560 896,598 Z" fill="#2b2b33"/>
      <circle cx="857" cy="540" r="3.4" fill="#f8e7a8"/><circle cx="875" cy="540" r="3.4" fill="#f8e7a8"/>
      <path d="M863,548 h6 l-3,4z" fill="#e2567a"/>
    </g>
    <!-- D: heart canvas -->
    <path d="M866,744 C836,712 798,738 818,774 C830,796 852,810 866,826 C880,810 902,796 914,774 C934,738 896,712 866,744 Z" fill="#000" opacity=".22" transform="translate(7,9)"/>
    <path d="M866,744 C836,712 798,738 818,774 C830,796 852,810 866,826 C880,810 902,796 914,774 C934,738 896,712 866,744 Z" fill="#d94a5c"/>
    <g fill="none" stroke-linecap="round" stroke-width="6">
      <path d="M828,756 q10,-14 24,-6" stroke="#f79aa4" opacity=".9"/>
      <path d="M846,790 q20,10 44,-14" stroke="#b2334a" opacity=".7"/>
      <path d="M884,754 q12,-6 18,6" stroke="#f79aa4" opacity=".7"/>
    </g>
  `);

  /* ---------- 04 words ---------- */
  const words = (print) => svg(`
    <g text-anchor="middle" font-family="Fraunces, Georgia, serif">
      <g class="${print ? '' : 'w-gray'}" fill="#f6efe2">
        <text x="512" y="${print ? 318 : 334}" font-size="64" font-weight="500" letter-spacing="-1.4">The room</text>
        <text x="512" y="${print ? 384 : 400}" font-size="64" font-weight="500" letter-spacing="-1.4">is gray.</text>
      </g>
      ${print ? `
      <text x="512" y="431" font-size="33" font-style="italic" font-weight="500" fill="#ffe2a6">The color is yours.</text>
      ` : `
      <g class="w-color" fill="#fff6e6">
        <text x="512" y="334" font-size="64" font-weight="500" letter-spacing="-1.4">The color</text>
        <text x="512" y="400" font-size="64" font-weight="500" letter-spacing="-1.4">is <tspan font-style="italic" fill="#ffd98a">yours.</tspan></text>
        <path class="w-stroke" d="M470,420 C514,409 566,409 626,418" pathLength="100" fill="none" stroke="#ffd98a" stroke-width="5" stroke-linecap="round"/>
      </g>`}
    </g>
  `);

  /* ---------- 05 easel and canvas ---------- */
  const paintShapes = (stroke) => stroke ? `
      <circle cx="606" cy="590" r="44"/>
      <path d="M320,712 Q380,660 450,700 T600,690 T680,676"/>
      <path d="M320,770 Q400,726 470,768 T680,744"/>
      <path d="M320,832 Q390,792 470,830 T680,806"/>
      <path d="M320,886 Q410,852 500,884 T680,868"/>
      <path d="M392,640 l14,-34 l14,34 M406,606 v-18"/>
  ` : '';
  const easel = svg(`
    <defs>
      <clipPath id="cv"><rect x="320" y="500" width="360" height="440"/></clipPath>
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#c9996a"/><stop offset="1" stop-color="#a9784c"/>
      </linearGradient>
    </defs>
    <g transform="translate(6,22)">
    <ellipse cx="500" cy="1080" rx="215" ry="17" fill="#000" opacity=".28"/>
    <!-- back leg and mast -->
    <path d="M492,470 L506,470 L516,1046 L498,1046 Z" fill="#6f4d31"/>
    <rect x="489" y="438" width="22" height="560" fill="#93683f"/>
    <!-- front legs -->
    <path d="M484,452 L502,452 L366,1080 L342,1080 Z" fill="url(#wood)"/>
    <path d="M498,452 L516,452 L658,1080 L634,1080 Z" fill="url(#wood)"/>
    <path d="M492,452 L502,452 L366,1080 L358,1080 Z" fill="#000" opacity=".12"/>
    <!-- cross bar -->
    <rect x="392" y="1000" width="216" height="14" rx="2" fill="#a47347"/>
    <!-- canvas shadow + side -->
    <rect x="320" y="500" width="360" height="440" fill="#000" opacity=".25" transform="translate(10,12)"/>
    <rect x="680" y="503" width="9" height="440" fill="#cfc8ba"/>
    <rect x="320" y="500" width="360" height="440" fill="#f6f0e3"/>
    <!-- gray copy: pencil outline waiting for colour -->
    <g class="go" fill="none" stroke="#8c8c8c" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 0" clip-path="url(#cv)" opacity=".85">
      ${paintShapes(true)}
    </g>
    <!-- colour copy: the finished painting -->
    <g class="co" clip-path="url(#cv)">
      <rect x="320" y="500" width="360" height="440" fill="#fbe7c4"/>
      <rect x="320" y="500" width="360" height="130" fill="#fdd9a4" opacity=".7"/>
      <circle cx="606" cy="590" r="44" fill="#ef6f4a"/>
      <circle cx="606" cy="590" r="58" fill="none" stroke="#f8a36c" stroke-width="7" opacity=".55"/>
      <path d="M392,640 l14,-34 l14,34 Z" fill="#fff"/><path d="M406,606 v-18" stroke="#37445c" stroke-width="3"/>
      <path d="M380,644 h54 l-8,10 h-38 Z" fill="#37445c"/>
      <path d="M320,712 Q380,660 450,700 T600,690 T680,676 V940 H320 Z" fill="#a6ddd0"/>
      <path d="M320,770 Q400,726 470,768 T680,744 V940 H320 Z" fill="#46a9a4"/>
      <path d="M320,832 Q390,792 470,830 T680,806 V940 H320 Z" fill="#23738d"/>
      <path d="M320,886 Q410,852 500,884 T680,868 V940 H320 Z" fill="#1c3f6e"/>
      <g fill="none" stroke-linecap="round">
        <path d="M344,720 q22,-16 44,-2" stroke="#fff" stroke-width="7" opacity=".85"/>
        <path d="M520,706 q26,-14 50,0" stroke="#fff" stroke-width="7" opacity=".8"/>
        <path d="M410,786 q26,-16 54,0" stroke="#d7f2ea" stroke-width="8" opacity=".85"/>
        <path d="M580,770 q24,-12 48,0" stroke="#d7f2ea" stroke-width="7" opacity=".7"/>
        <path d="M352,846 q30,-16 60,0" stroke="#7fc6cf" stroke-width="8" opacity=".8"/>
        <path d="M540,836 q30,-14 62,2" stroke="#7fc6cf" stroke-width="8" opacity=".7"/>
        <path d="M430,902 q30,-12 62,2" stroke="#4f79b0" stroke-width="8" opacity=".8"/>
        <path d="M584,640 q22,6 46,-2" stroke="#ffd08a" stroke-width="6" opacity=".7"/>
        <path d="M340,560 q60,-18 130,-4" stroke="#fff3d6" stroke-width="10" opacity=".7"/>
      </g>
    </g>
    <rect x="320" y="500" width="360" height="440" fill="none" stroke="#000" stroke-opacity=".10" stroke-width="2"/>
    <!-- clamp and tray -->
    <rect x="474" y="480" width="52" height="24" rx="3" fill="#8a6038"/>
    <rect x="296" y="938" width="408" height="18" rx="3" fill="#b98756"/>
    <rect x="296" y="952" width="408" height="6" fill="#000" opacity=".18"/>
    </g>
  `);

  /* ---------- 06 track lights ---------- */
  const head = (x, rot) => `
    <g transform="translate(${x},38)">
      <rect x="-3" y="0" width="6" height="26" fill="#161616"/>
      <g transform="translate(0,30) rotate(${rot})">
        <rect x="-19" y="-6" width="38" height="62" rx="7" fill="#1b1b1b"/>
        <rect x="-19" y="-6" width="12" height="62" rx="6" fill="#fff" opacity=".07"/>
        <ellipse cx="0" cy="56" rx="17" ry="5.5" fill="#fff1cf"/>
        <ellipse cx="0" cy="56" rx="26" ry="10" fill="#ffe6b0" opacity=".35"/>
      </g>
    </g>`;
  const cone = (x, dx, id) => `
    <polygon points="${x - 15},124 ${x + 15},124 ${x + dx + 210},1060 ${x + dx - 210},1060" fill="url(#${id})"/>`;
  const lights = svg(`
    <defs>
      <linearGradient id="cn" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff0cc" stop-opacity=".30"/>
        <stop offset=".55" stop-color="#fff0cc" stop-opacity=".09"/>
        <stop offset="1" stop-color="#fff0cc" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${cone(212, 150, 'cn')}${cone(812, -150, 'cn')}
    <!-- black track, crossing like the star on the shop's ceiling -->
    <g stroke="#151515" stroke-width="9" stroke-linecap="round">
      <path d="M-40,34 H1040"/><path d="M90,-30 L330,34"/><path d="M910,-30 L670,34"/>
    </g>
    <path d="M-40,31 H1040" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
    ${head(212, -14)}${head(812, 14)}
  `);

  /* ---------- 07 table ---------- */
  const blob = (cx, cy, rx, ry, c) => `
    <ellipse cx="${cx}" cy="${cy + 3}" rx="${rx}" ry="${ry}" fill="#000" opacity=".14"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/>
    <ellipse cx="${cx - rx * 0.3}" cy="${cy - ry * 0.35}" rx="${rx * 0.34}" ry="${ry * 0.28}" fill="#fff" opacity=".38"/>`;
  const brushUp = (x, top, lean, handle, tip) => `
    <g transform="rotate(${lean} ${x} 1180)">
      <rect x="${x - 5}" y="${top + 62}" width="10" height="${1180 - top - 62}" rx="4" fill="${handle}"/>
      <rect x="${x - 7}" y="${top + 38}" width="14" height="28" fill="#c9c9cc"/>
      <rect x="${x - 7}" y="${top + 44}" width="14" height="3" fill="#8f8f95"/>
      <path d="M${x - 8},${top + 38} Q${x - 10},${top + 12} ${x},${top} Q${x + 10},${top + 12} ${x + 8},${top + 38} Z" fill="${tip}"/>
    </g>`;
  const table = svg(`
    <defs>
      <linearGradient id="tb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d2a674"/><stop offset="1" stop-color="#b3824f"/>
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#eef6f6" stop-opacity=".75"/><stop offset=".5" stop-color="#eef6f6" stop-opacity=".35"/><stop offset="1" stop-color="#eef6f6" stop-opacity=".7"/>
      </linearGradient>
      <clipPath id="wf"><path d="M790,1254 L900,1232 L934,1300 L816,1326 Z"/></clipPath>
    </defs>
    <!-- brushes standing in the jar (behind the glass) -->
    ${brushUp(716, 960, -11, '#2b2b33', '#ef6f4a')}
    ${brushUp(742, 930, -2, '#b98756', '#23738d')}
    ${brushUp(764, 975, 8, '#d94a5c', '#f8c865')}
    ${brushUp(736, 1000, 15, '#2b2b33', '#fbf2e2')}
    <!-- table top -->
    <path d="M-80,1168 H1080 V1453 H-80 Z" fill="url(#tb)"/>
    <rect x="-80" y="1168" width="1160" height="7" fill="#fff" opacity=".28"/>
    <g stroke="#7d5630" stroke-opacity=".22" stroke-width="2" fill="none">
      <path d="M-80,1208 C200,1200 420,1216 1080,1204"/><path d="M-80,1262 C260,1270 560,1252 1080,1266"/>
      <path d="M-80,1322 C240,1314 620,1332 1080,1318"/><path d="M-80,1352 C300,1360 640,1346 1080,1356"/>
    </g>
    <!-- jar -->
    <ellipse cx="742" cy="1252" rx="62" ry="13" fill="#000" opacity=".22"/>
    <path d="M690,1112 H794 V1236 Q794,1252 742,1252 Q690,1252 690,1236 Z" fill="url(#glass)"/>
    <path d="M692,1178 H792 V1236 Q792,1250 742,1250 Q692,1250 692,1236 Z" fill="#46a9a4" opacity=".55"/>
    <ellipse cx="742" cy="1178" rx="50" ry="8" fill="#8fd0c4" opacity=".7"/>
    <ellipse cx="742" cy="1112" rx="52" ry="9" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>
    <rect x="700" y="1122" width="7" height="108" rx="3.5" fill="#fff" opacity=".55"/>
    <!-- palette -->
    <ellipse cx="292" cy="1284" rx="196" ry="62" fill="#000" opacity=".2"/>
    <path d="M100,1270 C100,1230 190,1208 300,1210 C420,1212 492,1238 488,1276 C485,1312 404,1334 292,1334 C250,1334 232,1318 204,1318 C150,1318 100,1306 100,1270 Z" fill="#ecd0a2"/>
    <path d="M100,1270 C100,1306 150,1318 204,1318 C232,1318 250,1334 292,1334 C404,1334 485,1312 488,1276 C486,1322 404,1344 292,1344 C250,1344 232,1328 204,1328 C150,1328 100,1316 100,1270Z" fill="#c9a877"/>
    <ellipse cx="170" cy="1284" rx="24" ry="11" fill="#9a713f"/>
    <ellipse cx="170" cy="1287" rx="22" ry="9" fill="#b3824f"/>
    ${blob(232, 1244, 26, 11, '#ef6f4a')}${blob(300, 1232, 26, 11, '#f8c865')}${blob(368, 1238, 26, 11, '#46a9a4')}
    ${blob(428, 1258, 24, 10, '#1c3f6e')}${blob(410, 1296, 24, 10, '#d94a5c')}${blob(338, 1284, 30, 12, '#fbf2e2')}
    <path d="M262,1300 q24,-10 46,-2 q-18,14 -46,2z" fill="#f29a72" opacity=".9"/>
    <!-- brush lying on the palette -->
    <g transform="rotate(-13 300 1290)">
      <rect x="180" y="1292" width="250" height="10" rx="5" fill="#2b2b33"/>
      <rect x="150" y="1290" width="34" height="14" fill="#c9c9cc"/><rect x="158" y="1290" width="3" height="14" fill="#8f8f95"/>
      <path d="M150,1290 Q122,1288 108,1297 Q122,1306 150,1304 Z" fill="#ef6f4a"/>
    </g>
    <!-- coffee -->
    <ellipse cx="602" cy="1316" rx="96" ry="24" fill="#000" opacity=".2"/>
    <ellipse cx="600" cy="1308" rx="94" ry="23" fill="#f7f4ee"/>
    <ellipse cx="600" cy="1305" rx="70" ry="15" fill="#dfdacf"/>
    <path d="M654,1262 C690,1254 700,1290 660,1294" fill="none" stroke="#cfdcc4" stroke-width="12" stroke-linecap="round"/>
    <path d="M538,1246 H662 C662,1290 640,1308 600,1308 C560,1308 538,1290 538,1246 Z" fill="#d7e3cc"/>
    <path d="M538,1246 C538,1290 560,1308 600,1308 C578,1300 560,1284 556,1246 Z" fill="#000" opacity=".06"/>
    <ellipse cx="600" cy="1246" rx="62" ry="15" fill="#e3ecd9"/>
    <ellipse cx="600" cy="1247" rx="54" ry="11.5" fill="#b9814f"/>
    <path d="M600,1252 C588,1244 580,1246 584,1241 C590,1237 598,1240 600,1244 C602,1240 610,1237 616,1241 C620,1246 612,1244 600,1252 Z" fill="#f6ead7"/>
    <!-- croissant waffle with jam -->
    <ellipse cx="866" cy="1304" rx="124" ry="34" fill="#000" opacity=".2"/>
    <ellipse cx="864" cy="1296" rx="122" ry="33" fill="#f7f4ee"/>
    <ellipse cx="864" cy="1293" rx="96" ry="23" fill="#e6e1d6"/>
    <path d="M790,1262 L900,1240 L934,1308 L816,1334 Z" fill="#a8662a"/>
    <path d="M790,1254 L900,1232 L934,1300 L816,1326 Z" fill="#e2a24a"/>
    <g clip-path="url(#wf)" stroke="#b97426" stroke-width="5" fill="none">
      <path d="M812,1249 L838,1322 M840,1244 L866,1316 M868,1238 L894,1310 M896,1232 L922,1304"/>
      <path d="M796,1274 L912,1250 M804,1296 L920,1272 M812,1318 L930,1292"/>
    </g>
    <path d="M790,1254 L900,1232" stroke="#f6c877" stroke-width="4" fill="none"/>
    <path d="M846,1262 q18,-12 36,0 q8,14 -8,22 q-22,8 -32,-6 q-4,-10 4,-16z" fill="#c2334d"/>
    <ellipse cx="858" cy="1266" rx="7" ry="3.4" fill="#fff" opacity=".45"/>
    <!-- paint tube -->
    <g transform="rotate(18 110 1366)">
      <rect x="20" y="1352" width="150" height="40" rx="8" fill="#eceae6"/>
      <rect x="70" y="1352" width="60" height="40" fill="#ef6f4a"/>
      <rect x="170" y="1362" width="18" height="20" rx="3" fill="#2b2b33"/>
      <path d="M188,1372 q26,-10 40,2 q-14,14 -40,-2z" fill="#ef6f4a"/>
    </g>
  `);

  /* ---------- 08 frame (card units 1000 x 1480) ---------- */
  const frame = (print) => svg(`
    <defs>
      <linearGradient id="pp" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7f4ee"/><stop offset="1" stop-color="#ece8df"/>
      </linearGradient>
    </defs>
    <path fill-rule="evenodd" fill="url(#pp)" d="M0,22 Q0,0 22,0 H978 Q1000,0 1000,22 V1458 Q1000,1480 978,1480 H22 Q0,1480 0,1458 Z M36,36 V1310 H964 V36 Z"/>
    <path d="M36,36 H964 V1310 H36 Z" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="3"/>
    <path d="M36,1310 V36 H964" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="7" transform="translate(3,3)"/>
    <!-- colour spilling onto the paper -->
    <g class="co">
      <path d="M52,1440 C150,1418 310,1414 462,1434" fill="none" stroke="#ef6f4a" stroke-width="20" stroke-linecap="round" opacity=".92"/>
      <path d="M76,1452 C170,1436 300,1432 430,1446" fill="none" stroke="#f8a36c" stroke-width="5" stroke-linecap="round" opacity=".7"/>
      <circle cx="494" cy="1438" r="5" fill="#ef6f4a"/><circle cx="514" cy="1424" r="3" fill="#ef6f4a"/>
    </g>
    <text x="54" y="1398" font-family="Inter, Helvetica, Arial, sans-serif" font-size="54" font-weight="700" letter-spacing="7" fill="#262626">GRAY ROOM</text>
    <text x="946" y="${print ? 1360 : 1374}" text-anchor="end" font-family="Inter, Helvetica, Arial, sans-serif" font-size="23" font-weight="600" letter-spacing="4.2" fill="#3a3a3a">PAINT &amp; CAFE</text>
    <text x="946" y="${print ? 1396 : 1412}" text-anchor="end" font-family="Inter, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'WenQuanYi Zen Hei', sans-serif" font-size="23" letter-spacing="2.4" fill="#6a6a6a">&#28784;&#25151;&#38291; &#30059;&#30059;&#21654;&#21857;&#24307;</text>
    ${print ? `<text x="946" y="1440" text-anchor="end" font-family="Fraunces, Georgia, serif" font-style="italic" font-weight="500" font-size="27" fill="#c8502f">Flip. Scan. Add your color.</text>` : ''}
  `, 1000, 1480);

  /* ---------- 09 foreground (card units, in front of the paper frame) ---------- */
  const leaf = (d, c, vein) => `<path d="${d}" fill="${c}"/><path d="${vein}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="3" stroke-linecap="round"/>`;
  const foreground = svg(`
    <g class="lf">
      ${leaf('M-90,120 C-10,40 120,10 250,58 C170,92 110,150 20,170 C-20,178 -60,160 -90,120 Z', '#2f6b4f', 'M-70,128 C20,96 130,70 240,60')}
      ${leaf('M-80,250 C-30,170 80,150 196,214 C120,246 70,300 -10,300 C-44,300 -70,282 -80,250 Z', '#3f8f6b', 'M-66,256 C10,232 100,214 188,216')}
      ${leaf('M-70,24 C-10,-60 110,-80 220,-20 C150,10 100,60 20,66 C-20,68 -50,52 -70,24 Z', '#245640', 'M-56,28 C20,0 120,-18 212,-20')}
    </g>
    <!-- the brush that just painted the stroke under the name, lying off the bottom edge -->
    <g transform="translate(492,1440) rotate(21)">
      <rect x="92" y="-9" width="330" height="18" rx="9" fill="#23232a"/>
      <rect x="92" y="-9" width="330" height="5" rx="2.5" fill="#fff" opacity=".10"/>
      <rect x="46" y="-13" width="50" height="26" fill="#cfcfd3"/>
      <rect x="58" y="-13" width="5" height="26" fill="#8f8f95"/>
      <path d="M46,-13 Q10,-15 -8,0 Q10,15 46,13 Z" fill="#8a6038"/>
      <path class="co" d="M24,-12 Q6,-10 -8,0 Q6,10 24,12 Z" fill="#ef6f4a"/>
    </g>
  `, 1000, 1480);


  /* shopfront drawing for the stamp on the back. Swap for Anthony's own photo when he has one. */
  const bulbs = [];
  for (let i = 0; i <= 14; i++) { const x = 70 + i * 19.5, y = 92 + Math.sin((i / 14) * Math.PI) * 16; bulbs.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2"/>`); }
  const shopfront = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="400" height="300" fill="#dfe3e6"/>
    <rect x="0" y="0" width="400" height="26" fill="#eef0f1"/>
    <g stroke="#cfd3d6" stroke-width="1"><path d="M0,9 H400 M0,18 H400"/><path d="M40,0 V26 M80,0 V26 M120,0 V26 M160,0 V26 M200,0 V26 M240,0 V26 M280,0 V26 M320,0 V26 M360,0 V26"/></g>
    <rect x="26" y="26" width="348" height="52" fill="#a9abad"/>
    <rect x="26" y="74" width="348" height="4" fill="#000" opacity=".18"/>
    <text x="200" y="61" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="5" fill="#fff">GRAY ROOM</text>
    <rect x="26" y="78" width="30" height="170" fill="#b9bbbd"/><rect x="344" y="78" width="30" height="170" fill="#b9bbbd"/>
    <rect x="56" y="78" width="288" height="170" fill="#2a2b2f"/>
    <rect x="70" y="112" width="260" height="136" fill="#4a4640"/>
    <rect x="70" y="112" width="260" height="136" fill="#ffd9a0" opacity=".28"/>
    <g fill="#ffe7bf" opacity=".9"><circle cx="110" cy="130" r="3"/><circle cx="160" cy="126" r="3"/><circle cx="240" cy="126" r="3"/><circle cx="290" cy="130" r="3"/></g>
    <g fill="#f6f1e6" opacity=".85"><rect x="96" y="176" width="34" height="44"/><rect x="150" y="186" width="26" height="34"/><rect x="262" y="180" width="30" height="40"/></g>
    <rect x="100" y="180" width="26" height="20" fill="#46a9a4"/><rect x="153" y="190" width="20" height="14" fill="#ef6f4a"/><rect x="266" y="184" width="22" height="18" fill="#f8c865"/>
    <g stroke="#111" stroke-width="3.5" fill="none"><rect x="70" y="112" width="260" height="136"/><path d="M135,112 V248 M200,112 V248 M265,112 V248 M70,146 H330"/></g>
    <path d="M70,92 Q200,128 343,92" fill="none" stroke="#1a1a1a" stroke-width="1.2"/>
    <g fill="#fff3cf">${bulbs.join('')}</g>
    <rect x="0" y="248" width="400" height="52" fill="#c9ccce"/>
    <g fill="#9da1a4" opacity=".7"><circle cx="30" cy="262" r="1.5"/><circle cx="90" cy="280" r="1.5"/><circle cx="150" cy="266" r="1.5"/><circle cx="210" cy="286" r="1.5"/><circle cx="270" cy="268" r="1.5"/><circle cx="330" cy="282" r="1.5"/><circle cx="376" cy="262" r="1.5"/><circle cx="60" cy="292" r="1.5"/><circle cx="240" cy="258" r="1.5"/></g>
    <g>
      <path d="M300,198 L288,286 M312,198 L326,286 M306,196 V280" stroke="#b98756" stroke-width="4" stroke-linecap="round" fill="none"/>
      <rect x="290" y="204" width="34" height="42" fill="#fbf2e2" stroke="#b98756" stroke-width="2"/>
      <circle cx="307" cy="223" r="9" fill="#f8c865"/>
      <rect x="286" y="246" width="42" height="5" fill="#b98756"/>
    </g>
    <g><rect x="60" y="216" width="30" height="46" fill="#f4f1ea" stroke="#333" stroke-width="2"/><path d="M66,228 H84 M66,236 H84 M66,244 H80" stroke="#555" stroke-width="2"/></g>
  </svg>`;

  window.GR = {
    SW, SH, shopfront,
    /* depth in card units (card width = 1000). Negative = behind the paper frame. */
    layers: (opts = {}) => [
      { id: 'mural',   name: 'Mural',        z: -330, kind: 'scene', dual: true,  html: mural },
      { id: 'wall',    name: 'Plaster wall', z: -270, kind: 'scene', dual: true,  html: wall },
      { id: 'gallery', name: 'Gallery',      z: -235, kind: 'scene', dual: true,  html: gallery },
      { id: 'words',   name: 'Headline',     z: -195, kind: 'scene', dual: false, html: words(opts.print) },
      { id: 'easel',   name: 'Easel',        z: -150, kind: 'scene', dual: true,  html: easel },
      { id: 'lights',  name: 'Track lights', z: -105, kind: 'scene', dual: true,  html: lights },
      { id: 'table',   name: 'Table',        z: -55,  kind: 'scene', dual: true,  html: table },
      { id: 'frame',   name: 'Paper frame',  z: 0,    kind: 'card',  dual: true,  html: frame(opts.print) },
      { id: 'fore',    name: 'Foreground',   z: 55,   kind: 'card',  dual: true,  html: foreground },
    ],
  };
})();
