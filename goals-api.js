(() => {
  const cfg = window.NIHILGUH_CONFIG || {};
  const BACKEND_FALLBACKS = [
    'https://script.google.com/macros/s/AKfycbx8IbeTPXiVQIJw_QL0YgRBRhurFGk2W2lQWE0CjGweLkF-aFI7KNyeh6PvVBuYZGM/exec',
    'https://script.google.com/macros/s/AKfycbzne2mZekghThymuej5yg8a6gNy2PNesVuVTo27RWhj7AXmr1TE_YEXMOImUySImf7Y/exec',
    'https://script.google.com/macros/s/AKfycbz8yWzWTfFx1N-KFCuYQK3kEx4mC854xja58Dq4pa8GzdZpxXBPX_91lVaqF7MrpUGR/exec'
  ];

  function backendCandidates(){
    const preferred = localStorage.getItem('nihilguh_backend_url') || cfg.backendUrl || '';
    return [preferred, ...BACKEND_FALLBACKS].filter((url,index,all)=>url && all.indexOf(url)===index);
  }

  const API = {
    get backendUrl(){ return localStorage.getItem('nihilguh_backend_url') || cfg.backendUrl || ''; },
    set backendUrl(v){ if(v) localStorage.setItem('nihilguh_backend_url', v.replace(/\/$/,'')); else localStorage.removeItem('nihilguh_backend_url'); },

    call(action, params = {}) {
      const candidates = backendCandidates();

      async function callOne(base) {
        if (!base) throw new Error('backend_not_configured');

        const qs = new URLSearchParams({ action, ...params, _: Date.now().toString() });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        try {
          const response = await fetch(base.replace(/\/$/,'') + '?' + qs.toString(), {
            method:'GET',
            mode:'cors',
            credentials:'omit',
            cache:'no-store',
            redirect:'follow',
            signal:controller.signal,
            headers:{ 'Accept':'application/json,text/plain,*/*' }
          });

          if (!response.ok) {
            throw new Error('http_' + response.status);
          }

          const text = await response.text();
          let data;

          try {
            data = JSON.parse(text);
          } catch (_) {
            // Compatibility with any deployment that still wraps JSON in callback(...).
            const match = text.match(/^[A-Za-z_$][0-9A-Za-z_$]*\((.*)\)\s*;?$/s);
            if (!match) throw new Error('invalid_backend_response');
            data = JSON.parse(match[1]);
          }

          if (data && data.ok === false) {
            throw new Error(data.error || 'api_error');
          }

          return data;
        } catch (err) {
          if (err?.name === 'AbortError') throw new Error('timeout');
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      }

      return (async()=>{
        let lastError = new Error('backend_not_configured');

        for(const base of candidates){
          try{
            const data = await callOne(base);

            if(base !== API.backendUrl){
              localStorage.setItem('nihilguh_backend_url',base);
            }

            return data;
          }catch(err){
            lastError = err;
            console.warn('NihilGuh backend falhou, tentando reserva:',base,err?.message||err);
          }
        }

        throw lastError;
      })();
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
    stateLite(){ return API.call('stateLite'); },
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
