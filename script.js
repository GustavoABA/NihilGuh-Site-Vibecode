(() => {
  const cfg = window.NIHIL_CONFIG || { links: {}, status: {} };
  const links = cfg.links || {};

  const subtitle = document.getElementById('subtitle');
  if (subtitle && cfg.creator?.subtitle) subtitle.textContent = cfg.creator.subtitle;

  document.querySelectorAll('[data-link]').forEach((el) => {
    const key = el.dataset.link;
    const href = links[key];
    if (href) el.href = href;
  });

  // Fallback local caso algum CDN de ícones falhe.
  document.querySelectorAll('.brand-icon img, .extra-icon img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback) fallback.style.display = 'block';
    }, { once: true });
  });

  // LivePix: carrega diretamente dentro do card e nunca deixa o loader preso.
  const livepixFrame = document.getElementById('livepix-frame');
  const livepixLoader = document.getElementById('livepix-loader');
  const livepixFallback = document.getElementById('livepix-fallback');
  const pixUrl = links.livepix || 'https://livepix.gg/justguh';
  let livepixReady = false;

  if (livepixFrame) {
    livepixFrame.addEventListener('load', () => {
      livepixReady = true;
      livepixLoader?.classList.add('is-hidden');
      if (livepixFallback) livepixFallback.hidden = true;
    });

    // Reatribuir o src garante que o listener esteja registrado antes da carga.
    livepixFrame.src = pixUrl;

    window.setTimeout(() => {
      if (!livepixReady) {
        livepixLoader?.classList.add('is-hidden');
        if (livepixFallback) livepixFallback.hidden = false;
      }
    }, 9000);
  }

  function setLive(platform, isLive) {
    const card = document.querySelector(`[data-platform="${platform}"]`);
    if (!card) return;
    card.classList.toggle('is-live', Boolean(isLive));
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
  const statusTimer = setInterval(() => {
    if (document.visibilityState === 'visible') checkTwitchLive();
  }, 60000);

  window.addEventListener('pagehide', () => clearInterval(statusTimer), { once: true });
})();
