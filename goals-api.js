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

        window[callback] = data => {
          if (data && data.ok === false) cleanup(new Error(data.error || 'api_error'));
          else cleanup(null, data);
        };
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
    detectorStatus(){ return API.call('detectorStatus'); },
    history(days = cfg.historyDays || 5){ return API.call('history', { days }); },
    records(){ return API.call('records'); },
    visit(){ return API.call('visit', { visitorId: API.visitorId() }); },
    vote(optionId){ return API.call('vote', { visitorId: API.visitorId(), optionId }); },
    roundJoin(roundId){ return API.call('roundJoin', { visitorId: API.visitorId(), roundId }); },
    roundSubmit(roundId, answer = '', displayName = ''){ return API.call('roundSubmit', { visitorId: API.visitorId(), roundId, answer, displayName }); },
    admin(action, adminKey, params = {}){ return API.call(action, { ...params, adminKey }); },

    adminPost(action, adminKey, params = {}) {
      return new Promise((resolve, reject) => {
        const base = API.backendUrl;
        if (!base) return reject(new Error('backend_not_configured'));
        const requestId = (crypto.randomUUID ? crypto.randomUUID() : 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        const iframeName = '__nihilguh_admin_post_' + requestId.replace(/[^a-z0-9]/gi,'');
        const iframe = document.createElement('iframe');
        iframe.name = iframeName;
        iframe.hidden = true;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = base;
        form.target = iframeName;
        form.style.display = 'none';
        const fields = { action:'adminAction', adminAction:action, adminKey, requestId, ...params };
        Object.entries(fields).forEach(([name,value]) => {
          const input = document.createElement('input');
          input.name = name;
          input.value = value == null ? '' : String(value);
          form.appendChild(input);
        });
        document.body.appendChild(iframe);
        document.body.appendChild(form);
        form.submit();
        form.remove();

        const started = Date.now();
        const timer = setInterval(async () => {
          try {
            const status = await API.call('adminPostStatus', { requestId });
            if (status?.pending) {
              if (Date.now() - started > 12000) throw new Error('admin_post_timeout');
              return;
            }
            clearInterval(timer);
            iframe.remove();
            if (!status?.success) reject(new Error(status?.error || 'admin_action_failed'));
            else resolve(status.data || {});
          } catch (err) {
            if (Date.now() - started <= 12000 && String(err.message||'').includes('timeout')) return;
            clearInterval(timer);
            iframe.remove();
            reject(err);
          }
        }, 450);
      });
    }
  };

  window.NihilGuhAPI = API;
})();
