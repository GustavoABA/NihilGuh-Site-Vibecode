(() => {
  const cfg = window.NIHIL_CONFIG || { links: {} };
  const links = cfg.links || {};

  const subtitle = document.getElementById('subtitle');
  if (subtitle && cfg.creator?.subtitle) subtitle.textContent = cfg.creator.subtitle;

  document.querySelectorAll('[data-link]').forEach((el) => {
    const key = el.dataset.link;
    const href = links[key];
    if (href) {
      el.href = href;
      el.classList.remove('disabled');
      el.removeAttribute('aria-disabled');
    } else {
      el.removeAttribute('href');
      el.classList.add('disabled');
      el.setAttribute('aria-disabled', 'true');
      el.addEventListener('click', (e) => e.preventDefault());
    }
  });

  const discordHero = document.getElementById('discord-hero');
  if (discordHero) discordHero.href = links.discord || '#';

  const modal = document.getElementById('pix-modal');
  const frameWrap = document.getElementById('pix-frame-wrap');
  const direct = document.getElementById('livepix-direct');
  const pixUrl = links.livepix || 'https://livepix.gg/justguh';
  let iframeLoaded = false;

  if (direct) direct.href = pixUrl;

  function openPix() {
    if (!modal) return;
    if (!iframeLoaded && frameWrap) {
      const iframe = document.createElement('iframe');
      iframe.src = pixUrl;
      iframe.title = 'LivePix — Apoiar NihilGuh';
      iframe.loading = 'eager';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allow = 'payment *';
      frameWrap.appendChild(iframe);
      iframeLoaded = true;
    }
    modal.showModal();
  }

  function closePix() {
    if (modal?.open) modal.close();
  }

  document.getElementById('open-livepix')?.addEventListener('click', openPix);
  document.getElementById('footer-pix')?.addEventListener('click', openPix);
  document.getElementById('close-livepix')?.addEventListener('click', closePix);

  modal?.addEventListener('click', (event) => {
    const rect = modal.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) closePix();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePix();
  });
})();
