(() => {
  'use strict';

  const MASTER_DURATION = 181;
  const REST_MS = 2 * 60 * 1000;
  const params = new URLSearchParams(location.search);
  const DEFAULT_AUDIO_SRC = '../assets/audio/harpy-hare.mp3';
  const EXPLICIT_AUDIO_SRC = params.get('audio') || '';
  const DEBUG = params.has('debug');
  const PREVIEW = params.has('preview');

  const SECTIONS = [
    { start:0, end:14, scene:'intro', icon:'✦' },
    { start:14, end:38, scene:'cheshire', icon:'☾' },
    { start:38, end:70, scene:'hare', icon:'➶' },
    { start:70, end:94, scene:'cheshire', icon:'☾' },
    { start:94, end:128, scene:'dancer', icon:'♠' },
    { start:128, end:166, scene:'cheshire', icon:'☾' },
    { start:166, end:181.2, scene:'bird', icon:'⌁' }
  ];

  // Texto fornecido pelo usuário. Os tempos são uma calibração inicial para o master ~3:01.
  const CAPTIONS = [
    {t:14.0, text:'Lebre Harpia'}, {t:16.2, text:'Onde você enterrou todos os seus filhos?'}, {t:20.8, text:'Me conte, digo eu'},
    {t:25.0, text:'Lebre Harpia'}, {t:27.2, text:'Onde você enterrou todos os seus filhos?'}, {t:32.0, text:'Me conte, digo eu'},

    {t:38.0, text:'Todas as flechas que você roubou'}, {t:42.8, text:'Partidas ao meio, agora queimadas e quebradas'},
    {t:47.7, text:'Assim como seu coração que estava tão ansioso para se esconder'}, {t:53.4, text:'Você não pode mantê-los todos enjaulados'},
    {t:58.1, text:'Eles vão lutar e fugir'}, {t:62.5, text:'Mãe, me conte, digo eu'}, {t:67.0, text:'(La-la-la, la-la-la, la-la-la)'},

    {t:70.0, text:'Lebre Harpia'}, {t:72.2, text:'Onde você enterrou todos os seus filhos?'}, {t:76.8, text:'Me conte, digo eu'},
    {t:81.0, text:'Lebre Harpia'}, {t:83.2, text:'Onde você enterrou todos os seus filhos?'}, {t:88.0, text:'Me conte, digo eu'},

    {t:94.0, text:'Paredes de floresta e tetos estrelados'}, {t:98.8, text:'Cortinas áridas que você está tecendo'},
    {t:103.8, text:'Assim como as histórias que você mantém dentro da sua cabeça'}, {t:109.5, text:'Ela não pode mantê-los todos seguros'},
    {t:114.0, text:'Eles vão morrer e ter medo'}, {t:118.5, text:'Mãe, me conte, digo eu'}, {t:123.0, text:'(Mãe, me conte, digo eu)'},

    {t:128.0, text:'Lebre Harpia'}, {t:130.0, text:'Onde você enterrou todos os seus filhos?'}, {t:133.7, text:'Me conte, digo eu'},
    {t:137.0, text:'Lebre Harpia'}, {t:139.0, text:'Onde você enterrou todos os seus filhos?'}, {t:142.8, text:'Me conte, digo eu'},
    {t:146.0, text:'Lebre Harpia'}, {t:148.0, text:'Onde você enterrou todos os seus filhos?'}, {t:151.8, text:'Me conte, digo eu'},
    {t:155.0, text:'Lebre Harpia'}, {t:157.0, text:'Onde você enterrou todos os seus filhos?'}, {t:160.7, text:'Me conte, digo eu (me conte, digo eu)'},

    {t:166.0, text:'Ela não pode mantê-los todos enjaulados'}, {t:169.6, text:'Eles estarão distantes e voarão para longe'},
    {t:173.3, text:'Mãe, me diga que você vai ficar'}, {t:176.8, text:'Nós estaremos distantes e voaremos para longe'}
  ];

  const $ = id => document.getElementById(id);
  const audio = $('harpy-audio');
  const broadcast = $('broadcast');
  const gate = $('start-gate');
  const gateTitle = $('start-gate-title');
  const gateCopy = $('start-gate-copy');
  const gatePlay = $('start-gate-play');
  const localAudioFile = $('local-audio-file');
  const currentEl = $('subtitle-current');
  const nextEl = $('subtitle-next');
  const iconEl = $('subtitle-icon');
  const audioStatus = $('audio-status');
  const debugPanel = $('debug-panel');
  const debugTime = $('debug-time');
  const debugScene = $('debug-scene');
  const debugOffset = $('debug-offset');
  const debugSeek = $('debug-seek');

  const queryOffset = params.get('offset');
  let offset = queryOffset !== null
    ? Number(queryOffset || 0)
    : Number(localStorage.getItem('nihilguh_harpy_offset') || 0);
  let activeScene = 'intro';
  let activeCaption = -1;
  let resting = false;
  let restTimer = null;
  let previewStartedAt = performance.now();
  let previewPausedAt = 0;
  let previewPaused = false;
  let raf = 0;
  let analyser = null;
  let analyserData = null;
  let audioContext = null;
  let audioReady = false;
  let audioSource = '';
  let localObjectUrl = '';
  let userGestureUnlocked = false;
  let audioDrivesTimeline = false;
  let virtualStartedAt = performance.now();
  let virtualPausedAt = 0;
  let virtualPaused = false;
  let virtualEndHandled = false;

  function virtualTime() {
    if (PREVIEW) return previewPaused ? previewPausedAt : (performance.now() - previewStartedAt) / 1000;
    return virtualPaused ? virtualPausedAt : (performance.now() - virtualStartedAt) / 1000;
  }

  function adjustedTime() {
    const raw = audioDrivesTimeline && !audio.paused
      ? Number(audio.currentTime || 0)
      : virtualTime();
    return Math.max(0, Math.min(MASTER_DURATION, raw + offset));
  }

  function sectionAt(t) {
    return SECTIONS.find(s => t >= s.start && t < s.end) || SECTIONS[SECTIONS.length - 1];
  }

  function captionIndexAt(t) {
    let idx = -1;
    for (let i=0;i<CAPTIONS.length;i++) {
      if (CAPTIONS[i].t <= t) idx = i;
      else break;
    }
    return idx;
  }

  function setScene(scene) {
    if (scene === activeScene) return;
    activeScene = scene;
    document.querySelectorAll('.scene').forEach(el => el.classList.toggle('is-active', el.dataset.scene === scene));
  }

  function setCaption(idx) {
    if (idx === activeCaption) return;
    activeCaption = idx;
    const cue = CAPTIONS[idx];
    const next = CAPTIONS[idx + 1];
    currentEl.classList.remove('is-changing');
    void currentEl.offsetWidth;
    currentEl.textContent = cue ? cue.text : '';
    currentEl.classList.add('is-changing');
    nextEl.textContent = next ? next.text : '';
  }

  function mouthValue(t, scene) {
    if (scene !== 'cheshire') return 1;
    let energy = 0;
    if (analyser && analyserData) {
      analyser.getByteTimeDomainData(analyserData);
      let sum = 0;
      for (let i=0;i<analyserData.length;i++) {
        const v = (analyserData[i] - 128) / 128;
        sum += v * v;
      }
      energy = Math.sqrt(sum / analyserData.length);
    }
    const fallback = 0.5 + 0.5 * Math.abs(Math.sin(t * 9.2) * Math.sin(t * 2.15));
    const drive = Math.max(fallback * .36, Math.min(1, energy * 4.8));
    return 1 + drive * .28;
  }

  function paint() {
    const rawVirtual = virtualTime();
    if (!resting && !audioDrivesTimeline && rawVirtual >= MASTER_DURATION && !virtualEndHandled) {
      virtualEndHandled = true;
      enterRest();
    }

    const t = adjustedTime();
    const sec = sectionAt(t);
    setScene(resting ? 'rest' : sec.scene);
    iconEl.textContent = sec.icon || '✦';

    if (!resting) setCaption(captionIndexAt(t));
    else {
      currentEl.textContent = '';
      nextEl.textContent = '';
    }

    document.documentElement.style.setProperty('--mouth-open', mouthValue(t, sec.scene).toFixed(3));

    if (DEBUG) {
      debugTime.textContent = t.toFixed(2);
      debugScene.textContent = resting ? 'rest' : sec.scene;
      debugOffset.textContent = offset.toFixed(2);
      debugSeek.value = String(Math.min(MASTER_DURATION, Math.max(0, PREVIEW ? t - offset : audio.currentTime || 0)));
    }
    raf = requestAnimationFrame(paint);
  }

  function setOffset(delta) {
    offset = Math.max(-10, Math.min(10, offset + delta));
    localStorage.setItem('nihilguh_harpy_offset', String(offset));
    if (DEBUG) debugOffset.textContent = offset.toFixed(2);
  }

  function setupAnalyser() {
    if (analyser || PREVIEW || !userGestureUnlocked) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaElementSource(audio);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = .74;
      analyserData = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
    } catch (_) {
      analyser = null;
    }
  }

  function showGate(title,copy,canPlay=true) {
    gateTitle.textContent = title;
    gateCopy.textContent = copy;
    gatePlay.hidden = !canPlay;
    gate.hidden = false;
    gate.classList.add('is-compact');
  }

  async function beginAudio(fromGesture=false) {
    if (PREVIEW) {
      gate.hidden = true;
      return;
    }
    if (!audioReady || !audio.src) {
      showGate(
        'Áudio ainda não configurado',
        'Escolha um MP3 do seu PC para testar agora, ou use ?audio=URL quando hospedar a faixa.',
        false
      );
      audioStatus.textContent = 'ÁUDIO NÃO CONFIGURADO';
      return;
    }

    if (fromGesture) userGestureUnlocked = true;

    try {
      const visualTime = Math.max(0, Math.min(MASTER_DURATION - .1, virtualTime()));
      if (Math.abs(Number(audio.currentTime || 0) - visualTime) > .35) {
        try { audio.currentTime = visualTime; } catch (_) {}
      }
      await audio.play();
      audioDrivesTimeline = true;
      gate.hidden = true;
      audioStatus.textContent = 'HARPY HARE · AO VIVO';

      if (userGestureUnlocked) {
        setupAnalyser();
        if (audioContext?.state === 'suspended') {
          try { await audioContext.resume(); } catch (_) {}
        }
      }
    } catch (_) {
      showGate(
        '▶ iniciar abertura',
        'O navegador bloqueou o autoplay com áudio. Clique uma vez para liberar.',
        true
      );
      audioStatus.textContent = 'CLIQUE PARA INICIAR';
    }
  }

  function enterRest() {
    if (resting) return;
    resting = true;
    broadcast.classList.add('is-fading');
    setTimeout(() => {
      broadcast.classList.remove('is-fading');
      broadcast.classList.add('is-resting');
      setScene('rest');
    }, 1900);

    clearTimeout(restTimer);
    restTimer = setTimeout(async () => {
      resting = false;
      broadcast.classList.remove('is-resting');
      broadcast.classList.add('is-entering');
      setTimeout(() => broadcast.classList.remove('is-entering'), 2300);
      activeCaption = -1;
      activeScene = '';
      virtualStartedAt = performance.now();
      virtualPausedAt = 0;
      virtualPaused = false;
      virtualEndHandled = false;
      audioDrivesTimeline = false;
      try { audio.currentTime = 0; } catch (_) {}
      if (audioReady) await beginAudio(false);
    }, REST_MS);
  }

  function previewSeek(value) {
    const v = Math.max(0, Math.min(MASTER_DURATION, Number(value) || 0));
    previewPausedAt = v;
    previewStartedAt = performance.now() - v * 1000;
    activeCaption = -1;
    activeScene = '';
  }

  async function configureAudioSource() {
    if (PREVIEW) {
      audioStatus.textContent = 'MODO PREVIEW · SEM ÁUDIO';
      return;
    }

    audio.addEventListener('ended', enterRest);

    if (EXPLICIT_AUDIO_SRC) {
      audioSource = EXPLICIT_AUDIO_SRC;
      audio.src = audioSource;
      audioReady = true;
      audio.addEventListener('canplay',() => beginAudio(false),{once:true});
      audio.addEventListener('error',() => {
        audioReady = false;
        audioDrivesTimeline = false;
        showGate('Animação rodando sem áudio','A URL de áudio não respondeu. A animação continua normalmente.',false);
        audioStatus.textContent = 'ANIMAÇÃO · SEM ÁUDIO';
      },{once:true});
      audio.load();
      return;
    }

    // Probe the same-origin default path with fetch first. A missing file no
    // longer gets assigned to <audio>, avoiding the noisy media 404.
    try {
      const response = await fetch(DEFAULT_AUDIO_SRC,{method:'HEAD',cache:'no-store'});
      if (response.ok) {
        audioSource = DEFAULT_AUDIO_SRC;
        audio.src = audioSource;
        audioReady = true;
        audio.addEventListener('canplay',() => beginAudio(false),{once:true});
        audio.load();
        return;
      }
    } catch (_) {}

    showGate(
      'Animação rodando sem áudio',
      'A página continua normalmente. Se quiser testar a música, escolha o MP3 do seu PC.',
      false
    );
    audioStatus.textContent = 'ANIMAÇÃO · SEM ÁUDIO';
  }

  gatePlay.addEventListener('click',() => beginAudio(true));

  localAudioFile.addEventListener('change',async e => {
    const file=e.target.files && e.target.files[0];
    if(!file) return;
    if(localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    localObjectUrl=URL.createObjectURL(file);
    audioSource=localObjectUrl;
    audio.src=audioSource;
    audioReady=true;
    userGestureUnlocked=true;
    audio.load();
    audio.addEventListener('canplay',async () => {
      try { await beginAudio(true); } catch (_) {}
    },{once:true});
  });

  if (DEBUG) {
    debugPanel.hidden = false;
    debugSeek.addEventListener('input', e => {
      const v = Number(e.target.value);
      if (PREVIEW) previewSeek(v);
      else {
        if (audioDrivesTimeline) {
          try { audio.currentTime = v; } catch (_) {}
        } else {
          virtualStartedAt = performance.now() - v * 1000;
          virtualPausedAt = v;
        }
        activeCaption = -1; activeScene = '';
      }
    });
    debugPanel.addEventListener('click', e => {
      const action = e.target.closest('button')?.dataset.debug;
      if (action === 'minus') setOffset(-.1);
      if (action === 'plus') setOffset(.1);
      if (action === 'restart') {
        if (PREVIEW) previewSeek(0);
        else { audio.currentTime = 0; beginAudio(); }
      }
    });
  }

  addEventListener('keydown', e => {
    if (e.key === '[') setOffset(e.shiftKey ? -1 : -.1);
    if (e.key === ']') setOffset(e.shiftKey ? 1 : .1);
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (PREVIEW) previewSeek(adjustedTime() - offset - 1);
      else if (audioDrivesTimeline) audio.currentTime = Math.max(0, audio.currentTime - 1);
      else virtualStartedAt += 1000;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (PREVIEW) previewSeek(adjustedTime() - offset + 1);
      else if (audioDrivesTimeline) audio.currentTime = Math.min(MASTER_DURATION, audio.currentTime + 1);
      else virtualStartedAt -= 1000;
    }
    if (e.code === 'Space' && DEBUG) {
      e.preventDefault();
      if (PREVIEW) {
        previewPaused = !previewPaused;
        if (previewPaused) previewPausedAt = adjustedTime() - offset;
        else previewStartedAt = performance.now() - previewPausedAt * 1000;
      } else {
        audio.paused ? beginAudio() : audio.pause();
      }
    }
  });

  if (PREVIEW) {
    gate.hidden = true;
    previewStartedAt = performance.now();
  } else {
    virtualStartedAt = performance.now();
    configureAudioSource();
  }

  paint();
})();