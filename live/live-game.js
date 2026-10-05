(() => {
  const api = window.NihilGuhAPI;
  const root = document.getElementById('live-game-root');
  const nameInput = document.getElementById('live-player-name-input');
  const status = document.getElementById('live-game-status');
  if (!root || !api) return;

  let currentSignature = '';
  let currentRound = null;
  let pollHandle = null;
  let tickHandle = null;
  let inFlight = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  const clock = sec => {
    sec = Math.max(0, Math.floor(Number(sec || 0)));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h,m,s].map(v => String(v).padStart(2,'0')).join(':');
  };

  function playerName(){
    return String(localStorage.getItem('nihilguh_player_name') || '').trim().slice(0,24);
  }

  if (nameInput) {
    nameInput.value = playerName();
    const save = () => localStorage.setItem('nihilguh_player_name', nameInput.value.trim().slice(0,24));
    nameInput.addEventListener('change', save);
    nameInput.addEventListener('blur', save);
  }

  function roundSeconds(r){
    if (!r) return 0;
    const at = r.status === 'active' ? r.endsAt : r.nextRoundAt;
    return at ? Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 1000)) : 0;
  }

  async function joinRound(r){
    if (!r || r.status !== 'active') return;
    const key = 'nihilguh_joined_' + r.roundId;
    if (sessionStorage.getItem(key)) return;
    try {
      await api.roundJoin(r.roundId);
      sessionStorage.setItem(key,'1');
    } catch (_) {}
  }

  async function submitRound(round, answer){
    if (!round || round.status !== 'active') return;
    const feedback = document.getElementById('play-feedback');
    if (feedback) {
      feedback.className = 'feedback';
      feedback.textContent = 'Validando no servidor…';
    }

    try {
      const res = await api.roundSubmit(round.roundId, answer, playerName());
      if (res?.won) {
        const amount = Number(res.awardedMinutes || 0);
        if (feedback) {
          feedback.className = 'feedback ' + (amount < 0 ? 'bad' : 'good');
          feedback.textContent = round.type === 'queen'
            ? (res.queenResult === 'penalty'
                ? (amount < 0 ? 'A RAINHA ROUBOU ' + Math.abs(amount) + ' MINUTOS!' : 'A RAINHA TENTOU ROUBAR, MAS NÃO HAVIA BÔNUS.')
                : 'PORTA CERTA! +' + amount + ' MINUTOS!')
            : 'VOCÊ CHEGOU PRIMEIRO! ' + (amount > 0 ? '+' : '') + amount + ' min';
        }
      } else {
        const reasons = {
          wrong:'Resposta incorreta. Tente novamente.',
          too_soon:'Cedo demais! Espere o sinal.',
          wait_phase:'Espere a fase de resposta.',
          round_closed:'Alguém já concluiu esta rodada.',
          stale_round:'Essa rodada já terminou.',
          attempt_limit:'Limite de tentativas desta rodada atingido.'
        };
        if (feedback) {
          feedback.className = 'feedback bad';
          feedback.textContent = reasons[res?.reason] || 'Não foi possível validar essa tentativa.';
        }
      }
      await refresh();
    } catch (_) {
      if (feedback) {
        feedback.className = 'feedback bad';
        feedback.textContent = 'Falha ao sincronizar a resposta. Tente novamente.';
      }
    }
  }

  function renderRound(r, live){
    currentRound = r || null;

    if (!live) {
      currentSignature = 'offline';
      root.innerHTML = '<div class="live-game-empty"><strong>Minigames pausados</strong><span>Eles aparecem aqui automaticamente quando a live começa.</span></div>';
      if (status) status.textContent = 'OFFLINE';
      return;
    }

    if (!r) {
      currentSignature = 'preparing';
      root.innerHTML = '<div class="live-game-empty"><strong>Preparando o próximo desafio…</strong><span>Sincronizando todos os jogadores.</span></div>';
      if (status) status.textContent = 'SINCRONIZANDO';
      return;
    }

    if (r.deckComplete) {
      currentSignature = 'complete';
      root.innerHTML = '<div class="live-game-empty"><strong>Wonderland concluído ♛</strong><span>As 23 rodadas desta live foram vencidas.</span></div>';
      if (status) status.textContent = 'CONCLUÍDO';
      return;
    }

    const signature = r.roundId + ':' + r.status + ':' + String(r.challenge?.phase || '') + ':' + String(r.availableRewardMinutes ?? r.rewardMinutes ?? 0);
    if (signature === currentSignature) {
      window.NihilGuhGameUI?.tick(r);
      return;
    }
    currentSignature = signature;

    if (r.status === 'active') {
      const ui = window.NihilGuhGameUI;
      root.innerHTML = ui
        ? ui.render(r)
        : '<div class="live-game-empty"><strong>' + esc(r.title) + '</strong><span>' + esc(r.instruction) + '</span></div>';
      if (ui) ui.mount(r, submitRound, 'live-game-root');
      joinRound(r);
      if (status) status.textContent = 'JOGUE AGORA';
      return;
    }

    if (r.status === 'won' && r.winner) {
      const amount = Number(r.winner.awardedMinutes || 0);
      const delta = amount > 0 ? '+' + amount : String(amount);
      root.innerHTML = '<div class="live-game-empty live-game-winner"><strong>' + esc(r.winner.name) + ' venceu</strong><span>' + esc(delta) + ' min · próximo jogo em <b id="live-game-next">' + clock(roundSeconds(r)) + '</b></span></div>';
      if (status) status.textContent = 'RODADA ENCERRADA';
      return;
    }

    root.innerHTML = '<div class="live-game-empty"><strong>Próxima rodada em instantes…</strong></div>';
    if (status) status.textContent = 'AGUARDE';
  }

  async function refresh(){
    if (inFlight) return;
    inFlight = true;
    try {
      const s = await api.stateLite();
      const live = Boolean(s?.session?.status === 'ONLINE');
      renderRound(s?.round, live);
    } catch (_) {
      if (status) status.textContent = 'RECONECTANDO';
      root.innerHTML = '<div class="live-game-empty"><strong>Reconectando os minigames…</strong><span>A live continua normalmente enquanto o backend volta.</span></div>';
    } finally {
      inFlight = false;
    }
  }

  function tick(){
    if (currentRound) {
      window.NihilGuhGameUI?.tick(currentRound);
      const next = document.getElementById('live-game-next');
      if (next) next.textContent = clock(roundSeconds(currentRound));
    }
  }

  // Keep the live-page copy consistent with the new 4h + 2h maximum.
  const capCopy = document.getElementById('live-state-copy');
  if (capCopy) {
    const enforceCapCopy = () => {
      if (document.body.classList.contains('is-live')) {
        const wanted = 'A comunidade pode adicionar até 2 horas: 4h base + 2h de bônus, máximo de 6h.';
        if (capCopy.textContent !== wanted) capCopy.textContent = wanted;
      }
    };
    new MutationObserver(enforceCapCopy).observe(capCopy,{childList:true,characterData:true,subtree:true});
    setInterval(enforceCapCopy,1000);
  }

  refresh();
  pollHandle = setInterval(() => document.visibilityState === 'visible' && refresh(), 3000);
  tickHandle = setInterval(tick, 400);
  addEventListener('pagehide',() => {
    clearInterval(pollHandle);
    clearInterval(tickHandle);
  },{once:true});
})();