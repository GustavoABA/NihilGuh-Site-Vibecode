
/**
 * NihilGuh — Live Interaction Engine
 * Boss do Mundo Louco, Última Chance, Modo Caos, votação, combos,
 * eventos controlados, Morte Súbita, loot e recordes.
 *
 * State is intentionally small and lives in ScriptProperties.
 * Permanent outcomes stay in EVENTOS/LIVES/VISITANTES.
 */
const INTERACTION_PROP = 'NIHILGUH_GAME_STATE_V3';
const INTERACTION_CFG = {
  bossMaxHp: 1000,
  bossDefeatMinutes: 30,
  lastChanceAtSec: 15 * 60,
  lastChanceDurationSec: 10 * 60,
  lastChanceRewardMin: 20,
  suddenDeathEnabled: true,
  suddenDeathDurationSec: 3 * 60,
  suddenDeathRewardMin: 10,
  chaosDurationSec: 12 * 60,
  chaosFirstAfterSec: 45 * 60,
  chaosRepeatMinSec: 55 * 60,
  voteDurationSec: 4 * 60,
  voteFirstAfterSec: 30 * 60,
  voteRepeatSec: 65 * 60,
  randomFirstAfterSec: 55 * 60,
  randomRepeatSec: 70 * 60,
  comboWindowSec: 180,
  comboRewardMin: 5,
  comboMaxAwards: 2
};

const INTERACTION_TIME_EVENTS = [
  'manual_time','livepix_time','boss_bonus','last_chance_bonus',
  'vote_mission_bonus','combo_bonus','sudden_death_bonus',
  'random_bonus','chaos_livepix_bonus','round_bonus'
];

const INTERACTION_RECENT_TYPES = [
  'boss_damage','boss_defeated','goal_complete','combo_bonus',
  'last_chance_start','last_chance_success','last_chance_failed',
  'chaos_start','chaos_end','vote_start','vote_resolved',
  'community_mission_start','community_mission_success','community_mission_failed',
  'random_event_start','random_event_success','random_event_failed',
  'sudden_death_start','sudden_death_success','sudden_death_failed',
  'loot_unlock','stream_growth','stream_support','stream_raid','livepix_donation',
  'round_start','round_won','round_expired'
];

function interactionSessionStart_(sessionId, startedAt) {
  if (!sessionId) return;
  const now = new Date(startedAt || now_()).getTime();
  const game = {
    version:3,
    sessionId:String(sessionId),
    startedAt:new Date(now).toISOString(),
    boss:{
      name:'CHESHIRE DO ABISMO',
      maxHp:INTERACTION_CFG.bossMaxHp,
      hp:INTERACTION_CFG.bossMaxHp,
      defeated:false,
      defeatedAt:''
    },
    chaos:{ active:false, type:'', label:'', startedAt:'', endsAt:'', nextAt:now + INTERACTION_CFG.chaosFirstAfterSec*1000 },
    vote:{ status:'idle', voteId:'', startedAt:'', endsAt:'', options:[], winnerId:'', nextAt:now + INTERACTION_CFG.voteFirstAfterSec*1000 },
    communityMission:null,
    lastChance:{ status:'idle', mission:null, startedAt:'', endsAt:'', triggered:false },
    randomEvent:{ status:'idle', mission:null, startedAt:'', endsAt:'', nextAt:now + INTERACTION_CFG.randomFirstAfterSec*1000 },
    suddenDeath:{ status:'idle', mission:null, startedAt:'', endsAt:'', triggered:false },
    combo:{ recent:[], awards:0, lastAwardAt:'' },
    loot:[],
    ending:false,
    updatedAt:new Date(now).toISOString()
  };
  interactionSave_(game);
  event_('game_start', sessionId, 'system', 'interaction_engine_v3', 0);
}

function interactionSessionEnd_(sessionId) {
  const game = interactionLoad_();
  if (!game || game.sessionId !== String(sessionId || '')) return;
  game.ending = true;
  game.endedAt = stamp_();
  interactionSave_(game);
}

function interactionLoad_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(INTERACTION_PROP);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function interactionSave_(game) {
  if (!game) return;
  game.updatedAt = stamp_();
  PropertiesService.getScriptProperties().setProperty(INTERACTION_PROP, JSON.stringify(game));
}

function interactionEnsure_(sessionId) {
  let game = interactionLoad_();
  if (!game || game.sessionId !== String(sessionId)) {
    const active = activeSession_();
    const startedAt = active && String(active.values[0]) === String(sessionId) ? active.values[2] : now_();
    interactionSessionStart_(sessionId, startedAt);
    game = interactionLoad_();
  }
  if (!game.boss) game.boss = {name:'CHESHIRE DO ABISMO',maxHp:1000,hp:1000,defeated:false,defeatedAt:''};
  if (!game.combo) game.combo = {recent:[],awards:0,lastAwardAt:''};
  if (!Array.isArray(game.loot)) game.loot = [];
  return game;
}

function interactionNowMs_() { return Date.now(); }
function interactionIso_(ms) { return new Date(ms).toISOString(); }

function interactionRemainingSeconds_(sessionId) {
  const active = activeSession_();
  if (!active || String(active.values[0]) !== String(sessionId)) return 0;
  const start = new Date(active.values[2]).getTime();
  if (!Number.isFinite(start)) return 0;
  const total = stats_(sessionId).total * 60;
  return Math.max(0, Math.floor(total - (Date.now() - start) / 1000));
}

function interactionMetricSnapshot_(sessionId) {
  const counts = {
    visitors:uniqueVisitors_(sessionId),
    growth_total:0,
    support_total:0,
    raid:0,
    livepix_amount:0,
    goal_complete:0
  };
  const rows = sh_(TABS.EVENTOS).getDataRange().getValues();
  for (let r=1; r<rows.length; r++) {
    if (String(rows[r][1]) !== String(sessionId)) continue;
    const type = String(rows[r][2] || '');
    if (type === 'stream_growth') counts.growth_total++;
    else if (type === 'chaos_growth_point') counts.growth_total++;
    else if (type === 'stream_support') counts.support_total++;
    else if (type === 'stream_raid') counts.raid++;
    else if (type === 'livepix_donation') {
      const currency = String(rows[r][10] || 'BRL').toUpperCase();
      if (!currency || currency === 'BRL') counts.livepix_amount += Number(rows[r][5] || 0);
    } else if (type === 'goal_complete') counts.goal_complete++;
  }
  return counts;
}

function interactionMissionTemplates_(kind) {
  const common = [
    {id:'visitors',label:'Abrir o Mundo Louco',description:'Novos visitantes únicos entram no Mundo Louco.',metric:'visitors',target:5,rewardMinutes:15,bossDamage:80},
    {id:'growth',label:'Sorrisos Novos',description:'Novos follows/inscrições entram na comunidade.',metric:'growth_total',target:3,rewardMinutes:15,bossDamage:90},
    {id:'livepix',label:'Oferenda ao Caos',description:'A comunidade acumula apoio pelo LivePix.',metric:'livepix_amount',target:20,rewardMinutes:20,bossDamage:120}
  ];
  if (kind === 'random') return [
    {id:'rabbit',label:'Caçada ao Coelho Branco',description:'4 novos visitantes em poucos minutos.',metric:'visitors',target:4,rewardMinutes:0,bossDamage:120,loot:'Selo Coelho Branco'},
    {id:'tea',label:'Tea Party Relâmpago',description:'2 novos follows/inscrições antes do chá esfriar.',metric:'growth_total',target:2,rewardMinutes:0,bossDamage:130,loot:'Selo Tea Party'},
    {id:'queen',label:'Carta da Rainha',description:'1 novo apoio externo antes da sentença.',metric:'support_total',target:1,rewardMinutes:0,bossDamage:160,loot:'Selo da Rainha'}
  ];
  if (kind === 'sudden') return [
    {id:'save_follow',label:'UM ÚLTIMO SORRISO',description:'1 novo follow/inscrição salva a transmissão.',metric:'growth_total',target:1,rewardMinutes:INTERACTION_CFG.suddenDeathRewardMin,bossDamage:60},
    {id:'save_livepix',label:'A ÚLTIMA OFERENDA',description:'R$10 em LivePix salvam a transmissão.',metric:'livepix_amount',target:10,rewardMinutes:INTERACTION_CFG.suddenDeathRewardMin,bossDamage:80}
  ];
  return common;
}

function interactionPick_(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function interactionMakeMission_(template, sessionId, durationSec, kind) {
  const snap = interactionMetricSnapshot_(sessionId);
  const now = interactionNowMs_();
  return {
    missionId:(kind || 'mission') + '_' + Utilities.getUuid().slice(0,8),
    kind:kind || 'mission',
    templateId:template.id,
    label:template.label,
    description:template.description,
    metric:template.metric,
    target:Number(template.target || 1),
    baseline:Number(snap[template.metric] || 0),
    progress:0,
    rewardMinutes:Number(template.rewardMinutes || 0),
    bossDamage:Number(template.bossDamage || 0),
    loot:template.loot || '',
    status:'active',
    startedAt:interactionIso_(now),
    endsAt:interactionIso_(now + durationSec*1000)
  };
}

function interactionMissionProgress_(mission, snap) {
  if (!mission) return 0;
  return Math.max(0, Number(snap[mission.metric] || 0) - Number(mission.baseline || 0));
}

function interactionAddMinutes_(sessionId, type, minutes, detail) {
  minutes = Number(minutes || 0);
  if (minutes <= 0) return;
  event_(type, sessionId, 'interaction', detail || type, minutes);
  syncLiveRow_(activeSession_());
}

function interactionUnlockLoot_(game, sessionId, id, label, url) {
  if (!id || game.loot.some(x => x.id === id)) return;
  const item = {id,label,url:url || '',unlockedAt:stamp_()};
  game.loot.push(item);
  event_('loot_unlock', sessionId, 'interaction', label, 1);
}

function interactionBossDamage_(game, sessionId, amount, source, detail) {
  amount = Math.max(0, Math.round(Number(amount || 0)));
  if (!amount || !game.boss || game.boss.defeated) return 0;
  const before = Number(game.boss.hp || 0);
  game.boss.hp = Math.max(0, before - amount);
  const dealt = before - game.boss.hp;
  if (dealt > 0) event_('boss_damage', sessionId, source || 'event', detail || '', dealt);

  if (game.boss.hp <= 0 && !game.boss.defeated) {
    game.boss.defeated = true;
    game.boss.defeatedAt = stamp_();
    event_('boss_defeated', sessionId, 'community', game.boss.name, INTERACTION_CFG.bossDefeatMinutes);
    interactionAddMinutes_(sessionId, 'boss_bonus', INTERACTION_CFG.bossDefeatMinutes, 'Boss do Mundo Louco derrotado');
    interactionUnlockLoot_(game, sessionId, 'wallpaper_boss', 'Wallpaper — Cheshire do Abismo', 'assets/reference-design.webp');
  }
  return dealt;
}

function interactionEvent_(sessionId, data) {
  if (!sessionId) return;
  const game = interactionEnsure_(sessionId);
  const type = String((data && data.type) || '');
  const listener = String((data && data.listener) || '');
  const amount = Number((data && data.amount) || 0);
  const chaos = game.chaos && game.chaos.active ? game.chaos.type : '';

  let damage = 0;
  if (type === 'visit') damage = 5;
  else if (type === 'stream_growth') damage = 12;
  else if (type === 'stream_support') {
    damage = /subscriber|sponsor|member|membership/i.test(listener) ? 48 : Math.max(28, Math.min(120, Math.round(amount * 2)));
  } else if (type === 'livepix_donation') {
    damage = Math.max(18, Math.min(250, Math.round(amount * 3)));
  } else if (type === 'stream_raid') {
    damage = 70 + Math.min(180, Math.max(0, Math.round(amount || 0)));
  } else if (type === 'goal_complete') damage = 60;

  if (chaos === 'boss_frenzy') damage *= 2;
  if (chaos === 'growth_double' && type === 'stream_growth') {
    damage *= 2;
    event_('chaos_growth_point', sessionId, 'chaos', listener || 'growth', 1);
  }

  if (chaos === 'livepix_double' && type === 'livepix_donation' && amount > 0) {
    const cfg = config_();
    const extra = Math.floor(amount / Math.max(1, cfg.livepixPerMinute));
    if (extra > 0) interactionAddMinutes_(sessionId, 'chaos_livepix_bonus', extra, 'LivePix 2× durante Modo Caos');
    damage *= 2;
  }

  interactionBossDamage_(game, sessionId, damage, type, listener);
  interactionSave_(game);
  interactionTick_();
}

function interactionGoalComplete_(sessionId, goalId) {
  if (!sessionId) return;
  const game = interactionEnsure_(sessionId);
  const now = interactionNowMs_();
  const cutoff = now - INTERACTION_CFG.comboWindowSec*1000;
  game.combo.recent = (game.combo.recent || []).filter(x => Number(x.at || 0) >= cutoff && x.id !== String(goalId));
  game.combo.recent.push({id:String(goalId || ''),at:now});

  interactionBossDamage_(game, sessionId, 60, 'goal_complete', String(goalId || ''));

  if (game.combo.recent.length >= 2 && Number(game.combo.awards || 0) < INTERACTION_CFG.comboMaxAwards) {
    game.combo.awards = Number(game.combo.awards || 0) + 1;
    game.combo.lastAwardAt = stamp_();
    game.combo.recent = [];
    interactionAddMinutes_(sessionId, 'combo_bonus', INTERACTION_CFG.comboRewardMin, 'COMBO DE METAS');
    interactionBossDamage_(game, sessionId, 50, 'combo', 'duas metas em sequência');
  }
  interactionSave_(game);
}

function interactionStartChaos_(game, sessionId, forcedType) {
  if (game.chaos && game.chaos.active) return;
  const options = [
    {type:'livepix_double',label:'OFERENDAS 2×',description:'LivePix gera o dobro do bônus de tempo nesta janela.'},
    {type:'growth_double',label:'SEGUIDORES 2×',description:'Follows/inscrições contam em dobro para missões e ferem mais o boss.'},
    {type:'boss_frenzy',label:'FRENESI DO BOSS',description:'Todo dano causado ao Boss do Mundo Louco vale o dobro.'}
  ];
  const selected = options.find(x => x.type === forcedType) || interactionPick_(options);
  const now = interactionNowMs_();
  game.chaos = {
    active:true,type:selected.type,label:selected.label,description:selected.description,
    startedAt:interactionIso_(now),
    endsAt:interactionIso_(now + INTERACTION_CFG.chaosDurationSec*1000),
    nextAt:0
  };
  event_('chaos_start',sessionId,'system',selected.type,INTERACTION_CFG.chaosDurationSec);
}

function interactionStartVote_(game, sessionId) {
  if (game.vote && game.vote.status === 'active') return;
  const pool = interactionMissionTemplates_('vote').slice();
  const first = pool.splice(Math.floor(Math.random()*pool.length),1)[0];
  const second = pool.splice(Math.floor(Math.random()*pool.length),1)[0];
  const now = interactionNowMs_();
  game.vote = {
    status:'active',
    voteId:'vote_' + Utilities.getUuid().slice(0,8),
    startedAt:interactionIso_(now),
    endsAt:interactionIso_(now + INTERACTION_CFG.voteDurationSec*1000),
    options:[first,second],
    winnerId:'',
    nextAt:0
  };
  event_('vote_start',sessionId,'system',game.vote.voteId,INTERACTION_CFG.voteDurationSec);
}

function interactionVoteCounts_(sessionId, voteId) {
  const counts = {};
  const rows = sh_(TABS.EVENTOS).getDataRange().getValues();
  const prefix = 'vote:' + String(voteId) + ':';
  for (let r=1; r<rows.length; r++) {
    if (String(rows[r][1]) !== String(sessionId) || String(rows[r][2]) !== 'site_vote') continue;
    if (String(rows[r][3] || '').indexOf(prefix) !== 0) continue;
    const option = String(rows[r][4] || '');
    counts[option] = Number(counts[option] || 0) + 1;
  }
  return counts;
}

function interactionVoteSeen_(sessionId, voteId, visitorId) {
  const rows = sh_(TABS.EVENTOS).getDataRange().getValues();
  const origin = 'vote:' + String(voteId) + ':' + String(visitorId);
  for (let r=rows.length-1; r>=1; r--) {
    if (String(rows[r][1]) === String(sessionId) && String(rows[r][2]) === 'site_vote' && String(rows[r][3]) === origin) return true;
  }
  return false;
}

function interactionVote_(visitorId, optionId) {
  visitorId = String(visitorId || '').slice(0,100);
  optionId = String(optionId || '').slice(0,80);
  if (!visitorId) throw new Error('invalid_visitor');
  const active = activeSession_();
  if (!active) throw new Error('offline');
  const sessionId = String(active.values[0]);
  interactionTick_();
  const game = interactionEnsure_(sessionId);
  if (!game.vote || game.vote.status !== 'active') throw new Error('vote_closed');
  const option = (game.vote.options || []).find(x => String(x.id) === optionId);
  if (!option) throw new Error('invalid_option');
  if (interactionVoteSeen_(sessionId, game.vote.voteId, visitorId)) {
    return {accepted:false,duplicate:true,game:interactionPublicState_(sessionId)};
  }
  event_('site_vote',sessionId,'vote:' + game.vote.voteId + ':' + visitorId,optionId,1);
  return {accepted:true,game:interactionPublicState_(sessionId)};
}

function interactionResolveVote_(game, sessionId) {
  if (!game.vote || game.vote.status !== 'active') return;
  const counts = interactionVoteCounts_(sessionId, game.vote.voteId);
  const options = game.vote.options || [];
  let winner = options[0] || null;
  for (const option of options) {
    if (!winner || Number(counts[option.id] || 0) > Number(counts[winner.id] || 0)) winner = option;
  }
  if (!winner) {
    game.vote.status = 'closed';
    return;
  }
  game.vote.status = 'resolved';
  game.vote.winnerId = winner.id;
  game.vote.resolvedAt = stamp_();
  game.vote.nextAt = interactionNowMs_() + INTERACTION_CFG.voteRepeatSec*1000;
  event_('vote_resolved',sessionId,'community',winner.label,Number(counts[winner.id] || 0));

  const mission = interactionMakeMission_(winner, sessionId, 12*60, 'community');
  game.communityMission = mission;
  event_('community_mission_start',sessionId,'vote',mission.label,mission.target);
}

function interactionStartLastChance_(game, sessionId) {
  if (game.lastChance && game.lastChance.triggered) return;
  const template = interactionPick_(interactionMissionTemplates_('last'));
  const mission = interactionMakeMission_(template, sessionId, INTERACTION_CFG.lastChanceDurationSec, 'last_chance');
  mission.rewardMinutes = INTERACTION_CFG.lastChanceRewardMin;
  game.lastChance = {
    status:'active',mission,
    startedAt:mission.startedAt,endsAt:mission.endsAt,triggered:true
  };
  event_('last_chance_start',sessionId,'system',mission.label,mission.target);
}

function interactionStartRandom_(game, sessionId) {
  if (game.randomEvent && game.randomEvent.status === 'active') return;
  const template = interactionPick_(interactionMissionTemplates_('random'));
  const mission = interactionMakeMission_(template, sessionId, 7*60, 'random');
  game.randomEvent = {
    status:'active',mission,
    startedAt:mission.startedAt,endsAt:mission.endsAt,nextAt:0
  };
  event_('random_event_start',sessionId,'system',mission.label,mission.target);
}

function interactionStartSuddenDeath_(game, sessionId) {
  if (!INTERACTION_CFG.suddenDeathEnabled || (game.suddenDeath && game.suddenDeath.triggered)) return;
  const template = interactionPick_(interactionMissionTemplates_('sudden'));
  const mission = interactionMakeMission_(template, sessionId, INTERACTION_CFG.suddenDeathDurationSec, 'sudden_death');
  game.suddenDeath = {
    status:'active',mission,
    startedAt:mission.startedAt,endsAt:mission.endsAt,triggered:true
  };
  event_('sudden_death_start',sessionId,'system',mission.label,mission.target);
}

function interactionCompleteMission_(game, sessionId, holderName, eventPrefix) {
  const holder = game[holderName];
  if (!holder || holder.status !== 'active' || !holder.mission) return false;
  const mission = holder.mission;
  const snap = interactionMetricSnapshot_(sessionId);
  mission.progress = interactionMissionProgress_(mission, snap);
  if (mission.progress < mission.target) return false;

  mission.status = 'success';
  mission.completedAt = stamp_();
  holder.status = 'success';
  const eventType = eventPrefix + '_success';
  event_(eventType,sessionId,'community',mission.label,mission.progress);

  if (mission.rewardMinutes > 0) {
    const timeType = holderName === 'lastChance' ? 'last_chance_bonus'
      : holderName === 'suddenDeath' ? 'sudden_death_bonus'
      : holderName === 'communityMission' ? 'vote_mission_bonus'
      : 'random_bonus';
    interactionAddMinutes_(sessionId,timeType,mission.rewardMinutes,mission.label);
  }
  if (mission.bossDamage > 0) interactionBossDamage_(game,sessionId,mission.bossDamage,eventPrefix,mission.label);
  if (mission.loot) interactionUnlockLoot_(game,sessionId,'loot_' + mission.templateId,mission.loot,'');
  return true;
}

function interactionFailMission_(game, sessionId, holderName, eventPrefix) {
  const holder = game[holderName];
  if (!holder || holder.status !== 'active' || !holder.mission) return false;
  holder.status = 'failed';
  holder.mission.status = 'failed';
  holder.mission.failedAt = stamp_();
  event_(eventPrefix + '_failed',sessionId,'system',holder.mission.label,holder.mission.progress || 0);
  return true;
}

function interactionTick_() {
  const active = activeSession_();
  if (!active) return;
  const sessionId = String(active.values[0]);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2500)) return;
  try {
    const game = interactionEnsure_(sessionId);
    const now = interactionNowMs_();
    const remaining = interactionRemainingSeconds_(sessionId);

    if (game.chaos && game.chaos.active && now >= new Date(game.chaos.endsAt).getTime()) {
      event_('chaos_end',sessionId,'system',game.chaos.type,0);
      game.chaos.active = false;
      game.chaos.endedAt = stamp_();
      game.chaos.nextAt = now + INTERACTION_CFG.chaosRepeatMinSec*1000;
    }
    if (game.chaos && !game.chaos.active && Number(game.chaos.nextAt || 0) && now >= Number(game.chaos.nextAt) && remaining > 30*60) {
      interactionStartChaos_(game,sessionId);
    }

    if (game.vote && game.vote.status === 'active' && now >= new Date(game.vote.endsAt).getTime()) interactionResolveVote_(game,sessionId);
    if (game.vote && game.vote.status !== 'active' && Number(game.vote.nextAt || 0) && now >= Number(game.vote.nextAt) && remaining > 25*60) {
      interactionStartVote_(game,sessionId);
    }

    if (game.communityMission && game.communityMission.status === 'active') {
      const snap = interactionMetricSnapshot_(sessionId);
      game.communityMission.progress = interactionMissionProgress_(game.communityMission,snap);
      if (game.communityMission.progress >= game.communityMission.target) {
        const wrap = {status:'active',mission:game.communityMission};
        game.communityMission = wrap;
        interactionCompleteMission_(game,sessionId,'communityMission','community_mission');
        game.communityMission = wrap.mission;
      } else if (now >= new Date(game.communityMission.endsAt).getTime()) {
        game.communityMission.status='failed';
        game.communityMission.failedAt=stamp_();
        event_('community_mission_failed',sessionId,'system',game.communityMission.label,game.communityMission.progress);
      }
    }

    if (game.randomEvent && game.randomEvent.status === 'active') {
      interactionCompleteMission_(game,sessionId,'randomEvent','random_event');
      if (game.randomEvent.status === 'active' && now >= new Date(game.randomEvent.endsAt).getTime()) interactionFailMission_(game,sessionId,'randomEvent','random_event');
      if (game.randomEvent.status !== 'active') game.randomEvent.nextAt = now + INTERACTION_CFG.randomRepeatSec*1000;
    } else if (game.randomEvent && Number(game.randomEvent.nextAt || 0) && now >= Number(game.randomEvent.nextAt) && remaining > 25*60) {
      interactionStartRandom_(game,sessionId);
    }

    if (remaining > 0 && remaining <= INTERACTION_CFG.lastChanceAtSec && game.lastChance && !game.lastChance.triggered) {
      interactionStartLastChance_(game,sessionId);
    }
    if (game.lastChance && game.lastChance.status === 'active') {
      interactionCompleteMission_(game,sessionId,'lastChance','last_chance');
      if (game.lastChance.status === 'active' && now >= new Date(game.lastChance.endsAt).getTime()) interactionFailMission_(game,sessionId,'lastChance','last_chance');
    }

    if (remaining <= 0 && game.suddenDeath && !game.suddenDeath.triggered) interactionStartSuddenDeath_(game,sessionId);
    if (game.suddenDeath && game.suddenDeath.status === 'active') {
      const won = interactionCompleteMission_(game,sessionId,'suddenDeath','sudden_death');
      if (won) game.ending = false;
      if (game.suddenDeath.status === 'active' && now >= new Date(game.suddenDeath.endsAt).getTime()) {
        interactionFailMission_(game,sessionId,'suddenDeath','sudden_death');
        game.ending = true;
      }
    }

    interactionSave_(game);
  } finally {
    lock.releaseLock();
  }
}

function interactionRecentEvents_(sessionId, limit) {
  limit = Math.max(1,Math.min(30,Number(limit || 16)));
  const rows = sh_(TABS.EVENTOS).getDataRange().getValues();
  const out = [];
  for (let r=rows.length-1; r>=1 && out.length<limit; r--) {
    if (String(rows[r][1]) !== String(sessionId)) continue;
    const type = String(rows[r][2] || '');
    if (INTERACTION_RECENT_TYPES.indexOf(type) < 0) continue;
    out.push({
      id:String(r+1) + ':' + String(rows[r][0] || '') + ':' + type,
      at:String(rows[r][0] || ''),
      type,
      origin:String(rows[r][3] || ''),
      detail:String(rows[r][4] || ''),
      value:Number(rows[r][5] || 0),
      provider:String(rows[r][6] || ''),
      user:String(rows[r][7] || '')
    });
  }
  return out.reverse();
}

function interactionPublicState_(sessionId) {
  if (!sessionId) return null;
  const game = interactionEnsure_(sessionId);
  const snap = interactionMetricSnapshot_(sessionId);

  function missionView(m) {
    if (!m) return null;
    const progress = m.status === 'active' ? interactionMissionProgress_(m,snap) : Number(m.progress || 0);
    return Object.assign({},m,{progress:Math.min(Number(m.target || 0),progress)});
  }

  const counts = game.vote && game.vote.voteId ? interactionVoteCounts_(sessionId,game.vote.voteId) : {};
  const vote = game.vote ? Object.assign({},game.vote,{
    options:(game.vote.options || []).map(o => Object.assign({},o,{votes:Number(counts[o.id] || 0)}))
  }) : null;

  return {
    boss:Object.assign({},game.boss,{percent:Math.max(0,Math.round(Number(game.boss.hp||0)/Math.max(1,Number(game.boss.maxHp||1))*100))}),
    chaos:game.chaos,
    vote,
    communityMission:missionView(game.communityMission && game.communityMission.mission ? game.communityMission.mission : game.communityMission),
    lastChance:game.lastChance ? Object.assign({},game.lastChance,{mission:missionView(game.lastChance.mission)}) : null,
    randomEvent:game.randomEvent ? Object.assign({},game.randomEvent,{mission:missionView(game.randomEvent.mission)}) : null,
    suddenDeath:game.suddenDeath ? Object.assign({},game.suddenDeath,{mission:missionView(game.suddenDeath.mission)}) : null,
    combo:game.combo,
    loot:game.loot || [],
    ending:Boolean(game.ending),
    remainingSeconds:interactionRemainingSeconds_(sessionId),
    recentEvents:interactionRecentEvents_(sessionId,18)
  };
}

function interactionRecords_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('nihilguh_records_v2');
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const lives = sh_(TABS.LIVES).getDataRange().getValues();
  const visitors = sh_(TABS.VISITANTES).getDataRange().getValues();
  const events = sh_(TABS.EVENTOS).getDataRange().getValues();
  const bySession = {};

  function ensure(id) {
    if (!bySession[id]) bySession[id] = {id,date:'',duration:0,goals:0,visitors:new Set(),growth:0,livepix:0};
    return bySession[id];
  }

  for (let r=1;r<lives.length;r++) {
    const id=String(lives[r][0]||''); if(!id) continue;
    const s=ensure(id); s.date=String(lives[r][1]||''); s.duration=Number(lives[r][7]||0); s.goals=Number(lives[r][8]||0);
  }
  for (let r=1;r<visitors.length;r++) {
    const id=String(visitors[r][0]||''); if(!id) continue;
    ensure(id).visitors.add(String(visitors[r][2]||''));
  }
  for (let r=1;r<events.length;r++) {
    const id=String(events[r][1]||''); if(!id) continue;
    const s=ensure(id), type=String(events[r][2]||'');
    if(type==='stream_growth') s.growth++;
    if(type==='livepix_donation'){
      const currency=String(events[r][10]||'BRL').toUpperCase();
      if(!currency || currency==='BRL') s.livepix+=Number(events[r][5]||0);
    }
  }

  const sessions=Object.keys(bySession).map(id=>{
    const s=bySession[id]; return {session_id:id,data:s.date,duration:s.duration,goals:s.goals,visitors:s.visitors.size,growth:s.growth,livepix:Number(s.livepix.toFixed(2))};
  });
  const best = key => sessions.reduce((a,b)=>!a || Number(b[key]||0)>Number(a[key]||0)?b:a,null);
  const result = {
    longest:best('duration'),
    mostGoals:best('goals'),
    mostVisitors:best('visitors'),
    mostGrowth:best('growth'),
    mostLivePix:best('livepix')
  };
  cache.put('nihilguh_records_v2',JSON.stringify(result),60);
  return result;
}

function interactionAdmin_(action, p) {
  const active=activeSession_();
  if(!active) throw new Error('no_active_session');
  const sessionId=String(active.values[0]);
  let game=interactionEnsure_(sessionId);

  if(action==='triggerChaos') interactionStartChaos_(game,sessionId,String(p.chaosType||''));
  else if(action==='triggerVote') interactionStartVote_(game,sessionId);
  else if(action==='triggerRandom') interactionStartRandom_(game,sessionId);
  else if(action==='triggerLastChance') interactionStartLastChance_(game,sessionId);
  else if(action==='bossDamage') interactionBossDamage_(game,sessionId,Math.min(1000,Math.max(1,Number(p.damage||100))),'admin','manual');
  else if(action==='resetGame') {
    interactionSessionStart_(sessionId,active.values[2]);
    game=interactionLoad_();
  } else throw new Error('unknown_game_action');

  interactionSave_(game);
  return interactionPublicState_(sessionId);
}
