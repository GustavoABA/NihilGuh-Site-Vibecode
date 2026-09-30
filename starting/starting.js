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
  gsap.set('.scene',{autoAlpha:0,scale:1.035,y:10});
  gsap.set('.scene-rest',{autoAlpha:0,scale:1,y:0});

  for(const s of SECTIONS){
    const el=scenes[s.scene];
    if(!el) continue;

    // Exact scene times are preserved. Only the visual transition changes.
    master.fromTo(
      el,
      {autoAlpha:0,scale:1.035,y:10},
      {autoAlpha:1,scale:1,y:0,duration:.90,ease:'expo.out'},
      s.start
    );

    master.to(
      el,
      {autoAlpha:0,scale:.985,y:-7,duration:.72,ease:'power3.in'},
      Math.max(s.start,s.end-.72)
    );
  }

  master
    .fromTo('.intro-copy',{y:18,opacity:0},{y:0,opacity:1,duration:1.3,ease:'power3.out'},1.0)
    .fromTo('.intro-rings',{scale:.78,rotation:-8,opacity:0},{scale:1,rotation:0,opacity:1,duration:2.2,ease:'expo.out'},.5)
    .fromTo('.intro-stars',{y:-8,opacity:0},{y:0,opacity:.9,duration:1.4},1.4);

  function clamp01(v){ return Math.max(0,Math.min(1,v)); }
  function ease(name,p){ return gsap.parseEase(name)(clamp01(p)); }
  function smoothstep(a,b,v){
    const p=clamp01((v-a)/(b-a));
    return p*p*(3-2*p);
  }
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

    const p=clamp01((t-section.start)/(section.end-section.start));
    const rings=document.querySelector('.intro-rings');
    const stars=document.querySelector('.intro-stars');
    const copy=document.querySelector('.intro-copy');
    const paper=document.querySelector('.stage-paper');

    const breath=Math.sin(t*.58);
    const drift=Math.sin(t*.19);
    const approach=smoothstep(.70,1,p);

    gsap.set(rings,{
      rotation:t*3.8,
      scale:1+p*.14+breath*.010,
      x:drift*5,
      y:Math.cos(t*.23)*3,
      opacity:.50+p*.30,
      transformOrigin:'50% 50%'
    });

    gsap.set(stars,{
      x:Math.sin(t*.21)*34,
      y:Math.cos(t*.27)*8,
      rotation:Math.sin(t*.13)*1.1,
      opacity:.48+.27*(.5+.5*Math.sin(t*.77))
    });

    gsap.set(copy,{
      y:Math.sin(t*.31)*2.6-approach*12,
      scale:1+Math.sin(t*.24)*.005+approach*.018,
      opacity:1-approach*.86
    });

    gsap.set(paper,{
      scale:1+p*.018,
      filter:`brightness(${1-approach*.43}) contrast(${1+approach*.18})`,
      transformOrigin:'50% 50%'
    });
  }

  function updateCheshire(t,section){
    if(section.scene!=='cheshire') return;

    const local=t-section.start;
    const eyes=$('cheshire-eyes');
    const mouth=$('cheshire-mouth');
    const leftEye=$('eye-left-wrap');
    const rightEye=$('eye-right-wrap');
    const haze=document.querySelector('.face-shadow');
    const aura=document.querySelector('.cheshire-aura');

    // Organic blink: quick close, softer reopen, slightly offset eyes.
    const blinkCycle=local%5.9;
    let blink=1;
    if(blinkCycle>5.56){
      const q=(blinkCycle-5.56)/.34;
      blink=q<.42
        ? 1-ease('power3.in',q/.42)*.94
        : .06+ease('power3.out',(q-.42)/.58)*.94;
    }

    const gazeWave=Math.sin(local*.31);
    const gazeFine=Math.sin(local*1.17)*.55;
    const lookX=gazeWave*5.4+gazeFine;
    const lookY=Math.cos(local*.23)*1.2;
    const headTilt=Math.sin(local*.15)*.28;

    gsap.set(eyes,{
      x:Math.sin(local*.29)*2.8,
      y:Math.cos(local*.21)*1.0,
      rotation:headTilt,
      transformOrigin:'50% 50%'
    });

    gsap.set(leftEye,{
      scaleY:blink,
      rotation:-1.35+Math.sin(local*.18)*.32,
      transformOrigin:'50% 50%'
    });
    gsap.set(rightEye,{
      scaleY:Math.min(1,blink+.025),
      rotation:1.35-Math.sin(local*.18)*.32,
      transformOrigin:'50% 50%'
    });

    gsap.set('.pupil-left',{
      x:lookX,
      y:lookY,
      rotation:-2.4+gazeWave*.45
    });
    gsap.set('.pupil-right',{
      x:lookX,
      y:lookY,
      rotation:2.4-gazeWave*.45
    });

    const voice=vocalActivity(t);
    const syllable=Math.pow(Math.abs(Math.sin(t*8.45)),1.45);
    const phrase=.5+.5*Math.sin(t*1.93+.35);

    // Singing deforms the grin mostly sideways, keeping the iconic silhouette.
    const open=.999+voice*(syllable*.022+phrase*.006);
    const widen=1+voice*(phrase*.018+syllable*.005);
    const floatY=Math.sin(t*.71)*.55;

    gsap.set(mouth,{
      y:floatY,
      scaleY:open,
      scaleX:widen,
      rotation:Math.sin(local*.17)*.13,
      transformOrigin:'50% 8%'
    });

    gsap.set('.cheek-left',{
      x:-voice*phrase*2.6,
      opacity:.12+voice*.055
    });
    gsap.set('.cheek-right',{
      x:voice*phrase*2.6,
      opacity:.12+voice*.055
    });

    if(haze){
      gsap.set(haze,{
        x:Math.sin(local*.14)*4,
        y:Math.cos(local*.11)*3,
        scale:1+Math.sin(local*.20)*.008,
        opacity:.88+.06*Math.sin(local*.24)
      });
    }
    if(aura){
      gsap.set(aura,{
        scale:1+Math.sin(local*.22)*.018,
        opacity:.82+.12*Math.sin(local*.19)
      });
    }
  }

  function updateHare(t,section){
    if(section.scene!=='hare') return;

    const W=theater.clientWidth;
    const H=theater.clientHeight;
    const local=t-section.start;
    const pass=4.8;
    const p=(local%pass)/pass;

    // Fast entry, readable center pass, quick exit.
    const travel=ease('power2.inOut',p);
    const x=-W*.40+W*1.62*travel;

    const stridePhase=p*Math.PI*12;
    const stride=Math.sin(stridePhase);
    const impact=Math.abs(Math.cos(stridePhase));
    const hop=Math.max(0,Math.sin(p*Math.PI*6));

    const y=-H*.035-hop*H*.055+Math.sin(stridePhase)*2.6;
    const rot=-1.2+stride*1.6;
    const squash=impact*.045;

    gsap.set('#hare-motion',{
      x,
      y,
      rotation:rot,
      transformOrigin:'50% 65%'
    });

    // SVG intrinsically faces left; negative X keeps it facing the direction of travel.
    gsap.set('#hare-art',{
      scaleX:-(1+squash),
      scaleY:1-squash*.55,
      transformOrigin:'50% 68%'
    });

    gsap.set('#hare-leg-a',{rotation:stride*18,transformOrigin:'0% 0%'});
    gsap.set('#hare-leg-b',{rotation:-stride*22,transformOrigin:'100% 0%'});
    gsap.set('#hare-leg-c',{rotation:stride*16,transformOrigin:'100% 0%'});

    const shadow=document.querySelector('.hare-shadow');
    if(shadow){
      gsap.set(shadow,{
        scaleX:1.08-hop*.28,
        scaleY:.9-hop*.18,
        opacity:.22-hop*.10
      });
    }

    document.querySelectorAll('.hare-lines i').forEach((el,i)=>{
      gsap.set(el,{x:-((local*(205+i*34)+i*120)%W),opacity:.10+i*.035});
    });
  }

  function updateDancer(t,section){
    if(section.scene!=='dancer') return;

    const local=t-section.start;
    const beatLen=1.05;
    const beat=local/beatLen;
    const beatFrac=beat-Math.floor(beat);
    const bar=beat/4;
    const barFrac=bar-Math.floor(bar);

    const pulse=Math.sin(beat*Math.PI*2);
    const halfPulse=Math.sin(beat*Math.PI);
    const sway=Math.sin(local*2.15)*5.2;

    // One elegant turn per 4-beat phrase with a small hold before/after.
    const turn=smoothstep(.18,.78,barFrac);
    const baseTurn=Math.floor(bar)*360;
    const rotationY=baseTurn+turn*360;

    gsap.set('#dancer-motion',{
      y:-Math.abs(halfPulse)*7+Math.sin(local*.52)*2.4,
      x:Math.sin(local*.61)*4,
      rotationZ:sway*.22,
      transformOrigin:'50% 58%'
    });

    gsap.set('#dancer-art',{
      rotationY,
      rotationZ:sway,
      scale:1+Math.abs(pulse)*.018,
      transformPerspective:980,
      transformOrigin:'50% 58%'
    });

    const skirtLag=Math.sin(local*2.15-.65);
    gsap.set('#dress-back',{
      rotation:-sway*1.55,
      scaleX:1+skirtLag*.065,
      scaleY:1-Math.abs(skirtLag)*.025,
      transformOrigin:'50% 15%'
    });
    gsap.set('#dress-front',{
      rotation:sway*1.25,
      scaleX:1-skirtLag*.050,
      transformOrigin:'50% 15%'
    });
    gsap.set('#dancer-torso',{
      rotation:-sway*.38,
      y:-Math.abs(pulse)*3.5,
      transformOrigin:'50% 80%'
    });
    gsap.set('#arm-left',{
      rotation:16*Math.sin(local*4.1+.55),
      transformOrigin:'100% 12%'
    });
    gsap.set('#arm-right',{
      rotation:-16*Math.sin(local*4.1+.55),
      transformOrigin:'0% 12%'
    });
  }

  function updateBird(t,section){
    if(section.scene!=='bird') return;

    const W=theater.clientWidth;
    const H=theater.clientHeight;
    const p=clamp01((t-section.start)/(section.end-section.start));
    const travel=ease('sine.inOut',p);

    const x=-W*.43+W*1.64*travel;
    const arc=-Math.sin(p*Math.PI)*H*.22;
    const drift=Math.sin(p*Math.PI*4)*H*.020;
    const y=-H*.02+arc+drift;

    const dy=-Math.cos(p*Math.PI)*.22+Math.cos(p*Math.PI*4)*.08;
    const bank=Math.max(-9,Math.min(9,dy*35));

    gsap.set('#bird-motion',{
      x,
      y,
      rotation:bank,
      scale:.88+Math.sin(p*Math.PI)*.16,
      transformOrigin:'50% 55%'
    });

    const flap=Math.sin((t-section.start)*10.6);
    const glide=.5+.5*Math.sin((t-section.start)*1.35);

    gsap.set('#wing-front',{
      rotation:-12-flap*(18+glide*8),
      transformOrigin:'20% 80%'
    });
    gsap.set('#wing-back',{
      rotation:10+flap*(17+glide*7),
      transformOrigin:'80% 80%'
    });
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
    gsap.fromTo(
      currentEl,
      {opacity:0,y:9,scale:.992},
      {opacity:1,y:0,scale:1,duration:.42,ease:'power3.out'}
    );
    if(nextEl){
      gsap.fromTo(nextEl,{opacity:0,y:4},{opacity:.72,y:0,duration:.52,ease:'power2.out'});
    }
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