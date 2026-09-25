(() => {
  const local = { roundId:'', mazePos:0, mazeMoves:'', puzzleBoard:[], puzzleMoves:'', round:null, submit:null };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const icons = {
    reaction:'⚡',hunt:'🐇',odd:'👁️',flash:'💨',scramble:'🔤',sequence:'🔢',
    math:'♛',memory:'🃏',caesar:'😼',maze:'🌀',puzzle:'🧩',queen:'🚪'
  };

  function meta(r) {
    const pct=Math.max(0,Math.min(100,Math.round((Number(r.index||1)-1)/Math.max(1,Number(r.totalRounds||23))*100)));
    return '<div class="game-progress"><i style="width:'+pct+'%"></i></div>'+
      '<div class="play-stats"><span>ATO '+esc(r.act||1)+'</span><span id="play-players">'+esc(r.participants||0)+' participando</span>'+
      '<span>+'+esc(r.rewardMinutes||0)+' min</span><span id="play-round-clock">--:--</span></div>';
  }

  function shell(r,body) {
    return '<section class="card challenge game-card" data-round-id="'+esc(r.roundId)+'">'+
      '<span class="eyebrow">RODADA '+esc(r.index)+' / '+esc(r.totalRounds||23)+'</span>'+
      '<div class="challenge-icon">'+(icons[r.type]||'♠')+'</div>'+
      '<h1>'+esc(r.title)+'</h1><p>'+esc(r.instruction)+'</p>'+
      body+'<div class="feedback" id="play-feedback"></div>'+meta(r)+'</section>';
  }

  function answerForm(placeholder='Sua resposta') {
    return '<form class="challenge-form" id="answer-form"><input class="answer-input" id="answer-input" autocomplete="off" placeholder="'+esc(placeholder)+'" maxlength="120" required><button class="btn primary" type="submit">Responder</button></form>';
  }

  function renderText(r) {
    return shell(r,'<div class="challenge-prompt">'+esc(r.challenge?.prompt||'???')+'</div>'+answerForm());
  }

  function renderReaction(r) {
    return shell(r,'<div class="reaction-zone"><button class="reaction-btn" id="reaction-btn" type="button" disabled>ESPERE…</button></div>');
  }

  function renderHunt(r) {
    const cells=Array.isArray(r.challenge?.cells)?r.challenge.cells:[];
    return shell(r,'<div class="hunt-grid">'+cells.map((v,i)=>
      '<button type="button" class="hunt-cell '+(v==='🐇'?'rabbit':'')+'" data-game-answer="cell:'+i+'" aria-label="posição '+(i+1)+'">'+esc(v)+'</button>'
    ).join('')+'</div>');
  }

  function renderOdd(r) {
    const cols=Number(r.challenge?.cols||5),cells=Array.isArray(r.challenge?.cells)?r.challenge.cells:[];
    return shell(r,'<div class="odd-grid" style="--game-cols:'+cols+'">'+cells.map((v,i)=>
      '<button type="button" class="odd-cell" data-game-answer="cell:'+i+'">'+esc(v)+'</button>'
    ).join('')+'</div>');
  }

  function renderFlash(r) {
    const hidden=Date.now()>=new Date(r.challenge?.hideAt||0).getTime();
    return shell(r,
      '<div class="flash-stage '+(hidden?'is-hidden':'')+'" id="flash-stage">'+
        '<div class="flash-word" id="flash-word">'+(hidden?'••••••••':esc(r.challenge?.flashText||''))+'</div>'+
        '<small>'+(hidden?'Agora digite o que você viu.':'Memorize. Vai sumir para todos ao mesmo tempo.')+'</small>'+
      '</div>'+
      '<div id="flash-answer" '+(hidden?'':'hidden')+'>'+answerForm('O que apareceu?')+'</div>'
    );
  }

  function renderMemory(r) {
    const cards=Array.isArray(r.challenge?.cards)?r.challenge.cards:[];
    const hidden=Date.now()>=new Date(r.challenge?.revealUntil||0).getTime();
    return shell(r,
      '<div class="memory-target">Depois que virar: encontre <strong>'+esc(r.challenge?.targetSymbol||'?')+'</strong></div>'+
      '<div class="memory-grid" id="memory-grid">'+cards.map((v,i)=>
        '<button type="button" class="memory-card '+(hidden?'is-hidden':'')+'" data-memory-index="'+i+'" data-game-answer="cell:'+i+'" '+(hidden?'':'disabled')+'>'+
        '<span class="card-face">'+(hidden?'?':esc(v))+'</span></button>'
      ).join('')+'</div>'
    );
  }

  function renderQueen(r) {
    return shell(r,
      '<div class="queen-warning">Uma escolha. Para todo mundo.</div>'+
      '<div class="queen-doors">'+
        '<button type="button" class="queen-door" data-game-answer="A"><span>🚪</span><strong>PORTA A</strong><small>+15 ou −10 min</small></button>'+
        '<button type="button" class="queen-door" data-game-answer="B"><span>🚪</span><strong>PORTA B</strong><small>+15 ou −10 min</small></button>'+
      '</div>'
    );
  }

  function renderMaze(r) {
    const c=r.challenge||{},cols=Number(c.cols||9),rows=Number(c.rows||9),open=new Set(c.open||[]);
    let html='<div class="maze-board" id="maze-board" style="--maze-cols:'+cols+'">';
    for(let i=0;i<cols*rows;i++){
      const isOpen=open.has(i);
      html+='<div class="maze-cell '+(isOpen?'open':'wall')+'" data-maze-cell="'+i+'">'+(i===c.start?'😼':i===c.goal?'🚪':'')+'</div>';
    }
    html+='</div><div class="maze-controls">'+
      '<button type="button" data-maze-move="U">↑</button>'+
      '<div><button type="button" data-maze-move="L">←</button><button type="button" data-maze-move="D">↓</button><button type="button" data-maze-move="R">→</button></div>'+
      '</div><small class="game-help">PC: use WASD ou setas.</small>';
    return shell(r,html);
  }

  function renderPuzzle(r) {
    const board=Array.isArray(r.challenge?.board)?r.challenge.board:[];
    return shell(r,
      '<div class="puzzle-board" id="puzzle-board">'+board.map((v,i)=>
        '<button type="button" class="puzzle-tile '+(v===0?'blank':'')+'" data-puzzle-index="'+i+'" '+(v===0?'disabled':'')+'>'+(v===0?'':esc(v))+'</button>'
      ).join('')+'</div><small class="game-help">Organize 1 → 15, deixando o último espaço vazio.</small>'
    );
  }

  function render(r) {
    if(!r)return '';
    if(['scramble','sequence','math','caesar'].includes(r.type))return renderText(r);
    if(r.type==='reaction')return renderReaction(r);
    if(r.type==='hunt')return renderHunt(r);
    if(r.type==='odd')return renderOdd(r);
    if(r.type==='flash')return renderFlash(r);
    if(r.type==='memory')return renderMemory(r);
    if(r.type==='maze')return renderMaze(r);
    if(r.type==='puzzle')return renderPuzzle(r);
    if(r.type==='queen')return renderQueen(r);
    return renderText(r);
  }

  function mount(r,submit) {
    local.round=r;local.submit=submit;
    if(local.roundId!==r.roundId){
      local.roundId=r.roundId;
      local.mazePos=Number(r.challenge?.start||0);local.mazeMoves='';
      local.puzzleBoard=Array.isArray(r.challenge?.board)?r.challenge.board.slice():[];
      local.puzzleMoves='';
    }
    const root=document.getElementById('play-root');
    if(!root)return;
    root.onclick=(e)=>{
      const answer=e.target.closest('[data-game-answer]');
      if(answer && !answer.disabled){submit(r,answer.dataset.gameAnswer);return;}
      const maze=e.target.closest('[data-maze-move]');
      if(maze){moveMaze(maze.dataset.mazeMove);return;}
      const tile=e.target.closest('[data-puzzle-index]');
      if(tile){movePuzzle(Number(tile.dataset.puzzleIndex));}
    };
    root.onsubmit=(e)=>{
      if(e.target.id!=='answer-form')return;
      e.preventDefault();
      const input=document.getElementById('answer-input');
      const value=input?.value||'';
      if(input)input.value='';
      submit(r,value);
    };
    drawMaze();
    drawPuzzle();
    tick(r);
  }

  function moveMaze(dir) {
    const r=local.round;if(!r||r.type!=='maze')return;
    const c=r.challenge||{},cols=Number(c.cols||9),rows=Number(c.rows||9),open=new Set(c.open||[]);
    const pos=local.mazePos,x=pos%cols,y=Math.floor(pos/cols);
    let next=pos;
    if(dir==='U'&&y>0)next=pos-cols;
    if(dir==='D'&&y<rows-1)next=pos+cols;
    if(dir==='L'&&x>0)next=pos-1;
    if(dir==='R'&&x<cols-1)next=pos+1;
    if(next===pos||!open.has(next))return;
    local.mazePos=next;local.mazeMoves+=dir;drawMaze();
    if(next===Number(c.goal))local.submit(r,local.mazeMoves);
  }

  function drawMaze() {
    const r=local.round;if(!r||r.type!=='maze')return;
    document.querySelectorAll('[data-maze-cell]').forEach(el=>{
      const idx=Number(el.dataset.mazeCell);
      el.classList.toggle('player',idx===local.mazePos);
      if(idx===local.mazePos)el.textContent='😼';
      else if(idx===Number(r.challenge.goal))el.textContent='🚪';
      else el.textContent='';
    });
  }

  function movePuzzle(index) {
    const r=local.round;if(!r||r.type!=='puzzle')return;
    const board=local.puzzleBoard,size=4,blank=board.indexOf(0);
    const bx=blank%size,by=Math.floor(blank/size),tx=index%size,ty=Math.floor(index/size);
    if(Math.abs(bx-tx)+Math.abs(by-ty)!==1)return;
    let move='';
    if(index===blank+size)move='U';
    else if(index===blank-size)move='D';
    else if(index===blank+1)move='L';
    else if(index===blank-1)move='R';
    if(!move)return;
    board[blank]=board[index];board[index]=0;local.puzzleMoves+=move;drawPuzzle();
    if(isPuzzleSolved(board))local.submit(r,local.puzzleMoves);
  }

  function drawPuzzle() {
    const r=local.round;if(!r||r.type!=='puzzle')return;
    const board=document.getElementById('puzzle-board');if(!board)return;
    board.innerHTML=local.puzzleBoard.map((v,i)=>
      '<button type="button" class="puzzle-tile '+(v===0?'blank':'')+'" data-puzzle-index="'+i+'" '+(v===0?'disabled':'')+'>'+(v===0?'':esc(v))+'</button>'
    ).join('');
  }

  function isPuzzleSolved(board) {
    if(!Array.isArray(board)||board.length!==16)return false;
    for(let i=0;i<15;i++)if(board[i]!==i+1)return false;
    return board[15]===0;
  }

  function tick(r) {
    if(!r||r.status!=='active')return;
    if(r.type==='reaction'){
      const btn=document.getElementById('reaction-btn');if(!btn)return;
      const ready=Date.now()>=new Date(r.challenge?.unlockAt||0).getTime();
      btn.disabled=!ready;btn.classList.toggle('ready',ready);btn.textContent=ready?'CLIQUE AGORA!':'ESPERE…';
    }
    if(r.type==='memory'){
      const hidden=Date.now()>=new Date(r.challenge?.revealUntil||0).getTime();
      if(hidden)document.querySelectorAll('.memory-card').forEach(card=>{
        card.disabled=false;card.classList.add('is-hidden');
        const face=card.querySelector('.card-face');if(face)face.textContent='?';
      });
    }
    if(r.type==='flash'){
      const hidden=Date.now()>=new Date(r.challenge?.hideAt||0).getTime();
      const stage=document.getElementById('flash-stage'),word=document.getElementById('flash-word'),answer=document.getElementById('flash-answer');
      if(hidden&&stage){
        stage.classList.add('is-hidden');
        if(word)word.textContent='••••••••';
        if(answer)answer.hidden=false;
      }
    }
  }

  document.addEventListener('keydown',(e)=>{
    if(!local.round||local.round.type!=='maze'||local.round.status!=='active')return;
    const tag=(document.activeElement?.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea')return;
    const map={ArrowUp:'U',w:'U',W:'U',ArrowDown:'D',s:'D',S:'D',ArrowLeft:'L',a:'L',A:'L',ArrowRight:'R',d:'R',D:'R'};
    const dir=map[e.key];if(!dir)return;
    e.preventDefault();moveMaze(dir);
  });

  window.NihilGuhGameUI={render,mount,tick};
})();