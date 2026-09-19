# NihilGuh Live Goals — Apps Script

Este backend usa **somente o detector já adotado pelo site**:

`https://decapi.me/twitch/uptime?channel=nihilguh&offline_msg=offline`

Não usa API oficial da Twitch, Client ID, OAuth ou Client Secret.

## Planilha

ID já configurado no código:

`15hJC-OZfbYvK7A1hVuXwcth5gyxj6DxmQx8lUAk9f6Y`

Abas: CONFIG, LIVES, METAS, VISITANTES, EVENTOS e PAINEL.

## Publicar

1. Abra a planilha **NihilGuh — Metas de Live**.
2. Extensões → Apps Script.
3. Cole o conteúdo de `apps-script/Code.gs`.
4. Execute `setup()` uma vez e autorize.
5. Copie a `ADMIN_KEY` e a `BRIDGE_KEY` mostradas no log/resultado.
6. Implantar → Nova implantação → Aplicativo da Web.
7. Executar como: você. Acesso: qualquer pessoa.
8. Copie a URL terminada em `/exec`.
9. Coloque essa URL em `site.config.js` no campo `backendUrl`.

O gatilho criado pelo `setup()` consulta a DecAPI a cada minuto. Cinco checks offline consecutivos encerram a sessão por padrão; isso é configurável na aba CONFIG.

## Fallback

`admin.html` permite:
- forçar início;
- forçar encerramento;
- sincronizar a DecAPI;
- concluir metas manuais;
- adicionar minutos.

A URL do backend e a chave de administrador ficam apenas no localStorage do navegador usado no painel.


## StreamElements

O backend aceita eventos do widget em `streamelements/` pela ação `streamEvent`.

A `BRIDGE_KEY` é gerada pelo `setup()` e não deve ser colocada no GitHub. Depois do deploy do Web App, abra `admin.html` com sua ADMIN_KEY e use **Mostrar BRIDGE_KEY**, ou copie a chave diretamente do resultado de `setup()`.

Os eventos de Twitch, YouTube e Kick são salvos na aba EVENTOS e atualizam as metas automáticas da sessão ativa.


## LivePix

Quando o Event Bridge identifica um `tip-latest` marcado como LivePix, o backend registra o valor em BRL na sessão ativa.

A regra padrão vem da aba CONFIG:
`LivePix R$ por minuto = 10`

O tempo concedido é `floor(total_livepix_da_sessao / 10)`, descontando os minutos já concedidos anteriormente. Dessa forma valores parciais acumulam sem duplicar tempo.
