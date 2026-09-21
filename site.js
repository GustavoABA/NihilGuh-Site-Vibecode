(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intro = document.getElementById('intro');
  const body = document.body;
  const liveStrip = document.getElementById('live-strip');
  const watchLive = document.getElementById('watch-live');
  const toast = document.getElementById('toast');

  function settleArtwork(){
    body.classList.add('art-settled');
    if(window.gsap){
      gsap.set('.logo-art img,.hero-art img,.ramen-art img',{clearProps:'transform,filter'});
      gsap.set('.reveal',{clearProps:'transform'});
    }
  }

  function removeIntro(){
    if(!intro){ settleArtwork(); return; }
    intro.classList.add('done');
    setTimeout(()=>{ intro.remove(); settleArtwork(); }, reduced ? 10 : 420);
  }

  function entrance(){
    if(reduced || !window.gsap){
      removeIntro();
      document.querySelectorAll('.reveal').forEach(el=>{
        el.style.opacity='1';
        el.style.transform='none';
      });
      return;
    }

    const tl=gsap.timeline({defaults:{ease:'power3.out'}});
    gsap.set('.intro-cat',{opacity:0,scale:.76});
    gsap.set('.intro-title',{opacity:0,y:18});
    gsap.set('.intro-smoke',{opacity:0,y:140,scale:.75});
    gsap.set('.intro-flash',{opacity:0});
    gsap.set('.reveal',{opacity:0,y:22});

    tl.to('.intro-cat',{opacity:1,scale:1,duration:.95})
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

  document.querySelectorAll('[data-value]').forEach(button=>button.addEventListener('click',()=>{
    if(!amount)return;
    amount.value=Number(button.dataset.value).toFixed(2).replace('.',',');
    amount.focus();
  }));

  message?.addEventListener('input',()=>{
    if(count) count.textContent=String(message.value.length);
  });

  function showToast(text){
    if(!toast)return;
    toast.textContent=text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(()=>toast.classList.remove('show'),2800);
  }

  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const data=new FormData(form);
    const name=String(data.get('name')||'').trim();
    const value=String(data.get('amount')||'').trim();
    const msg=String(data.get('message')||'').trim();
    const summary=[name&&`Nome: ${name}`,value&&`Valor: R$ ${value}`,msg&&`Mensagem: ${msg}`].filter(Boolean).join('\n');
    if(summary&&navigator.clipboard?.writeText){
      try{await navigator.clipboard.writeText(summary);}catch{}
    }
    showToast(summary?'Dados copiados. Abrindo o LivePix…':'Abrindo o LivePix…');
    setTimeout(()=>window.open('https://livepix.gg/justguh','_blank','noopener,noreferrer'),160);
  });

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