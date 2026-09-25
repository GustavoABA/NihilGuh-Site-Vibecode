/**
 * NihilGuh — Round Engine
 * Minigames competitivos por live. O Apps Script é autoritativo:
 * - uma rodada ativa por sessão;
 * - resposta nunca é enviada ao frontend;
 * - primeiro acerto válido vence sob ScriptLock;
 * - prêmio respeita o teto de bônus configurado para a live;
 * - próxima rodada nasce automaticamente.
 */
const ROUND_PROP = 'NIHILGUH_ROUND_STATE_V1';
const ROUND_CFG = {
  roundDurationSec: 4 * 60,
  reactionDurationSec: 75,
  nextRoundDelaySec: 9,
  maxWrongAttemptsPerPlayer: 20,
  maxTrackedPlayers: 250
};

function roundSessionStart_(sessionId, startedAt) {
  if (!sessionId) return;
  const state = {
    version:1,
    sessionId:String(sessionId),
    index:0,
    current:null,
    lastWinner:null,
    startedAt:new Date(startedAt || now_()).toISOString(),
    updatedAt:stamp_()
  };
  roundSave_(state);
  roundStartNext_(state, String(sessionId));
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

function roundLoad_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(ROUND_PROP);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function roundSave_(state) {
  if (!state) return;
  state.updatedAt = stamp_();
  PropertiesService.getScriptProperties().setProperty(ROUND_PROP, JSON.stringify(state));
}

function roundEnsure_(sessionId) {
  let state = roundLoad_();
  if (!state || state.sessionId !== String(sessionId || '')) {
    const active = activeSession_();
    const startedAt = active && String(active.values[0]) === String(sessionId) ? active.values[2] : now_();
    roundSessionStart_(sessionId, startedAt);
    state = roundLoad_();
  }
  return state;
}

function roundHashVisitor_(visitorId) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(visitorId || ''));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'').slice(0,12);
}

function roundNormalize_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g,'');
}

function roundShuffle_(text) {
  const chars = String(text).split('');
  for (let i=chars.length-1; i>0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    const t = chars[i]; chars[i] = chars[j]; chars[j] = t;
  }
  const out = chars.join('');
  return out === text && chars.length > 1 ? chars.slice(1).concat(chars[0]).join('') : out;
}

function roundCaesar_(text, shift) {
  return String(text).toUpperCase().replace(/[A-Z]/g, ch => {
    const n = ch.charCodeAt(0) - 65;
    return String.fromCharCode(65 + ((n + shift + 26) % 26));
  });
}

function roundBuildChallenge_(sessionId, index) {
  const types = ['sequence','math','scramble','caesar','reaction'];
  const type = types[Math.abs(Number(index || 0)) % types.length];
  const now = Date.now();
  const base = {
    roundId:'round_' + Utilities.getUuid().slice(0,10),
    index:Number(index || 1),
    type,
    status:'active',
    startedAt:new Date(now).toISOString(),
    endsAt:new Date(now + ROUND_CFG.roundDurationSec*1000).toISOString(),
    rewardMinutes:5,
    title:'',
    instruction:'',
    challenge:{},
    secretAnswer:'',
    participants:[],
    attempts:0,
    wrongAttempts:{},
    winner:null,
    nextRoundAt:''
  };

  if (type === 'sequence') {
    const start = 2 + Math.floor(Math.random()*7);
    const step = 2 + Math.floor(Math.random()*8);
    const shown = [0,1,2,3].map(i => start + step*i);
    base.title = 'Sequência do Coelho';
    base.instruction = 'Descubra o próximo número antes de todo mundo.';
    base.challenge = { prompt:shown.join(' · ') + ' · ?' };
    base.secretAnswer = String(start + step*4);
    base.rewardMinutes = 5;
  } else if (type === 'math') {
    const a = 4 + Math.floor(Math.random()*12);
    const b = 3 + Math.floor(Math.random()*9);
    const c = 2 + Math.floor(Math.random()*8);
    base.title = 'Conta da Rainha';
    base.instruction = 'Resolva a conta. Vale a ordem normal das operações.';
    base.challenge = { prompt:a + ' × ' + b + ' + ' + c + ' = ?' };
    base.secretAnswer = String(a*b+c);
    base.rewardMinutes = 5;
  } else if (type === 'scramble') {
    const words = ['wonderland','cheshire','coelho','rainha','cartas','abismo','caos','relogio','espelho','loucura'];
    const word = words[Math.floor(Math.random()*words.length)];
    base.title = 'Palavra Embaralhada';
    base.instruction = 'Desembaralhe a palavra do Mundo Louco.';
    base.challenge = { prompt:roundShuffle_(word.toUpperCase()), letters:word.length };
    base.secretAnswer = word;
    base.rewardMinutes = 10;
  } else if (type === 'caesar') {
    const words = ['COELHO','CHAVE','CARTAS','GATO','CAOS','TEMPO','ABISMO','SORRISO'];
    const word = words[Math.floor(Math.random()*words.length)];
    const shift = 1 + Math.floor(Math.random()*5);
    base.title = 'Código do Cheshire';
    base.instruction = 'Cada letra avançou ' + shift + ' casa(s) no alfabeto. Descubra a palavra original.';
    base.challenge = { prompt:roundCaesar_(word, shift), shift };
    base.secretAnswer = word;
    base.rewardMinutes = 10;
  } else {
    const unlockMs = now + (7 + Math.floor(Math.random()*7))*1000;
    base.title = 'Sorriso Relâmpago';
    base.instruction = 'Espere o sinal. O primeiro clique válido vence.';
    base.challenge = { unlockAt:new Date(unlockMs).toISOString() };
    base.secretAnswer = '__REACTION__';
    base.endsAt = new Date(now + ROUND_CFG.reactionDurationSec*1000).toISOString();
    base.rewardMinutes = 5;
  }

  return base;
}

function roundStartNext_(state, sessionId) {
  state.index = Number(state.index || 0) + 1;
  state.current = roundBuildChallenge_(sessionId, state.index);
  event_('round_start', sessionId, 'round', state.current.roundId + '|' + state.current.type, state.current.rewardMinutes);
  roundSave_(state);
  return state.current;
}

function roundTick_() {
  const active = activeSession_();
  if (!active) return;
  const sessionId = String(active.values[0]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2500)) return;
  try {
    const state = roundEnsure_(sessionId);
    const round = state.current;
    const now = Date.now();

    if (!round) {
      roundStartNext_(state, sessionId);
      return;
    }

    if (round.status === 'active' && now >= new Date(round.endsAt).getTime()) {
      round.status = 'expired';
      round.expiredAt = stamp_();
      round.nextRoundAt = new Date(now + ROUND_CFG.nextRoundDelaySec*1000).toISOString();
      event_('round_expired', sessionId, 'round', round.roundId, 0);
      roundSave_(state);
      return;
    }

    if (round.status !== 'active' && round.nextRoundAt && now >= new Date(round.nextRoundAt).getTime()) {
      roundStartNext_(state, sessionId);
    }
  } finally {
    lock.releaseLock();
  }
}

function roundAddParticipant_(round, visitorId) {
  const key = roundHashVisitor_(visitorId);
  if (!Array.isArray(round.participants)) round.participants = [];
  if (round.participants.indexOf(key) < 0 && round.participants.length < ROUND_CFG.maxTrackedPlayers) {
    round.participants.push(key);
  }
  return key;
}

function roundJoin_(visitorId, roundId) {
  visitorId = String(visitorId || '').slice(0,120);
  roundId = String(roundId || '').slice(0,80);
  if (!visitorId) throw new Error('invalid_visitor');
  const active = activeSession_();
  if (!active) throw new Error('offline');
  const sessionId = String(active.values[0]);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('busy');
  try {
    roundTickNoLock_(sessionId);
    const state = roundEnsure_(sessionId);
    const round = state.current;
    if (!round || round.roundId !== roundId || round.status !== 'active') return { joined:false, round:roundPublicState_(sessionId) };
    roundAddParticipant_(round, visitorId);
    roundSave_(state);
    return { joined:true, round:roundPublicStateFromState_(state) };
  } finally {
    lock.releaseLock();
  }
}

function roundTickNoLock_(sessionId) {
  const state = roundEnsure_(sessionId);
  const round = state.current;
  const now = Date.now();
  if (!round) {
    roundStartNext_(state, sessionId);
    return;
  }
  if (round.status === 'active' && now >= new Date(round.endsAt).getTime()) {
    round.status = 'expired';
    round.expiredAt = stamp_();
    round.nextRoundAt = new Date(now + ROUND_CFG.nextRoundDelaySec*1000).toISOString();
    event_('round_expired', sessionId, 'round', round.roundId, 0);
    roundSave_(state);
  } else if (round.status !== 'active' && round.nextRoundAt && now >= new Date(round.nextRoundAt).getTime()) {
    roundStartNext_(state, sessionId);
  }
}

function roundSubmit_(visitorId, roundId, answer, displayName) {
  visitorId = String(visitorId || '').slice(0,120);
  roundId = String(roundId || '').slice(0,80);
  displayName = truncate_(String(displayName || '').trim(), 24);
  if (!visitorId) throw new Error('invalid_visitor');

  const active = activeSession_();
  if (!active) throw new Error('offline');
  const sessionId = String(active.values[0]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('busy');

  try {
    roundTickNoLock_(sessionId);
    const state = roundEnsure_(sessionId);
    const round = state.current;
    if (!round || round.roundId !== roundId) return {accepted:false, reason:'stale_round', round:roundPublicStateFromState_(state)};
    if (round.status !== 'active') return {accepted:false, reason:'round_closed', round:roundPublicStateFromState_(state)};

    const playerKey = roundAddParticipant_(round, visitorId);
    round.attempts = Number(round.attempts || 0) + 1;
    if (!round.wrongAttempts) round.wrongAttempts = {};
    const wrong = Number(round.wrongAttempts[playerKey] || 0);
    if (wrong >= ROUND_CFG.maxWrongAttemptsPerPlayer) {
      roundSave_(state);
      return {accepted:false, reason:'attempt_limit', round:roundPublicStateFromState_(state)};
    }

    let correct = false;
    if (round.type === 'reaction') {
      const unlockAt = new Date(round.challenge.unlockAt).getTime();
      if (Date.now() < unlockAt) {
        round.wrongAttempts[playerKey] = wrong + 1;
        roundSave_(state);
        return {accepted:false, reason:'too_soon', round:roundPublicStateFromState_(state)};
      }
      correct = true;
    } else {
      correct = roundNormalize_(answer) === roundNormalize_(round.secretAnswer);
    }

    if (!correct) {
      round.wrongAttempts[playerKey] = wrong + 1;
      roundSave_(state);
      return {accepted:false, reason:'wrong', round:roundPublicStateFromState_(state)};
    }

    const cfg = config_();
    const before = stats_(sessionId);
    const allowance = Math.max(0, Number(cfg.maxBonusMinutes || 240) - Number(before.gained || 0));
    const awarded = Math.min(Number(round.rewardMinutes || 0), allowance);
    if (awarded > 0) event_('round_bonus', sessionId, 'round', round.roundId + '|' + round.type, awarded);

    const publicName = displayName || ('Visitante ' + playerKey.slice(0,4).toUpperCase());
    round.status = 'won';
    round.winner = {
      name:publicName,
      playerKey:playerKey,
      at:stamp_(),
      awardedMinutes:awarded
    };
    round.wonAt = stamp_();
    round.nextRoundAt = new Date(Date.now() + ROUND_CFG.nextRoundDelaySec*1000).toISOString();
    state.lastWinner = round.winner;
    event_('round_won', sessionId, 'round', publicName + '|' + round.roundId, awarded);
    roundSave_(state);
    syncLiveRow_(activeSession_());
    updatePanel_();

    return {accepted:true, won:true, awardedMinutes:awarded, round:roundPublicStateFromState_(state)};
  } finally {
    lock.releaseLock();
  }
}

function roundPublicStateFromState_(state) {
  if (!state || !state.current) return null;
  const r = state.current;
  return {
    roundId:r.roundId,
    index:Number(r.index || 0),
    type:r.type,
    status:r.status,
    startedAt:r.startedAt,
    endsAt:r.endsAt,
    nextRoundAt:r.nextRoundAt || '',
    rewardMinutes:Number(r.rewardMinutes || 0),
    title:r.title,
    instruction:r.instruction,
    challenge:r.challenge || {},
    participants:Array.isArray(r.participants) ? r.participants.length : 0,
    attempts:Number(r.attempts || 0),
    winner:r.winner ? {
      name:r.winner.name,
      at:r.winner.at,
      awardedMinutes:Number(r.winner.awardedMinutes || 0)
    } : null
  };
}

function roundPublicState_(sessionId) {
  if (!sessionId) return null;
  return roundPublicStateFromState_(roundEnsure_(sessionId));
}
