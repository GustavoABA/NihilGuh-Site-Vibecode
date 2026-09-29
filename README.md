# NihilGuh — Mundo Louco

Hub de live e interação da comunidade publicado em GitHub Pages, com estado autoritativo em Google Apps Script.

## Rotas

- `/` — perfil, canais, comunidade, apoio e estado da live.
- `/live/` — player Twitch, relógio, metas e rodada.
- `/play/` — minigame global sincronizado.
- `/overlay/` — overlay OBS 600×400.
- `/overlay.html` — URL legada do overlay.
- `/admin.html` — painel privado.

## Relógio

Cada sessão nasce com **240 min (4h)**.

Existe um único saldo de bônus autoritativo entre **0 e 240 min**, compartilhado por minigames, metas, LivePix e ajustes administrativos. O tempo total nunca passa de **480 min (8h)**.

A Escolha da Rainha pode retirar bônus já conquistado, mas nunca reduz a base de 4h.

## Minigames

Uma live recebe um baralho global de **23 rodadas**. O mesmo desafio é exibido para todos.

O potencial nominal positivo do baralho é **+240 min**:
- Reflexo do Gato ×3;
- Caça ao Coelho ×3;
- Ache o Diferente ×2;
- Digite Antes que Suma ×2;
- Palavra Embaralhada ×2;
- Sequência Maluca ×2;
- Conta da Rainha ×2;
- Memória de Cartas ×2;
- Código do Cheshire ×2;
- Labirinto do Abismo ×1;
- Puzzle Deslizante 4×4 ×1;
- Escolha da Rainha ×1.

Cada rodada permanece **ativa sem limite de tempo enquanto a Twitch estiver online**. Ela só termina quando alguém vence. Após a vitória, o backend aplica a alteração no relógio, mostra o resultado por alguns segundos e então cria a próxima rodada global.

O primeiro acerto válido fecha a rodada sob `LockService`. Labirinto e puzzle são reexecutados no backend para validar o caminho/movimentos.

Memória e Digite Antes que Suma usam ciclos globais repetidos de memorização → resposta. Enquanto ninguém vence, o ciclo recomeça para que quem entrar depois ainda tenha chance de participar; o conteúdo secreto deixa de ser enviado durante a fase de resposta.

## Estado e escala

- Google Sheets: histórico persistente de lives, metas, visitantes e eventos.
- ScriptProperties: somente o estado global compacto da rodada.
- CacheService: presença/tentativas por jogador, configuração e leituras quentes.
- `stateLite`: endpoint usado pelo polling público.
- uma única requisição de polling por navegador fica em voo por vez.

O identificador do jogador continua sendo casual, baseado no navegador. Não é autenticação forte e não deve ser usado para prêmios de valor real.

## Motor legado

O antigo motor automático de Boss/Caos/Votos/Missões permanece no código apenas para referência histórica, mas está **desativado**. Ele não altera mais o relógio nem cria mecânicas invisíveis.

## Segurança

- ações administrativas mutáveis usam POST;
- ações administrativas por GET foram removidas;
- `ADMIN_KEY` e `BRIDGE_KEY` não são mais impressas nos logs de `setup()`;
- respostas corretas continuam somente no backend.

## Backend

Fontes:
- `apps-script/Code.gs`
- `apps-script/Interactions.gs`
- `apps-script/RoundEngine.gs`

Para publicar, use `apps-script/ALL_IN_ONE.gs`. O CI verifica que ele é exatamente a concatenação das três fontes acima.

## Deploy

O GitHub Pages publica automaticamente o branch `main`.

O Apps Script precisa ser atualizado separadamente por **Gerenciar implantações → Editar → Nova versão**, preservando a mesma URL `/exec`.

## Home durante a live

Quando a Twitch está online, a home prioriza a transmissão: o player aparece primeiro e o minigame global fica imediatamente abaixo do vídeo, permitindo assistir e jogar na mesma página.

O embed usa autoplay com áudio inicialmente mutado para maximizar compatibilidade com as políticas de reprodução automática dos navegadores. Em dispositivos móveis, a Twitch pode exigir interação do usuário para iniciar o vídeo.


## Overlay OBS

O overlay 600×400 é transparente e usa um ciclo sincronizado pela hora de início da live:

1. **5 minutos:** somente o cronômetro.
2. **12 segundos:** CTA animado com o avatar apontando para `twitch.tv/nihilguh`.
3. **20 minutos:** somente o cronômetro.
4. **20 segundos:** resumo animado dos vencedores daquele ciclo, mostrando jogador, jogo e minutos aplicados.
5. O ciclo recomeça.

O backend mantém um feed compacto com até 23 vencedores da sessão. O overlay não consulta a planilha inteira a cada atualização.
