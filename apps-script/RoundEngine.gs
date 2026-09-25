/**
 * NihilGuh — Wonderland Round Engine V2
 * Um baralho global de 23 rodadas por live.
 * Potencial positivo total: +240 min. A Escolha da Rainha pode retirar 10 min.
 * Todas as respostas são validadas no backend sob ScriptLock.
 */
const ROUND_PROP = 'NIHILGUH_ROUND_STATE_V2';
const ROUND_CFG = {
  nextRoundDelaySec: 8,
  standardDurationSec: 150,
  longDurationSec: 360,
  reactionDurationSec: 60,
  maxWrongAttemptsPerPlayer: 25,
  maxTrackedPlayers: 300
};

const ROUND_REWARDS = {
  reaction:5,
  hunt:5,
  odd:10,
  flash:10,
  scramble:10,
  sequence:10,
  math:10,
  memory:10,
  caesar:15,
  maze:20,
  puzzle:25,
  queen:15
};

function roundSessionStart_(sessionId, startedAt) {
  if (!sessionId) return;
  const deck = roundBuildDeck_();
  const state = {
    version:2,
    stateVersion:0,
    sessionId:String(sessionId),
    index:0,
    deck:deck,
    current:null,
    lastWinner:null,
    startedAt:new Date(startedAt || now_()).toISOString(),
    updatedAt:stamp_()
  };
  roundSave_(state);
  roundStartNext_(state,String(sessionId));
}

function roundSessionEnd_(sessionId) {
  const state = roundLoad_();
  if (!state || state.sessionId !== String(sessionId || '')) return;
  if (state.current && state.current.status === 'active') {
    state.current.status = 'closed';
    state.current.closedAt = stamp_();
  }
  state.endedAt = stamp_();
  roundSave_(state);
}

function roundBuildDeck_() {
  const act1 = ['reaction','reaction','hunt','hunt','scramble','sequence','math','odd'];
  const act2 = ['flash','flash','memory','memory','caesar','odd','reaction','hunt','math'];
  const act3 = ['scramble','sequence','caesar','maze','puzzle'];
  return roundShuffleArray_(act1)
    .concat(roundShuffleArray_(act2))
    .concat(roundShuffleArray_(act3))
    .concat(['queen']);
}

function roundShuffleArray_(arr) {
  const out = arr.slice();
  for (let i=out.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    const t=out[i]; out[i]=out[j]; out[j]=t;
  }
  return out;
}

function roundLoad_() {
  try {
    const raw=PropertiesService.getScriptProperties().getProperty(ROUND_PROP);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function roundSave_(state) {
  if (!state) return;
  state.stateVersion=Number(state.stateVersion||0)+1;
  state.updatedAt=stamp_();
  PropertiesService.getScriptProperties().setProperty(ROUND_PROP,JSON.stringify(state));
}

function roundEnsure_(sessionId) {
  let state=roundLoad_();
  if (!state || state.sessionId !== String(sessionId||'')) {
    const active=activeSession_();
    const startedAt=active && String(active.values[0])===String(sessionId) ? active.values[2] : now_();
    roundSessionStart_(sessionId,startedAt);
    state=roundLoad_();
  }
  return state;
}

function roundHashVisitor_(visitorId) {
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(visitorId||''));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'').slice(0,12);
}

function roundNormalize_(value) {
  return String(value==null?'':value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
}

function roundShuffleText_(text) {
  const chars=String(text).split('');
  for(let i=chars.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const t=chars[i];chars[i]=chars[j];chars[j]=t;
  }
  const out=chars.join('');
  return out===text && chars.length>1 ? chars.slice(1).concat(chars[0]).join('') : out;
}

function roundCaesar_(text,shift) {
  return String(text).toUpperCase().replace(/[A-Z]/g,ch=>{
    const n=ch.charCodeAt(0)-65;
    return String.fromCharCode(65+((n+shift+26)%26));
  });
}

function roundAct_(index) {
  index=Number(index||1);
  if(index<=8) return 1;
  if(index<=17) return 2;
  return 3;
}

function roundBase_(type,index) {
  const now=Date.now();
  const longGame=['maze','puzzle'].includes(type);
  return {
    roundId:'round_'+Utilities.getUuid().slice(0,10),
    index:Number(index||1),
    act:roundAct_(index),
    type:type,
    status:'active',
    startedAt:new Date(now).toISOString(),
    endsAt:new Date(now+(longGame?ROUND_CFG.longDurationSec:ROUND_CFG.standardDurationSec)*1000).toISOString(),
    rewardMinutes:Number(ROUND_REWARDS[type]||5),
    penaltyMinutes:0,
    title:'',
    instruction:'',
    challenge:{},
    secretAnswer:'',
    secret:{},
    participants:[],
    attempts:0,
    wrongAttempts:{},
    winner:null,
    nextRoundAt:''
  };
}

function roundBuildChallenge_(sessionId,index,type) {
  const base=roundBase_(type,index);
  const act=base.act;
  const now=Date.now();

  if(type==='reaction'){
    const unlockMs=now+(6+Math.floor(Math.random()*8))*1000;
    base.title='Reflexo do Gato';
    base.instruction='Espere o sorriso acender. O primeiro clique válido vence.';
    base.challenge={unlockAt:new Date(unlockMs).toISOString()};
    base.secretAnswer='__REACTION__';
    base.endsAt=new Date(now+ROUND_CFG.reactionDurationSec*1000).toISOString();
  }

  else if(type==='hunt'){
    const size=act===1?20:(act===2?30:42);
    const target=Math.floor(Math.random()*size);
    base.title='Caça ao Coelho';
    base.instruction='Encontre o Coelho Branco antes que alguém o capture.';
    base.challenge={cells:size,targetIndex:target,decoys:act>=2};
    base.secretAnswer='cell:'+target;
  }

  else if(type==='odd'){
    const cols=act===1?5:(act===2?7:9);
    const rows=cols;
    const target=Math.floor(Math.random()*(cols*rows));
    const themes=[
      {normal:'😼',odd:'😺'},
      {normal:'♠',odd:'♣'},
      {normal:'🌙',odd:'🌘'},
      {normal:'🖤',odd:'💜'},
      {normal:'☕',odd:'🍵'}
    ];
    const theme=themes[Math.floor(Math.random()*themes.length)];
    base.title='Ache o Diferente';
    base.instruction='Só um símbolo não pertence ao padrão. Seja o primeiro a tocar nele.';
    base.challenge={cols:cols,rows:rows,normal:theme.normal,odd:theme.odd,targetIndex:target};
    base.secretAnswer='cell:'+target;
  }

  else if(type==='flash'){
    const words=['CHESHIRE','WONDERLAND','RAINHADEHEARTS','COELHOBRANCO','MUNDOLouco','ESPELHOMALUCO','RELÓGIODACOELHO','GATOSORRIDENTE'];
    const raw=words[Math.floor(Math.random()*words.length)].toUpperCase();
    const visibleMs=act===1?2600:(act===2?1900:1400);
    base.title='Digite Antes que Suma';
    base.instruction='Memorize a palavra. Ela vai desaparecer para todos ao mesmo tempo.';
    base.challenge={flashText:raw,hideAt:new Date(now+visibleMs).toISOString(),length:raw.length};
    base.secretAnswer=raw;
  }

  else if(type==='scramble'){
    const easy=['COELHO','CARTAS','RAINHA','SORRISO','ESPELHO','RELOGIO'];
    const hard=['WONDERLAND','CHESHIRE','LABIRINTO','ABISMO','LOUCURA','CHAPELEIRO'];
    const pool=act===1?easy:easy.concat(hard);
    const word=pool[Math.floor(Math.random()*pool.length)];
    base.title='Palavra Embaralhada';
    base.instruction='Desembaralhe a palavra do Mundo Louco.';
    base.challenge={prompt:roundShuffleText_(word),letters:word.length};
    base.secretAnswer=word;
  }

  else if(type==='sequence'){
    const mode=Math.random()<0.5?'linear':'growing';
    let shown,answer;
    if(mode==='linear'){
      const start=2+Math.floor(Math.random()*9);
      const step=2+Math.floor(Math.random()*(act===1?6:10));
      shown=[0,1,2,3].map(i=>start+step*i);
      answer=start+step*4;
    }else{
      const start=1+Math.floor(Math.random()*5);
      const first=1+Math.floor(Math.random()*4);
      shown=[start];
      let cur=start;
      for(let i=0;i<3;i++){cur+=first+i+1;shown.push(cur);}
      answer=cur+first+4;
    }
    base.title='Sequência Maluca';
    base.instruction='Descubra qual número vem depois.';
    base.challenge={prompt:shown.join('  ·  ')+'  ·  ?'};
    base.secretAnswer=String(answer);
  }

  else if(type==='math'){
    const a=5+Math.floor(Math.random()*(act===1?10:18));
    const b=2+Math.floor(Math.random()*9);
    const c=2+Math.floor(Math.random()*10);
    const d=act>=2?2+Math.floor(Math.random()*5):0;
    const answer=act>=2?(a*b+c-d):(a*b+c);
    base.title='Conta da Rainha';
    base.instruction='Resolva antes dos súditos. Vale a ordem normal das operações.';
    base.challenge={prompt:act>=2?(a+' × '+b+' + '+c+' − '+d+' = ?'):(a+' × '+b+' + '+c+' = ?')};
    base.secretAnswer=String(answer);
  }

  else if(type==='memory'){
    const symbols=['♛','🐇','😼','☕','🗝️','♠','🌙','♥','🎩','🕰️','🃏','♦'];
    const cells=act===1?8:12;
    const selected=roundShuffleArray_(symbols).slice(0,cells);
    const targetIndex=Math.floor(Math.random()*cells);
    const targetSymbol=selected[targetIndex];
    const revealMs=act===1?5500:(act===2?4300:3300);
    base.title='Memória de Cartas';
    base.instruction='Memorize as cartas. Quando virarem, encontre o símbolo pedido.';
    base.challenge={
      cards:selected,
      targetSymbol:targetSymbol,
      targetIndex:targetIndex,
      revealUntil:new Date(now+revealMs).toISOString()
    };
    base.secretAnswer='cell:'+targetIndex;
  }

  else if(type==='caesar'){
    const easy=['GATO','TEMPO','COELHO','CHAVE','CARTAS','RAINHA','SORRISO'];
    const hard=['CHESHIRE','ABISMO','ESPELHO','LOUCURA','WONDERLAND','CHAPELEIRO'];
    const pool=act>=3?hard:easy.concat(hard);
    const word=pool[Math.floor(Math.random()*pool.length)];
    const shift=act===1?(1+Math.floor(Math.random()*3)):(2+Math.floor(Math.random()*6));
    base.title='Código do Cheshire';
    base.instruction=act>=3
      ? 'O gato avançou '+shift+' passos no alfabeto. Traga a palavra de volta.'
      : 'Cada letra avançou '+shift+' casa(s). Descubra a palavra original.';
    base.challenge={prompt:roundCaesar_(word,shift),hint:'volte '+shift+' no alfabeto'};
    base.secretAnswer=word;
  }

  else if(type==='maze'){
    const maze=roundGenerateMaze_(9,9);
    base.title='Labirinto do Abismo';
    base.instruction='Atravesse o labirinto. Setas/WASD no PC ou botões no celular.';
    base.challenge={cols:maze.cols,rows:maze.rows,open:maze.open,start:maze.start,goal:maze.goal};
    base.secret={maze:maze};
  }

  else if(type==='puzzle'){
    const puzzle=roundGeneratePuzzle_(4,70);
    base.title='Puzzle Deslizante';
    base.instruction='Reconstrua o quadro 4×4. O primeiro puzzle válido adiciona 25 minutos.';
    base.challenge={size:4,board:puzzle.board};
    base.secret={puzzleStart:puzzle.board.slice()};
  }

  else if(type==='queen'){
    const goodDoor=Math.random()<0.5?'A':'B';
    base.title='Escolha da Rainha';
    base.instruction='Uma porta adiciona 15 minutos. A outra rouba 10 minutos conquistados. A primeira escolha vale para todos.';
    base.challenge={doors:['A','B']};
    base.secret={goodDoor:goodDoor};
    base.penaltyMinutes=-10;
  }

  return base;
}

function roundGenerateMaze_(cols,rows){
  const total=cols*rows;
  const open={};
  let x=0,y=0;
  open[0]=true;
  while(x<cols-1 || y<rows-1){
    const canR=x<cols-1,canD=y<rows-1;
    if(canR && canD ? Math.random()<0.5 : canR) x++; else y++;
    open[y*cols+x]=true;
  }
  const targetOpen=Math.floor(total*0.68);
  while(Object.keys(open).length<targetOpen) open[Math.floor(Math.random()*total)]=true;
  return {cols:cols,rows:rows,open:Object.keys(open).map(Number).sort((a,b)=>a-b),start:0,goal:total-1};
}

function roundGeneratePuzzle_(size,moves){
  const total=size*size;
  const board=[];
  for(let i=1;i<total;i++) board.push(i);
  board.push(0);
  let blank=total-1,last=-1;
  for(let k=0;k<moves;k++){
    const x=blank%size,y=Math.floor(blank/size);
    const options=[];
    if(x>0)options.push(blank-1);
    if(x<size-1)options.push(blank+1);
    if(y>0)options.push(blank-size);
    if(y<size-1)options.push(blank+size);
    const filtered=options.filter(v=>v!==last);
    const pool=filtered.length?filtered:options;
    const next=pool[Math.floor(Math.random()*pool.length)];
    board[blank]=board[next];board[next]=0;
    last=blank;blank=next;
  }
  return {board:board};
}

function roundValidateMaze_(round,path){
  const maze=round.secret&&round.secret.maze;
  if(!maze)return false;
  let pos=maze.start;
  const open={};maze.open.forEach(i=>open[i]=true);
  const moves=String(path||'').toUpperCase().replace(/[^UDLR]/g,'').slice(0,800);
  for(let i=0;i<moves.length;i++){
    const x=pos%maze.cols,y=Math.floor(pos/maze.cols);
    let next=pos;
    if(moves[i]==='U'&&y>0)next=pos-maze.cols;
    if(moves[i]==='D'&&y<maze.rows-1)next=pos+maze.cols;
    if(moves[i]==='L'&&x>0)next=pos-1;
    if(moves[i]==='R'&&x<maze.cols-1)next=pos+1;
    if(next===pos||!open[next])return false;
    pos=next;
  }
  return pos===maze.goal;
}

function roundValidatePuzzle_(round,path){
  const start=round.secret&&round.secret.puzzleStart;
  if(!Array.isArray(start))return false;
  const board=start.slice(),size=4;
  let blank=board.indexOf(0);
  const moves=String(path||'').toUpperCase().replace(/[^UDLR]/g,'').slice(0,1200);
  for(let i=0;i<moves.length;i++){
    const x=blank%size,y=Math.floor(blank/size);
    let tile=-1;
    if(moves[i]==='U'&&y<size-1)tile=blank+size;
    if(moves[i]==='D'&&y>0)tile=blank-size;
    if(moves[i]==='L'&&x<size-1)tile=blank+1;
    if(moves[i]==='R'&&x>0)tile=blank-1;
    if(tile<0)return false;
    board[blank]=board[tile];board[tile]=0;blank=tile;
  }
  for(let i=0;i<board.length-1;i++)if(board[i]!==i+1)return false;
  return board[board.length-1]===0;
}

function roundStartNext_(state,sessionId){
  if(!Array.isArray(state.deck)||!state.deck.length)state.deck=roundBuildDeck_();
  const nextIndex=Number(state.index||0)+1;
  if(nextIndex>state.deck.length){
    state.current=null;
    state.completedAt=stamp_();
    roundSave_(state);
    event_('round_deck_complete',sessionId,'round','23 rodadas concluídas',0);
    return null;
  }
  state.index=nextIndex;
  state.current=roundBuildChallenge_(sessionId,nextIndex,state.deck[nextIndex-1]);
  event_('round_start',sessionId,'round',state.current.roundId+'|'+state.current.type,state.current.rewardMinutes);
  roundSave_(state);
  return state.current;
}

function roundTick_(){
  const active=activeSession_();if(!active)return;
  const sessionId=String(active.values[0]);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(2500))return;
  try{roundTickNoLock_(sessionId);}finally{lock.releaseLock();}
}

function roundTickNoLock_(sessionId){
  const state=roundEnsure_(sessionId),round=state.current,now=Date.now();
  if(!round){
    if(Number(state.index||0)<(state.deck||[]).length)roundStartNext_(state,sessionId);
    return;
  }
  if(round.status==='active'&&now>=new Date(round.endsAt).getTime()){
    round.status='expired';round.expiredAt=stamp_();
    round.nextRoundAt=new Date(now+ROUND_CFG.nextRoundDelaySec*1000).toISOString();
    event_('round_expired',sessionId,'round',round.roundId,0);
    roundSave_(state);return;
  }
  if(round.status!=='active'&&round.nextRoundAt&&now>=new Date(round.nextRoundAt).getTime()){
    roundStartNext_(state,sessionId);
  }
}

function roundAddParticipant_(round,visitorId){
  const key=roundHashVisitor_(visitorId);
  if(!Array.isArray(round.participants))round.participants=[];
  if(round.participants.indexOf(key)<0&&round.participants.length<ROUND_CFG.maxTrackedPlayers)round.participants.push(key);
  return key;
}

function roundJoin_(visitorId,roundId){
  visitorId=String(visitorId||'').slice(0,120);roundId=String(roundId||'').slice(0,80);
  if(!visitorId)throw new Error('invalid_visitor');
  const active=activeSession_();if(!active)throw new Error('offline');
  const sessionId=String(active.values[0]),lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))throw new Error('busy');
  try{
    roundTickNoLock_(sessionId);
    const state=roundEnsure_(sessionId),round=state.current;
    if(!round||round.roundId!==roundId||round.status!=='active')return{joined:false,round:roundPublicStateFromState_(state)};
    roundAddParticipant_(round,visitorId);roundSave_(state);
    return{joined:true,round:roundPublicStateFromState_(state)};
  }finally{lock.releaseLock();}
}

function roundResolveAmount_(sessionId,requested){
  const cfg=config_(),before=stats_(sessionId),amount=Number(requested||0);
  if(amount>=0){
    const allowance=Math.max(0,Number(cfg.maxBonusMinutes||240)-Number(before.gained||0));
    return Math.min(amount,allowance);
  }
  return -Math.min(Math.abs(amount),Number(before.gained||0));
}

function roundSubmit_(visitorId,roundId,answer,displayName){
  visitorId=String(visitorId||'').slice(0,120);
  roundId=String(roundId||'').slice(0,80);
  displayName=truncate_(String(displayName||'').trim(),24);
  answer=String(answer||'').slice(0,1600);
  if(!visitorId)throw new Error('invalid_visitor');

  const active=activeSession_();if(!active)throw new Error('offline');
  const sessionId=String(active.values[0]),lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('busy');

  try{
    roundTickNoLock_(sessionId);
    const state=roundEnsure_(sessionId),round=state.current;
    if(!round||round.roundId!==roundId)return{accepted:false,reason:'stale_round',round:roundPublicStateFromState_(state)};
    if(round.status!=='active')return{accepted:false,reason:'round_closed',round:roundPublicStateFromState_(state)};

    const playerKey=roundAddParticipant_(round,visitorId);
    round.attempts=Number(round.attempts||0)+1;
    if(!round.wrongAttempts)round.wrongAttempts={};
    const wrong=Number(round.wrongAttempts[playerKey]||0);
    if(wrong>=ROUND_CFG.maxWrongAttemptsPerPlayer){
      roundSave_(state);
      return{accepted:false,reason:'attempt_limit',round:roundPublicStateFromState_(state)};
    }

    let correct=false,selectedDoor='',requested=Number(round.rewardMinutes||0);

    if(round.type==='reaction'){
      if(Date.now()<new Date(round.challenge.unlockAt).getTime()){
        round.wrongAttempts[playerKey]=wrong+1;roundSave_(state);
        return{accepted:false,reason:'too_soon',round:roundPublicStateFromState_(state)};
      }
      correct=true;
    }else if(round.type==='maze'){
      correct=roundValidateMaze_(round,answer);
    }else if(round.type==='puzzle'){
      correct=roundValidatePuzzle_(round,answer);
    }else if(round.type==='queen'){
      selectedDoor=String(answer||'').trim().toUpperCase();
      if(!['A','B'].includes(selectedDoor)){
        round.wrongAttempts[playerKey]=wrong+1;roundSave_(state);
        return{accepted:false,reason:'wrong',round:roundPublicStateFromState_(state)};
      }
      correct=true;
      requested=selectedDoor===round.secret.goodDoor ? round.rewardMinutes : round.penaltyMinutes;
    }else{
      correct=roundNormalize_(answer)===roundNormalize_(round.secretAnswer);
    }

    if(!correct){
      round.wrongAttempts[playerKey]=wrong+1;roundSave_(state);
      return{accepted:false,reason:'wrong',round:roundPublicStateFromState_(state)};
    }

    const awarded=roundResolveAmount_(sessionId,requested);
    if(awarded>0)event_('round_bonus',sessionId,'round',round.roundId+'|'+round.type,awarded);
    if(awarded<0)event_('round_penalty',sessionId,'round',round.roundId+'|'+round.type,awarded);

    const publicName=displayName||('Visitante '+playerKey.slice(0,4).toUpperCase());
    round.status='won';
    round.winner={
      name:publicName,playerKey:playerKey,at:stamp_(),
      awardedMinutes:awarded,
      selectedDoor:selectedDoor,
      queenResult:round.type==='queen'?(awarded>=0?'bonus':'penalty'):''
    };
    round.wonAt=stamp_();
    round.nextRoundAt=new Date(Date.now()+ROUND_CFG.nextRoundDelaySec*1000).toISOString();
    state.lastWinner=round.winner;
    event_('round_won',sessionId,'round',publicName+'|'+round.roundId,awarded);
    roundSave_(state);
    syncLiveRow_(activeSession_());updatePanel_();

    return{accepted:true,won:true,awardedMinutes:awarded,queenResult:round.winner.queenResult,round:roundPublicStateFromState_(state)};
  }finally{lock.releaseLock();}
}

function roundPublicStateFromState_(state){
  if(!state)return null;
  const r=state.current;
  if(!r)return{
    stateVersion:Number(state.stateVersion||0),
    deckComplete:true,
    index:Number(state.index||0),
    totalRounds:Array.isArray(state.deck)?state.deck.length:23
  };
  return{
    stateVersion:Number(state.stateVersion||0),
    deckComplete:false,
    roundId:r.roundId,
    index:Number(r.index||0),
    totalRounds:Array.isArray(state.deck)?state.deck.length:23,
    act:Number(r.act||1),
    type:r.type,
    status:r.status,
    startedAt:r.startedAt,
    endsAt:r.endsAt,
    nextRoundAt:r.nextRoundAt||'',
    rewardMinutes:Number(r.rewardMinutes||0),
    penaltyMinutes:Number(r.penaltyMinutes||0),
    title:r.title,
    instruction:r.instruction,
    challenge:r.challenge||{},
    participants:Array.isArray(r.participants)?r.participants.length:0,
    attempts:Number(r.attempts||0),
    winner:r.winner?{
      name:r.winner.name,
      at:r.winner.at,
      awardedMinutes:Number(r.winner.awardedMinutes||0),
      selectedDoor:r.winner.selectedDoor||'',
      queenResult:r.winner.queenResult||''
    }:null
  };
}

function roundPublicState_(sessionId){
  if(!sessionId)return null;
  return roundPublicStateFromState_(roundEnsure_(sessionId));
}
