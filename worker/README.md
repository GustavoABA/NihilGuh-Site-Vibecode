# Proxy seguro LivePix

O site principal roda no GitHub Pages, que é estático. O `client_secret` do LivePix **nunca pode** ficar no `site.config.js` ou no JavaScript público.

Este Worker expõe somente as operações que o visitante precisa:

- `POST /message` → cria mensagem + pagamento (`POST /v2/messages`)
- `POST /payment` → cria pagamento simples (`POST /v2/payments`)
- `GET /plans` → lista planos de assinatura (`GET /v2/subscriptions/plans`)
- `POST /subscription` → inicia assinatura (`POST /v2/subscriptions`)
- `GET /health` → testa autenticação OAuth2

## Publicar com Cloudflare Workers

1. Instale Wrangler: `npm i -g wrangler`
2. Entre na Cloudflare: `wrangler login`
3. Dentro desta pasta, configure:
   - `wrangler secret put LIVEPIX_CLIENT_ID`
   - `wrangler secret put LIVEPIX_CLIENT_SECRET`
   - se necessário, `wrangler secret put LIVEPIX_SCOPE`
4. Rode: `wrangler deploy`
5. Copie a URL `https://...workers.dev`
6. Em `site.config.js`, coloque essa URL em `api.base`.

## Segurança

As credenciais não são versionadas. O Worker valida valor, tamanho dos campos, origem CORS e `redirectUrl`.

Como uma credencial foi compartilhada em uma conversa, gere um novo `client_secret` no painel LivePix antes de publicar.
