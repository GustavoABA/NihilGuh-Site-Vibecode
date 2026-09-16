# NihilGuh — Wonderland Broadcast

Landing page leve para centralizar canais, comunidade e apoio via LivePix.

## Site

- Twitch, YouTube, TikTok, Kick e Trovo
- Discord e Coret.cloud
- detector de live da Twitch
- entrada animada inspirada nos alertas Wonderland/Cheshire
- assets locais otimizados
- favicon com emote de ramen
- GitHub Pages via `.github/workflows/pages.yml`

## LivePix

O iframe foi removido porque o LivePix bloqueia incorporação externa com `X-Frame-Options: sameorigin` e `frame-ancestors 'none'`.

A página agora tem uma interface própria com:

- mensagem + Pix
- Pix rápido
- planos de assinatura
- recorrência mensal, trimestral, semestral e anual

As chamadas passam por `worker/worker.js`, mantendo o `client_secret` fora do GitHub Pages.

> Para ativar os pagamentos, publique o Worker e preencha `api.base` em `site.config.js`.

A API oficial do LivePix usa OAuth2 e retorna uma `redirectUrl` de checkout para pagamentos, mensagens e assinaturas.
