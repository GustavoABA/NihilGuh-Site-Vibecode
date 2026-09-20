const SHEET_ID = '15hJC-OZfbYvK7A1hVuXwcth5gyxj6DxmQx8lUAk9f6Y';
const TZ = 'America/Sao_Paulo';
const TABS = { CONFIG:'CONFIG', LIVES:'LIVES', METAS:'METAS', VISITANTES:'VISITANTES', EVENTOS:'EVENTOS', PAINEL:'PAINEL' };

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g,''));
  if (!props.getProperty('BRIDGE_KEY')) props.setProperty('BRIDGE_KEY', Utilities.getUuid().replace(/-/g,''));
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pollTwitchStatus');
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pollTwitchStatus').timeBased().everyMinutes(1).create();
  pollTwitchStatus();
  Logger.log('ADMIN_KEY=' + props.getProperty('ADMIN_KEY'));
  Logger.log('BRIDGE_KEY=' + props.getProperty('BRIDGE_KEY'));
  return {
    ok:true,
    adminKey:props.getProperty('ADMIN_KEY'),
    bridgeKey:props.getProperty('BRIDGE_KEY')
  };
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'state';
    let data;

    if (action === 'state') { interactionTick_(); data = publicState_(); }
    else if (action === 'history') data = history_(Number(p.days || 5));
    else if (action === 'records') data = { records:interactionRecords_() };
    else if (action === 'visit') data = registerVisit_(String(p.visitorId || ''));
    else if (action === 'vote') data = interactionVote_(String(p.visitorId || ''), String(p.optionId || ''));
    else if (action === 'streamEvent') {
      requireBridge_(p.bridgeKey);
      data = streamEvent_(p);
    } else {
      requireAdmin_(p.adminKey);
      if (action === 'sync') data = (pollTwitchStatus(), interactionTick_(), publicState_());
      else if (action === 'forceStart') data = forceStart_();
      else if (action === 'forceEnd') data = forceEnd_();
      else if (action === 'completeGoal') data = completeGoal_(String(p.goalId || ''), 'admin');
      else if (action === 'addMinutes') data = addMinutes_(Number(p.minutes || 0));
      else if (['triggerChaos','triggerVote','triggerRandom','triggerLastChance','bossDamage','resetGame'].includes(action)) data = interactionAdmin_(action,p);
      else if (action === 'bridgeInfo') data = { bridgeKey:PropertiesService.getScriptProperties().getProperty('BRIDGE_KEY') || '' };
      else throw new Error('unknown_action');
    }

    return output_(p.callback, { ok:true, ...data });
  } catch (err) {
    return output_((e && e.parameter && e.parameter.callback) || '', { ok:false, error:String(err.message || err) });
  }
}

function output_(callback, data) {
  const json = JSON.stringify(data);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function ss_(){ return SpreadsheetApp.openById(SHEET_ID); }
function sh_(name){ return ss_().getSheetByName(name); }
function now_(){ return new Date(); }
function date_(d){ return Utilities.formatDate(d || now_(), TZ, 'yyyy-MM-dd'); }
function stamp_(d){ return Utilities.formatDate(d || now_(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function truncate_(value, max){ value=String(value || ''); return value.length > max ? value.slice(0,max) : value; }

function config_() {
  const values = sh_(TABS.CONFIG).getDataRange().getValues();
  const goals = [];
  for (let r=1; r<values.length; r++) {
    if (values[r][0] === true && values[r][1]) goals.push({
      id:String(values[r][1]), meta:String(values[r][2]), tipo:String(values[r][3]),
      alvo:Number(values[r][4] || 1), reward:Number(values[r][5] || 0)
    });
  }
  const map = {};
  for (let r=1; r<values.length; r++) if (values[r][7]) map[String(values[r][7])] = values[r][8];
  return {
    goals,
    baseMinutes:Number(map['Tempo base da live (min)'] || 240),
    offlineChecks:Number(map['Checks offline para encerrar'] || 5),
    channel:String(map['Canal Twitch'] || 'nihilguh'),
    decapi:String(map['DecAPI URL'] || 'https://decapi.me/twitch/uptime?channel=nihilguh&offline_msg=offline'),
    livepixPerMinute:Number(map['LivePix R$ por minuto'] || 10),
    maxBonusMinutes:Number(map['Máximo de bônus da live (min)'] || 240),
    livepixBridgePlatform:String(map['LivePix bridge platform'] || 'twitch').toLowerCase()
  };
}

function pollTwitchStatus() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    const cfg = config_();
    let text;
    try {
      const res = UrlFetchApp.fetch(cfg.decapi, { muteHttpExceptions:true, followRedirects:true });
      if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error('decapi_http_' + res.getResponseCode());
      text = String(res.getContentText() || '').trim().toLowerCase();
    } catch (err) {
      event_('detector_error','decapi',String(err.message || err),'');
      return;
    }

    const online = Boolean(text && !text.includes('offline') && !text.includes('error'));
    const props = PropertiesService.getScriptProperties();
    const active = activeSession_();

    if (online) {
      props.setProperty('OFFLINE_COUNT','0');
      props.setProperty('TWITCH_STATE','online');
      if (!active) startSession_('decapi');
    } else {
      props.setProperty('TWITCH_STATE','offline');
      if (active) {
        const count = Number(props.getProperty('OFFLINE_COUNT') || 0) + 1;
        props.setProperty('OFFLINE_COUNT', String(count));
        if (count >= cfg.offlineChecks) {
          closeSession_(active.row, 'decapi');
          props.setProperty('OFFLINE_COUNT','0');
        }
      }
    }
    updatePanel_();
  } finally { lock.releaseLock(); }
}

function activeSession_() {
  const s = sh_(TABS.LIVES), vals = s.getDataRange().getValues();
  for (let r=vals.length-1; r>=1; r--) {
    if (String(vals[r][4]).toUpperCase() === 'ONLINE') return { row:r+1, values:vals[r] };
  }
  return null;
}

function startSession_(origin) {
  const existing = activeSession_();
  if (existing) return existing;
  const cfg = config_(), d=now_(), id='live_' + Utilities.formatDate(d,TZ,'yyyyMMdd_HHmmss');
  const live = sh_(TABS.LIVES);
  live.appendRow([id,date_(d),stamp_(d),'','ONLINE',cfg.baseMinutes,0,cfg.baseMinutes,0,cfg.goals.length,origin || 'manual']);
  const goals = sh_(TABS.METAS);
  cfg.goals.forEach(g => goals.appendRow([id,date_(d),g.id,g.meta,g.tipo,g.alvo,0,false,g.reward,'']));
  event_('session_start',id,origin || 'manual',cfg.baseMinutes);
  interactionSessionStart_(id,d);
  updatePanel_();
  return activeSession_();
}

function closeSession_(row, origin) {
  const live = sh_(TABS.LIVES);
  const id = String(live.getRange(row,1).getValue());
  const stats = stats_(id);
  live.getRange(row,4,1,7).setValues([[stamp_(), 'ENCERRADA', live.getRange(row,6).getValue(), stats.gained, stats.total, stats.completed, stats.goalCount]]);
  event_('session_end',id,origin || 'manual',stats.total);
  interactionSessionEnd_(id);
  updatePanel_();
  return { ended:true, sessionId:id };
}

function stats_(sessionId) {
  const liveVals=sh_(TABS.LIVES).getDataRange().getValues();
  let base=240;
  for(let r=1;r<liveVals.length;r++) if(String(liveVals[r][0])===sessionId){base=Number(liveVals[r][5]||240);break;}
  const gVals=sh_(TABS.METAS).getDataRange().getValues();
  let gained=0,completed=0,goalCount=0;
  for(let r=1;r<gVals.length;r++) if(String(gVals[r][0])===sessionId){
    goalCount++;
    if(gVals[r][7]===true){completed++;gained+=Number(gVals[r][8]||0);}
  }
  const eVals=sh_(TABS.EVENTOS).getDataRange().getValues();
  for(let r=1;r<eVals.length;r++) {
    if(String(eVals[r][1])!==sessionId) continue;
    const eventType=String(eVals[r][2]);
    if(INTERACTION_TIME_EVENTS.includes(eventType)) gained+=Number(eVals[r][5]||0);
  }
  const maxBonus=Number(config_().maxBonusMinutes || 240);
  gained=Math.min(Math.max(0,gained),maxBonus);
  return {base,gained,total:base+gained,completed,goalCount};
}

function syncLiveRow_(active) {
  if (!active) return;
  const id=String(active.values[0]), stats=stats_(id);
  sh_(TABS.LIVES).getRange(active.row,7,1,4).setValues([[stats.gained,stats.total,stats.completed,stats.goalCount]]);
}

function registerVisit_(visitorId) {
  if (!visitorId || visitorId.length > 100) throw new Error('invalid_visitor');
  const active=activeSession_();
  if(!active) return { counted:false, reason:'offline' };
  const id=String(active.values[0]), visitors=sh_(TABS.VISITANTES), vals=visitors.getDataRange().getValues();
  let row=0;
  for(let r=1;r<vals.length;r++) if(String(vals[r][0])===id && String(vals[r][2])===visitorId){row=r+1;break;}
  if(row) visitors.getRange(row,5).setValue(stamp_());
  else visitors.appendRow([id,date_(),visitorId,stamp_(),stamp_()]);
  if(!row) interactionEvent_(id,{type:'visit',listener:'site_visit',amount:1});
  const count=uniqueVisitors_(id);
  updateVisitorGoals_(id,count);
  syncLiveRow_(activeSession_());
  updatePanel_();
  return { counted:!row, visitors:count };
}

function uniqueVisitors_(id) {
  const vals=sh_(TABS.VISITANTES).getDataRange().getValues(), set=new Set();
  for(let r=1;r<vals.length;r++) if(String(vals[r][0])===id) set.add(String(vals[r][2]));
  return set.size;
}

function updateVisitorGoals_(id,count) {
  const s=sh_(TABS.METAS), vals=s.getDataRange().getValues(), now=stamp_();
  for(let r=1;r<vals.length;r++) if(String(vals[r][0])===id && String(vals[r][4])==='visitors'){
    s.getRange(r+1,7).setValue(count);
    if(vals[r][7]!==true && count>=Number(vals[r][5]||0)){
      s.getRange(r+1,8).setValue(true); s.getRange(r+1,10).setValue(now);
      event_('goal_complete',id,'visitors',String(vals[r][2]),Number(vals[r][8]||0));
    }
  }
}

function streamEvent_(p) {
  const active=activeSession_();
  if(!active) return { recorded:false, reason:'offline' };

  const id=String(active.values[0]);
  const provider=normalizeProvider_(p.platform);
  const listener=truncate_(p.listener,100);
  const eventId=truncate_(p.eventId,230);
  const user=truncate_(p.user,180);
  const message=truncate_(p.message,500);
  const currency=truncate_(p.currency,30);
  const raw=truncate_(p.raw,5000);
  const amountRaw=String(p.amount === undefined ? '' : p.amount);
  const amountNum=Number(amountRaw);
  const amount=Number.isFinite(amountNum) ? amountNum : truncate_(amountRaw,80);

  if(!listener) throw new Error('missing_listener');
  if(eventId && eventSeen_(eventId)) return { recorded:false, duplicate:true, eventId };

  const cfg=config_();
  const normalized=classifyStreamEvent_(provider,listener,p,cfg.livepixBridgePlatform);
  sh_(TABS.EVENTOS).appendRow([
    stamp_(),id,normalized,'streamelements',listener,amount,
    provider,user,listener,eventId,currency,message,raw
  ]);

  if(normalized==='livepix_donation') updateLivePix_(id);
  updateStreamGoals_(id);
  interactionEvent_(id,{type:normalized,listener,provider,amount,user});
  syncLiveRow_(activeSession_());
  updatePanel_();

  return { recorded:true, sessionId:id, platform:provider, type:normalized };
}

function normalizeProvider_(value) {
  const p=String(value || '').toLowerCase().trim();
  return ['twitch','youtube','kick'].includes(p) ? p : 'unknown';
}

function classifyStreamEvent_(provider, listener, p, livepixBridgePlatform) {
  const l=String(listener || '').toLowerCase();

  if(l === 'tip-latest' && String(p.isLivePix || '') === 'true' && provider === livepixBridgePlatform) return 'livepix_donation';
  if(l === 'follower-latest') return 'stream_growth';

  if(l === 'subscriber-latest') {
    if(provider === 'youtube') return 'stream_growth';
    if(String(p.isCommunityGift || '') === 'true' && String(p.bulkGifted || '') !== 'true') return 'stream_other';
    if(provider === 'twitch' || provider === 'kick') return 'stream_support';
  }

  if([
    'tip-latest','cheer-latest','kicks-latest','superchat-latest','super-chat-latest',
    'supersticker-latest','super-sticker-latest','jewels-latest','sponsor-latest',
    'member-latest','membership-latest','supporter-latest'
  ].includes(l)) return 'stream_support';

  if(l === 'raid-latest') return 'stream_raid';

  return 'stream_other';
}

function eventSeen_(eventId) {
  if(!eventId) return false;
  const vals=sh_(TABS.EVENTOS).getDataRange().getValues();
  for(let r=vals.length-1;r>=1;r--) if(String(vals[r][9] || '') === eventId) return true;
  return false;
}

function updateStreamGoals_(sessionId) {
  const events=sh_(TABS.EVENTOS).getDataRange().getValues();
  const counts={
    growth_total:0,growth_twitch:0,growth_youtube:0,growth_kick:0,
    support_total:0,raid:0,platforms:0
  };
  const providers=new Set();

  for(let r=1;r<events.length;r++){
    if(String(events[r][1])!==sessionId || String(events[r][3])!=='streamelements') continue;
    const type=String(events[r][2]);
    const provider=String(events[r][6]).toLowerCase();

    if(type==='stream_growth'){
      counts.growth_total++;
      if(provider==='twitch') counts.growth_twitch++;
      if(provider==='youtube') counts.growth_youtube++;
      if(provider==='kick') counts.growth_kick++;
      if(['twitch','youtube','kick'].includes(provider)) providers.add(provider);
    } else if(type==='stream_support' || type==='livepix_donation'){
      counts.support_total++;
      if(['twitch','youtube','kick'].includes(provider)) providers.add(provider);
    } else if(type==='stream_raid'){
      counts.raid++;
      if(['twitch','youtube','kick'].includes(provider)) providers.add(provider);
    }
  }
  counts.platforms=providers.size;

  const goals=sh_(TABS.METAS), vals=goals.getDataRange().getValues(), completedAt=stamp_();
  for(let r=1;r<vals.length;r++){
    if(String(vals[r][0])!==sessionId) continue;
    const type=String(vals[r][4]);
    if(!(type in counts)) continue;

    const progress=Number(counts[type] || 0);
    goals.getRange(r+1,7).setValue(progress);

    if(vals[r][7]!==true && progress>=Number(vals[r][5]||0)){
      goals.getRange(r+1,8).setValue(true);
      goals.getRange(r+1,10).setValue(completedAt);
      event_('goal_complete',sessionId,'streamelements',String(vals[r][2]),Number(vals[r][8]||0));
    }
  }
}

function updateLivePix_(sessionId) {
  const cfg=config_();
  const events=sh_(TABS.EVENTOS).getDataRange().getValues();
  let total=0;
  let awarded=0;

  for(let r=1;r<events.length;r++){
    if(String(events[r][1])!==sessionId) continue;
    const type=String(events[r][2]);
    if(type==='livepix_donation'){
      const currency=String(events[r][10] || 'BRL').toUpperCase();
      if(currency && currency!=='BRL') continue;
      total+=Number(events[r][5] || 0);
    } else if(type==='livepix_time'){
      awarded+=Number(events[r][5] || 0);
    }
  }

  const earned=Math.floor(total / Math.max(1, cfg.livepixPerMinute));
  const delta=Math.max(0, earned-awarded);
  if(delta>0){
    event_('livepix_time',sessionId,'livepix','R$ '+total.toFixed(2)+' acumulados',delta);
  }

  const goals=sh_(TABS.METAS), vals=goals.getDataRange().getValues(), completedAt=stamp_();
  for(let r=1;r<vals.length;r++){
    if(String(vals[r][0])!==sessionId || String(vals[r][4])!=='livepix_amount') continue;
    goals.getRange(r+1,7).setValue(total);
    if(vals[r][7]!==true && total>=Number(vals[r][5]||0)){
      goals.getRange(r+1,8).setValue(true);
      goals.getRange(r+1,10).setValue(completedAt);
      event_('goal_complete',sessionId,'livepix',String(vals[r][2]),0);
    }
  }
}

function completeGoal_(goalId, origin) {
  const active=activeSession_(); if(!active) throw new Error('no_active_session');
  const id=String(active.values[0]), s=sh_(TABS.METAS), vals=s.getDataRange().getValues();
  for(let r=1;r<vals.length;r++) if(String(vals[r][0])===id && String(vals[r][2])===goalId){
    if(vals[r][7]!==true){
      s.getRange(r+1,7).setValue(Number(vals[r][5]||1));
      s.getRange(r+1,8).setValue(true); s.getRange(r+1,10).setValue(stamp_());
      event_('goal_complete',id,origin || 'admin',goalId,Number(vals[r][8]||0));
    }
    syncLiveRow_(activeSession_()); updatePanel_(); return publicState_();
  }
  throw new Error('goal_not_found');
}

function addMinutes_(minutes) {
  if(!Number.isFinite(minutes) || minutes<=0 || minutes>240) throw new Error('invalid_minutes');
  const active=activeSession_(); if(!active) throw new Error('no_active_session');
  const id=String(active.values[0]); event_('manual_time',id,'admin','minutos adicionados',minutes);
  syncLiveRow_(activeSession_()); updatePanel_(); return publicState_();
}

function forceStart_(){ startSession_('admin'); PropertiesService.getScriptProperties().setProperty('OFFLINE_COUNT','0'); return publicState_(); }
function forceEnd_(){ const a=activeSession_(); if(!a) return { ended:false }; return closeSession_(a.row,'admin'); }

function publicState_() {
  const active=activeSession_();
  if(!active) return { twitchState:PropertiesService.getScriptProperties().getProperty('TWITCH_STATE') || 'unknown', session:null, goals:[] };
  const row=sh_(TABS.LIVES).getRange(active.row,1,1,11).getValues()[0];
  const id=String(row[0]), vals=sh_(TABS.METAS).getDataRange().getValues(), goals=[];
  for(let r=1;r<vals.length;r++) if(String(vals[r][0])===id) goals.push({
    goal_id:String(vals[r][2]),meta:String(vals[r][3]),tipo:String(vals[r][4]),alvo:Number(vals[r][5]||0),
    progresso:Number(vals[r][6]||0),concluida:vals[r][7]===true,recompensa_min:Number(vals[r][8]||0),concluida_em:vals[r][9] ? String(vals[r][9]) : ''
  });
  return { twitchState:'online', session:{
    session_id:id,data:String(row[1]),inicio:String(row[2]),fim:String(row[3]||''),status:String(row[4]),
    tempo_base_min:Number(row[5]||0),tempo_ganho_min:Number(row[6]||0),tempo_total_min:Number(row[7]||0),
    metas_batidas:Number(row[8]||0),metas_total:Number(row[9]||0)
  }, goals, game:interactionPublicState_(id) };
}

function history_(days) {
  days=Math.min(30,Math.max(1,Number(days||5)));
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-days+1);
  const lVals=sh_(TABS.LIVES).getDataRange().getValues(), sessions=[];
  for(let r=lVals.length-1;r>=1;r--){
    const d=new Date(String(lVals[r][1])+'T00:00:00');
    if(d<cutoff) continue;
    sessions.push({session_id:String(lVals[r][0]),data:String(lVals[r][1]),inicio:String(lVals[r][2]),fim:String(lVals[r][3]||''),status:String(lVals[r][4]),tempo_total_min:Number(lVals[r][7]||0),metas_batidas:Number(lVals[r][8]||0),metas_total:Number(lVals[r][9]||0)});
  }
  const gVals=sh_(TABS.METAS).getDataRange().getValues(), goals={};
  sessions.forEach(s=>goals[s.session_id]=[]);
  for(let r=1;r<gVals.length;r++){const id=String(gVals[r][0]);if(goals[id])goals[id].push({goal_id:String(gVals[r][2]),meta:String(gVals[r][3]),concluida:gVals[r][7]===true,recompensa_min:Number(gVals[r][8]||0)});}
  return { sessions, goals };
}

function event_(type, sessionId, origin, detail, value) {
  sh_(TABS.EVENTOS).appendRow([stamp_(),sessionId || '',type || '',origin || '',detail || '',value === undefined ? '' : value]);
  if(type === 'goal_complete' && typeof interactionGoalComplete_ === 'function') {
    interactionGoalComplete_(sessionId, detail);
  }
}

function updatePanel_() {
  const p=sh_(TABS.PAINEL), state=publicStateNoSync_();
  if(state.session) p.getRange('B4:B8').setValues([[state.session.session_id],[state.session.status],[state.session.tempo_base_min],[state.session.tempo_ganho_min],[state.session.metas_batidas+'/'+state.session.metas_total]]);
  else p.getRange('B4:B8').setValues([['—'],['OFFLINE'],[config_().baseMinutes],[0],['0/0']]);
  const hist=history_(5).sessions.slice(0,5);
  const rows=[];
  for(let i=0;i<5;i++){const h=hist[i];rows.push(h?[h.data,h.inicio ? h.inicio.slice(11,16):'—',h.fim ? h.fim.slice(11,16):'—',h.tempo_total_min,h.metas_batidas+'/'+h.metas_total]:['—','—','—','—','—']);}
  p.getRange(5,4,5,5).setValues(rows);
}

function publicStateNoSync_() {
  const active=activeSession_(); if(!active)return {session:null};
  const r=sh_(TABS.LIVES).getRange(active.row,1,1,11).getValues()[0];
  return {session:{session_id:String(r[0]),status:String(r[4]),tempo_base_min:Number(r[5]||0),tempo_ganho_min:Number(r[6]||0),metas_batidas:Number(r[8]||0),metas_total:Number(r[9]||0)}};
}

function requireAdmin_(key) {
  const expected=PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if(!expected || !key || String(key)!==String(expected)) throw new Error('unauthorized');
}

function requireBridge_(key) {
  const expected=PropertiesService.getScriptProperties().getProperty('BRIDGE_KEY');
  if(!expected || !key || String(key)!==String(expected)) throw new Error('bridge_unauthorized');
}
