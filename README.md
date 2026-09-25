# NihilGuh — Mundo Louco

Hub de live e interação da comunidade publicado em GitHub Pages, com estado autoritativo em Google Apps Script.

## Experiência pública

- / — perfil do criador, canais, Twitch, apoio e resumo da rodada.
- /live/ — sala da live com player Twitch, relógio, metas e rodada atual.
- /play/ — minigame mobile-first; todos disputam a mesma rodada.
- /overlay/ — overlay 600×400 para OBS.
- /overlay.html — URL legada mantida compatível.
- /admin.html — painel privado de controle.

## Regra central da live

Cada sessão começa com **240 minutos (4h)**. Metas, LivePix, eventos e minigames podem conceder até **240 minutos extras**, portanto o teto é **480 minutos (8h)**.

A Twitch é usada como sinal de sessão através da DecAPI já adotada pelo projeto. Quando a transmissão passa de offline para online, o backend cria uma nova sessão e uma nova sequência de rodadas.

## Minigames

O arquivo apps-script/RoundEngine.gs mantém uma rodada autoritativa por sessão. A resposta correta não é enviada ao navegador. O primeiro acerto válido é processado dentro de LockService, fecha a rodada para todos, concede o bônus de tempo permitido e agenda a próxima rodada.

Tipos iniciais:
- Sequência do Coelho;
- Conta da Rainha;
- Palavra Embaralhada;
- Código do Cheshire;
- Sorriso Relâmpago (reflexo).

O identificador do visitante é local ao navegador e serve para a dinâmica casual; não é autenticação forte.

## Backend

Fontes:
- apps-script/Code.gs
- apps-script/Interactions.gs
- apps-script/RoundEngine.gs

Para publicar sem gerenciar vários arquivos, use apps-script/ALL_IN_ONE.gs.

O Google Sheets continua como histórico e registro de sessões/metas/eventos. O estado volátil dos jogos fica em ScriptProperties, evitando depender de varreduras do Sheets para cada detalhe da rodada.

## Segurança do painel

Comandos administrativos do frontend usam POST. A ADMIN_KEY não é enviada na query string. O navegador envia um requestId aleatório e consulta apenas o resultado temporário dessa operação.

## GitHub Pages

.github/workflows/pages.yml publica automaticamente o conteúdo do branch main.
