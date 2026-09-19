# NihilGuh Event Bridge — StreamElements

Este widget envia eventos do StreamElements para o Google Apps Script da NihilGuh.

## O que ele registra

O widget ignora chat e eventos internos de interface. Ele encaminha eventos de atividade como:

- follow / follower
- subscriber
- tip
- cheer
- KICKs
- raid
- Super Chat / Super Sticker quando o StreamElements emitir o listener correspondente
- memberships/sponsor quando o StreamElements emitir o listener correspondente
- outros eventos `*-latest`, que ficam registrados mesmo quando não afetam uma meta

O backend classifica os eventos em `stream_growth`, `stream_support`, `stream_raid` ou `stream_other`.

## Importante para Twitch + YouTube + Kick

Os eventos do StreamElements são vinculados à conta/plataforma selecionada. Portanto use **um Event Bridge por plataforma**:

1. Entre no StreamElements e selecione a conta Twitch.
2. Crie um Overlay pequeno e adicione um **Custom Widget**.
3. Cole:
   - `widget.html` na aba HTML
   - `widget.css` na aba CSS
   - `widget.js` na aba JS
   - `fields.json` na aba FIELDS
4. Em OPEN EDITOR:
   - informe a URL `/exec` do Apps Script;
   - informe a `BRIDGE_KEY`;
   - escolha `Twitch`.
5. Salve e mantenha a URL desse overlay carregada em uma Browser Source do OBS.
6. Repita para YouTube e Kick, escolhendo a plataforma correspondente.

As três Browser Sources podem ficar com 1×1 px ou posicionadas fora da tela. O importante é permanecerem carregadas durante a live. Não ative "Shutdown source when not visible".

## BRIDGE_KEY

Ao executar `setup()` no Apps Script, o sistema cria e retorna:

- `ADMIN_KEY`
- `BRIDGE_KEY`

A BRIDGE_KEY é separada da chave do painel e serve somente para receber eventos dos widgets StreamElements.

## Eventos salvos

A aba `EVENTOS` registra:

`timestamp | session_id | tipo | origem | detalhe | valor | plataforma | usuario | listener | event_id | moeda | mensagem | raw_json`

Eventos recebidos quando não existe uma sessão de live ativa são ignorados. Eventos com `event_id` já registrado são descartados como duplicados.
