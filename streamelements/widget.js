let bridgeConfig = {
  enabled: true,
  backendUrl: '',
  bridgeKey: '',
  platform: 'twitch',
  channelName: ''
};

window.addEventListener('onWidgetLoad', function (obj) {
  const detail = (obj && obj.detail) || {};
  const fieldData = detail.fieldData || {};
  const channel = detail.channel || {};

  bridgeConfig.enabled = fieldData.enabled !== false;
  bridgeConfig.backendUrl = String(fieldData.backendUrl || '').trim().replace(/\/$/, '');
  bridgeConfig.bridgeKey = String(fieldData.bridgeKey || '').trim();
  bridgeConfig.platform = String(fieldData.platform || 'twitch').toLowerCase();
  bridgeConfig.channelName = String(channel.username || '');
});

window.addEventListener('onEventReceived', function (obj) {
  if (!bridgeConfig.enabled || !bridgeConfig.backendUrl || !bridgeConfig.bridgeKey) return;

  const detail = (obj && obj.detail) || {};
  const listener = String(detail.listener || '');
  const event = detail.event || {};

  const ignored = new Set([
    'message','delete-message','delete-messages','kvstore:update','bot:counter',
    'widget-button','event','event:test','event:skip','alertService:toggleSound'
  ]);
  if (!listener || ignored.has(listener)) return;

  const eventId = String(
    event.activityId || event._id || event.id || event.eventId ||
    (bridgeConfig.platform + '-' + Date.now() + '-' + Math.random().toString(36).slice(2))
  );

  let currency = event.currency || event.userCurrency || '';
  if (currency && typeof currency === 'object') currency = currency.code || currency.symbol || '';

  const compactRaw = JSON.stringify({
    listener,
    platform: bridgeConfig.platform,
    channel: bridgeConfig.channelName,
    event
  }).slice(0, 1200);

  const params = new URLSearchParams({
    action: 'streamEvent',
    bridgeKey: bridgeConfig.bridgeKey,
    platform: bridgeConfig.platform,
    listener,
    eventId,
    user: String(event.name || event.displayName || event.sender || '').slice(0, 180),
    amount: String(event.amount == null ? '' : event.amount),
    currency: String(currency || '').slice(0, 30),
    message: String(event.message || event.text || '').slice(0, 500),
    gifted: String(Boolean(event.gifted)),
    bulkGifted: String(Boolean(event.bulkGifted)),
    isCommunityGift: String(Boolean(event.isCommunityGift)),
    raw: compactRaw
  });

  fetch(bridgeConfig.backendUrl + '?' + params.toString(), {
    method: 'GET',
    mode: 'no-cors',
    cache: 'no-store',
    credentials: 'omit'
  }).catch(function () {});
});
