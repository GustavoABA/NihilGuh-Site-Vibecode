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

  const supportLink = document.getElementById('support-link');
  if (supportLink && links.livepix) supportLink.href = links.livepix;

  document.querySelectorAll('.brand-icon img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback) fallback.style.display = 'block';
    }, { once: true });
  });

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
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') checkTwitchLive();
  }, 60000);

  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
