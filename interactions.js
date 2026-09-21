
(() => {
  const root=document.getElementById('community-game');
  const api=window.NihilGuhAPI;
  if(!root || !api) return;

  let state=null, records=null, lastBossHp=null, recordsAt=0;
  let seen=new Set();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('pt-BR');
  const money=n=>'R$ '+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const clock=s=>[Math.floor(s/3600),Math.floor((s%3600)/60),Math.floor(s%60)].map(v=>String(Math.max(0,v)).padStart(2,'0')).join(':');

  function missionCard(title,holder,klass){
    klass=klass||'';
    const m=holder && holder.mission ? holder.mission : holder;
    if(!m || !m.label) return '';
    const pct=Math.min(100,Math.round(Number(m.progress||0)/Math.max(1,Number(m.target||1))*100));
    const status=(holder&&holder.status)||m.status||'active';
    const left=m.endsAt?Math.max(0,Math.ceil((new Date(m.endsAt)-Date.now())/1000)):0;
    return '<div class="event-card '+klass+' '+(status==='success'?'success':'')+'">'+
      '<span class="eyebrow">'+esc(title)+'</span><strong>'+esc(m.label)+'</strong>'+
      '<p>'+esc(m.description||'')+'</p>'+
      '<div class="mission-progress"><i style="width:'+pct+'%"></i></div>'+
      '<p style="margin-top:7px">'+fmt(m.progress)+' / '+fmt(m.target)+(status==='active'&&left?' · '+clock(left):'')+'</p></div>';
  }

  function recordCell(label,obj,key,formatter){
    formatter=formatter||fmt;
    if(!obj) return '<div class="record"><span>'+label+'</span><b>—</b></div>';
    return '<div class="record"><span>'+label+'</span><b>'+formatter(obj[key])+'</b><small>'+esc(obj.data||'')+'</small></div>';
  }

  function voteHtml(game){
    if(!game || !game.vote || game.vote.status!=='active') return '';
    const options=(game.vote.options||[]).map(o=>
      '<button class="vote-option" data-vote="'+esc(o.id)+'">'+
      '<b>'+esc(o.label)+'</b><small>'+esc(o.description)+'</small>'+
      '<span class="vote-count">'+fmt(o.votes)+' voto(s)</span></button>'
    ).join('');
    return '<div class="vote-card"><span class="eyebrow">A TOCA DECIDE</span>'+
      '<h3>Qual desafio entra na live?</h3><div class="vote-options">'+options+'</div>'+
      '<p style="font-size:.68rem;color:#8f7da1;margin:10px 0 0">1 voto por navegador nesta rodada · '+
      clock(Math.max(0,(new Date(game.vote.endsAt)-Date.now())/1000))+'</p></div>';
  }

  function render(){
    const live=Boolean(state && state.session && state.session.status==='ONLINE');
    const game=state && state.game;
    document.body.classList.toggle('mode-chaos',Boolean(game&&game.chaos&&game.chaos.active));
    document.body.classList.toggle('mode-critical',Boolean(game&&((game.lastChance&&game.lastChance.status==='active')||(game.suddenDeath&&game.suddenDeath.status==='active'))));

    let liveHtml='';
    if(live && game){
      const b=game.boss||{};
      const bossPct=Math.max(0,Math.min(100,Number(b.percent==null?100:b.percent)));
      const chaos=game.chaos&&game.chaos.active
        ? '<div class="event-card chaos"><span class="eyebrow">MODO CAOS</span><strong>'+esc(game.chaos.label)+'</strong><p>'+
          esc(game.chaos.description||'')+' · termina em '+clock(Math.max(0,(new Date(game.chaos.endsAt)-Date.now())/1000))+'</p></div>'
        : '';
      const urgent=game.suddenDeath&&game.suddenDeath.status==='active'
        ? missionCard('☠ MORTE SÚBITA',game.suddenDeath,'urgent')
        : (game.lastChance&&game.lastChance.status==='active'?missionCard('⚠ ÚLTIMA CHANCE',game.lastChance,'urgent'):'');
      const community=game.communityMission&&game.communityMission.status==='active'?missionCard('MISSÃO ESCOLHIDA PELA TOCA',game.communityMission,''):'';
      const random=game.randomEvent&&game.randomEvent.status==='active'?missionCard('EVENTO SURPRESA',game.randomEvent,''):'';
      const vote=voteHtml(game);
      const loot=(game.loot||[]).length
        ? '<div class="loot-card"><span class="eyebrow">LOOT LIBERADO</span><h3>Recompensas da Toca</h3><div class="loot-list">'+
          game.loot.map(x=>x.url
            ? '<a class="loot-chip" href="'+esc(x.url)+'" target="_blank" rel="noreferrer">'+esc(x.label)+'</a>'
            : '<span class="loot-chip">'+esc(x.label)+'</span>').join('')+'</div></div>'
        : '';

      liveHtml='<div class="game-grid"><div>'+
        '<div class="boss-card"><div class="boss-top"><div><span class="eyebrow">BOSS DA TOCA</span><div class="boss-name">'+esc(b.name||'CHESHIRE DO ABISMO')+'</div></div>'+
        '<div class="boss-hp-text">'+fmt(b.hp)+' / '+fmt(b.maxHp)+' HP</div></div>'+
        '<div class="boss-stage '+(b.defeated?'dead':'')+'" id="boss-stage"><div class="boss-face">◖≋⌣≋◗</div>'+
        '<div class="boss-bar" style="--boss-pct:'+bossPct+'%"><i></i></div>'+
        '<div class="boss-help">Visitas, follows, apoios, LivePix, raids e metas ferem o boss. Derrotá-lo libera +30 minutos e loot.</div></div></div>'+
        '<div class="game-stack" style="margin-top:12px">'+urgent+chaos+community+random+'</div></div>'+
        '<div class="game-stack">'+(vote||'<div class="event-card"><span class="eyebrow">JOGO DA LIVE</span><strong>'+
          esc(b.defeated?'BOSS DERROTADO':'A comunidade está jogando')+'</strong><p>Nem toda ação adiciona tempo: algumas causam dano, ativam eventos, votações, combos ou liberam recompensas.</p></div>')+
        loot+'</div></div>';
    } else {
      liveHtml='<div class="game-offline">O minigame coletivo desperta automaticamente quando uma sessão de live estiver ativa.</div>';
    }

    const rec=records&&records.records?records.records:(records||{});
    const recHtml='<div class="records-card" style="margin-top:14px;position:relative;z-index:1"><span class="eyebrow">RECORDES DA TOCA</span><h3>Melhores sessões</h3>'+
      '<div class="records-grid">'+
      recordCell('Maior duração',rec.longest,'duration',n=>fmt(n)+' min')+
      recordCell('Mais metas',rec.mostGoals,'goals')+
      recordCell('Mais visitantes',rec.mostVisitors,'visitors')+
      recordCell('Mais crescimento',rec.mostGrowth,'growth')+
      recordCell('Maior LivePix',rec.mostLivePix,'livepix',money)+
      '</div></div>';

    root.innerHTML=liveHtml+recHtml;

    root.querySelectorAll('[data-vote]').forEach(btn=>{
      const voteId=game&&game.vote?String(game.vote.voteId||''):'';
      const key='nihilguh_vote_'+voteId;
      if(localStorage.getItem(key)) btn.disabled=true;
      btn.addEventListener('click',async()=>{
        btn.disabled=true;
        try{
          const res=await api.vote(btn.dataset.vote);
          localStorage.setItem(key,btn.dataset.vote);
          if(res&&res.game&&state) state.game=res.game;
          await refresh(true);
        }catch(e){
          if(String(e.message).includes('duplicate')) localStorage.setItem(key,'1');
          btn.disabled=false;
        }
      });
    });

    if(live && game && lastBossHp!==null && Number(game.boss&&game.boss.hp)<lastBossHp){
      const stage=document.getElementById('boss-stage');
      if(stage){
        stage.classList.add('hit');
        setTimeout(()=>stage.classList.remove('hit'),520);
      }
    }
    if(live && game) lastBossHp=Number(game.boss&&game.boss.hp);
  }

  function reactEvents(){
    const events=state&&state.game&&state.game.recentEvents?state.game.recentEvents:[];
    events.forEach(ev=>{
      if(seen.has(ev.id)) return;
      seen.add(ev.id);
      if(seen.size>80) seen=new Set(Array.from(seen).slice(-50));
      if(ev.type==='boss_defeated' && window.gsap){
        gsap.fromTo(root,{filter:'brightness(2.2)'},{filter:'brightness(1)',duration:1.1,ease:'power3.out'});
      }
    });
  }

  async function refresh(forceRecords){
    if(!api.backendUrl){
      root.hidden=true;
      return;
    }
    root.hidden=false;
    try{
      state=await api.state();
      if(forceRecords || !records || Date.now()-recordsAt>120000){
        try{records=await api.records();recordsAt=Date.now();}catch(_){}
      }
      reactEvents();
      render();
    }catch(e){
      console.warn('Interaction engine indisponível:',e);
    }
  }

  refresh(true);
  setInterval(()=>document.visibilityState==='visible'&&refresh(false),15000);
  setInterval(()=>{if(state&&state.session) render();},1000);
})();
