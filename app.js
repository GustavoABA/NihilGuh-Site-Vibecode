(() => {
  const api = window.NihilGuhAPI;
  const page = document.body.dataset.page || 'home';
  let state = null;
  let pollHandle = null;
  let secondHandle = null;
  let embedded = new Set();
  let lastPlaySignature = '';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clock = (sec) => {
    sec = Math.max(0, Math.floor(Number(sec || 0)));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return [h,m,s].map(v => String(v).padStart(2,'0')).join(':');
  };
  const mins = (n) => {
    n = Math.max(0, Number(n || 0));
    const h = Math.floor(n / 60), m = Math.round(n % 60);
    return h ? h + 'h ' + String(m).padStart(2,'0') + 'min' : m + ' min';
  };
  const isLive = (s) => Boolean(s && s.session && s.session.status === 'ONLINE');

  function remainingSeconds(s) {
    if (!isLive(s)) return 0;
    const started = new Date(s.session.inicio).getTime();
    const total = Number(s.session.tempo_total_min || 0) * 60;
    if (!Number.isFinite(started)) return Number(s.game?.remainingSeconds || 0);
    return Math.max(0, Math.floor(total - (Date.now() - started) / 1000));
  }

  function roundSeconds(r) {
    if (!r) return 0;
    const at = r.status === 'active' ? r.endsAt : r.nextRoundAt;
    return at ? Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 1000)) : 0;
  }

  function ensureTwitch(targetId, live) {
    const target = $(targetId);
    if (!target) return;
    if (!live) {
      if (embedded.has(targetId)) embedded.delete(targetId);
      target.innerHTML = '<div class="offline-art"><strong>O Mundo Louco está dormindo.</strong><br>Quando a Twitch entrar ao vivo, o player aparece aqui automaticamente.</div>';
      return;
    }
    if (embedded.has(targetId)) return;
    const parent = location.hostname || 'gustavoaba.github.io';
    target.innerHTML = '<iframe title="Live NihilGuh na Twitch" allowfullscreen="true" scrolling="no" src="https://player.twitch.tv/?channel=nihilguh&parent=' + encodeURIComponent(parent) + '&autoplay=false&muted=true"></iframe>';
    embedded.add(targetId);
  }

  function setStatus(live) {
    document.body.classList.toggle('is-live',live);
    document.body.classList.toggle('is-offline',!live);
    document.querySelectorAll('[data-live-dot]').forEach(el => el.classList.toggle('online',live));
    document.querySelectorAll('[data-live-badge]').forEach(el => {
      el.classList.toggle('online',live);
      el.textContent = live ? '● AO VIVO' : 'OFFLINE';
    });
  }

  function countVisit(s) {
    if (!isLive(s) || !api) return;
    const id = s.session.session_id;
    const key = 'nihilguh_counted_session';
    if (localStorage.getItem(key) === id) return;
    api.visit().then(() => localStorage.setItem(key,id)).catch(() => {});
  }

  function roundLabel(r) {
    if (!r) return 'Aguardando desafio';
    if (r.deckComplete) return 'Wonderland concluído';
    if (r.status === 'won' && r.winner) return r.type === 'queen' ? 'A Rainha decidiu' : r.winner.name + ' venceu';
    if (r.status === 'expired') return 'Rodada encerrada';
    return r.title || 'Desafio atual';
  }

  function signedMinutes(value) {
    const n = Number(value || 0);
    return (n > 0 ? '+' : '') + n + ' min';
  }

  function renderHome(s) {
    const live = isLive(s);
    setStatus(live);

    document.querySelectorAll('[data-live-only]').forEach(el => el.toggleAttribute('hidden',!live));

    if (!live) {
      embedded.delete('home-player');
      const player = $('home-player');
      if (player) player.innerHTML = '';
      return;
    }

    ensureTwitch('home-player', true);
    if ($('home-timer')) $('home-timer').textContent = clock(remainingSeconds(s));
    if ($('home-earned')) $('home-earned').textContent = '+' + mins(s.session.tempo_ganho_min);
    if ($('home-total')) $('home-total').textContent = mins(s.session.tempo_total_min);

    const r = s?.round;
    if ($('home-round-title')) $('home-round-title').textContent = roundLabel(r);
    if ($('home-round-copy')) $('home-round-copy').textContent =
      r?.deckComplete ? 'As 23 rodadas desta live foram concluídas.' :
      r?.status === 'active' ? r.instruction :
      r?.winner ? r.winner.name + ' alterou o relógio em ' + signedMinutes(r.winner.awardedMinutes) + '.' :
      'Preparando a próxima rodada.';
    if ($('home-round-people')) $('home-round-people').textContent = r ? (r.participants || 0) + ' participando' : 'Preparando jogadores…';
    if ($('home-round-reward')) $('home-round-reward').textContent = r?.status === 'active' ? '+' + r.rewardMinutes : '—';
  }

  function renderLive(s) {
    const live = isLive(s);
    setStatus(live);
    ensureTwitch('live-player', live);
    if ($('live-clock')) $('live-clock').textContent = live ? clock(remainingSeconds(s)) : '04:00:00';
    if ($('live-bonus')) $('live-bonus').textContent = live ? '+' + mins(s.session.tempo_ganho_min) : '+0 min';
    if ($('live-total')) $('live-total').textContent = live ? mins(s.session.tempo_total_min) : '4h base';
    if ($('live-state-copy')) $('live-state-copy').textContent = live ? 'A comunidade pode estender esta live até o limite de 8 horas.' : 'As brincadeiras começam automaticamente quando a Twitch ficar online.';

    const r = s?.round;
    if ($('live-round-title')) $('live-round-title').textContent = live ? roundLabel(r) : 'Sem rodada ativa';
    if ($('live-round-copy')) $('live-round-copy').textContent =
      live && r?.deckComplete ? 'As 23 rodadas desta live foram concluídas.' :
      live && r?.status === 'active' ? r.instruction :
      live && r?.winner ? r.winner.name + ' fechou a rodada em ' + signedMinutes(r.winner.awardedMinutes) + '. A próxima começa em instantes.' :
      'Abra a página de jogo quando a live começar.';
    if ($('live-round-meta')) $('live-round-meta').textContent = r ? (r.participants || 0) + ' jogadores · prêmio +' + (r.rewardMinutes || 0) + ' min' : '—';

    const goals = $('live-goals-list');
    if (goals) {
      const items = Array.isArray(s?.goals) ? s.goals : [];
      goals.innerHTML = items.length ? items.map(g => {
        const pct = Math.min(100,Math.round(Number(g.progresso||0)/Math.max(1,Number(g.alvo||1))*100));
        return '<div class="list-row ' + (g.concluida?'done':'') + '"><div><strong>' + (g.concluida?'✓ ':'') + esc(g.meta) + '</strong><small style="display:block;margin-top:4px">' + esc(g.progresso) + ' / ' + esc(g.alvo) + '</small><div class="goal-progress"><i style="width:' + pct + '%"></i></div></div><b>+' + esc(g.recompensa_min) + ' min</b></div>';
      }).join('') : '<div class="subtle">As metas desta sessão aparecerão aqui.</div>';
    }
  }

  function challengePrompt(r) {
    if (!r) return '';
    if (r.type === 'reaction') return 'ESPERE O SINAL';
    return r.challenge?.prompt || '???';
  }

  function renderPlay(s) {
    const root = $('play-root');
    if (!root) return;
    const live = isLive(s);
    setStatus(live);

    if (!live) {
      lastPlaySignature = 'offline';
      root.innerHTML = '<section class="card offline-card"><div class="challenge-icon">☾</div><h1>Live offline</h1><p class="subtle">Os minigames são liberados automaticamente quando NihilGuh entra ao vivo na Twitch.</p><div class="actions" style="justify-content:center"><a class="btn primary" href="../">Voltar ao perfil</a></div></section>';
      return;
    }

    const r = s.round;
    if (!r) {
      lastPlaySignature = 'preparing';
      root.innerHTML = '<section class="card offline-card"><h1>Preparando o Mundo Louco…</h1><p class="subtle">O backend está criando a primeira rodada.</p></section>';
      return;
    }

    if (r.deckComplete) {
      lastPlaySignature = 'deck-complete';
      root.innerHTML = '<section class="card winner"><div class="crown">♛</div><span class="eyebrow">WONDERLAND CONCLUÍDO</span><h1>As 23 rodadas acabaram</h1><strong>A comunidade zerou o baralho desta live.</strong><p class="subtle">O relógio continua valendo normalmente até o encerramento da transmissão.</p></section>';
      return;
    }

    const signature = r.roundId + ':' + r.status;
    if (signature !== lastPlaySignature) {
      lastPlaySignature = signature;
      if (r.status === 'active') {
        const ui = window.NihilGuhGameUI;
        root.innerHTML = ui ? ui.render(r) : '<section class="card offline-card"><h1>'+esc(r.title)+'</h1><p class="subtle">'+esc(r.instruction)+'</p></section>';
        if (ui) ui.mount(r, submitRound);
        joinRound(r);
      } else if (r.status === 'won' && r.winner) {
        const amount = Number(r.winner.awardedMinutes || 0);
        const signed = amount > 0 ? '+' + amount : String(amount);
        const queen = r.type === 'queen';
        root.innerHTML = '<section class="card winner '+(amount<0?'penalty':'')+'">'+
          '<div class="crown">'+(amount<0?'💀':'♛')+'</div>'+
          '<span class="eyebrow">'+(queen?'A RAINHA DECIDIU':'RODADA CONCLUÍDA')+'</span>'+
          '<h1>'+esc(r.winner.name)+(queen?' escolheu a Porta '+esc(r.winner.selectedDoor||''):' chegou primeiro')+'</h1>'+
          '<strong>'+esc(signed)+' minutos na live</strong>'+
          '<p class="subtle">Próxima brincadeira em <span id="play-next-clock">'+clock(roundSeconds(r))+'</span>.</p></section>';
      } else {
        root.innerHTML = '<section class="card winner"><div class="crown">⌛</div><h1>Ninguém venceu esta rodada</h1><p class="subtle">Próxima brincadeira em <span id="play-next-clock">'+clock(roundSeconds(r))+'</span>.</p></section>';
      }
    }

    paintPlayDynamic(r);
  }

  async function joinRound(r) {
    if (!api || !r || r.status !== 'active') return;
    const key = 'nihilguh_joined_' + r.roundId;
    if (sessionStorage.getItem(key)) return;
    try {
      await api.roundJoin(r.roundId);
      sessionStorage.setItem(key,'1');
    } catch (_) {}
  }

  function paintPlayDynamic(r) {
    if (!r) return;
    if ($('play-players')) $('play-players').textContent = (r.participants || 0) + ' participando';
    if ($('play-round-clock')) $('play-round-clock').textContent = clock(roundSeconds(r));
    if ($('play-next-clock')) $('play-next-clock').textContent = clock(roundSeconds(r));
    window.NihilGuhGameUI?.tick(r);
  }

  function playerName() {
    return String(localStorage.getItem('nihilguh_player_name') || '').trim().slice(0,24);
  }

  async function submitRound(round, answer) {
    if (!round || round.status !== 'active') return;
    const feedback = $('play-feedback');
    if (feedback) { feedback.className='feedback'; feedback.textContent='Validando no servidor…'; }
    try {
      const res = await api.roundSubmit(round.roundId, answer, playerName());
      if (res?.won) {
        const amount = Number(res.awardedMinutes || 0);
        const signed = amount > 0 ? '+' + amount : String(amount);
        if (feedback) {
          feedback.className = 'feedback ' + (amount < 0 ? 'bad' : 'good');
          feedback.textContent = round.type === 'queen'
            ? (amount < 0 ? 'A RAINHA ROUBOU ' + Math.abs(amount) + ' MINUTOS!' : 'PORTA CERTA! +' + amount + ' MINUTOS!')
            : 'VOCÊ CHEGOU PRIMEIRO! ' + signed + ' min';
        }
      } else {
        const map = {
          wrong:'Resposta incorreta. Tente novamente.',
          too_soon:'Cedo demais! Espere o sinal.',
          round_closed:'Alguém já concluiu esta rodada.',
          stale_round:'Essa rodada já terminou.',
          attempt_limit:'Limite de tentativas desta rodada atingido.'
        };
        if (feedback) { feedback.className='feedback bad'; feedback.textContent=map[res?.reason] || 'Não foi possível validar essa tentativa.'; }
      }
      await refresh();
    } catch (err) {
      if (feedback) { feedback.className='feedback bad'; feedback.textContent='Falha ao falar com o backend. Tente novamente.'; }
    }
  }

  function bindPlay() {
    const name = $('player-name-input');
    if (name) {
      name.value = playerName();
      name.addEventListener('change',() => localStorage.setItem('nihilguh_player_name',name.value.trim().slice(0,24)));
      name.addEventListener('blur',() => localStorage.setItem('nihilguh_player_name',name.value.trim().slice(0,24)));
    }
  }

  function renderOverlay(s) {
    const live = isLive(s);
    if ($('overlay-status')) $('overlay-status').textContent = live ? '● AO VIVO' : 'OFFLINE';
    if ($('overlay-clock')) $('overlay-clock').textContent = live ? clock(remainingSeconds(s)) : '04:00:00';
    const r = s?.round;
    if ($('overlay-round')) $('overlay-round').textContent = live ? roundLabel(r) : 'Aguardando a próxima live';
    if ($('overlay-desc')) $('overlay-desc').textContent = !live ? 'O cronômetro começa em 4 horas quando a Twitch entrar online.' :
      r?.status === 'active' ? r.instruction :
      r?.deckComplete ? 'As 23 rodadas desta live foram concluídas.' :
      r?.winner ? r.winner.name + ' alterou o relógio em ' + signedMinutes(r.winner.awardedMinutes) + '.' : 'Preparando próxima rodada.';
    if ($('overlay-meta')) $('overlay-meta').textContent = r ? (r.participants || 0) + ' jogadores' : 'Mundo Louco';
    if ($('overlay-bonus')) $('overlay-bonus').textContent = live ? '+' + mins(s.session.tempo_ganho_min) + ' pela comunidade' : 'até 8h';
    $('overlay-round')?.classList.toggle('overlay-winner',Boolean(r?.winner && r.status==='won'));
  }

  function render(s) {
    if (page === 'home') renderHome(s);
    else if (page === 'live') renderLive(s);
    else if (page === 'play') renderPlay(s);
    else if (page === 'overlay') renderOverlay(s);
  }

  async function refresh() {
    if (!api?.backendUrl) return;
    try {
      state = await api.state();
      countVisit(state);
      render(state);
    } catch (err) {
      console.warn('NihilGuh backend indisponível:',err);
      setStatus(false);
      document.querySelectorAll('[data-live-badge]').forEach(el => {
        el.classList.remove('online');
        el.textContent = 'ERRO BACKEND';
      });
      if ($('overlay-status')) $('overlay-status').textContent = 'ERRO BACKEND';
      if ($('overlay-desc')) $('overlay-desc').textContent = 'O site não conseguiu ler o Apps Script. Atualize a fonte do navegador e confira se o Web App está público para qualquer pessoa.';
      if ($('play-root') && page === 'play') $('play-root').innerHTML = '<section class="card offline-card"><h1>Backend indisponível</h1><p class="subtle">Não foi possível ler o estado da live. Atualize a página e confira a implantação do Apps Script.</p></section>';
    }
  }

  function paintSecond() {
    if (!state) return;
    if (page === 'home' && $('home-timer') && isLive(state)) $('home-timer').textContent = clock(remainingSeconds(state));
    if (page === 'live' && $('live-clock') && isLive(state)) $('live-clock').textContent = clock(remainingSeconds(state));
    if (page === 'overlay' && $('overlay-clock') && isLive(state)) $('overlay-clock').textContent = clock(remainingSeconds(state));
    if (page === 'play' && state.round) paintPlayDynamic(state.round);
  }

  if (page === 'play') bindPlay();
  refresh();
  const pollMs = page === 'overlay' || page === 'play' ? 3000 : 10000;
  pollHandle = setInterval(() => document.visibilityState === 'visible' && refresh(),pollMs);
  secondHandle = setInterval(paintSecond,500);
  addEventListener('pagehide',() => { clearInterval(pollHandle); clearInterval(secondHandle); },{once:true});
})();