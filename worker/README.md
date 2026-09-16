# Proxy seguro LivePix

O site principal roda no GitHub Pages, que é estático. O `client_secret` do LivePix **nunca pode** ficar no `site.config.js` ou no JavaScript público.

Este Worker expõe somente as operações que o visitante precisa:

- `POST /message` → cria mensagem + pagamento (`POST /v2/messages`)
- `POST /payment` → cria pagamento simples (`POST /v2/payments`)
- `GET /plans` → lista planos de assinatura (`GET /v2/subscriptions/plans`)
- `POST /subscription` → inicia assinatura (`POST /v2/subscriptions`)
- `GET /health` → testa autenticação OAuth2

## Ativação rápida pelo GitHub Actions

O repositório possui o workflow **Deploy LivePix Worker**. Configure em `Settings → Secrets and variables → Actions` estes quatro secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `LIVEPIX_CLIENT_ID`
- `LIVEPIX_CLIENT_SECRET`

Depois abra `Actions → Deploy LivePix Worker → Run workflow`.

O workflow:

1. publica o Worker;
2. testa `/health` contra a API LivePix;
3. pega a URL `workers.dev` automaticamente;
4. grava essa URL em `site.config.js`;
5. dispara o deploy do GitHub Pages.

## Publicação manual com Wrangler

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

Se um `client_secret` tiver sido exposto em chat, log ou arquivo público, revogue-o e gere outro antes de publicar.
