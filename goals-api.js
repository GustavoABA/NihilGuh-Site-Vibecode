(() => {
  const cfg = window.NIHILGUH_CONFIG || {};
  const API = {
    get backendUrl(){ return localStorage.getItem('nihilguh_backend_url') || cfg.backendUrl || ''; },
    set backendUrl(v){ if(v) localStorage.setItem('nihilguh_backend_url', v.replace(/\/$/,'')); else localStorage.removeItem('nihilguh_backend_url'); },

    call(action, params = {}) {
      return new Promise((resolve, reject) => {
        const base = API.backendUrl;
        if (!base) return reject(new Error('backend_not_configured'));
        const callback = '__nihilguh_cb_' + Math.random().toString(36).slice(2);
        const script = document.createElement('script');
        const timeout = setTimeout(() => cleanup(new Error('timeout')), 10000);

        function cleanup(error, data){
          clearTimeout(timeout);
          try { delete window[callback]; } catch {}
          script.remove();
          error ? reject(error) : resolve(data);
        }

        window[callback] = data => {\n          if (data && data.ok === false) cleanup(new Error(data.error || 'api_error'));\n          else cleanup(null, data);\n        };
        const qs = new URLSearchParams({ action, callback, ...params, _: Date.now().toString() });
        script.src = base + '?' + qs.toString();
        script.onerror = () => cleanup(new Error('network_error'));
        document.head.appendChild(script);
      });
    },

    visitorId(){
      let id = localStorage.getItem('nihilguh_visitor_id');
      if(!id){
        id = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem('nihilguh_visitor_id', id);
      }
      return id;
    },

    state(){ return API.call('state'); },
    history(days = cfg.historyDays || 5){ return API.call('history', { days }); },
    visit(){ return API.call('visit', { visitorId: API.visitorId() }); },
    admin(action, adminKey, params = {}){ return API.call(action, { ...params, adminKey }); }
  };

  window.NihilGuhAPI = API;
})();
