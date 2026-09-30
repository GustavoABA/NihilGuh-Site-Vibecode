(() => {
  const api = window.NihilGuhAPI;
  const page = document.body.dataset.page || 'home';
  let state = null;
  let refreshInFlight = false;
  let pollHandle = null;
  let secondHandle = null;
  let embedded = new Set();
  let lastPlaySignature = '';
  let lastHomeGameSignature = '';
  let lastOverlayView = '';
  let lastOverlayWinnerPage = -1;

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
    target.innerHTML = '<iframe title="Live NihilGuh na Twitch" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="true" scrolling="no" src="https://player.twitch.tv/?channel=nihilguh&parent=' + encodeURIComponent(parent) + '&autoplay=true&muted=true"></iframe>';
    embedded.add(targetId);
  }


  function parseUptimeSeconds(text) {
    const raw = String(text || '').trim().toLowerCase();
    if (!raw || raw.includes('offline') || raw.includes('error')) return null;
    let total = 0;
    const units = [
      ['day',86400],['hour',3600],['minute',60],['second',1]
    ];
    for (const [unit,mult] of units) {
      const m = raw.match(new RegExp('(\\d+)\\s*' + unit + 's?'));
      if (m) total += Number(m[1]) * mult;
    }
    if (total > 0) return total;
    const colon = raw.match(/^(?:(\\d+):)?(\\d{1,2}):(\\d{2})$/);
    if (colon) return Number(colon[1] || 0)*3600 + Number(colon[2])*60 + Number(colon[3]);
    return null;
  }

  async function twitchFallbackState() {
    try {
      const res = await fetch('https://decapi.me/twitch/uptime/nihilguh?offline_msg=offline&_=' + Date.now(), { cache:'no-store' });
      if (!res.ok) return null;
      const raw = await res.text();
      const uptime = parseUptimeSeconds(raw);
      if (uptime == null) return null;
      return {
        fallback:true,
        twitchState:'online',
        session:{
          session_id:'decapi_fallback',
          inicio:new Date(Date.now() - uptime*1000).toISOString(),
          status:'ONLINE',
          tempo_base_min:240,
          tempo_ganho_min:0,
          tempo_total_min:240
        },
        goals:[],
        round:null
      };
    } catch (_) {
      return null;
    }
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

  function renderHomeGame(r) {
    const root=$('home-game-root');
    if(!root) return;

    if(!r){
      lastHomeGameSignature='preparing';
      root.innerHTML='<div class="home-game-state"><strong>Preparando o primeiro jogo…</strong><span>Assim que o backend criar a rodada ela aparece aqui.</span></div>';
      return;
    }

    if(r.deckComplete){
      lastHomeGameSignature='deck-complete';
      root.innerHTML='<div class="home-game-state"><strong>Wonderland concluído ♛</strong><span>As 23 rodadas desta live foram vencidas.</span></div>';
      return;
    }

    const signature=r.roundId+':'+r.status+':'+String(r.challenge?.phase||'')+':'+String(r.availableRewardMinutes??r.rewardMinutes??0);
    if(signature===lastHomeGameSignature){
      window.NihilGuhGameUI?.tick(r);
      return;
    }
    lastHomeGameSignature=signature;

    if(r.status==='active'){
      const ui=window.NihilGuhGameUI;
      root.innerHTML=ui ? ui.render(r) : '<div class="home-game-state"><strong>'+esc(r.title)+'</strong><span>'+esc(r.instruction)+'</span></div>';
      if(ui) ui.mount(r,submitRound,'home-game-root');
      joinRound(r);
      return;
    }

    if(r.status==='won' && r.winner){
      const amount=Number(r.winner.awardedMinutes||0);
      const queen=r.type==='queen';
      const penalty=queen&&r.winner.queenResult==='penalty';
      const result=penalty
        ? (amount<0 ? String(amount)+' min no relógio' : 'nenhum bônus disponível para roubar')
        : '+'+Math.max(0,amount)+' min no relógio';
      root.innerHTML='<div class="home-game-state winner-inline '+(penalty?'penalty':'')+'"><strong>'+
        esc(r.winner.name)+(queen?' escolheu a Porta '+esc(r.winner.selectedDoor||''):' venceu')+
        '</strong><span>'+esc(result)+' · próximo jogo em <b id="home-next-game-clock">'+clock(roundSeconds(r))+'</b></span></div>';
      return;
    }

    root.innerHTML='<div class="home-game-state"><strong>Sincronizando a próxima rodada…</strong></div>';
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

    renderHomeGame(s?.round);
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
    if ($('live-round-meta')) $('live-round-meta').textContent = r ? (r.participants || 0) + ' jogadores · prêmio +' + (r.availableRewardMinutes ?? r.rewardMinutes ?? 0) + ' min' : '—';

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

    const signature = r.roundId + ':' + r.status + ':' + String(r.challenge?.phase || '') + ':' + String(r.availableRewardMinutes ?? r.rewardMinutes ?? 0);
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
        const queenPenalty = queen && r.winner.queenResult === 'penalty';
        root.innerHTML = '<section class="card winner '+(queenPenalty?'penalty':'')+'">'+
          '<div class="crown">'+(queenPenalty?'💀':'♛')+'</div>'+
          '<span class="eyebrow">'+(queen?'A RAINHA DECIDIU':'RODADA CONCLUÍDA')+'</span>'+
          '<h1>'+esc(r.winner.name)+(queen?' escolheu a Porta '+esc(r.winner.selectedDoor||''):' chegou primeiro')+'</h1>'+
          '<strong>'+(queenPenalty && amount===0 ? 'A Rainha não encontrou bônus para roubar' : esc(signed)+' minutos na live')+'</strong>'+
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
            ? (res.queenResult === 'penalty'
                ? (amount < 0 ? 'A RAINHA ROUBOU ' + Math.abs(amount) + ' MINUTOS!' : 'A RAINHA TENTOU ROUBAR, MAS NÃO HAVIA BÔNUS.')
                : 'PORTA CERTA! +' + amount + ' MINUTOS!')
            : 'VOCÊ CHEGOU PRIMEIRO! ' + signed + ' min';
        }
      } else {
        const map = {
          wrong:'Resposta incorreta. Tente novamente.',
          too_soon:'Cedo demais! Espere o sinal.',
          wait_phase:'Espere a fase de resposta.',
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

  function bindPlayerNameInput(id) {
    const name=$(id);
    if(!name) return;
    name.value=playerName();
    const save=()=>localStorage.setItem('nihilguh_player_name',name.value.trim().slice(0,24));
    name.addEventListener('change',save);
    name.addEventListener('blur',save);
  }

  function bindPlay() {
    bindPlayerNameInput('player-name-input');
  }

  const OVERLAY_TIMER_A_SEC = 5 * 60;
  const OVERLAY_CTA_SEC = 3 * 60;
  const OVERLAY_TIMER_B_SEC = 20 * 60;
  const OVERLAY_WINS_SEC = 20;
  const OVERLAY_CYCLE_SEC = OVERLAY_TIMER_A_SEC + OVERLAY_CTA_SEC + OVERLAY_TIMER_B_SEC + OVERLAY_WINS_SEC;

  function overlayElapsedSeconds(s) {
    if (!isLive(s)) return 0;
    const started = new Date(s.session.inicio).getTime();
    return Number.isFinite(started) ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0;
  }

  function overlayCycleState(s) {
    const elapsed = overlayElapsedSeconds(s);
    const cycleIndex = Math.floor(elapsed / OVERLAY_CYCLE_SEC);
    const pos = elapsed % OVERLAY_CYCLE_SEC;
    const ctaStart = OVERLAY_TIMER_A_SEC;
    const timerBStart = ctaStart + OVERLAY_CTA_SEC;
    const winsStart = timerBStart + OVERLAY_TIMER_B_SEC;

    let mode = 'timer';
    if (pos >= ctaStart && pos < timerBStart) mode = 'cta';
    else if (pos >= winsStart) mode = 'wins';

    return { elapsed, cycleIndex, pos, mode, winsStart };
  }

  function setOverlayView(mode) {
    for (const name of ['timer','cta','wins']) {
      const el = $('overlay-view-' + name);
      if (!el) continue;
      const active = name === mode;
      el.hidden = !active;
      el.classList.toggle('is-active',active);
    }
    if (lastOverlayView !== mode) {
      lastOverlayView = mode;
      lastOverlayWinnerPage = -1;
    }
  }

  function overlayWinsForCycle(s, cycle) {
    const wins = Array.isArray(s?.overlay?.recentWins) ? s.overlay.recentWins : [];
    if (!wins.length || !isLive(s)) return [];

    const start = new Date(s.session.inicio).getTime() + cycle.cycleIndex * OVERLAY_CYCLE_SEC * 1000;
    const end = start + OVERLAY_CYCLE_SEC * 1000;
    const filtered = wins.filter(w => {
      const at = new Date(w.at).getTime();
      return Number.isFinite(at) && at >= start && at < end;
    });
    return filtered.length ? filtered : [];
  }

  function overlayWinnerRowsHtml(wins, cycle) {
    if (!wins.length) {
      return '<div class="overlay-no-wins"><strong>Ninguém zerou um jogo nesse ciclo.</strong><span>O relógio ficou intacto… por enquanto.</span></div>';
    }

    const pageSize = 4;
    const pages = Math.max(1, Math.ceil(wins.length / pageSize));
    const winsProgress = Math.max(0, cycle.pos - cycle.winsStart);
    const pageDuration = OVERLAY_WINS_SEC / pages;
    const page = Math.min(pages - 1, Math.floor(winsProgress / Math.max(.5,pageDuration)));
    const slice = wins.slice(page * pageSize, page * pageSize + pageSize);

    if (page !== lastOverlayWinnerPage) lastOverlayWinnerPage = page;

    return slice.map(w => {
      const minutes = Number(w.minutes || 0);
      const delta = minutes > 0 ? '+' + minutes + ' min' : minutes < 0 ? String(minutes) + ' min' : '0 min';
      return '<div class="overlay-win-row">'+
        '<div class="overlay-win-player"><strong>'+esc(w.winner || 'Visitante')+'</strong><span>'+esc(w.title || 'Jogo do Mundo Louco')+'</span></div>'+
        '<b class="'+(minutes<0?'negative':'')+'">'+esc(delta)+'</b>'+
      '</div>';
    }).join('');
  }

  function paintOverlayFrame(s) {
    const live = isLive(s);
    const cycle = overlayCycleState(s);
    const mode = live ? cycle.mode : 'timer';
    setOverlayView(mode);

    if ($('overlay-clock')) $('overlay-clock').textContent = live ? clock(remainingSeconds(s)) : '04:00:00';

    if (mode === 'wins') {
      const wins = overlayWinsForCycle(s,cycle);
      if ($('overlay-win-count')) $('overlay-win-count').textContent = wins.length ? wins.length + (wins.length===1?' vitória':' vitórias') : 'nenhuma vitória';
      if ($('overlay-winners-list')) $('overlay-winners-list').innerHTML = overlayWinnerRowsHtml(wins,cycle);
    }
  }

  function renderOverlay(s) {
    paintOverlayFrame(s);
  }

  function render(s) {
    if (page === 'home') renderHome(s);
    else if (page === 'live') renderLive(s);
    else if (page === 'play') renderPlay(s);
    else if (page === 'overlay') renderOverlay(s);
  }

  async function refresh() {
    if (!api?.backendUrl || refreshInFlight) return;
    refreshInFlight = true;
    try {
      state = await api.stateLite();
      countVisit(state);
      render(state);
    } catch (err) {
      console.warn('NihilGuh backend indisponível:',err);
      const fallback = await twitchFallbackState();
      if (fallback) {
        state = fallback;
        if (page === 'overlay') renderOverlay(state);
        else if (page === 'home') {
          setStatus(true);
          document.querySelectorAll('[data-live-only]').forEach(el => el.toggleAttribute('hidden',false));
          ensureTwitch('home-player', true);
          if ($('home-timer')) $('home-timer').textContent = clock(remainingSeconds(state));
          if ($('home-earned')) $('home-earned').textContent = 'backend offline';
          if ($('home-total')) $('home-total').textContent = '4h base';
          if ($('home-game-root')) $('home-game-root').innerHTML = '<div class="home-game-state"><strong>Minigames aguardando o backend.</strong><span>A live continua tocando normalmente.</span></div>';
        } else if (page === 'live') {
          renderLive(state);
          if ($('live-round-title')) $('live-round-title').textContent = 'Backend temporariamente indisponível';
          if ($('live-round-copy')) $('live-round-copy').textContent = 'O relógio continua pela Twitch; minigames e bônus aguardam reconexão.';
        } else if (page === 'play') {
          setStatus(true);
          if ($('play-root')) $('play-root').innerHTML = '<section class="card offline-card"><h1>Live detectada</h1><p class="subtle">O cronômetro está funcionando pela Twitch, mas os minigames precisam do Apps Script público para sincronizar todos os jogadores.</p></section>';
        }
        return;
      }
      setStatus(false);
      document.querySelectorAll('[data-live-badge]').forEach(el => {
        el.classList.remove('online');
        el.textContent = 'ERRO BACKEND';
      });
      if ($('overlay-status')) $('overlay-status').textContent = 'ERRO BACKEND';
      if ($('overlay-desc')) $('overlay-desc').textContent = 'Não foi possível ler o Apps Script nem o status da Twitch.';
      if ($('play-root') && page === 'play') $('play-root').innerHTML = '<section class="card offline-card"><h1>Backend indisponível</h1><p class="subtle">Não foi possível ler o estado da live.</p></section>';
    } finally {
      refreshInFlight = false;
    }
  }

  function paintSecond() {
    if (!state) return;
    if (page === 'home' && $('home-timer') && isLive(state)) {
      $('home-timer').textContent = clock(remainingSeconds(state));
      if(state.round) window.NihilGuhGameUI?.tick(state.round);
      if($('home-next-game-clock')) $('home-next-game-clock').textContent=clock(roundSeconds(state.round));
    }
    if (page === 'live' && $('live-clock') && isLive(state)) $('live-clock').textContent = clock(remainingSeconds(state));
    if (page === 'overlay') paintOverlayFrame(state);
    if (page === 'play' && state.round) paintPlayDynamic(state.round);
  }

  if (page === 'play') bindPlay();
  if (page === 'home') bindPlayerNameInput('home-player-name-input');
  refresh();
  const pollMs = page === 'overlay' || page === 'play' || page === 'home' ? 3000 : 10000;
  pollHandle = setInterval(() => document.visibilityState === 'visible' && refresh(),pollMs);
  secondHandle = setInterval(paintSecond,500);
  addEventListener('pagehide',() => { clearInterval(pollHandle); clearInterval(secondHandle); },{once:true});
})();