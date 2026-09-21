(() => {
  const KEY = 'nihilguh_backend_url';
  const DEFAULT_BACKEND = 'https://script.google.com/macros/s/AKfycbwZk4rY5yDWyGrZRAaQHfHzKnQeLc091VQSs5fehtmfpkxnHxQ32wfUUzF5jzFQMumo/exec';
  const params = new URLSearchParams(location.search);
  const supplied = params.get('backend');

  // Official NihilGuh Apps Script backend.
  // A valid ?backend= URL can still be used to replace it intentionally.
  if (supplied && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(supplied)) {
    localStorage.setItem(KEY, supplied.replace(/\/$/, ''));
    params.delete('backend');
    const clean = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
    history.replaceState(null, '', clean);
  } else {
    const current = localStorage.getItem(KEY);
    if (!current || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(current)) {
      localStorage.setItem(KEY, DEFAULT_BACKEND);
    } else if (current !== DEFAULT_BACKEND) {
      // Migrate stale/old deployments to the currently published backend.
      localStorage.setItem(KEY, DEFAULT_BACKEND);
    }
  }

  window.NIHILGUH_CONFIG = {
    backendUrl: localStorage.getItem(KEY) || DEFAULT_BACKEND,
    historyDays: 5,
    pollMs: 30000,
    deploymentId: 'AKfycbwZk4rY5yDWyGrZRAaQHfHzKnQeLc091VQSs5fehtmfpkxnHxQ32wfUUzF5jzFQMumo'
  };
})();