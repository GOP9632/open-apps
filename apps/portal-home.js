// 「回入口」按鈕：從入口網站（anthony-apps.netlify.app，/apps/* 代理到 GitHub Pages）打開 app 時才顯示。
// 加到主畫面的入口是全螢幕、沒有上一頁，所以每個網頁 app 都要有這顆按鈕。
// 用法：在 <head> 放 <script src="../portal-home.js"></script>，
// 再把 <a class="portal-home" href="https://anthony-apps.netlify.app/" aria-label="回入口">…</a> 放進 app 自己的頁首，樣式由各 app 決定。
// 直接用 gop9632.github.io 打開時按鈕會藏起來。
(function () {
  var fromPortal = !/\.github\.io$/.test(location.hostname);
  var css = document.createElement('style');
  css.textContent = 'html:not(.from-portal) .portal-home{display:none!important}';
  document.head.appendChild(css);
  if (fromPortal) document.documentElement.classList.add('from-portal');
})();
