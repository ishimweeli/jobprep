// Microsoft Clarity (project ze6gt9zfad): anonymous usage analytics (clicks, scrolling, page views).
// Loaded from this file rather than inline because the site's Content-Security-Policy only allows same-origin
// scripts; the API's helmet config allows the Clarity domains. Runs on the live site only, never on admin pages.
(function () {
  if (location.hostname !== 'jobprep.nexvecta.com' || location.pathname.indexOf('/admin') === 0) return;
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', 'ze6gt9zfad');
})();
