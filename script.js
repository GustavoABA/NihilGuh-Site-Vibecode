(() => {
  const cfg = window.NIHIL_CONFIG || { links: {}, status: {}, api: {} };
  const links = cfg.links || {};
  const apiBase = String(cfg.api?.base || '').replace(/\/+$/, '');

  const intro = document.getElementById('intro-gate');
  const endIntro = () => {
    document.body.classList.remove('intro-running');
    if (intro) intro.remove();
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    endIntro();
  } else {
    window.setTimeout(endIntro, 3550);
  }

  const subtitle = document.getElementById('subtitle');
  if (subtitle && cfg.creator?.subtitle) subtitle.textContent = cfg.creator.subtitle;

  document.querySelectorAll('[data-link]').forEach((el) => {
    const href = links[el.dataset.link];
    if (href) el.href = href;
  });

  document.querySelectorAll('.brand-icon img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback) fallback.style.display = 'block';
    }, { once: true });
  });

  function setLive(platform, isLive) {
    const card = document.querySelector(`[data-platform="${platform}"]`);
    if (card) card.classList.toggle('is-live', Boolean(isLive));
  }

  async function checkTwitchLive() {
    if (!cfg.status?.twitch?.enabled) return;
    const channel = cfg.status.twitch.channel || 'nihilguh';
    const endpoint = `https://decapi.me/twitch/uptime?channel=${encodeURIComponent(channel)}&offline_msg=offline`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error('status request failed');
      const text = (await response.text()).trim().toLowerCase();
      const live = Boolean(text) && !text.includes('offline') && !text.includes('error');
      setLive('twitch', live);
    } catch (_) {
      setLive('twitch', false);
    }
  }

  checkTwitchLive();
  const twitchTimer = setInterval(() => {
    if (document.visibilityState === 'visible') checkTwitchLive();
  }, 60000);
  window.addEventListener('pagehide', () => clearInterval(twitchTimer), { once: true });

  const apiStatus = document.getElementById('api-status');
  const apiStatusText = document.getElementById('api-status-text');
  const apiFallback = document.getElementById('api-fallback');

  const setApiState = (state, text) => {
    apiStatus?.classList.remove('is-ready', 'is-error');
    if (state === 'ready') apiStatus?.classList.add('is-ready');
    if (state === 'error') apiStatus?.classList.add('is-error');
    if (apiStatusText) apiStatusText.textContent = text;
  };

  async function api(path, options = {}) {
    if (!apiBase) throw new Error('API_NOT_CONFIGURED');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkApi() {
    if (!apiBase) {
      setApiState('error', 'API segura ainda não conectada ao site.');
      if (apiFallback) apiFallback.hidden = false;
      return false;
    }
    try {
      await api('/health', { method: 'GET' });
      setApiState('ready', 'LivePix API conectada.');
      if (apiFallback) apiFallback.hidden = true;
      return true;
    } catch (_) {
      setApiState('error', 'Não foi possível conectar ao LivePix agora.');
      if (apiFallback) apiFallback.hidden = false;
      return false;
    }
  }

  const apiReadyPromise = checkApi();

  document.querySelectorAll('.pix-tab').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      document.querySelectorAll('.pix-tab').forEach((b) => {
        const active = b === button;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.pix-pane').forEach((pane) => {
        const active = pane.dataset.pane === tab;
        pane.classList.toggle('is-active', active);
        pane.hidden = !active;
      });
      if (tab === 'subscription') loadPlans();
    });
  });

  document.querySelectorAll('.quick-values').forEach((group) => {
    group.querySelectorAll('[data-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const form = document.getElementById(group.dataset.target);
        const input = form?.querySelector('[name="amount"]');
        if (input) {
          input.value = Number(button.dataset.value).toFixed(2).replace('.', ',');
          input.focus();
        }
      });
    });
  });

  function amountToCents(value) {
    const normalized = String(value || '').trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const number = Number(normalized);
    if (!Number.isFinite(number) || number <= 0) throw new Error('Informe um valor válido.');
    return Math.round(number * 100);
  }

  function setFeedback(form, message, type = '') {
    const target = form.querySelector('.form-feedback');
    if (!target) return;
    target.textContent = message;
    target.className = `form-feedback ${type}`.trim();
  }

  async function submitWithCheckout(form, path, payloadFactory) {
    const button = form.querySelector('button[type="submit"]');
    setFeedback(form, '');
    try {
      if (!(await apiReadyPromise)) throw new Error('A integração segura ainda não foi configurada.');
      const payload = payloadFactory(new FormData(form));
      button.disabled = true;
      button.querySelector('span').textContent = 'Criando checkout...';
      const result = await api(path, { method: 'POST', body: JSON.stringify(payload) });
      const redirectUrl = result?.redirectUrl || result?.data?.redirectUrl;
      if (!redirectUrl) throw new Error('O LivePix não retornou a URL do checkout.');
      setFeedback(form, 'Checkout criado. Redirecionando...', 'ok');
      window.location.assign(redirectUrl);
    } catch (error) {
      setFeedback(form, error.message || 'Não foi possível criar o pagamento.', 'error');
      if (apiFallback) apiFallback.hidden = false;
    } finally {
      if (button) {
        button.disabled = false;
        const label = form.id === 'subscription-form' ? 'Continuar assinatura' : form.id === 'payment-form' ? 'Gerar pagamento' : 'Continuar para o Pix';
        button.querySelector('span').textContent = label;
      }
    }
  }

  document.getElementById('message-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithCheckout(event.currentTarget, '/message', (fd) => ({
      username: String(fd.get('username') || '').trim(),
      message: String(fd.get('message') || '').trim(),
      amount: amountToCents(fd.get('amount')),
      currency: 'BRL',
      redirectUrl: window.location.href.split('#')[0] + '#apoiar'
    }));
  });

  document.getElementById('payment-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithCheckout(event.currentTarget, '/payment', (fd) => ({
      amount: amountToCents(fd.get('amount')),
      currency: 'BRL',
      redirectUrl: window.location.href.split('#')[0] + '#apoiar'
    }));
  });

  let plansLoaded = false;
  async function loadPlans() {
    if (plansLoaded) return;
    const loading = document.getElementById('subscription-loading');
    const grid = document.getElementById('plans-grid');
    try {
      if (!(await apiReadyPromise)) throw new Error('API não configurada');
      const result = await api('/plans', { method: 'GET' });
      const plans = result?.data || result?.plans || [];
      if (!Array.isArray(plans) || !plans.length) throw new Error('Nenhum plano disponível.');
      if (grid) {
        grid.innerHTML = '';
        plans.forEach((plan) => {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'plan-card';
          card.dataset.planId = plan.id;
          const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: plan.currency || 'BRL' }).format((Number(plan.amount) || 0) / 100);
          card.innerHTML = `<strong>${escapeHtml(plan.name || plan.slug || 'Plano')}</strong><small>${escapeHtml(plan.description || 'Assinatura LivePix')}</small><b>${value}</b>`;
          card.addEventListener('click', () => selectPlan(plan, card));
          grid.appendChild(card);
        });
      }
      plansLoaded = true;
    } catch (error) {
      if (grid) grid.innerHTML = `<div class="form-feedback error">${escapeHtml(error.message || 'Não foi possível carregar os planos.')}</div>`;
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  function selectPlan(plan, card) {
    document.querySelectorAll('.plan-card').forEach((el) => el.classList.toggle('is-selected', el === card));
    const form = document.getElementById('subscription-form');
    if (!form) return;
    form.hidden = false;
    form.querySelector('[name="planId"]').value = plan.id;
    const selected = document.getElementById('selected-plan');
    if (selected) selected.textContent = `Plano selecionado: ${plan.name || plan.slug || 'LivePix'}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('subscription-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitWithCheckout(event.currentTarget, '/subscription', (fd) => ({
      planId: String(fd.get('planId') || ''),
      recurrence: String(fd.get('recurrence') || 'monthly'),
      subscriber: {
        username: String(fd.get('username') || '').trim(),
        email: String(fd.get('email') || '').trim()
      },
      redirectUrl: window.location.href.split('#')[0] + '#apoiar'
    }));
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
})();
