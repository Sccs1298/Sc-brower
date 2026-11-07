(function () {
  var S = window.STORE;

  // ---- Meta Pixel ----
  window.track = function () {};
  if (S.pixelId) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', S.pixelId);
    fbq('track', 'PageView');
    window.track = function (ev, data) { fbq('track', ev, data || {}); };
  }

  // שמירת פרמטרי UTM לשימוש בהמשך
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('utm_source')) sessionStorage.setItem('utm', location.search);
  } catch (e) {}

  window.checkout = function (p) {
    var pkg = S.packages[p];
    var url = S.growLinks[p];
    track('InitiateCheckout', { value: pkg.price, currency: 'ILS', num_items: pkg.qty, content_ids: ['klaro-' + p], content_type: 'product' });
    try { sessionStorage.setItem('pending_pkg', String(p)); } catch (e) {}
    if (!url) { alert('הקופה תיפתח בקרוב — דף התשלום עדיין לא חובר.'); return; }
    location.href = url;
  };

  document.addEventListener('DOMContentLoaded', function () {
    // פרטי עסק בפוטר ובתקנון
    var b = S.business;
    document.querySelectorAll('[data-biz]').forEach(function (el) {
      var v = b[el.getAttribute('data-biz')];
      if (v) el.textContent = v;
    });
    document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = S.brand; });
    var wa = document.getElementById('wa');
    if (wa && b.whatsapp) { wa.href = 'https://wa.me/' + b.whatsapp; wa.hidden = false; }
    var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  });
})();
