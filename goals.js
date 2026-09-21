(() => {
  const root = document.getElementById('live-goals');
  if (!root || !window.NihilGuhAPI) return;

  const api = window.NihilGuhAPI;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastCompleted = new Set();
  let timerInterval = null;
  let lastState = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  function formatMinutes(mins) {
    mins = Math.max(0, Number(mins || 0));
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h ? `${h}h ${String(m).padStart(2,'0')}min` : `${m} min`;
  }

  function remainingSeconds(state) {
    if (!state?.session || state.session.status !== 'ONLINE') return 0;
    const start = new Date(state.session.inicio).getTime();
    const total = Number(state.session.tempo_total_min || 0) * 60;
    return Math.max(0, Math.floor(total - (Date.now() - start) / 1000));
  }

  function clock(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h,m,s].map(v => String(v).padStart(2,'0')).join(':');
  }

  function paintClock() {
    const el = root.querySelector('[data-goals-clock]');
    if (el && lastState) el.textContent = clock(remainingSeconds(lastState));
  }

  function celebrate(goal) {
    if (reduced) return;
    const el = document.createElement('div');
    el.className = 'live-goal-pop';
    el.textContent = `META CONCLUÍDA · +${goal.recompensa_min} MIN`;
    document.body.appendChild(el);
    if (window.gsap) {
      gsap.fromTo(el,{opacity:0,y:20,scale:.94},{opacity:1,y:0,scale:1,duration:.35,ease:'back.out(1.8)'});
      gsap.to(el,{opacity:0,y:-16,delay:2.2,duration:.4,onComplete:()=>el.remove()});
    } else setTimeout(()=>el.remove(),2600);
  }

  function progressLabel(g) {
    if (g.tipo === 'visitors') return `${g.progresso}/${g.alvo} visitantes`;
    if (g.tipo === 'growth_total') return `${g.progresso}/${g.alvo} novos na comunidade`;
    if (g.tipo === 'growth_twitch') return `${g.progresso}/${g.alvo} Twitch`;
    if (g.tipo === 'growth_youtube') return `${g.progresso}/${g.alvo} YouTube`;
    if (g.tipo === 'growth_kick') return `${g.progresso}/${g.alvo} Kick`;
    if (g.tipo === 'support_total') return `${g.progresso}/${g.alvo} apoios`;
    if (g.tipo === 'raid') return `${g.progresso}/${g.alvo} raids`;
    if (g.tipo === 'platforms') return `${g.progresso}/${g.alvo} plataformas`;
    if (g.tipo === 'livepix_amount') return `R$ ${Number(g.progresso||0).toFixed(2)} / R$ ${Number(g.alvo||0).toFixed(2)}`;
    return g.concluida ? 'concluída' : 'meta da live';
  }

  function render(state, history) {
    lastState = state;
    const live = Boolean(state?.session && state.session.status === 'ONLINE');
    const goals = Array.isArray(state?.goals) ? state.goals : [];
    const sessions = Array.isArray(history?.sessions) ? history.sessions.slice(0,5) : [];
    const completed = goals.filter(g => g.concluida);

    root.classList.toggle('is-live',live);
    root.classList.toggle('is-offline',!live);
    const nowCompleted = new Set(completed.map(g => g.goal_id));

    if (lastCompleted.size) {
      completed.filter(g => !lastCompleted.has(g.goal_id)).forEach(celebrate);
    }
    lastCompleted = nowCompleted;

    const historyHtml = sessions.map(day => `
      <div class="history-day">
        <strong>${esc(day.data)}</strong>
        <small>${esc(day.metas_batidas)}/${esc(day.metas_total)} metas</small>
        <small>${formatMinutes(day.tempo_total_min)}</small>
      </div>`).join('');

    root.innerHTML = `
      <div class="goals-head">
        <div>
          <span class="eyebrow">MISSÕES DO MUNDO LOUCO</span>
          <h2>${live ? 'Missões da live' : 'Missões da próxima live'}</h2>
        </div>
        <div class="goals-status ${live ? 'is-live' : ''}">
          <span class="goals-status-dot"></span>
          <span>${live ? 'ao vivo agora' : 'offline'}</span>
        </div>
      </div>
      ${live ? `
        <div class="goals-timer" data-goals-clock>${clock(remainingSeconds(state))}</div>
        <div class="goals-subline">${formatMinutes(state.session.tempo_ganho_min)} adicionados pela comunidade</div>
        <div class="goals-list">
          ${goals.map(g => `
            <div class="goal-row ${g.concluida ? 'done' : ''}">
              <div class="goal-check">${g.concluida ? '✓' : '○'}</div>
              <div>
                <div class="goal-title">${esc(g.meta)}</div>
                <div class="goal-meta">
                  <span>${esc(progressLabel(g))}</span>
                </div>
              </div>
              <div class="goal-reward">${g.tipo === 'livepix_amount' ? '+1 min / R$10' : '+' + esc(g.recompensa_min) + ' min'}</div>
            </div>`).join('')}
        </div>
      ` : `
        <div class="goals-offline-note">As missões aparecem automaticamente quando a live começar.</div>
      `}
      ${sessions.length ? `
        <div class="goals-history">
          <span class="eyebrow">ÚLTIMAS SESSÕES</span>
          <div class="goals-history-grid">${historyHtml}</div>
        </div>
      ` : ''}`;

    clearInterval(timerInterval);
    if (live) timerInterval = setInterval(paintClock, 1000);
  }

  async function refresh() {
    if (!api.backendUrl) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    try {
      let state = await api.state();
      const sessionId = state?.session?.status === 'ONLINE' ? state.session.session_id : '';
      if (sessionId && localStorage.getItem('nihilguh_counted_session') !== sessionId) {
        await api.visit();
        localStorage.setItem('nihilguh_counted_session', sessionId);
        state = await api.state();
      }
      const history = await api.history(5);
      render(state, history);
    } catch (err) {
      console.warn('Live goals indisponível:', err);
      root.innerHTML = '<div class="goals-offline-note">Metas temporariamente indisponíveis. O detector normal da live continua funcionando.</div>';
    }
  }

  refresh();
  setInterval(() => document.visibilityState === 'visible' && refresh(), Number((window.NIHILGUH_CONFIG||{}).pollMs || 30000));
})();