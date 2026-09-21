(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intro = document.getElementById('intro');
  const body = document.body;
  const liveStrip = document.getElementById('live-strip');
  const watchLive = document.getElementById('watch-live');
  const toast = document.getElementById('toast');
  let introTimeline = null;
  let introSeen = false;

  try {
    introSeen = sessionStorage.getItem('nihilguh_intro_seen') === '1';
  } catch {}

  function settleArtwork(){
    body.classList.add('art-settled');
    if(window.gsap){
      gsap.set('.logo-art img,.hero-art img,.ramen-art img',{clearProps:'transform,filter'});
      gsap.set('.reveal',{clearProps:'transform'});
    }
  }

  function removeIntro(){
    try { sessionStorage.setItem('nihilguh_intro_seen','1'); } catch {}
    if(!intro){ settleArtwork(); return; }
    intro.classList.add('done');
    setTimeout(()=>{ intro.remove(); settleArtwork(); }, reduced ? 10 : 220);
  }

  function entrance(){
    if(introSeen){
      intro?.remove();
      document.querySelectorAll('.reveal').forEach(el=>{
        el.style.opacity='1';
        el.style.transform='none';
      });
      settleArtwork();
      return;
    }

    if(reduced || !window.gsap){
      removeIntro();
      document.querySelectorAll('.reveal').forEach(el=>{
        el.style.opacity='1';
        el.style.transform='none';
      });
      return;
    }

    introTimeline=gsap.timeline({defaults:{ease:'power3.out'}});
    gsap.set('.intro-cat',{opacity:0,scale:.76});
    gsap.set('.intro-title',{opacity:0,y:18});
    gsap.set('.intro-smoke',{opacity:0,y:140,scale:.75});
    gsap.set('.intro-flash',{opacity:0});
    gsap.set('.reveal',{opacity:0,y:22});

    introTimeline.to('.intro-cat',{opacity:1,scale:1,duration:.95})
      .to('.intro-title',{opacity:.92,y:0,duration:.42},'-=.28')
      .to('.intro-smoke',{opacity:.55,y:-24,scale:1.2,stagger:.08,duration:1.0},'-=.12')
      .to('.intro-flash',{opacity:.62,duration:.10},'-=.14')
      .to('.intro-flash',{opacity:0,duration:.30})
      .to(intro,{opacity:0,duration:.48,onComplete:removeIntro},'-=.12')
      .to('.reveal',{
        opacity:1,y:0,stagger:.07,duration:.62,
        onComplete:()=>{ gsap.set('.reveal',{clearProps:'transform'}); settleArtwork(); }
      },'-=.18');
  }

  intro?.querySelector('.intro-skip')?.addEventListener('click',()=>{
    introTimeline?.kill();
    document.querySelectorAll('.reveal').forEach(el=>{
      el.style.opacity='1';
      el.style.transform='none';
    });
    removeIntro();
  });

  entrance();

  async function particles(){
    if(reduced || !window.tsParticles || !window.loadSlim) return;
    try{
      await loadSlim(tsParticles);
      await tsParticles.load({
        id:'tsparticles',
        options:{
          fullScreen:{enable:false},fpsLimit:40,detectRetina:true,
          particles:{
            number:{value:20,density:{enable:true,width:1400,height:900}},
            color:{value:['#a74cff','#db9cff','#ffffff']},
            opacity:{value:{min:.04,max:.16},animation:{enable:true,speed:.25,sync:false}},
            size:{value:{min:1,max:2.5}},
            move:{enable:true,speed:{min:.10,max:.32},direction:'top-right',random:true,outModes:{default:'out'}},
            links:{enable:false}
          },
          interactivity:{events:{onHover:{enable:false},onClick:{enable:false},resize:{enable:true}}},
          background:{color:'transparent'}
        }
      });
    }catch(error){ console.warn('Partículas indisponíveis:',error); }
  }
  particles();

  function setLive(isLive){
    body.classList.toggle('is-live',isLive);
    body.classList.toggle('is-offline',!isLive);
    if(liveStrip) liveStrip.hidden=!isLive;
    if(watchLive) watchLive.setAttribute('aria-hidden',isLive?'false':'true');
    if(isLive && liveStrip && window.gsap && !reduced){
      gsap.fromTo(liveStrip,{opacity:0,y:-8},{opacity:1,y:0,duration:.4,ease:'power2.out',clearProps:'transform'});
    }
  }

  async function checkLive(){
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),4500);
      const response=await fetch('https://decapi.me/twitch/uptime?channel=nihilguh&offline_msg=offline',{
        cache:'no-store',signal:controller.signal
      });
      clearTimeout(timeout);
      if(!response.ok) throw new Error('status');
      const text=(await response.text()).trim().toLowerCase();
      setLive(Boolean(text)&&!text.includes('offline')&&!text.includes('error'));
    }catch{ setLive(false); }
  }
  checkLive();
  const liveTimer=setInterval(()=>document.visibilityState==='visible'&&checkLive(),60000);
  addEventListener('pagehide',()=>clearInterval(liveTimer),{once:true});

  document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',e=>{
    const target=document.querySelector(link.getAttribute('href'));
    if(!target)return;
    e.preventDefault();
    target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
  }));

  const form=document.getElementById('livepix-form');
  const amount=document.getElementById('support-amount');
  const message=form?.querySelector('textarea[name="message"]');
  const count=document.getElementById('message-count');
  const apiStatus=document.getElementById('livepix-api-status');
  const sendButton=form?.querySelector('.send-btn');
  const sendButtonLabel=sendButton?.querySelector('span');

  function parseBrl(value){
    const normalized=String(value||'').trim().replace(/\./g,'').replace(',','.');
    const n=Number(normalized);
    return Number.isFinite(n)?n:NaN;
  }

  document.querySelectorAll('[data-value]').forEach(button=>button.addEventListener('click',()=>{
    if(!amount)return;
    amount.value=Number(button.dataset.value).toFixed(2).replace('.',',');
    amount.focus();
  }));

  document.querySelector('[data-focus-amount]')?.addEventListener('click',()=>{
    amount?.focus();
    amount?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
  });

  message?.addEventListener('input',()=>{
    if(count) count.textContent=String(message.value.length);
  });

  function showToast(text){
    if(!toast)return;
    toast.textContent=text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(()=>toast.classList.remove('show'),3200);
  }

  async function refreshLivePixStatus(){
    if(!window.NihilGuhAPI?.backendUrl){
      if(apiStatus) apiStatus.textContent='Checkout seguro indisponível: backend não conectado.';
      return;
    }
    try{
      const status=await window.NihilGuhAPI.call('livepixStatus');
      if(apiStatus){
        apiStatus.textContent=status.configured
          ? '🔒 LivePix conectado. O site gera um checkout seguro para cada apoio.'
          : '⚠ Falta conectar o Client ID/Secret da LivePix no painel admin.';
        apiStatus.classList.toggle('ready',Boolean(status.configured));
      }
    }catch{
      if(apiStatus) apiStatus.textContent='Não foi possível verificar a conexão LivePix agora.';
    }
  }
  refreshLivePixStatus();

  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const data=new FormData(form);
    const username=String(data.get('name')||'').trim()||'Anônimo';
    const value=parseBrl(data.get('amount'));
    const msg=String(data.get('message')||'').trim()||'Apoio para o Mundo Louco ♡';

    if(!Number.isFinite(value)||value<1){
      amount?.focus();
      showToast('O valor mínimo do LivePix é R$ 1,00.');
      return;
    }

    if(!window.NihilGuhAPI?.backendUrl){
      showToast('O checkout seguro ainda não está conectado.');
      return;
    }

    const amountCents=Math.round(value*100);
    if(sendButton) sendButton.disabled=true;
    if(sendButtonLabel) sendButtonLabel.textContent='Gerando checkout…';
    if(apiStatus) apiStatus.textContent='Conectando com a LivePix…';

    try{
      const result=await window.NihilGuhAPI.call('livepixCheckout',{
        visitorId:window.NihilGuhAPI.visitorId(),
        username,
        message:msg,
        amountCents:String(amountCents)
      });

      if(!result?.checkoutUrl) throw new Error('checkout_url_missing');
      sessionStorage.setItem('nihilguh_livepix_reference',String(result.reference||''));
      showToast('Pix criado. Abrindo checkout seguro da LivePix…');
      if(apiStatus) apiStatus.textContent='🔒 Checkout criado com segurança. Redirecionando…';
      setTimeout(()=>{ location.href=result.checkoutUrl; },250);
    }catch(err){
      const raw=String(err?.message||err);
      let friendly='Não foi possível criar o Pix. Tente novamente.';
      if(raw.includes('livepix_credentials_missing')) friendly='Conecte o Client ID e Client Secret da LivePix no painel admin.';
      else if(raw.includes('livepix_wait_a_few_seconds')) friendly='Aguarde alguns segundos antes de gerar outro Pix.';
      else if(raw.includes('livepix_oauth_')) friendly='A LivePix recusou as credenciais OAuth. Confira Client ID/Secret e os escopos da aplicação.';
      else if(raw.includes('livepix_checkout_failed')) friendly='A LivePix recusou a criação do Pix. Verifique no painel LivePix se a aplicação tem messages:write ou payments:write.';
      else if(raw.includes('livepix_api_401') || raw.includes('livepix_oauth_401')) friendly='As credenciais LivePix estão inválidas ou expiraram. Salve novamente o Client ID/Secret no painel admin.';
      else if(raw.includes('livepix_api_403') || raw.includes('livepix_oauth_403')) friendly='A aplicação LivePix não tem permissão para criar Pix. Ative messages:write ou payments:write na aplicação.';
      showToast(friendly);
      if(sendButton) sendButton.disabled=false;
      if(sendButtonLabel) sendButtonLabel.textContent='Gerar Pix seguro';
    }
  });

  if(new URLSearchParams(location.search).get('livepix')==='return'){
    showToast('Você voltou do checkout LivePix. Obrigado pelo apoio! ♡');
    history.replaceState(null,'',location.pathname+location.hash);
  }

  if('IntersectionObserver' in window && window.gsap && !reduced){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting||entry.target.dataset.seen)return;
        entry.target.dataset.seen='1';
        gsap.fromTo(entry.target,{opacity:0,y:18},{
          opacity:1,y:0,duration:.55,ease:'power2.out',
          onComplete:()=>gsap.set(entry.target,{clearProps:'transform'})
        });
      });
    },{threshold:.1});
    document.querySelectorAll('.glass').forEach(el=>observer.observe(el));
  }
})();