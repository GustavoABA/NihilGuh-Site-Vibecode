(() => {
  const intro = document.getElementById('intro');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const unlock = () => {
    document.body.classList.remove('intro-lock');
    intro?.remove();
  };
  if (reduced) unlock(); else setTimeout(unlock, 3800);

  const liveCard = document.querySelector('.live-main-card');
  const subtitle = document.getElementById('live-subtitle');
  async function checkLive() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const r = await fetch('https://decapi.me/twitch/uptime?channel=nihilguh&offline_msg=offline', { cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('status');
      const text = (await r.text()).trim().toLowerCase();
      const isLive = Boolean(text) && !text.includes('offline') && !text.includes('error');
      liveCard?.classList.toggle('is-live', isLive);
      if (subtitle) subtitle.textContent = isLive ? 'Estou live agora!' : 'Offline agora — veja os outros canais.';
    } catch {
      liveCard?.classList.remove('is-live');
      if (subtitle) subtitle.textContent = 'Status indisponível no momento.';
    }
  }
  checkLive();
  const statusTimer = setInterval(() => document.visibilityState === 'visible' && checkLive(), 60000);
  addEventListener('pagehide', () => clearInterval(statusTimer), { once: true });

  const form = document.getElementById('livepix-form');
  const amount = document.getElementById('support-amount');
  const msg = form?.querySelector('textarea[name="message"]');
  const count = document.getElementById('message-count');
  const toast = document.getElementById('toast');
  document.querySelectorAll('[data-value]').forEach(btn => btn.addEventListener('click', () => {
    if (amount) amount.value = Number(btn.dataset.value).toFixed(2).replace('.', ',');
    amount?.focus();
  }));
  msg?.addEventListener('input', () => { if (count) count.textContent = String(msg.value.length); });

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
  }
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const summary = [
      fd.get('name') ? `Nome: ${String(fd.get('name')).trim()}` : '',
      fd.get('amount') ? `Valor: R$ ${String(fd.get('amount')).trim()}` : '',
      fd.get('message') ? `Mensagem: ${String(fd.get('message')).trim()}` : ''
    ].filter(Boolean).join('\n');
    if (summary && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(summary); } catch {}
    }
    showToast(summary ? 'Dados copiados. Abrindo o LivePix…' : 'Abrindo o LivePix…');
    setTimeout(() => window.open('https://livepix.gg/justguh', '_blank', 'noopener,noreferrer'), 220);
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }));
})();
