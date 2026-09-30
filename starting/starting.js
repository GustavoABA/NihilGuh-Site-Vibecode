(() => {
  'use strict';

  const MASTER_DURATION = 179.583;
  const REST_MS = 2 * 60 * 1000;
  const params = new URLSearchParams(location.search);
  const DEFAULT_AUDIO_SRC = '../assets/audio/harpy-hare.mp3';
  const EXPLICIT_AUDIO_SRC = params.get('audio') || '';
  const DEBUG = params.has('debug');
  const PREVIEW = params.has('preview');

  const SECTIONS = [
    { start:0, end:14, scene:'intro', icon:'✦' },
    { start:14, end:38, scene:'cheshire', icon:'☾' },
    { start:38, end:70, scene:'hare', icon:'➶' },
    { start:70, end:94, scene:'cheshire', icon:'☾' },
    { start:94, end:128, scene:'dancer', icon:'♠' },
    { start:128, end:165.5, scene:'cheshire', icon:'☾' },
    { start:165.5, end:MASTER_DURATION + .5, scene:'bird', icon:'⌁' }
  ];

  // Legendas fornecidas pelo usuário.
  const CAPTIONS = [
    {t:14.0,text:'Lebre Harpia'},{t:16.2,text:'Onde você enterrou todos os seus filhos?'},{t:20.8,text:'Me conte, digo eu'},
    {t:25.0,text:'Lebre Harpia'},{t:27.2,text:'Onde você enterrou todos os seus filhos?'},{t:32.0,text:'Me conte, digo eu'},
    {t:38.0,text:'Todas as flechas que você roubou'},{t:42.8,text:'Partidas ao meio, agora queimadas e quebradas'},
    {t:47.7,text:'Assim como seu coração que estava tão ansioso para se esconder'},{t:53.4,text:'Você não pode mantê-los todos enjaulados'},
    {t:58.1,text:'Eles vão lutar e fugir'},{t:62.5,text:'Mãe, me conte, digo eu'},{t:67.0,text:'(La-la-la, la-la-la, la-la-la)'},
    {t:70.0,text:'Lebre Harpia'},{t:72.2,text:'Onde você enterrou todos os seus filhos?'},{t:76.8,text:'Me conte, digo eu'},
    {t:81.0,text:'Lebre Harpia'},{t:83.2,text:'Onde você enterrou todos os seus filhos?'},{t:88.0,text:'Me conte, digo eu'},
    {t:94.0,text:'Paredes de floresta e tetos estrelados'},{t:98.8,text:'Cortinas áridas que você está tecendo'},
    {t:103.8,text:'Assim como as histórias que você mantém dentro da sua cabeça'},{t:109.5,text:'Ela não pode mantê-los todos seguros'},
    {t:114.0,text:'Eles vão morrer e ter medo'},{t:118.5,text:'Mãe, me conte, digo eu'},{t:123.0,text:'(Mãe, me conte, digo eu)'},
    {t:128.0,text:'Lebre Harpia'},{t:130.0,text:'Onde você enterrou todos os seus filhos?'},{t:133.7,text:'Me conte, digo eu'},
    {t:137.0,text:'Lebre Harpia'},{t:139.0,text:'Onde você enterrou todos os seus filhos?'},{t:142.8,text:'Me conte, digo eu'},
    {t:146.0,text:'Lebre Harpia'},{t:148.0,text:'Onde você enterrou todos os seus filhos?'},{t:151.8,text:'Me conte, digo eu'},
    {t:155.0,text:'Lebre Harpia'},{t:157.0,text:'Onde você enterrou todos os seus filhos?'},{t:160.7,text:'Me conte, digo eu (me conte, digo eu)'},
    {t:165.5,text:'Ela não pode mantê-los todos enjaulados'},{t:169.0,text:'Eles estarão distantes e voarão para longe'},
    {t:172.7,text:'Mãe, me diga que você vai ficar'},{t:176.0,text:'Nós estaremos distantes e voaremos para longe'}
  ];

  const $ = id => document.getElementById(id);
  const audio = $('harpy-audio');
  const film = $('reference-film');
  const broadcast = $('broadcast');
  const gate = $('start-gate');
  const gateTitle = $('start-gate-title');
  const gateCopy = $('start-gate-copy');
  const gatePlay = $('start-gate-play');
  const localAudioFile = $('local-audio-file');
  const currentEl = $('subtitle-current');
  const nextEl = $('subtitle-next');
  const iconEl = $('subtitle-icon');
  const audioStatus = $('audio-status');
  const debugPanel = $('debug-panel');
  const debugTime = $('debug-time');
  const debugScene = $('debug-scene');
  const debugOffset = $('debug-offset');
  const debugSeek = $('debug-seek');

  const queryOffset = params.get('offset');
  let offset = queryOffset !== null ? Number(queryOffset || 0) : Number(localStorage.getItem('nihilguh_harpy_offset') || 0);
  let activeCaption = -1;
  let activeScene = '';
  let resting = false;
  let restTimer = null;
  let audioReady = false;
  let audioDrivesTimeline = false;
  let localObjectUrl = '';
  let virtualStartedAt = performance.now();
  let virtualPausedAt = 0;
  let virtualPaused = false;
  let virtualEndHandled = false;
  let analyser = null;
  let analyserData = null;
  let audioContext = null;
  let analyserSourceConnected = false;

  const sceneElements = new Map();
  const scrubbers = [];
  const loops = [];

  function clamp(v,min=0,max=1){ return Math.min(max,Math.max(min,v)); }
  function sectionAt(t){ return SECTIONS.find(s => t >= s.start && t < s.end) || SECTIONS[SECTIONS.length - 1]; }

  function makeScrubber(el,keyframes,start,end,easing='linear'){
    if(!el) return null;
    const anim=el.animate(keyframes,{duration:Math.max(1,(end-start)*1000),fill:'both',easing});
    anim.pause();
    scrubbers.push({anim,start,end,el});
    return anim;
  }

  function makeLoop(el,keyframes,start,end,duration,easing='linear'){
    if(!el) return null;
    const anim=el.animate(keyframes,{duration,iterations:Infinity,fill:'both',easing});
    anim.pause();
    loops.push({anim,start,end,duration,el});
    return anim;
  }

  function setupSceneAnimations(){
    document.querySelectorAll('.scene').forEach(el => {
      sceneElements.set(el.dataset.scene,el);
    });

    const hareStart=38, hareEnd=70;
    makeLoop($('hare-motion'),[
      {transform:'translate3d(-42vw,-45%,0) rotate(-2deg)',opacity:0,offset:0},
      {transform:'translate3d(-20vw,-50%,0) rotate(1deg)',opacity:1,offset:.08},
      {transform:'translate3d(22vw,-55%,0) rotate(-1deg)',opacity:1,offset:.42},
      {transform:'translate3d(64vw,-47%,0) rotate(1.5deg)',opacity:1,offset:.76},
      {transform:'translate3d(110vw,-53%,0) rotate(-1deg)',opacity:0,offset:1}
    ],hareStart,hareEnd,5600,'cubic-bezier(.34,.02,.27,.99)');
    makeLoop($('hare-art'),[
      {transform:'scaleX(-1) translateY(0) rotate(-1deg)'},
      {transform:'scaleX(-1) translateY(-9px) rotate(1deg)'},
      {transform:'scaleX(-1) translateY(1px) rotate(-.5deg)'}
    ],hareStart,hareEnd,255,'ease-in-out');
    document.querySelectorAll('.hare-dust i').forEach((el,i)=>makeLoop(el,[
      {transform:'translate3d(0,0,0) scale(.5)',opacity:.35},
      {transform:`translate3d(${-34-i*12}px,${-10+i*4}px,0) scale(1.4)`,opacity:0}
    ],hareStart,hareEnd,850+i*120,'ease-out'));

    const dancerStart=94,dancerEnd=128;
    makeLoop($('dancer-motion'),[
      {transform:'translate3d(-16px,4px,0) rotate(-3deg)'},
      {transform:'translate3d(6px,-10px,0) rotate(1.7deg)'},
      {transform:'translate3d(18px,3px,0) rotate(3.5deg)'},
      {transform:'translate3d(-6px,-7px,0) rotate(-1.8deg)'},
      {transform:'translate3d(-16px,4px,0) rotate(-3deg)'}
    ],dancerStart,dancerEnd,2350,'cubic-bezier(.42,0,.3,1)');
    makeLoop($('dress-back'),[
      {transform:'rotate(-3deg) scaleX(.96)'},
      {transform:'rotate(5deg) scaleX(1.09)'},
      {transform:'rotate(-2deg) scaleX(.98)'}
    ],dancerStart,dancerEnd,1180,'ease-in-out');
    makeLoop($('dress-front'),[
      {transform:'rotate(2deg) scaleX(1.02)'},
      {transform:'rotate(-5deg) scaleX(.93)'},
      {transform:'rotate(3deg) scaleX(1.04)'}
    ],dancerStart,dancerEnd,1180,'ease-in-out');
    makeLoop($('dancer-torso'),[
      {transform:'rotate(-1.5deg) translateY(0)'},
      {transform:'rotate(2deg) translateY(-7px)'},
      {transform:'rotate(-1deg) translateY(0)'}
    ],dancerStart,dancerEnd,1180,'ease-in-out');
    makeLoop($('arm-left'),[
      {transform:'rotate(11deg)'},{transform:'rotate(-15deg)'},{transform:'rotate(11deg)'}
    ],dancerStart,dancerEnd,1180,'ease-in-out');
    makeLoop($('arm-right'),[
      {transform:'rotate(-12deg)'},{transform:'rotate(16deg)'},{transform:'rotate(-12deg)'}
    ],dancerStart,dancerEnd,1180,'ease-in-out');
    makeLoop($('dancer-art'),[
      {transform:'rotateY(-7deg) rotateZ(-1.5deg) scale(1)'},
      {transform:'rotateY(12deg) rotateZ(2deg) scale(1.025)'},
      {transform:'rotateY(-10deg) rotateZ(-2deg) scale(.995)'},
      {transform:'rotateY(-7deg) rotateZ(-1.5deg) scale(1)'}
    ],dancerStart,dancerEnd,1850,'cubic-bezier(.45,.05,.2,1)');

    const birdStart=165.5,birdEnd=MASTER_DURATION;
    makeLoop($('bird-motion'),[
      {transform:'translate3d(-42vw,10vh,0) rotate(-6deg)',opacity:0,offset:0},
      {transform:'translate3d(-18vw,1vh,0) rotate(-2deg)',opacity:1,offset:.12},
      {transform:'translate3d(28vw,-9vh,0) rotate(3deg)',opacity:1,offset:.52},
      {transform:'translate3d(72vw,-2vh,0) rotate(-1deg)',opacity:1,offset:.82},
      {transform:'translate3d(112vw,-13vh,0) rotate(5deg)',opacity:0,offset:1}
    ],birdStart,birdEnd,7600,'cubic-bezier(.31,.02,.21,.99)');
    makeLoop($('wing-front'),[
      {transform:'rotate(12deg)'},{transform:'rotate(-34deg)'},{transform:'rotate(13deg)'}
    ],birdStart,birdEnd,620,'ease-in-out');
    makeLoop($('wing-back'),[
      {transform:'rotate(-9deg)'},{transform:'rotate(31deg)'},{transform:'rotate(-10deg)'}
    ],birdStart,birdEnd,620,'ease-in-out');
  }

  function updateSceneStage(t,sec){
    sceneElements.forEach((el,name)=>{
      const visible=!resting && name===sec.scene;
      el.classList.toggle('is-visible',visible);
      if(!visible || name==='rest') return;
      const fadeIn=clamp((t-sec.start)/.85);
      const fadeOut=clamp((sec.end-t)/.85);
      const alpha=Math.min(fadeIn,fadeOut,1);
      const zoom=1.014-(alpha*.014);
      el.style.opacity=String(alpha);
      el.style.transform='scale('+zoom.toFixed(4)+')';
    });
  }

  function updateAnimations(t,sec){
    updateSceneStage(t,sec);
    for(const item of scrubbers){
      const active=t>=item.start && t<=item.end;
      if(active) item.anim.currentTime=clamp((t-item.start)/(item.end-item.start))*((item.end-item.start)*1000);
    }
    for(const item of loops){
      if(t>=item.start && t<=item.end){
        const local=(t-item.start)*1000;
        item.anim.currentTime=local % item.duration;
      }
    }
  }

  function virtualTime(){ return virtualPaused ? virtualPausedAt : (performance.now()-virtualStartedAt)/1000; }
  function timelineTime(){
    const raw=audioDrivesTimeline && !audio.paused ? Number(audio.currentTime||0) : virtualTime();
    return clamp(raw+offset,0,MASTER_DURATION);
  }

  function captionIndexAt(t){
    let idx=-1;
    for(let i=0;i<CAPTIONS.length;i++){ if(CAPTIONS[i].t<=t) idx=i; else break; }
    return idx;
  }

  function setCaption(idx){
    if(idx===activeCaption) return;
    activeCaption=idx;
    const cue=CAPTIONS[idx], next=CAPTIONS[idx+1];
    currentEl.classList.remove('is-changing');
    void currentEl.offsetWidth;
    currentEl.textContent=cue?cue.text:'';
    currentEl.classList.add('is-changing');
    nextEl.textContent=next?next.text:'';
  }

  function setupAnalyser(){
    if(analyser || !audioReady) return;
    try{
      audioContext=new (window.AudioContext||window.webkitAudioContext)();
      const source=audioContext.createMediaElementSource(audio);
      analyser=audioContext.createAnalyser();
      analyser.fftSize=256;
      analyser.smoothingTimeConstant=.68;
      analyserData=new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      analyserSourceConnected=true;
    }catch(_){ analyser=null; }
  }

  function vocalEnergy(t){
    if(analyser && analyserData){
      analyser.getByteTimeDomainData(analyserData);
      let sum=0;
      for(let i=0;i<analyserData.length;i++){
        const v=(analyserData[i]-128)/128;
        sum+=v*v;
      }
      return clamp(Math.sqrt(sum/analyserData.length)*5.4);
    }
    const syllable=Math.abs(Math.sin(t*8.6))*Math.abs(Math.sin(t*2.13+.7));
    return .18+syllable*.62;
  }

  function updateCheshire(t,scene){
    const eyes=$('cheshire-eyes'),mouth=$('cheshire-mouth');
    if(!eyes||!mouth) return;
    if(scene!=='cheshire'){
      eyes.style.transform='translate3d(0,0,0)';
      mouth.style.transform='scaleY(1)';
      return;
    }
    const local=t-(SECTIONS.find(s=>s.scene==='cheshire'&&t>=s.start&&t<s.end)?.start||0);
    const look=Math.sin(local*.46)*12;
    const blink=(local%5.8)>5.55 ? .08 : 1;
    eyes.style.transform=`translate3d(${look}px,${Math.cos(local*.37)*3}px,0) scaleY(${blink})`;
    const e=vocalEnergy(t);
    mouth.style.transform=`translate3d(0,${Math.sin(t*1.6)*3}px,0) scaleY(${1+e*.24})`;
  }

  function syncFilm(t){
    if(!film || film.readyState<1) return;
    if(film.paused){
      film.play().catch(()=>{});
    }
    if(Number.isFinite(film.duration) && film.duration>0){
      const target=t%film.duration;
      if(Math.abs(film.currentTime-target)>.85){
        try{film.currentTime=target;}catch(_){}
      }
    }
  }

  function showGate(title,copy,canPlay=true){
    gateTitle.textContent=title;
    gateCopy.textContent=copy;
    gatePlay.hidden=!canPlay;
    gate.hidden=false;
  }

  async function beginAudio(fromGesture=false){
    if(!audioReady||!audio.src) return;
    try{
      const visual=clamp(virtualTime(),0,MASTER_DURATION-.1);
      if(Math.abs((audio.currentTime||0)-visual)>.35) audio.currentTime=visual;
      await audio.play();
      audioDrivesTimeline=true;
      gate.hidden=true;
      audioStatus.textContent='HARPY HARE · ÁUDIO';
      if(fromGesture){
        setupAnalyser();
        if(audioContext?.state==='suspended') await audioContext.resume().catch(()=>{});
      }
    }catch(_){
      showGate('▶ liberar áudio','O navegador bloqueou o som. A animação continua sincronizada sem ele.',true);
      audioStatus.textContent='ANIMAÇÃO · ÁUDIO BLOQUEADO';
    }
  }

  async function configureAudio(){
    if(PREVIEW){ audioStatus.textContent='PREVIEW · SEM ÁUDIO'; return; }
    const candidate=EXPLICIT_AUDIO_SRC||DEFAULT_AUDIO_SRC;
    try{
      const response=await fetch(candidate,{method:'HEAD',cache:'no-store'});
      if(!response.ok) throw new Error('missing');
      audio.src=candidate;
      audioReady=true;
      audio.addEventListener('canplay',()=>beginAudio(false),{once:true});
      audio.addEventListener('ended',enterRest);
      audio.load();
    }catch(_){
      showGate('Animação rodando sem áudio','Escolha o MP3 para testar o lip-sync. A abertura não para sem ele.',false);
      audioStatus.textContent='ANIMAÇÃO · SEM ÁUDIO';
    }
  }

  function enterRest(){
    if(resting) return;
    resting=true;
    audioDrivesTimeline=false;
    broadcast.classList.add('is-fading');
    setTimeout(()=>{
      broadcast.classList.remove('is-fading');
      broadcast.classList.add('is-resting');
      sceneElements.forEach(el=>el.classList.remove('is-visible'));
      const rest=sceneElements.get('rest');
      if(rest){rest.classList.add('is-visible');rest.style.opacity='1';rest.style.transform='scale(1)';}
    },1900);
    clearTimeout(restTimer);
    restTimer=setTimeout(async()=>{
      resting=false;
      broadcast.classList.remove('is-resting');
      broadcast.classList.add('is-entering');
      setTimeout(()=>broadcast.classList.remove('is-entering'),2100);
      virtualStartedAt=performance.now();
      virtualPausedAt=0;
      virtualPaused=false;
      virtualEndHandled=false;
      activeCaption=-1;
      activeScene='';
      try{audio.currentTime=0}catch(_){}
      if(audioReady) await beginAudio(false);
    },REST_MS);
  }

  function seekVirtual(v){
    const value=clamp(Number(v)||0,0,MASTER_DURATION);
    virtualStartedAt=performance.now()-value*1000;
    virtualPausedAt=value;
    virtualEndHandled=false;
    if(audioDrivesTimeline){try{audio.currentTime=value}catch(_){}}
    activeCaption=-1;
  }

  function setOffset(delta){
    offset=clamp(offset+delta,-10,10);
    localStorage.setItem('nihilguh_harpy_offset',String(offset));
  }

  function paint(){
    const raw=virtualTime();
    if(!resting&&!audioDrivesTimeline&&raw>=MASTER_DURATION&&!virtualEndHandled){
      virtualEndHandled=true;enterRest();
    }
    const t=timelineTime();
    const sec=sectionAt(t);
    activeScene=resting?'rest':sec.scene;
    iconEl.textContent=sec.icon||'✦';
    if(!resting){
      updateAnimations(t,sec);
      updateCheshire(t,sec.scene);
      setCaption(captionIndexAt(t));
      syncFilm(t);
    }else{
      currentEl.textContent='';nextEl.textContent='';
    }
    if(DEBUG){
      debugTime.textContent=t.toFixed(2);
      debugScene.textContent=activeScene;
      debugOffset.textContent=offset.toFixed(2);
      debugSeek.value=String(t);
    }
    requestAnimationFrame(paint);
  }

  gatePlay.addEventListener('click',()=>{
    setupAnalyser();
    beginAudio(true);
  });

  localAudioFile.addEventListener('change',e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    if(localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    localObjectUrl=URL.createObjectURL(file);
    audio.src=localObjectUrl;
    audioReady=true;
    audio.addEventListener('canplay',()=>{
      setupAnalyser();
      beginAudio(true);
    },{once:true});
    audio.addEventListener('ended',enterRest,{once:false});
    audio.load();
  });

  if(DEBUG){
    debugPanel.hidden=false;
    debugSeek.max=String(MASTER_DURATION);
    debugSeek.addEventListener('input',e=>seekVirtual(e.target.value));
    debugPanel.addEventListener('click',e=>{
      const action=e.target.closest('button')?.dataset.debug;
      if(action==='minus')setOffset(-.1);
      if(action==='plus')setOffset(.1);
      if(action==='restart'){seekVirtual(0);if(audioReady)beginAudio(false)}
    });
  }

  addEventListener('keydown',e=>{
    if(e.key==='[')setOffset(e.shiftKey?-1:-.1);
    if(e.key===']')setOffset(e.shiftKey?1:.1);
    if(e.key==='ArrowLeft'){e.preventDefault();seekVirtual(timelineTime()-offset-1)}
    if(e.key==='ArrowRight'){e.preventDefault();seekVirtual(timelineTime()-offset+1)}
    if(e.code==='Space'&&DEBUG){
      e.preventDefault();
      if(audioDrivesTimeline&&!audio.paused){audio.pause();audioDrivesTimeline=false;virtualStartedAt=performance.now()-audio.currentTime*1000}
      else if(audioReady)beginAudio(true);
      else{
        if(!virtualPaused){
          virtualPausedAt=virtualTime();
          virtualPaused=true;
        }else{
          virtualPaused=false;
          virtualStartedAt=performance.now()-virtualPausedAt*1000;
        }
      }
    }
  });

  setupSceneAnimations();
  sceneElements.get('intro')?.classList.add('is-visible');
  film.play().catch(()=>{});
  virtualStartedAt=performance.now();
  configureAudio();
  paint();
})();