const SHEET_ID = '15hJC-OZfbYvK7A1hVuXwcth5gyxj6DxmQx8lUAk9f6Y';
const TZ = 'America/Sao_Paulo';
const TABS = { CONFIG:'CONFIG', LIVES:'LIVES', METAS:'METAS', VISITANTES:'VISITANTES', EVENTOS:'EVENTOS', PAINEL:'PAINEL' };

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g,''));
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pollTwitchStatus');
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pollTwitchStatus').timeBased().everyMinutes(1).create();
  pollTwitchStatus();
  Logger.log('ADMIN_KEY=' + props.getProperty('ADMIN_KEY'));
  return { ok:true, adminKey:props.getProperty('ADMIN_KEY') };
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'state';
    let data;
    if (action === 'state') data = publicState_();
    else if (action === 'history') data = history_(Number(p.days || 5));
    else if (action === 'visit') data = registerVisit_(String(p.visitorId || ''));
    else {
      requireAdmin_(p.adminKey);
      if (action === 'sync') data = (pollTwitchStatus(), publicState_());
      else if (action === 'forceStart') data = forceStart_();
      else if (action === 'forceEnd') data = forceEnd_();
      else if (action === 'completeGoal') data = completeGoal_(String(p.goalId || ''), 'admin');
      else if (action === 'addMinutes') data = addMinutes_(Number(p.minutes || 0));
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
    decapi:String(map['DecAPI URL'] || 'https://decapi.me/twitch/uptime?channel=nihilguh&offline_msg=offline')
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
  updatePanel_();
  return activeSession_();
}

function closeSession_(row, origin) {
  const live = sh_(TABS.LIVES);
  const id = String(live.getRange(row,1).getValue());
  const stats = stats_(id);
  live.getRange(row,4,1,7).setValues([[stamp_(), 'ENCERRADA', live.getRange(row,6).getValue(), stats.gained, stats.total, stats.completed, stats.goalCount]]);
  event_('session_end',id,origin || 'manual',stats.total);
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
  for(let r=1;r<eVals.length;r++) if(String(eVals[r][1])===sessionId && String(eVals[r][2])==='manual_time') gained+=Number(eVals[r][5]||0);
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

function forceStart_(){ const a=startSession_('admin'); PropertiesService.getScriptProperties().setProperty('OFFLINE_COUNT','0'); return publicState_(); }
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
  }, goals };
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
