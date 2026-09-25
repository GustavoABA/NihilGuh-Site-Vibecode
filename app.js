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
    if (r.status === 'won' && r.winner) return r.winner.name + ' venceu';
    if (r.status === 'expired') return 'Rodada encerrada';
    return r.title || 'Desafio atual';
  }

  function renderHome(s) {
    const live = isLive(s);
    setStatus(live);
    ensureTwitch('home-player', live);
    if ($('home-live-title')) $('home-live-title').textContent = live ? 'NihilGuh está ao vivo' : 'Próxima transmissão';
    if ($('home-timer')) $('home-timer').textContent = live ? clock(remainingSeconds(s)) : '04:00:00';
    if ($('home-earned')) $('home-earned').textContent = live ? '+' + mins(s.session.tempo_ganho_min) : 'até +4h';
    if ($('home-total')) $('home-total').textContent = live ? mins(s.session.tempo_total_min) : '4h → 8h';
    const r = s?.round;
    if ($('home-round-title')) $('home-round-title').textContent = live ? roundLabel(r) : 'Desafios aparecem durante a live';
    if ($('home-round-copy')) $('home-round-copy').textContent = !live ? 'Entre quando a Twitch estiver online e dispute contra a comunidade.' :
      r?.status === 'active' ? r.instruction :
      r?.winner ? r.winner.name + ' garantiu +' + r.winner.awardedMinutes + ' min para a transmissão.' : 'Preparando a próxima rodada.';
    if ($('home-round-people')) $('home-round-people').textContent = r ? (r.participants || 0) + ' participando' : '—';
    if ($('home-round-reward')) $('home-round-reward').textContent = r?.status === 'active' ? '+' + r.rewardMinutes : '—';
    document.querySelectorAll('[data-live-only]').forEach(el => el.toggleAttribute('hidden',!live));
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
    if ($('live-round-copy')) $('live-round-copy').textContent = live && r?.status === 'active' ? r.instruction :
      live && r?.winner ? r.winner.name + ' venceu a rodada. A próxima começa em instantes.' : 'Abra a página de jogo quando a live começar.';
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
      root.innerHTML = '<section class="card offline-card"><h1>Preparando o Mundo Louco…</h1><p class="subtle">O backend está criando a primeira rodada.</p></section>';
      return;
    }

    const signature = r.roundId + ':' + r.status;
    if (signature !== lastPlaySignature) {
      lastPlaySignature = signature;
      if (r.status === 'active') {
        const reaction = r.type === 'reaction';
        root.innerHTML = '<section class="card challenge" data-round-id="' + esc(r.roundId) + '">' +
          '<span class="eyebrow">RODADA #' + esc(r.index) + '</span><div class="challenge-icon">' + (reaction?'⚡':'♠') + '</div>' +
          '<h1>' + esc(r.title) + '</h1><p>' + esc(r.instruction) + '</p>' +
          '<div class="challenge-prompt">' + esc(challengePrompt(r)) + '</div>' +
          (reaction
            ? '<div class="reaction-zone"><button class="reaction-btn" id="reaction-btn" type="button" disabled>ESPERE…</button></div>'
            : '<form class="challenge-form" id="answer-form"><input class="answer-input" id="answer-input" autocomplete="off" placeholder="Sua resposta" maxlength="80" required><button class="btn primary" type="submit">Responder</button></form>') +
          '<div class="feedback" id="play-feedback"></div>' +
          '<div class="play-stats"><span id="play-players">0 participando</span><span>+' + esc(r.rewardMinutes) + ' min</span><span id="play-round-clock">--:--</span></div></section>';
        joinRound(r);
      } else if (r.status === 'won' && r.winner) {
        root.innerHTML = '<section class="card winner"><div class="crown">♛</div><span class="eyebrow">RODADA CONCLUÍDA</span><h1>' + esc(r.winner.name) + ' chegou primeiro</h1><strong>+' + esc(r.winner.awardedMinutes) + ' minutos na live</strong><p class="subtle">Próxima brincadeira em <span id="play-next-clock">' + clock(roundSeconds(r)) + '</span>.</p></section>';
      } else {
        root.innerHTML = '<section class="card winner"><div class="crown">⌛</div><h1>Ninguém venceu esta rodada</h1><p class="subtle">Próxima brincadeira em <span id="play-next-clock">' + clock(roundSeconds(r)) + '</span>.</p></section>';
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
    const reaction = $('reaction-btn');
    if (reaction && r.type === 'reaction' && r.status === 'active') {
      const ready = Date.now() >= new Date(r.challenge.unlockAt).getTime();
      reaction.disabled = !ready;
      reaction.classList.toggle('ready',ready);
      reaction.textContent = ready ? 'CLIQUE AGORA!' : 'ESPERE…';
    }
  }

  function playerName() {
    return String(localStorage.getItem('nihilguh_player_name') || '').trim().slice(0,24);
  }

  async function submitRound(round, answer) {
    const feedback = $('play-feedback');
    if (feedback) { feedback.className='feedback'; feedback.textContent='Validando no servidor…'; }
    try {
      const res = await api.roundSubmit(round.roundId, answer, playerName());
      if (res?.won) {
        if (feedback) { feedback.className='feedback good'; feedback.textContent='VOCÊ CHEGOU PRIMEIRO! +' + res.awardedMinutes + ' min'; }
      } else {
        const map = {
          wrong:'Resposta incorreta. Tente novamente.',
          too_soon:'Cedo demais! Espere o sinal.',
          round_closed:'Alguém já venceu esta rodada.',
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
    document.addEventListener('submit',e => {
      if (e.target.id !== 'answer-form') return;
      e.preventDefault();
      if (!state?.round || state.round.status !== 'active') return;
      const input = $('answer-input');
      const value = input?.value || '';
      if (input) input.value='';
      submitRound(state.round,value);
    });
    document.addEventListener('click',e => {
      if (e.target.id !== 'reaction-btn') return;
      if (!state?.round || state.round.status !== 'active') return;
      submitRound(state.round,'CLICK');
    });
  }

  function renderOverlay(s) {
    const live = isLive(s);
    if ($('overlay-status')) $('overlay-status').textContent = live ? '● AO VIVO' : 'OFFLINE';
    if ($('overlay-clock')) $('overlay-clock').textContent = live ? clock(remainingSeconds(s)) : '04:00:00';
    const r = s?.round;
    if ($('overlay-round')) $('overlay-round').textContent = live ? roundLabel(r) : 'Aguardando a próxima live';
    if ($('overlay-desc')) $('overlay-desc').textContent = !live ? 'O cronômetro começa em 4 horas quando a Twitch entrar online.' :
      r?.status === 'active' ? r.instruction :
      r?.winner ? r.winner.name + ' adicionou +' + r.winner.awardedMinutes + ' min.' : 'Preparando próxima rodada.';
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