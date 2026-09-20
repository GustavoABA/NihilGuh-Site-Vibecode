(() => {
  const ART_PARTS = 11;

  async function hydrateReferenceArt() {
    try {
      const parts = await Promise.all(
        Array.from({ length: ART_PARTS }, (_, i) =>
          fetch(`assets/reference-v3/${i}.txt?v=6`, { cache: 'no-store' }).then(r => {
            if (!r.ok) throw new Error(`Parte ${i} não encontrada`);
            return r.text();
          })
        )
      );

      const base64 = parts.join('').replace(/\s+/g, '');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: 'image/webp' });
      const artUrl = URL.createObjectURL(blob);

      document.querySelectorAll('.reference-crop').forEach(el => {
        el.style.backgroundImage = `url("${artUrl}")`;
        el.style.backgroundRepeat = 'no-repeat';
      });

      const scene = document.querySelector('.scene-bg');
      if (scene) scene.style.backgroundImage = `url("${artUrl}")`;

      document.documentElement.style.setProperty('--reference-art', `url("${artUrl}")`);
      document.body.classList.add('art-ready');

      window.addEventListener('pagehide', () => URL.revokeObjectURL(artUrl), { once: true });
      return true;
    } catch (error) {
      console.error('Falha ao reconstruir arte do site:', error);
      document.body.classList.add('art-error');
      return false;
    }
  }

  async function start() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const intro = document.getElementById('intro');
    const body = document.body;
    const liveStrip = document.getElementById('live-strip');
    const watchLive = document.getElementById('watch-live');
    const toast = document.getElementById('toast');

    function removeIntro() {
      if (!intro) return;
      intro.classList.add('done');
      setTimeout(() => intro.remove(), reduced ? 10 : 420);
    }

    if (reduced || !window.gsap) {
      removeIntro();
      document.querySelectorAll('.reveal').forEach(el => {
        el.style.opacity = 1;
        el.style.transform = 'none';
      });
    } else {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      gsap.set('.intro-cat', { opacity: 0, scale: .72, filter: 'brightness(.45) saturate(1.1) blur(10px)' });
      gsap.set('.intro-title', { opacity: 0, y: 22 });
      gsap.set('.intro-smoke', { opacity: 0, y: 150, scale: .7 });
      gsap.set('.intro-flash', { opacity: 0 });
      gsap.set('.reveal', { opacity: 0, y: 26 });

      tl.to('.intro-cat', { opacity: 1, scale: 1, filter: 'brightness(1.08) saturate(1.3) blur(0px)', duration: 1.05 })
        .to('.intro-title', { opacity: .92, y: 0, duration: .5 }, '-=.35')
        .to('.intro-smoke', { opacity: .58, y: -30, scale: 1.25, stagger: .08, duration: 1.1 }, '-=.18')
        .to('.intro-cat', { scale: 1.08, duration: .65, ease: 'sine.inOut' }, '-=.9')
        .to('.intro-flash', { opacity: .72, duration: .12 }, '-=.16')
        .to('.intro-flash', { opacity: 0, duration: .34 })
        .to(intro, { opacity: 0, duration: .55, onComplete: removeIntro }, '-=.16')
        .to('.reveal', { opacity: 1, y: 0, stagger: .09, duration: .75 }, '-=.22');
    }

    async function particles() {
      if (reduced || !window.tsParticles || !window.loadSlim) return;
      try {
        await loadSlim(tsParticles);
        await tsParticles.load({
          id: 'tsparticles',
          options: {
            fullScreen: { enable: false },
            fpsLimit: 45,
            detectRetina: true,
            particles: {
              number: { value: 24, density: { enable: true, width: 1400, height: 900 } },
              color: { value: ['#a74cff', '#db9cff', '#ffffff'] },
              opacity: { value: { min: .05, max: .2 }, animation: { enable: true, speed: .3, sync: false } },
              size: { value: { min: 1, max: 3 } },
              move: { enable: true, speed: { min: .12, max: .38 }, direction: 'top-right', random: true, outModes: { default: 'out' } },
              links: { enable: false }
            },
            interactivity: { detectsOn: 'window', events: { onHover: { enable: false }, onClick: { enable: false }, resize: { enable: true } } },
            background: { color: 'transparent' }
          }
        });
      } catch (error) {
        console.warn('Partículas indisponíveis:', error);
      }
    }
    particles();

    function setLive(isLive) {
      body.classList.toggle('is-live', isLive);
      if (liveStrip) liveStrip.hidden = !isLive;
      if (watchLive) watchLive.setAttribute('aria-hidden', isLive ? 'false' : 'true');
      if (isLive && window.gsap && !reduced) {
        gsap.fromTo(liveStrip, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: .45, ease: 'power2.out' });
      }
    }

    async function checkLive() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const response = await fetch('https://decapi.me/twitch/uptime?channel=nihilguh&offline_msg=offline', { cache: 'no-store', signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('status');
        const text = (await response.text()).trim().toLowerCase();
        setLive(Boolean(text) && !text.includes('offline') && !text.includes('error'));
      } catch {
        setLive(false);
      }
    }
    checkLive();
    const liveTimer = setInterval(() => document.visibilityState === 'visible' && checkLive(), 60000);
    addEventListener('pagehide', () => clearInterval(liveTimer), { once: true });

    document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }));

    const form = document.getElementById('livepix-form');
    const amount = document.getElementById('support-amount');
    const message = form?.querySelector('textarea[name="message"]');
    const count = document.getElementById('message-count');

    document.querySelectorAll('[data-value]').forEach(button => button.addEventListener('click', () => {
      if (!amount) return;
      amount.value = Number(button.dataset.value).toFixed(2).replace('.', ',');
      amount.focus();
      if (window.gsap && !reduced) gsap.fromTo(amount, { scale: .98 }, { scale: 1, duration: .2, ease: 'back.out(2)' });
    }));

    message?.addEventListener('input', () => {
      if (count) count.textContent = String(message.value.length);
    });

    function showToast(text) {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add('show');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
    }

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const value = String(data.get('amount') || '').trim();
      const msg = String(data.get('message') || '').trim();
      const summary = [name && `Nome: ${name}`, value && `Valor: R$ ${value}`, msg && `Mensagem: ${msg}`].filter(Boolean).join('\n');

      if (summary && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(summary); } catch {}
      }

      showToast(summary ? 'Dados copiados. Abrindo o LivePix…' : 'Abrindo o LivePix…');
      if (window.gsap && !reduced) gsap.to('.send-btn', { scale: .96, duration: .08, yoyo: true, repeat: 1 });
      setTimeout(() => window.open('https://livepix.gg/justguh', '_blank', 'noopener,noreferrer'), 180);
    });

    if ('IntersectionObserver' in window && window.gsap && !reduced) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.target.dataset.seen) return;
          entry.target.dataset.seen = '1';
          gsap.fromTo(entry.target, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .65, ease: 'power2.out' });
        });
      }, { threshold: .1 });
      document.querySelectorAll('.glass').forEach(el => observer.observe(el));
    }
  }

  start();
})();
