(() => {
  const KEY = 'nihilguh_backend_url';
  const params = new URLSearchParams(location.search);
  const supplied = params.get('backend');

  // Allows the owner to connect a deployed Apps Script once without exposing
  // admin credentials. The URL itself is public and safe to keep client-side.
  if (supplied && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(supplied)) {
    localStorage.setItem(KEY, supplied);
    params.delete('backend');
    const clean = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
    history.replaceState(null, '', clean);
  }

  window.NIHILGUH_CONFIG = {
    backendUrl: localStorage.getItem(KEY) || '',
    historyDays: 5,
    pollMs: 30000
  };
})();