(() => {
  'use strict';

  const DURATION = 179.583;
  const REST_MS = 120000;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const AUDIO_SRC = params.get('audio') || '../assets/audio/harpy-hare.mp3?v=2';

  const SECTIONS = [
    {start:0,end:30.74,scene:'intro',icon:'✦'},
    {start:30.74,end:45.28,scene:'cheshire',icon:'☾'},
    {start:45.28,end:60.44,scene:'hare',icon:'➶'},
    {start:60.44,end:74.88,scene:'cheshire',icon:'☾'},
    {start:74.88,end:89.96,scene:'dancer',icon:'♠'},
    {start:89.96,end:163.72,scene:'cheshire',icon:'☾'},
    {start:163.72,end:DURATION,scene:'bird',icon:'⌁'}
  ];

  const CAPTIONS = [
    {t:30.74,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:34.65,text:'Me conte, digo eu'},
    {t:38.21,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:42.06,text:'Me conte, digo eu'},

    {t:45.28,text:'Todas as flechas que você roubou'},
    {t:47.06,text:'Partidas ao meio, agora queimadas e quebradas'},
    {t:49.09,text:'Assim como seu coração que estava tão ansioso para se esconder'},
    {t:52.67,text:'Você não pode mantê-los todos enjaulados'},
    {t:54.55,text:'Eles vão lutar e fugir'},
    {t:56.48,text:'Mãe, me conte, digo eu'},

    {t:60.44,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:64.22,text:'Me conte, digo eu'},
    {t:67.82,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:71.58,text:'Me conte, digo eu'},

    {t:74.88,text:'Paredes de floresta e tetos estrelados'},
    {t:76.75,text:'Cortinas áridas que você está tecendo'},
    {t:78.56,text:'Assim como as histórias que você mantém dentro da sua cabeça'},
    {t:82.15,text:'Ela não pode mantê-los todos seguros'},
    {t:84.14,text:'Eles vão morrer e ter medo'},
    {t:85.90,text:'Mãe, me conte, digo eu'},

    {t:89.96,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:93.71,text:'Me conte, digo eu'},
    {t:97.47,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:101.13,text:'Me conte, digo eu'},
    {t:119.68,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:123.31,text:'Me conte, digo eu'},
    {t:126.94,text:'Lebre Harpia — Onde você enterrou todos os seus filhos?'},
    {t:130.62,text:'Me conte, digo eu (me conte, digo eu)'},

    {t:163.72,text:'Ela não pode mantê-los todos enjaulados'},
    {t:167.16,text:'Eles estarão distantes e voarão para longe'},
    {t:170.86,text:'Mãe, me diga que você vai ficar'},
    {t:174.55,text:'Nós estaremos distantes e voaremos para longe'}
  ];

  const $ = id => document.getElementById(id);
  const audio = $('harpy-audio');
  const theater = $('theater');
  const broadcast = $('broadcast');
  const currentEl = $('subtitle-current');
  const nextEl = $('subtitle-next');
  const iconEl = $('subtitle-icon');
  const statusEl = $('audio-status');
  const debugPanel = $('debug-panel');
  const debugTime = $('debug-time');
  const debugScene = $('debug-scene');
  const debugSeek = $('debug-seek');

  const scenes = Object.fromEntries([...document.querySelectorAll('.scene')].map(el => [el.dataset.scene,el]));
  let captionIndex = -1;
  let audioActive = false;
  let resting = false;
  let restTimer = 0;
  let virtualStart = performance.now();
  let retryTimer = 0;

  const master = gsap.timeline({paused:true, defaults:{ease:'power2.inOut'}});
  gsap.set('.scene',{autoAlpha:0,scale:1.025});
  gsap.set('.scene-rest',{autoAlpha:0,scale:1});

  for(const s of SECTIONS){
    const el=scenes[s.scene];
    if(!el) continue;
    master.to(el,{autoAlpha:1,scale:1,duration:.72,ease:'power3.out'},s.start);
    master.to(el,{autoAlpha:0,scale:.99,duration:.62,ease:'power2.in'},Math.max(s.start,s.end-.62));
  }

  master
    .fromTo('.intro-copy',{y:18,opacity:0},{y:0,opacity:1,duration:1.3,ease:'power3.out'},1.0)
    .fromTo('.intro-rings',{scale:.78,rotation:-8,opacity:0},{scale:1,rotation:0,opacity:1,duration:2.2,ease:'expo.out'},.5)
    .fromTo('.intro-stars',{y:-8,opacity:0},{y:0,opacity:.9,duration:1.4},1.4);

  function ease(name,p){ return gsap.parseEase(name)(Math.max(0,Math.min(1,p))); }
  function sectionAt(t){ return SECTIONS.find(s=>t>=s.start&&t<s.end) || SECTIONS[SECTIONS.length-1]; }
  function virtualTime(){ return (performance.now()-virtualStart)/1000; }
  function timeNow(){ return audioActive&&!audio.paused ? audio.currentTime : Math.min(DURATION,virtualTime()); }

  function vocalActivity(t){
    for(let i=0;i<CAPTIONS.length;i++){
      const start=CAPTIONS[i].t;
      const next=i<CAPTIONS.length-1?CAPTIONS[i+1].t:DURATION;
      const duration=Math.min(4.25,Math.max(1.35,next-start-.12));
      if(t>=start && t<=start+duration){
        const p=(t-start)/duration;
        const edge=Math.min(1,p/.08,(1-p)/.10);
        return Math.max(0,Math.min(1,edge));
      }
    }
    return 0;
  }

  function updateIntro(t,section){
    if(section.scene!=='intro') return;
    const p=Math.max(0,Math.min(1,(t-section.start)/(section.end-section.start)));
    const rings=document.querySelector('.intro-rings');
    const stars=document.querySelector('.intro-stars');
    const copy=document.querySelector('.intro-copy');
    const paper=document.querySelector('.stage-paper');

    const slow=t*5.2;
    const pulse=.5+.5*Math.sin(t*.72);
    const approach=Math.max(0,(p-.72)/.28);

    gsap.set(rings,{
      rotation:slow,
      scale:1+p*.16+Math.sin(t*.4)*.015,
      opacity:.52+p*.32,
      transformOrigin:'50% 50%'
    });
    gsap.set(stars,{
      x:Math.sin(t*.23)*28,
      y:Math.cos(t*.31)*7,
      opacity:.45+.4*pulse
    });
    gsap.set(copy,{
      y:Math.sin(t*.36)*3-approach*10,
      opacity:1-approach*.82,
      scale:1+Math.sin(t*.28)*.006
    });
    gsap.set(paper,{
      filter:`brightness(${1-approach*.42}) contrast(${1+approach*.22})`
    });
  }

  function updateCheshire(t,section){
    if(section.scene!=='cheshire') return;
    const local=t-section.start;
    const eyes=$('cheshire-eyes');
    const mouth=$('cheshire-mouth');
    const blinkPhase=local%5.3;
    const blink=blinkPhase>5.08?Math.max(.08,1-(blinkPhase-5.08)*7):1;
    const lookX=Math.sin(local*.46)*9;
    const lookY=Math.cos(local*.31)*2.4;
    const tilt=Math.sin(local*.22)*.9;
    gsap.set(eyes,{
      x:lookX,
      y:lookY,
      rotation:tilt,
      scaleY:blink,
      transformOrigin:'50% 50%'
    });
    gsap.set('.pupil-left',{rotation:-2.4+Math.sin(local*.4)*1.2});
    gsap.set('.pupil-right',{rotation:2.4-Math.sin(local*.4)*1.2});

    const voice=vocalActivity(t);
    const syllable=Math.pow(Math.abs(Math.sin(t*8.6)),1.42);
    const phrase=Math.abs(Math.sin(t*2.0+.35));
    const open=.995+voice*(syllable*.055+phrase*.014);
    const widen=1+voice*phrase*.018;
    const grinLift=Math.sin(t*.92)*1.15;
    gsap.set(mouth,{
      y:grinLift,
      scaleY:open,
      scaleX:widen,
      rotation:Math.sin(local*.27)*.35,
      transformOrigin:'50% 7%'
    });
  }

  function updateHare(t,section){
    if(section.scene!=='hare') return;
    const W=theater.clientWidth;
    const local=t-section.start;
    const pass=5.1;
    const p=(local%pass)/pass;
    const travel=ease('power1.inOut',p);
    const x=-W*.38 + W*1.58*travel;
    const hop=Math.sin(p*Math.PI*4);
    const stride=Math.sin(p*Math.PI*10);
    gsap.set('#hare-motion',{x,y:-20+hop*13,rotation:hop*1.8});
    gsap.set('#hare-art',{scaleX:-1*(1+Math.abs(stride)*.035),scaleY:1-Math.abs(stride)*.025,transformOrigin:'50% 65%'});
    gsap.set('#hare-leg-a',{rotation:stride*12,transformOrigin:'0% 0%'});
    gsap.set('#hare-leg-b',{rotation:-stride*15,transformOrigin:'100% 0%'});
    gsap.set('#hare-leg-c',{rotation:stride*10,transformOrigin:'100% 0%'});
    document.querySelectorAll('.hare-lines i').forEach((el,i)=>gsap.set(el,{x:-(local*150+i*100)%W}));
  }

  function updateDancer(t,section){
    if(section.scene!=='dancer') return;
    const local=t-section.start;
    const beat=local*2*Math.PI/1.05;
    const spin=(local*175)%360;
    const bob=Math.sin(beat)*8;
    const sway=Math.sin(beat*.5)*4.5;
    gsap.set('#dancer-motion',{y:bob,rotationZ:sway*.35});
    gsap.set('#dancer-art',{rotationY:spin,rotationZ:sway,scale:1+Math.abs(Math.sin(beat))*0.025,transformPerspective:900,transformOrigin:'50% 58%'});
    gsap.set('#dress-back',{rotation:-sway*1.45,scaleX:1+Math.sin(beat+.8)*.07,transformOrigin:'50% 15%'});
    gsap.set('#dress-front',{rotation:sway*1.2,scaleX:1-Math.sin(beat+.8)*.055,transformOrigin:'50% 15%'});
    gsap.set('#dancer-torso',{rotation:-sway*.45,y:-Math.abs(Math.sin(beat))*5,transformOrigin:'50% 80%'});
    gsap.set('#arm-left',{rotation:18*Math.sin(beat+.6),transformOrigin:'100% 12%'});
    gsap.set('#arm-right',{rotation:-18*Math.sin(beat+.6),transformOrigin:'0% 12%'});
  }

  function updateBird(t,section){
    if(section.scene!=='bird') return;
    const W=theater.clientWidth;
    const H=theater.clientHeight;
    const p=Math.max(0,Math.min(1,(t-section.start)/(section.end-section.start)));
    const travel=ease('sine.inOut',p);
    const x=-W*.42+W*1.62*travel;
    const wave=Math.sin(p*Math.PI*3);
    const y=-H*.08-H*.18*Math.sin(p*Math.PI)+wave*12;
    gsap.set('#bird-motion',{x,y,rotation:wave*2.5});
    const flap=Math.sin((t-section.start)*10.8);
    gsap.set('#wing-front',{rotation:-18-flap*24,transformOrigin:'20% 80%'});
    gsap.set('#wing-back',{rotation:14+flap*22,transformOrigin:'80% 80%'});
  }

  function captionAt(t){
    let i=-1;
    for(let n=0;n<CAPTIONS.length;n++){ if(CAPTIONS[n].t<=t)i=n; else break; }
    return i;
  }

  function updateCaption(t){
    const i=captionAt(t);
    if(i===captionIndex) return;
    captionIndex=i;
    const cue=CAPTIONS[i],next=CAPTIONS[i+1];
    gsap.killTweensOf(currentEl);
    currentEl.textContent=cue?cue.text:'';
    nextEl.textContent=(cue&&next)?next.text:'';
    gsap.fromTo(currentEl,{opacity:0,y:10,filter:'blur(4px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.38,ease:'power2.out'});
  }

  function syncFrame(){
    if(resting){ requestAnimationFrame(syncFrame); return; }
    const t=Math.max(0,Math.min(DURATION,timeNow()));
    const section=sectionAt(t);
    master.time(t,false);
    iconEl.textContent=section.icon;
    updateCaption(t);
    updateIntro(t,section);
    updateCheshire(t,section);
    updateHare(t,section);
    updateDancer(t,section);
    updateBird(t,section);

    if(DEBUG){
      debugTime.textContent=t.toFixed(2);
      debugScene.textContent=section.scene;
      debugSeek.value=String(t);
    }

    if(!audioActive && virtualTime()>=DURATION) enterRest();
    requestAnimationFrame(syncFrame);
  }

  async function tryAutoplay(){
    if(resting) return;
    clearTimeout(retryTimer);
    try{
      if(!audio.src) audio.src=AUDIO_SRC;
      audio.autoplay=true;
      audio.preload='auto';
      if(Math.abs((audio.currentTime||0)-virtualTime())>.5 && virtualTime()<DURATION-.3){
        audio.currentTime=Math.max(0,Math.min(DURATION-.2,virtualTime()));
      }
      await audio.play();
      audioActive=true;
      statusEl.textContent='HARPY HARE';
    }catch(err){
      audioActive=false;
      statusEl.textContent='HARPY HARE · AUTOPLAY BLOQUEADO';
      retryTimer=setTimeout(tryAutoplay,1400);
    }
  }

  function enterRest(){
    if(resting) return;
    resting=true;
    audioActive=false;
    clearTimeout(retryTimer);
    try{audio.pause()}catch(_){}
    gsap.to(broadcast,{opacity:0,duration:1.6,ease:'power2.inOut',onComplete:()=>{
      broadcast.classList.add('resting');
      gsap.set('.scene',{autoAlpha:0});
      gsap.set('.scene-rest',{autoAlpha:1});
      gsap.to(broadcast,{opacity:1,duration:1.2});
    }});
    clearTimeout(restTimer);
    restTimer=setTimeout(async()=>{
      gsap.to(broadcast,{opacity:0,duration:1.2,onComplete:()=>{
        broadcast.classList.remove('resting');
        master.time(0,false);
        captionIndex=-1;
        currentEl.textContent='';
        nextEl.textContent='';
        virtualStart=performance.now();
        try{audio.currentTime=0}catch(_){}
        resting=false;
        gsap.to(broadcast,{opacity:1,duration:1.6,ease:'power2.out'});
        tryAutoplay();
      }});
    },REST_MS);
  }

  audio.src=AUDIO_SRC;
  audio.autoplay=true;
  audio.preload='auto';
  audio.addEventListener('ended',enterRest);
  audio.addEventListener('canplay',tryAutoplay);
  audio.addEventListener('loadeddata',tryAutoplay);
  audio.addEventListener('play',()=>{
    audioActive=true;
    virtualStart=performance.now()-audio.currentTime*1000;
  });
  audio.addEventListener('pause',()=>{ if(!resting) audioActive=false; });

  if(DEBUG){
    debugPanel.hidden=false;
    debugSeek.addEventListener('input',()=>{
      const v=Number(debugSeek.value)||0;
      virtualStart=performance.now()-v*1000;
      try{audio.currentTime=v}catch(_){}
      master.time(v,false);
      captionIndex=-1;
    });
  }

  addEventListener('pageshow',tryAutoplay);
  addEventListener('focus',tryAutoplay);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden)tryAutoplay(); });
  addEventListener('pointerdown',tryAutoplay,{passive:true});
  addEventListener('keydown',tryAutoplay);

  virtualStart=performance.now();
  master.time(0,false);
  tryAutoplay();
  requestAnimationFrame(syncFrame);
})();